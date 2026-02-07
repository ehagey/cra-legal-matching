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

def compare_clause(
    apple_clause: str,
    pdf_data_url: str,
    pdf_filename: str,
) -> Dict:
    """
    Compare a single Apple clause against one PDF document.

    Returns dict with classification, summary, matches, analysis, usage, error.
    """
    prompt = build_comparison_prompt(apple_clause, pdf_filename)

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
) -> List[Dict]:
    """
    Process clauses × PDFs.  Progress is written to job_store[job_id].
    """
    from services.html_service import process_html_link

    logger.info("[batch] START job=%s clauses=%d pdfs=%d links=%d",
                job_id, len(apple_clauses), len(pdf_files), len(html_links or []))

    results: List[Dict] = []

    # Convert HTML links (silently, no progress updates)
    if html_links:
        _update_job(job_id, current_item="Preparing documents…")
        for link in html_links:
            logger.info("[batch] Converting HTML link: %s", link)
            success, filename, pdf_bytes = process_html_link(link)
            if success:
                logger.info("[batch] Converted %s -> %s (%d bytes)", link, filename, len(pdf_bytes))
                pdf_files.append((filename, pdf_bytes))
            else:
                logger.warning("[batch] Failed to convert %s: %s", link, filename)

    total_comparisons = len(apple_clauses) * len(pdf_files)
    completed = 0
    logger.info("[batch] Total comparisons to run: %d", total_comparisons)
    _update_job(job_id, total=0, current_item="Preparing comparisons…")

    # Pre-encode PDFs
    encoded_pdfs: Dict[str, str] = {}
    for filename, pdf_bytes in pdf_files:
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

    # Build list of tasks for parallel execution
    tasks = []
    for clause_idx, apple_clause in enumerate(apple_clauses):
        for pdf_filename, _ in pdf_files:
            if pdf_filename not in encoded_pdfs:
                continue
            tasks.append((clause_idx, apple_clause, pdf_filename, encoded_pdfs[pdf_filename]))

    if not tasks:
        logger.info("[batch] DONE job=%s (no valid comparisons)", job_id)
        _update_job(job_id, done=True, completed=completed, results=list(results))
        return results

    # Set total now that we're ready to start actual comparisons
    _update_job(job_id, total=completed + len(tasks), current_item="Starting comparisons…")
    logger.info("[batch] Running %d comparisons in parallel", len(tasks))

    lock = threading.Lock()

    def _run_one(clause_idx: int, clause: str, pdf_filename: str, pdf_data_url: str) -> Dict:
        label = f"Clause {clause_idx + 1} vs {pdf_filename}"
        logger.info("[batch] Starting: %s", label)
        result = compare_clause(clause, pdf_data_url, pdf_filename)
        with lock:
            nonlocal completed
            completed += 1
            logger.info("[batch] Finished: %s -> %s  (%d/%d)",
                        label, result.get("classification"), completed, completed + len(tasks))
            _update_job(job_id, completed=completed, current_item=label)
        return result

    max_workers = min(len(tasks), 5)
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        # Submit all tasks in order, collect results in clause order
        ordered_futures = [
            executor.submit(_run_one, ci, c, fn, data)
            for ci, c, fn, data in tasks
        ]
        # Wait for all and collect in original order (clause 1 first)
        for future in ordered_futures:
            results.append(future.result())

    logger.info("[batch] DONE job=%s total_results=%d", job_id, len(results))
    _update_job(job_id, done=True, completed=completed, results=list(results))
    return results

