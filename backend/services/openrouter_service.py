"""OpenRouter API service for clause comparison."""

import json
import logging
import re
import threading
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
from constants.prompts import build_comparison_prompt
from services.pdf_service import encode_pdf_to_base64, validate_pdf


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
# JSON parsing
# ---------------------------------------------------------------------------

def _parse_json_response(content: str) -> Dict:
    """Extract JSON from Claude response with multiple fallback strategies."""
    # Strategy 1: direct parse
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        pass

    # Strategy 2: markdown code block
    json_match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", content, re.DOTALL)
    if json_match:
        try:
            return json.loads(json_match.group(1))
        except json.JSONDecodeError:
            pass

    # Strategy 3: first { … } block
    json_match = re.search(r"\{.*\}", content, re.DOTALL)
    if json_match:
        try:
            return json.loads(json_match.group(0))
        except json.JSONDecodeError:
            pass

    return {
        "classification": "ERROR",
        "summary": "Failed to parse JSON response from API",
        "matches": [],
        "analysis": f"Raw response: {content[:500]}…",
        "error": "JSON parsing failed",
        "raw_response": content,
    }


# ---------------------------------------------------------------------------
# Single comparison
# ---------------------------------------------------------------------------

def compare_clause_with_text(
    apple_clause: str,
    text_content: str,
    document_name: str,
    custom_prompt: str = None,
) -> Dict:
    """
    Compare a single Apple clause against text content (from HTML scraping).
    
    Returns dict with classification, summary, matches, analysis, error.
    """
    prompt = build_comparison_prompt(apple_clause, document_name, text_content=text_content, custom_prompt=custom_prompt)
    
    text_size_kb = len(text_content.encode("utf-8")) / 1024
    logger.info("Processing: %s (%.2f KB text)", document_name, text_size_kb)
    
    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/cra-legal-matching",
        "X-Title": "Legal Clause Analyzer",
    }
    
    payload = {
        "model": MODEL_NAME,
        "messages": [
            {
                "role": "user",
                "content": prompt,
            }
        ],
        "temperature": TEMPERATURE,
        "max_tokens": MAX_TOKENS,
    }
    
    try:
        response = requests.post(
            OPENROUTER_API_URL, headers=headers, json=payload, timeout=120
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
                "pdf_filename": document_name,
                "apple_clause": apple_clause[:100] + ("…" if len(apple_clause) > 100 else ""),
            }
        
        result = response.json()
        content = result.get("choices", [{}])[0].get("message", {}).get("content", "")
        parsed_result = _parse_json_response(content)
        
        parsed_result["pdf_filename"] = document_name
        parsed_result["apple_clause"] = apple_clause[:100] + ("…" if len(apple_clause) > 100 else "")
        return parsed_result
        
    except requests.exceptions.RequestException as e:
        logger.exception("Request exception")
        return {
            "classification": "ERROR",
            "summary": f"API request failed: {e}",
            "matches": [],
            "analysis": f"Error connecting to OpenRouter API: {e}",
            "error": str(e),
            "pdf_filename": document_name,
            "apple_clause": apple_clause[:100] + ("…" if len(apple_clause) > 100 else ""),
        }
    except Exception as e:
        logger.exception("Unexpected exception")
        return {
            "classification": "ERROR",
            "summary": f"Unexpected error: {e}",
            "matches": [],
            "analysis": f"An unexpected error occurred: {e}",
            "error": str(e),
            "pdf_filename": document_name,
            "apple_clause": apple_clause[:100] + ("…" if len(apple_clause) > 100 else ""),
        }


def compare_clause(
    apple_clause: str,
    pdf_data_url: str,
    pdf_filename: str,
    custom_prompt: str = None,
) -> Dict:
    """
    Compare a single Apple clause against one PDF document.

    Returns dict with classification, summary, matches, analysis, usage, error.
    """
    prompt = build_comparison_prompt(apple_clause, pdf_filename, custom_prompt=custom_prompt)

    pdf_size_mb = len(pdf_data_url.encode("utf-8")) / (1024 * 1024)
    logger.info("Processing: %s (%.2f MB data URL)", pdf_filename, pdf_size_mb)

    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/cra-legal-matching",
        "X-Title": "Legal Clause Analyzer",
    }

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
    }

    try:
        response = requests.post(
            OPENROUTER_API_URL, headers=headers, json=payload, timeout=120
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
                "pdf_filename": pdf_filename,
                "apple_clause": apple_clause[:100] + ("…" if len(apple_clause) > 100 else ""),
            }

        result = response.json()
        content = result.get("choices", [{}])[0].get("message", {}).get("content", "")
        parsed_result = _parse_json_response(content)

        parsed_result["pdf_filename"] = pdf_filename
        parsed_result["apple_clause"] = apple_clause[:100] + ("…" if len(apple_clause) > 100 else "")
        return parsed_result

    except requests.exceptions.RequestException as e:
        logger.exception("Request exception")
        return {
            "classification": "ERROR",
            "summary": f"API request failed: {e}",
            "matches": [],
            "analysis": f"Error connecting to OpenRouter API: {e}",
            "error": str(e),
            "pdf_filename": pdf_filename,
            "apple_clause": apple_clause[:100] + ("…" if len(apple_clause) > 100 else ""),
        }
    except Exception as e:
        logger.exception("Unexpected exception")
        return {
            "classification": "ERROR",
            "summary": f"Unexpected error: {e}",
            "matches": [],
            "analysis": f"An unexpected error occurred: {e}",
            "error": str(e),
            "pdf_filename": pdf_filename,
            "apple_clause": apple_clause[:100] + ("…" if len(apple_clause) > 100 else ""),
        }


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
                _update_job(job_id, current_item=f"✗ Failed to scrape: {display_name_short}")
                # Add error result for each clause
                for clause in apple_clauses:
                    err_result = {
                        "classification": "ERROR",
                        "summary": f"Failed to scrape HTML: {text_content}",
                        "matches": [],
                        "analysis": f"Could not scrape {link}: {text_content}",
                        "error": text_content,
                        "pdf_filename": link,
                        "apple_clause": clause[:100] + ("…" if len(clause) > 100 else ""),
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
                        "apple_clause": clause[:100] + ("…" if len(clause) > 100 else ""),
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
                        "apple_clause": clause[:100] + ("…" if len(clause) > 100 else ""),
                    }
                    results.append(err_result)
                    completed += 1
                    _update_job(job_id, completed=completed, current_item=f"Error: {filename}", results=list(results))
                continue

            encoded_pdfs[filename] = encode_pdf_to_base64(pdf_bytes)
            _update_job(job_id, total=0, current_item=f"✓ Parsed: {filename_short}")

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
    logger.info("[batch] Running %d comparisons in parallel", len(tasks))

    lock = threading.Lock()

    def _run_one(task_type: str, clause_idx: int, clause: str, doc_name: str, pdf_data_url: str = None, text_content: str = None) -> Dict:
        nonlocal completed
        clause_short = clause[:40] + "…" if len(clause) > 40 else clause
        doc_short = doc_name[:40] + "…" if len(doc_name) > 40 else doc_name
        label = f"Clause {clause_idx + 1} vs {doc_short}"
        
        # Update progress when starting
        with lock:
            _update_job(job_id, completed=completed, current_item=f"Comparing: {clause_short} vs {doc_short}…", results=list(results))
        
        logger.info("[batch] Starting: %s", label)
        
        if task_type == "pdf":
            result = compare_clause(clause, pdf_data_url, doc_name, custom_prompt=custom_prompt_pdf)
        else:  # html
            result = compare_clause_with_text(clause, text_content, doc_name, custom_prompt=custom_prompt_text)
        
        # Store full clause text and clause index for ordering
        result["apple_clause"] = clause  # Full clause, not truncated
        result["_clause_idx"] = clause_idx  # For ordering
        
        with lock:
            completed += 1
            classification = result.get("classification", "UNKNOWN")
            logger.info("[batch] Finished: %s -> %s  (%d/%d)",
                        label, classification, completed, total_comparisons)
            # Don't append here - we'll collect in order from futures
            _update_job(job_id, completed=completed, current_item=f"✓ {classification}: Clause {clause_idx + 1} vs {doc_short}", results=list(results))
        return result

    max_workers = min(len(tasks), 5)
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

    logger.info("[batch] DONE job=%s total_results=%d", job_id, len(results))
    _update_job(job_id, done=True, completed=completed, results=list(results))
    return results

