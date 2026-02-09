"""FastAPI application for Legal Clause Analyzer."""

import asyncio
import json
import logging
import uuid
from typing import AsyncGenerator, List

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from starlette.responses import StreamingResponse

from auth import PasswordAuthMiddleware
from config import FRONTEND_URL, MODEL_NAME, validate_config
from services.openrouter_service import batch_compare, job_store
from utils.validation import validate_clauses

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Legal Clause Analyzer API",
    version="1.0.0",
    description="Compare Apple Developer Agreement clauses against competitor platform agreements.",
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL, "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Auth middleware
app.add_middleware(PasswordAuthMiddleware)


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

@app.get("/api/health")
async def health():
    is_valid, msg = validate_config()
    return {
        "status": "ok" if is_valid else "misconfigured",
        "model": MODEL_NAME,
        "error": msg if not is_valid else None,
    }


# ---------------------------------------------------------------------------
# Preview HTML as PDF
# ---------------------------------------------------------------------------

@app.post("/api/preview-html")
async def preview_html(html_link: str = Form(...)):
    """
    Scrape HTML link with Jina AI and return the text content for preview.
    Returns the text as a response.
    """
    from services.html_service import scrape_html_with_jina_async

    logger.info("Preview request for HTML link: %s", html_link)
    try:
        success, text_content, display_name = await scrape_html_with_jina_async(html_link)
        if not success:
            error_msg = text_content if isinstance(text_content, str) else "Failed to scrape HTML link"
            logger.warning("Preview failed for %s: %s", html_link, error_msg)
            raise HTTPException(status_code=400, detail=error_msg)

        from fastapi.responses import Response
        logger.info("Preview successful for %s, text length: %d chars", html_link, len(text_content))
        return Response(
            content=text_content,
            media_type="text/plain",
            headers={"Content-Disposition": f'inline; filename="{display_name}.txt"'},
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Unexpected error in preview-html")
        raise HTTPException(status_code=500, detail=f"Internal error: {str(e)}")


# ---------------------------------------------------------------------------
# Analyze
# ---------------------------------------------------------------------------

@app.post("/api/analyze")
async def analyze(
    clauses: str = Form(...),
    html_links: str = Form("[]"),
    files: List[UploadFile] = File(default=[]),
    custom_prompt_pdf: str = Form(None),
    custom_prompt_text: str = Form(None),
):
    """
    Start an analysis job.

    - clauses: JSON-encoded list of clause strings
    - html_links: JSON-encoded list of URL strings
    - files: uploaded PDF files
    """
    # Parse inputs
    try:
        clause_list: List[str] = json.loads(clauses)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="clauses must be a JSON array of strings")

    try:
        link_list: List[str] = json.loads(html_links)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="html_links must be a JSON array of strings")

    # Filter empty clauses
    non_empty = [c for c in clause_list if c and c.strip()]
    is_valid, err = validate_clauses(non_empty)
    if not is_valid:
        raise HTTPException(status_code=400, detail=err)

    if not files and not link_list:
        raise HTTPException(status_code=400, detail="Provide at least one PDF or HTML link")

    # Read uploaded PDFs
    pdf_files = []
    for f in files:
        content = await f.read()
        pdf_files.append((f.filename or "upload.pdf", content))

    # Create job
    job_id = str(uuid.uuid4())
    job_store[job_id] = {
        "completed": 0,
        "total": 0,
        "current_item": "Starting…",
        "results": [],
        "done": False,
        "error": None,
    }

    logger.info(
        "Created job %s — %d clauses, %d PDFs, %d links",
        job_id, len(non_empty), len(pdf_files), len(link_list),
    )

    # Run in background thread (blocking I/O)
    async def _run():
        try:
            logger.info("Job %s: background thread starting", job_id)
            await asyncio.to_thread(
                batch_compare, non_empty, pdf_files, link_list, job_id, custom_prompt_pdf, custom_prompt_text
            )
            logger.info("Job %s: background thread finished", job_id)
        except Exception as exc:
            logger.exception("Job %s: background thread error", job_id)
            job_store[job_id]["error"] = str(exc)
            job_store[job_id]["done"] = True

    asyncio.create_task(_run())

    return {"job_id": job_id}


# ---------------------------------------------------------------------------
# SSE Progress
# ---------------------------------------------------------------------------

async def _sse_generator(job_id: str) -> AsyncGenerator[str, None]:
    """Yield SSE-formatted strings for a given job.

    Always sends the current state every tick so the frontend stays
    in sync.  Also sends heartbeat comments to keep the connection alive.
    """
    tick = 0
    while True:
        job = job_store.get(job_id)
        if job is None:
            logger.warning("SSE: job %s disappeared from store", job_id)
            break

        payload = json.dumps({
            "completed": job["completed"],
            "total": job["total"],
            "current_item": job["current_item"],
            "done": job["done"],
            "error": job["error"],
            "results": job["results"] if job["done"] else [],
        })

        # Always send the current state so the frontend is never stale
        logger.info(
            "SSE job %s [tick %d]: completed=%s/%s done=%s item=%s",
            job_id, tick, job["completed"], job["total"], job["done"],
            job["current_item"][:60],
        )
        yield f"event: progress\ndata: {payload}\n\n"

        if job["done"]:
            logger.info("SSE job %s: DONE — sending final results (%d)", job_id, len(job["results"]))
            break

        # Heartbeat comment to keep the connection alive through proxies
        await asyncio.sleep(1)
        yield ": heartbeat\n\n"
        tick += 1


@app.get("/api/progress/{job_id}")
async def progress(job_id: str):
    """Server-Sent Events stream for job progress."""
    if job_id not in job_store:
        raise HTTPException(status_code=404, detail="Job not found")

    logger.info("SSE connection opened for job %s", job_id)

    return StreamingResponse(
        _sse_generator(job_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Prompt Management
# ---------------------------------------------------------------------------

@app.get("/api/prompt")
async def get_prompt():
    """Get current custom prompts."""
    from prompt_store import get_custom_prompt
    
    custom = get_custom_prompt()
    if custom:
        return {
            "pdf": custom.get("pdf", ""),
            "text": custom.get("text", ""),
            "has_custom": True,
        }
    
    # Return default prompts (raw templates with placeholders)
    default_pdf = """You are a legal analyst comparing developer agreement clauses. Your task is to analyze the attached PDF document ("{pdf_filename}") and find ALL clauses that match or relate to the following Apple Developer Agreement clause.

APPLE CLAUSE TO FIND:
{apple_clause}

INSTRUCTIONS:
1. Read the ENTIRE PDF document carefully
2. Analyze the Apple clause above. If it contains multiple distinct legal concepts or ideas, break them down and analyze each one separately. For example, if the clause covers both "termination rights" and "refund policies", treat these as separate concepts and find matches for each independently.
3. Find ALL clauses that match or relate to the Apple clause (or each distinct concept within it). Not just the best match.
4. For each match, provide precise citations including:
   - Page number (exact page where the clause appears)
   - Section/Article number (e.g., "Section 10.2", "Article 5")
   - Paragraph number within that section
   - Section title/heading
   - Full quoted text of the matching clause

5. Classify each match as:
   - IDENTICAL: Same legal effect, wording may differ slightly but meaning is equivalent
   - SIMILAR: Related clause with meaningful differences that could affect legal interpretation
   - NOT_PRESENT: No comparable clause exists in this document

6. For SIMILAR matches, provide a side-by-side comparison of key differences:
   - What aspect differs (e.g., "termination notice period", "liability cap", "jurisdiction")
   - Apple's version
   - Their version
   - Legal note explaining the significance of the difference

7. Provide an overall classification for the document:
   - IDENTICAL: At least one match is IDENTICAL
   - SIMILAR: Only SIMILAR matches found, no IDENTICAL
   - NOT_PRESENT: No comparable clauses found

OUTPUT FORMAT:
You MUST respond with valid JSON only, using this exact schema:

{{
  "classification": "IDENTICAL" | "SIMILAR" | "NOT_PRESENT",
  "summary": "Brief one-line finding (e.g., 'Found 2 identical matches in Section 5.3 and Section 8.1')",
  "matches": [
    {{
      "type": "IDENTICAL" | "SIMILAR",
      "page": <number>,
      "section": "<section number, e.g., '10.2' or 'Article 5'>",
      "section_title": "<full section heading/title>",
      "paragraph": <number>,
      "full_text": "<exact quoted text of the matching clause>",
      "differences": [
        {{
          "aspect": "<what differs, e.g., 'termination period'>",
          "apple": "<Apple's version>",
          "theirs": "<their version>"
        }}
      ],
      "legal_note": "<explanation of legal significance, especially for SIMILAR matches>"
    }}
  ],
  "analysis": "<Overall comparison summary explaining the relationship between the Apple clause and what was found in this document>"
}}

IMPORTANT:
- Return ONLY valid JSON, no markdown code blocks, no explanatory text before or after
- If no matches found, return classification: "NOT_PRESENT" with empty matches array
- For IDENTICAL matches, differences array should be empty
- Page numbers must be accurate - cite the exact page where text appears
- Section and paragraph numbers must match what's in the document
- Full quoted text must be EXACT verbatim copies from the document — preserve the original capitalization, punctuation, and formatting exactly as written. Do NOT convert text to uppercase, title case, or any other case that differs from the source document.
- In the "differences" table, the "apple" and "theirs" values must also preserve original casing exactly as they appear in each respective document"""

    default_text = """You are a legal analyst comparing developer agreement clauses. Your task is to analyze the following document text ("{pdf_filename}") and find ALL clauses that match or relate to the following Apple Developer Agreement clause.

DOCUMENT TEXT TO ANALYZE:
{text_content}

APPLE CLAUSE TO FIND:
{apple_clause}

INSTRUCTIONS:
1. Read the ENTIRE document text carefully
2. Analyze the Apple clause above. If it contains multiple distinct legal concepts or ideas, break them down and analyze each one separately. For example, if the clause covers both "termination rights" and "refund policies", treat these as separate concepts and find matches for each independently.
3. Find ALL clauses that match or relate to the Apple clause (or each distinct concept within it). Not just the best match.
3. For each match, provide precise citations including:
   - Section/Article number (e.g., "Section 10.2", "Article 5")
   - Paragraph number within that section
   - Section title/heading
   - Full quoted text of the matching clause

5. Classify each match as:
   - IDENTICAL: Same legal effect, wording may differ slightly but meaning is equivalent
   - SIMILAR: Related clause with meaningful differences that could affect legal interpretation
   - NOT_PRESENT: No comparable clause exists in this document

6. For SIMILAR matches, provide a side-by-side comparison of key differences:
   - What aspect differs (e.g., "termination notice period", "liability cap", "jurisdiction")
   - Apple's version
   - Their version
   - Legal note explaining the significance of the difference

7. Provide an overall classification for the document:
   - IDENTICAL: At least one match is IDENTICAL
   - SIMILAR: Only SIMILAR matches found, no IDENTICAL
   - NOT_PRESENT: No comparable clauses found

OUTPUT FORMAT:
You MUST respond with valid JSON only, using this exact schema:

{{
  "classification": "IDENTICAL" | "SIMILAR" | "NOT_PRESENT",
  "summary": "Brief one-line finding (e.g., 'Found 2 identical matches in Section 5.3 and Section 8.1')",
  "matches": [
    {{
      "type": "IDENTICAL" | "SIMILAR",
      "page": <number or null if not available>,
      "section": "<section number, e.g., '10.2' or 'Article 5'>",
      "section_title": "<full section heading/title>",
      "paragraph": <number>,
      "full_text": "<exact quoted text of the matching clause>",
      "differences": [
        {{
          "aspect": "<what differs, e.g., 'termination period'>",
          "apple": "<Apple's version>",
          "theirs": "<their version>"
        }}
      ],
      "legal_note": "<explanation of legal significance, especially for SIMILAR matches>"
    }}
  ],
  "analysis": "<Overall comparison summary explaining the relationship between the Apple clause and what was found in this document>"
}}

IMPORTANT:
- Return ONLY valid JSON, no markdown code blocks, no explanatory text before or after
- If no matches found, return classification: "NOT_PRESENT" with empty matches array
- For IDENTICAL matches, differences array should be empty
- Section and paragraph numbers must match what's in the document
- Full quoted text must be EXACT verbatim copies from the document — preserve the original capitalization, punctuation, and formatting exactly as written. Do NOT convert text to uppercase, title case, or any other case that differs from the source document.
- In the "differences" table, the "apple" and "theirs" values must also preserve original casing exactly as they appear in each respective document"""
    
    return {
        "pdf": default_pdf,
        "text": default_text,
        "has_custom": False,
    }


@app.post("/api/prompt")
async def update_prompt(
    pdf: str = Form(None),
    text: str = Form(None),
    reset: bool = Form(False),
):
    """Update or reset custom prompts."""
    from prompt_store import save_custom_prompt, reset_custom_prompt
    
    if reset:
        success = reset_custom_prompt()
        if not success:
            raise HTTPException(status_code=500, detail="Failed to reset prompt")
        return {"message": "Prompt reset to default"}
    
    if pdf is None and text is None:
        raise HTTPException(status_code=400, detail="Provide at least one prompt (pdf or text)")
    
    success = save_custom_prompt(pdf_prompt=pdf, text_prompt=text)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to save prompt")
    
    return {"message": "Prompt updated successfully"}


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
