"""HTML text scraping service using Jina AI."""

import logging
from typing import Tuple
from urllib.parse import urlparse

import requests

from config import JINA_API_KEY, JINA_API_URL

logger = logging.getLogger(__name__)


def scrape_html_with_jina(url: str) -> Tuple[bool, str, str]:
    """
    Scrape text content from HTML URL using Jina AI.
    
    Returns:
        (success, text_content, display_name)
    """
    if not JINA_API_KEY:
        return False, "JINA_API_KEY not configured", ""
    
    try:
        jina_url = f"{JINA_API_URL}/{url}"
        headers = {
            "Authorization": f"Bearer {JINA_API_KEY}",
            "X-Return-Format": "text"
        }
        
        logger.info("Scraping URL with Jina AI: %s", url)
        response = requests.get(jina_url, headers=headers, timeout=60)
        
        if response.status_code != 200:
            error_msg = f"Jina AI request failed: {response.status_code}"
            try:
                error_data = response.json()
                error_msg = error_data.get("detail", error_msg)
            except:
                error_msg = response.text[:200] if response.text else error_msg
            return False, error_msg, ""
        
        text_content = response.text
        
        # Build display name
        try:
            parsed = urlparse(url)
            netloc = parsed.netloc.replace("www.", "")
            domain_parts = netloc.split(".")
            domain_parts = [p for p in domain_parts if p.lower() not in ("com", "org", "net", "io", "co")]
            domain_label = " ".join(p.capitalize() for p in domain_parts) if domain_parts else netloc
            
            path_part = parsed.path.strip("/").split("/")[-1] if parsed.path.strip("/") else ""
            for ext in (".html", ".htm", ".php", ".aspx", ".jsp", ".shtml"):
                if path_part.lower().endswith(ext):
                    path_part = path_part[: -len(ext)]
                    break
            page_label = path_part.replace("-", " ").replace("_", " ").strip().title() if path_part else "Agreement"
            
            display_name = f"{domain_label} - {page_label}"[:80]
        except Exception:
            display_name = url
        
        logger.info("Successfully scraped %s (%d chars)", url, len(text_content))
        return True, text_content, display_name
        
    except requests.exceptions.RequestException as e:
        logger.exception("Jina AI request exception")
        return False, f"Failed to scrape URL: {str(e)}", ""
    except Exception as e:
        logger.exception("Unexpected error scraping URL")
        return False, f"Unexpected error: {str(e)}", ""


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

