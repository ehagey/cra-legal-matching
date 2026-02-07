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
    Convert an HTML link to PDF for preview purposes.
    Returns the PDF as a response.
    """
    from services.html_service import process_html_link_async

    logger.info("Preview request for HTML link: %s", html_link)
    try:
        success, result, pdf_bytes = await process_html_link_async(html_link)
        if not success:
            error_msg = result if isinstance(result, str) else "Failed to process HTML link"
            logger.warning("Preview failed for %s: %s", html_link, error_msg)
            raise HTTPException(status_code=400, detail=error_msg)

        from fastapi.responses import Response
        logger.info("Preview successful for %s, PDF size: %d bytes", html_link, len(pdf_bytes))
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'inline; filename="{result}"'},
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
                batch_compare, non_empty, pdf_files, link_list, job_id
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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
