"""HTML text scraping service using Jina AI."""

import logging
import time
from typing import Tuple
from urllib.parse import urlparse

import requests

from config import JINA_API_KEY, JINA_API_URL

logger = logging.getLogger(__name__)

MAX_RETRIES = 3
RETRY_BACKOFF = [2, 5, 10]  # seconds to wait between retries


def _build_display_name(url: str) -> str:
    """Build a human-readable display name from a URL."""
    try:
        parsed = urlparse(url)
        netloc = parsed.netloc.replace("www.", "")
        domain_parts = netloc.split(".")
        domain_parts = [p for p in domain_parts if p.lower() not in ("com", "org", "net", "io", "co")]
        domain_label = " ".join(p.capitalize() for p in domain_parts) if domain_parts else netloc

        path_part = parsed.path.strip("/").split("/")[-1] if parsed.path.strip("/") else ""
        for ext in (".html", ".htm", ".php", ".aspx", ".jsp", ".shtml", ".as"):
            if path_part.lower().endswith(ext):
                path_part = path_part[: -len(ext)]
                break
        page_label = path_part.replace("-", " ").replace("_", " ").strip().title() if path_part else "Agreement"

        return f"{domain_label} - {page_label}"[:80]
    except Exception:
        return url


def scrape_html_with_jina(url: str) -> Tuple[bool, str, str]:
    """
    Scrape text content from HTML URL using Jina AI.
    Retries up to MAX_RETRIES times with exponential backoff on transient errors.
    
    Returns:
        (success, text_content, display_name)
    """
    if not JINA_API_KEY:
        return False, "JINA_API_KEY not configured", ""

    display_name = _build_display_name(url)
    last_error = ""

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            jina_url = f"{JINA_API_URL}/{url}"
            headers = {
                "Authorization": f"Bearer {JINA_API_KEY}",
                "X-Return-Format": "text",
            }

            logger.info("Scraping URL with Jina AI (attempt %d/%d): %s", attempt, MAX_RETRIES, url)
            response = requests.get(jina_url, headers=headers, timeout=90)

            if response.status_code == 200:
                text_content = response.text
                if text_content and len(text_content.strip()) > 50:
                    logger.info("Successfully scraped %s (%d chars) on attempt %d", url, len(text_content), attempt)
                    return True, text_content, display_name
                else:
                    last_error = f"Scraped page returned very little content ({len(text_content.strip())} chars). The site may block automated access."
                    logger.warning("Scraped %s but got only %d chars on attempt %d", url, len(text_content.strip()), attempt)
            else:
                # Extract error details
                try:
                    error_data = response.json()
                    last_error = error_data.get("detail", f"HTTP {response.status_code}")
                except Exception:
                    last_error = response.text[:300] if response.text else f"HTTP {response.status_code}"
                logger.warning("Jina AI returned %d for %s on attempt %d: %s", response.status_code, url, attempt, last_error[:100])

        except requests.exceptions.ConnectionError as e:
            last_error = f"Connection error: {e}"
            logger.warning("Connection error scraping %s on attempt %d: %s", url, attempt, str(e)[:150])
        except requests.exceptions.Timeout as e:
            last_error = f"Request timed out after 90s"
            logger.warning("Timeout scraping %s on attempt %d", url, attempt)
        except requests.exceptions.RequestException as e:
            last_error = f"Request failed: {e}"
            logger.warning("Request exception scraping %s on attempt %d: %s", url, attempt, str(e)[:150])
        except Exception as e:
            last_error = f"Unexpected error: {e}"
            logger.exception("Unexpected error scraping %s on attempt %d", url, attempt)

        # Wait before retrying (unless this was the last attempt)
        if attempt < MAX_RETRIES:
            wait = RETRY_BACKOFF[attempt - 1]
            logger.info("Retrying %s in %ds…", url, wait)
            time.sleep(wait)

    # All retries exhausted
    final_msg = (
        f"Failed to scrape after {MAX_RETRIES} attempts. "
        f"Last error: {last_error}. "
        f"This site may block automated access — try uploading the page content as a PDF or text file instead."
    )
    logger.error("All %d scrape attempts failed for %s", MAX_RETRIES, url)
    return False, final_msg, display_name


# ---------------------------------------------------------------------------
# Async version for FastAPI endpoints
# ---------------------------------------------------------------------------

async def scrape_html_with_jina_async(url: str) -> Tuple[bool, str, str]:
    """
    Scrape text content from HTML URL using Jina AI (async version).
    
    Returns:
        (success, text_content, display_name)
    """
    import asyncio
    # Run the sync function in a thread pool
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, scrape_html_with_jina, url)

