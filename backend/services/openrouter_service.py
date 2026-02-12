"""OpenRouter API service for clause comparison."""

import json
import logging
import re
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any, Dict, List, Optional, Tuple

import requests

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

from config import (
    MAX_TOKENS,
    MODEL_NAME,
    OPENROUTER_API_KEY,
    OPENROUTER_API_URL,
    PDF_ENGINE,
    TEMPERATURE,
)
from constants.prompts import build_aspect_extraction_prompt, build_comparison_prompt
from services.pdf_service import encode_pdf_to_base64, validate_pdf


# ---------------------------------------------------------------------------
# Retry configuration
# ---------------------------------------------------------------------------
MAX_API_RETRIES = 3
API_RETRY_DELAYS = [5, 10, 20]  # seconds between retries


# ---------------------------------------------------------------------------
# In-memory job store  (consumed by SSE endpoint in main.py)
# ---------------------------------------------------------------------------
# { job_id: { "completed": int, "total": int, "current_item": str,
#              "results": [...], "done": bool, "error": str|None } }
job_store: Dict[str, Dict[str, Any]] = {}


def _update_job(job_id: Optional[str], **kwargs):
    """Safely update fields in the job store for a given job."""
    if job_id and job_id in job_store:
        job_store[job_id].update(kwargs)


# ---------------------------------------------------------------------------
# JSON parsing — kept simple
# ---------------------------------------------------------------------------

_JSON_PARSE_ERROR = "JSON parsing failed"


def _close_truncated_json(text: str) -> Optional[Dict]:
    """If the LLM was cut off mid-JSON, close open strings/brackets and parse."""
    start = text.find("{")
    if start == -1:
        return None
    s = text[start:]
    # Close unterminated string
    in_str, esc = False, False
    for ch in s:
        if esc: esc = False; continue
        if ch == "\\": esc = True; continue
        if ch == '"': in_str = not in_str
    if in_str:
        s += '"'
    # Close open brackets
    stack: list[str] = []
    in_str, esc = False, False
    for ch in s:
        if esc: esc = False; continue
        if ch == "\\": esc = True; continue
        if ch == '"': in_str = not in_str; continue
        if in_str: continue
        if ch in "{[": stack.append(ch)
        elif ch == "}" and stack and stack[-1] == "{": stack.pop()
        elif ch == "]" and stack and stack[-1] == "[": stack.pop()
    for opener in reversed(stack):
        s += "]" if opener == "[" else "}"
    s = re.sub(r",\s*([\]}])", r"\1", s)  # trailing commas
    try:
        parsed = json.loads(s)
        return parsed if isinstance(parsed, dict) else None
    except json.JSONDecodeError:
        return None


def _parse_json_response(content: str) -> Dict:
    """Parse LLM output into a dict.  Handles code fences, truncation, lists."""
    text = content.strip()

    # 1. Strip ```json ... ``` or ``` ... ``` (complete or truncated)
    m = re.match(r"^```(?:json)?\s*\n?(.*?)(?:```\s*)?$", text, re.DOTALL | re.IGNORECASE)
    if m:
        text = m.group(1).strip()

    # 2. Try direct parse
    try:
        parsed = json.loads(text)
        if isinstance(parsed, dict):
            return parsed
        if isinstance(parsed, list):
            for item in parsed:
                if isinstance(item, dict):
                    return item
    except json.JSONDecodeError:
        pass

    # 3. Try closing truncated JSON (model hit output token limit)
    repaired = _close_truncated_json(text)
    if repaired is not None:
        logger.info("Repaired truncated JSON (%d chars)", len(text))
        return repaired

    # 4. Give up
    logger.error("JSON parse failed. First 500 chars:\n%s", content[:500])
    return {
        "classification": "ERROR",
        "summary": "Failed to parse JSON from LLM",
        "matches": [],
        "error": _JSON_PARSE_ERROR,
        "raw_snippet": content[:500],
    }


def _is_retryable(result: Dict) -> bool:
    """Should we retry this result?"""
    err = str(result.get("error", ""))
    if not err:
        return False
    if err == _JSON_PARSE_ERROR:
        return True
    if any(code in err for code in ["429", "500", "502", "503", "504"]):
        return True
    lower = err.lower()
    return any(kw in lower for kw in ["timeout", "connection", "reset"])


def _call_openrouter(payload: Dict, timeout: int = 120) -> Tuple[Dict, Optional[str]]:
    """
    Make a single OpenRouter API call.

    Returns (parsed_result_dict, raw_content_or_None).
    On HTTP or network error, returns an error dict.
    """
    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/cra-legal-matching",
        "X-Title": "Legal Clause Analyzer",
    }
    
    try:
        response = requests.post(
            OPENROUTER_API_URL, headers=headers, json=payload, timeout=timeout
        )
        
        if response.status_code != 200:
            error_detail = ""
            try:
                err = response.json()
                error_detail = err.get("error", {}).get("message", str(err))
            except Exception:
                error_detail = response.text[:500]
            return {
                "classification": "ERROR",
                "summary": f"API request failed: {response.status_code} {response.reason}",
                "matches": [],
                "analysis": f"Error from OpenRouter API: {error_detail}",
                "error": f"{response.status_code}: {error_detail}",
            }, None

        resp_json = response.json()
        choice = resp_json.get("choices", [{}])[0]
        raw_content = choice.get("message", {}).get("content", "")
        finish_reason = choice.get("finish_reason", "")
        if finish_reason == "length":
            logger.warning("Response may be truncated (finish_reason=length, %d chars)", len(raw_content))
        parsed = _parse_json_response(raw_content)
        return parsed, raw_content
        
    except requests.exceptions.RequestException as e:
        return {
            "classification": "ERROR",
            "summary": f"API request failed: {e}",
            "matches": [],
            "analysis": f"Error connecting to OpenRouter API: {e}",
            "error": str(e),
        }, None
    except Exception as e:
        return {
            "classification": "ERROR",
            "summary": f"Unexpected error: {e}",
            "matches": [],
            "analysis": f"An unexpected error occurred: {e}",
            "error": str(e),
        }, None


def _call_openrouter_with_retry(payload: Dict, label: str = "", timeout: int = 120) -> Dict:
    """
    Call OpenRouter with automatic retry on transient/retryable errors.
    Returns the final parsed result dict.
    """
    last_result: Dict = {}
    for attempt in range(1, MAX_API_RETRIES + 1):
        result, _ = _call_openrouter(payload, timeout=timeout)

        if not _is_retryable(result):
            return result  # Success or non-retryable error

        last_result = result
        err_short = result.get("error", "unknown")[:80]
        if attempt < MAX_API_RETRIES:
            delay = API_RETRY_DELAYS[attempt - 1]
            logger.warning(
                "[retry] %s — attempt %d/%d failed (%s), retrying in %ds…",
                label, attempt, MAX_API_RETRIES, err_short, delay,
            )
            time.sleep(delay)
        else:
            logger.error(
                "[retry] %s — all %d attempts failed. Last error: %s",
                label, MAX_API_RETRIES, err_short,
            )

    return last_result


# ---------------------------------------------------------------------------
# Phase 1: Extract aspects from an Apple clause
# ---------------------------------------------------------------------------

def extract_aspects(apple_clause: str) -> List[Dict]:
    """
    Ask the LLM to identify the distinct legal aspects in an Apple clause.
    Uses automatic retry on transient errors / JSON parse failures.
    Returns a list of {"label": "...", "description": "..."} dicts.
    Falls back to a single generic aspect on failure.
    """
    fallback = [{"label": "General", "description": apple_clause}]
    prompt = build_aspect_extraction_prompt(apple_clause)

    payload = {
        "model": MODEL_NAME,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": TEMPERATURE,
        "max_tokens": 2000,
        "response_format": {"type": "json_object"},
    }

    clause_short = apple_clause[:40] + "…" if len(apple_clause) > 40 else apple_clause
    parsed = _call_openrouter_with_retry(payload, label=f"extract_aspects({clause_short})", timeout=60)

    if parsed.get("classification") == "ERROR":
        logger.warning("Aspect extraction failed after retries: %s", parsed.get("error", ""))
        return fallback

    aspects = parsed.get("aspects", [])
    if not aspects or not isinstance(aspects, list):
        logger.warning("Aspect extraction returned no aspects, using fallback")
        return fallback

    # Validate structure
    valid = []
    for asp in aspects:
        if isinstance(asp, dict) and asp.get("label") and asp.get("description"):
            valid.append({"label": asp["label"].strip(), "description": asp["description"].strip()})

    if not valid:
        return fallback

    # If there are 2+ distinct aspects, prepend a "Holistic Review" aspect
    # so the LLM also compares the clause as a whole (not just piece-by-piece).
    # For single-aspect clauses this is unnecessary — one aspect IS the whole clause.
    if len(valid) >= 2:
        holistic = {
            "label": "Holistic Review",
            "description": (
                "Overall assessment of the entire clause as a whole — "
                "compare the combined legal effect of all its provisions together, "
                "not just the individual aspects."
            ),
        }
        valid.insert(0, holistic)

    logger.info("Extracted %d aspects from clause: %s", len(valid), [a["label"] for a in valid])
    return valid


# ---------------------------------------------------------------------------
# Deterministic overall classification (overrides LLM's top-level label)
# ---------------------------------------------------------------------------

def _compute_overall_classification(result: Dict) -> str:
    """
    Majority-based rule:
      - Count present (IDENTICAL/SIMILAR) vs NOT_PRESENT matches.
      - If more than half are NOT_PRESENT → NOT_PRESENT.
      - Otherwise: all present are IDENTICAL → IDENTICAL, else → SIMILAR.
    Falls back to the LLM's own label if there are no matches.
    """
    matches = result.get("matches") or []
    if not matches:
        return result.get("classification", "NOT_PRESENT")

    # Defensive: skip any non-dict entries in matches
    types = [m.get("type", "NOT_PRESENT") for m in matches if isinstance(m, dict)]
    if not types:
        return result.get("classification", "NOT_PRESENT")
    not_present = sum(1 for t in types if t == "NOT_PRESENT")
    total = len(types)

    if not_present > total / 2:
        return "NOT_PRESENT"

    present_types = [t for t in types if t != "NOT_PRESENT"]
    if all(t == "IDENTICAL" for t in present_types):
        return "IDENTICAL"
    return "SIMILAR"


# ---------------------------------------------------------------------------
# Single comparison
# ---------------------------------------------------------------------------

def compare_clause_with_text(
    apple_clause: str,
    text_content: str,
    document_name: str,
    custom_prompt: str = None,
    aspects: list = None,
) -> Dict:
    """
    Compare a single Apple clause against text content (from HTML scraping).
    Automatically retries on transient errors and JSON parse failures.
    """
    prompt = build_comparison_prompt(apple_clause, document_name, text_content=text_content, custom_prompt=custom_prompt, aspects=aspects)

    text_size_kb = len(text_content.encode("utf-8")) / 1024
    logger.info("Processing: %s (%.2f KB text)", document_name, text_size_kb)

    payload = {
        "model": MODEL_NAME,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": TEMPERATURE,
        "max_tokens": MAX_TOKENS,
        "response_format": {"type": "json_object"},
    }

    doc_short = document_name[:40] + "…" if len(document_name) > 40 else document_name
    result = _call_openrouter_with_retry(payload, label=f"compare_text({doc_short})")

    result["pdf_filename"] = document_name
    result["apple_clause"] = apple_clause
    result["classification"] = _compute_overall_classification(result)
    return result


def compare_clause(
    apple_clause: str,
    pdf_data_url: str,
    pdf_filename: str,
    custom_prompt: str = None,
    aspects: list = None,
) -> Dict:
    """
    Compare a single Apple clause against one PDF document.
    Automatically retries on transient errors and JSON parse failures.
    """
    prompt = build_comparison_prompt(apple_clause, pdf_filename, custom_prompt=custom_prompt, aspects=aspects)

    pdf_size_mb = len(pdf_data_url.encode("utf-8")) / (1024 * 1024)
    logger.info("Processing: %s (%.2f MB data URL)", pdf_filename, pdf_size_mb)

    payload = {
        "model": MODEL_NAME,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {
                        "type": "file",
                        "file": {
                            "filename": pdf_filename,
                            "file_data": pdf_data_url,
                        },
                    },
                ],
            }
        ],
        "plugins": [{"id": "file-parser", "pdf": {"engine": PDF_ENGINE}}],
        "temperature": TEMPERATURE,
        "max_tokens": MAX_TOKENS,
        "response_format": {"type": "json_object"},
    }

    doc_short = pdf_filename[:40] + "…" if len(pdf_filename) > 40 else pdf_filename
    result = _call_openrouter_with_retry(payload, label=f"compare_pdf({doc_short})")

    result["pdf_filename"] = pdf_filename
    result["apple_clause"] = apple_clause
    result["classification"] = _compute_overall_classification(result)
    return result


# ---------------------------------------------------------------------------
# Batch comparison  (writes progress into job_store)
# ---------------------------------------------------------------------------

def batch_compare(
    apple_clauses: List[str],
    pdf_files: List[Tuple[str, bytes]],
    html_links: Optional[List[str]] = None,
    job_id: Optional[str] = None,
    custom_prompt_pdf: Optional[str] = None,
    custom_prompt_text: Optional[str] = None,
) -> List[Dict]:
    """
    Process clauses × PDFs and HTML links.  Progress is written to job_store[job_id].
    HTML links are scraped with Jina AI and compared as text.
    """
    from services.html_service import scrape_html_with_jina

    logger.info("[batch] START job=%s clauses=%d pdfs=%d links=%d",
                job_id, len(apple_clauses), len(pdf_files), len(html_links or []))

    results: List[Dict] = []

    # Scrape HTML links with Jina AI (get text content)
    html_texts: List[Tuple[str, str]] = []  # (display_name, text_content)
    if html_links:
        for idx, link in enumerate(html_links, 1):
            display_name_short = link.split("/")[-1][:50] if "/" in link else link[:50]
            _update_job(job_id, current_item=f"Scraping website {idx}/{len(html_links)}: {display_name_short}…")
            logger.info("[batch] Scraping HTML link: %s", link)
            success, text_content, display_name = scrape_html_with_jina(link)
            if success:
                logger.info("[batch] Scraped %s -> %s (%d chars)", link, display_name, len(text_content))
                html_texts.append((display_name, text_content))
                _update_job(job_id, current_item=f"✓ Scraped: {display_name[:60]}")
            else:
                logger.warning("[batch] Failed to scrape %s: %s", link, text_content)
                fail_label = display_name if display_name else display_name_short
                _update_job(job_id, current_item=f"✗ Failed to scrape: {fail_label[:60]}")
                # Add error result for each clause
                for clause in apple_clauses:
                    err_result = {
                        "classification": "ERROR",
                        "summary": f"Failed to scrape HTML: {text_content}",
                        "matches": [],
                        "analysis": f"Could not scrape {link}: {text_content}",
                        "error": text_content,
                        "pdf_filename": link,
                        "apple_clause": clause,
                    }
                    results.append(err_result)
                    completed = len(results)
                    _update_job(job_id, completed=completed, current_item=f"Error: {link}", results=list(results))

    # Calculate total comparisons: PDFs + HTML texts
    total_comparisons = len(apple_clauses) * (len(pdf_files) + len(html_texts))
    completed = len(results)  # Already have error results from failed scrapes
    logger.info("[batch] Total comparisons to run: %d (PDFs: %d, HTML: %d)", 
                total_comparisons, len(apple_clauses) * len(pdf_files), len(apple_clauses) * len(html_texts))

    # Pre-encode PDFs
    encoded_pdfs: Dict[str, str] = {}
    if pdf_files:
        for idx, (filename, pdf_bytes) in enumerate(pdf_files, 1):
            filename_short = filename[:50] if len(filename) > 50 else filename
            _update_job(job_id, total=0, current_item=f"Parsing PDF {idx}/{len(pdf_files)}: {filename_short}…")
            
            is_valid, error_msg = validate_pdf(pdf_bytes)
            if not is_valid:
                for clause in apple_clauses:
                    err_result = {
                        "classification": "ERROR",
                        "summary": f"PDF validation failed: {error_msg}",
                        "matches": [],
                        "analysis": f"Could not process {filename}: {error_msg}",
                        "error": error_msg,
                        "pdf_filename": filename,
                        "apple_clause": clause,
                    }
                    results.append(err_result)
                    completed += 1
                    _update_job(job_id, completed=completed, current_item=f"Error: {filename}", results=list(results))
                continue

            pdf_size_mb = len(pdf_bytes) / (1024 * 1024)
            if pdf_size_mb > 20:
                error_msg = f"PDF too large for API ({pdf_size_mb:.2f}MB, max 20MB)"
                for clause in apple_clauses:
                    err_result = {
                        "classification": "ERROR",
                        "summary": f"PDF too large: {error_msg}",
                        "matches": [],
                        "analysis": f"Could not process {filename}: {error_msg}",
                        "error": error_msg,
                        "pdf_filename": filename,
                        "apple_clause": clause,
                    }
                    results.append(err_result)
                    completed += 1
                    _update_job(job_id, completed=completed, current_item=f"Error: {filename}", results=list(results))
                continue

            encoded_pdfs[filename] = encode_pdf_to_base64(pdf_bytes)
            _update_job(job_id, total=0, current_item=f"✓ Parsed: {filename_short}")

    # ---------------------------------------------------------------
    # Phase 1: Extract aspects from each Apple clause (in parallel)
    # ---------------------------------------------------------------
    _update_job(job_id, current_item="Extracting legal aspects from clauses…")
    logger.info("[batch] Phase 1: Extracting aspects from %d clauses", len(apple_clauses))

    clause_aspects: Dict[int, List[Dict]] = {}  # clause_idx -> list of aspects

    with ThreadPoolExecutor(max_workers=min(len(apple_clauses), 10)) as executor:
        aspect_futures = {
            executor.submit(extract_aspects, clause): idx
            for idx, clause in enumerate(apple_clauses)
        }
        for future in aspect_futures:
            idx = aspect_futures[future]
            try:
                aspects = future.result()
                clause_aspects[idx] = aspects
                logger.info("[batch] Clause %d aspects: %s", idx + 1, [a["label"] for a in aspects])
            except Exception as e:
                logger.exception("[batch] Aspect extraction failed for clause %d", idx + 1)
                clause_aspects[idx] = [{"label": "General", "description": apple_clauses[idx]}]

    _update_job(job_id, current_item="✓ Aspects extracted — starting comparisons…")

    # ---------------------------------------------------------------
    # Phase 2: Compare each clause × document with pre-defined aspects
    # ---------------------------------------------------------------
    # Build list of tasks for parallel execution
    tasks = []
    # PDF tasks
    for clause_idx, apple_clause in enumerate(apple_clauses):
        for pdf_filename, _ in pdf_files:
            if pdf_filename not in encoded_pdfs:
                continue
            tasks.append(("pdf", clause_idx, apple_clause, pdf_filename, encoded_pdfs[pdf_filename], None))
    # HTML text tasks
    for clause_idx, apple_clause in enumerate(apple_clauses):
        for display_name, text_content in html_texts:
            tasks.append(("html", clause_idx, apple_clause, display_name, None, text_content))

    if not tasks:
        logger.info("[batch] DONE job=%s (no valid comparisons)", job_id)
        _update_job(job_id, done=True, completed=completed, results=list(results))
        return results

    # Set total now that we're ready to start actual comparisons
    _update_job(job_id, total=completed + len(tasks), current_item="Starting comparisons…")
    logger.info("[batch] Phase 2: Running %d comparisons in parallel", len(tasks))

    lock = threading.Lock()

    def _run_one(task_type: str, clause_idx: int, clause: str, doc_name: str, pdf_data_url: str = None, text_content: str = None) -> Dict:
        nonlocal completed
        clause_short = clause[:40] + "…" if len(clause) > 40 else clause
        doc_short = doc_name[:40] + "…" if len(doc_name) > 40 else doc_name
        label = f"Clause {clause_idx + 1} vs {doc_short}"
        aspects = clause_aspects.get(clause_idx)
        
        # Update progress when starting
        with lock:
            _update_job(job_id, completed=completed, current_item=f"Comparing: {clause_short} vs {doc_short}…", results=list(results))
        
        try:
            logger.info("[batch] Starting: %s (aspects: %s)", label, [a.get("label", "?") if isinstance(a, dict) else str(a) for a in (aspects or [])])
            
            if task_type == "pdf":
                result = compare_clause(clause, pdf_data_url, doc_name, custom_prompt=custom_prompt_pdf, aspects=aspects)
            else:  # html
                result = compare_clause_with_text(clause, text_content, doc_name, custom_prompt=custom_prompt_text, aspects=aspects)
        except Exception as e:
            logger.exception("[batch] Unexpected error in %s", label)
            result = {
                "classification": "ERROR",
                "summary": f"Unexpected error: {e}",
                "matches": [],
                "analysis": f"An unexpected error occurred while processing {label}: {e}",
                "error": str(e),
                "pdf_filename": doc_name,
            }
        
        # Store full clause text, clause index, and aspects for downstream use
        result["apple_clause"] = clause  # Full clause, not truncated
        result["_clause_idx"] = clause_idx  # For ordering
        result["_aspects"] = aspects  # Pre-defined aspects for this clause
        
        with lock:
            completed += 1
            classification = result.get("classification", "UNKNOWN")
            logger.info("[batch] Finished: %s -> %s  (%d/%d)",
                        label, classification, completed, total_comparisons)
            _update_job(job_id, completed=completed, current_item=f"✓ {classification}: Clause {clause_idx + 1} vs {doc_short}", results=list(results))
        return result

    BATCH_SIZE = 50
    max_workers = min(len(tasks), BATCH_SIZE)
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        # Submit all tasks in order
        ordered_futures = [
            executor.submit(_run_one, tt, ci, c, fn, pdf_data, text_data)
            for tt, ci, c, fn, pdf_data, text_data in tasks
        ]
        # Collect results in submission order (preserves clause order)
        for future in ordered_futures:
            result = future.result()  # Wait for completion and get result
            results.append(result)  # Append in order
            # Update job store with ordered results
            _update_job(job_id, results=list(results))

    # Sort results by clause index, then by document name to ensure consistent ordering
    results.sort(key=lambda r: (
        r.get("_clause_idx", 999),  # Sort by clause index first
        r.get("pdf_filename", "")   # Then by document name
    ))
    
    logger.info("[batch] DONE job=%s total_results=%d", job_id, len(results))
    _update_job(job_id, done=True, completed=completed, results=list(results))
    return results

