"""HTML to PDF conversion service."""

from typing import Tuple
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright
from playwright.async_api import async_playwright


def fetch_html_from_url(url: str, timeout: int = 30) -> Tuple[bool, str, bytes]:
    """
    Fetch HTML content from a URL using Playwright (handles JavaScript-rendered content).
    """
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page()
            page.goto(url, wait_until="networkidle", timeout=timeout * 1000)
            html_content = page.content()
            browser.close()
        return True, html_content, html_content.encode('utf-8')
    except Exception as e:
        return False, f"Failed to fetch URL: {str(e)}", b""


def convert_html_to_pdf(html_content: str, url: str = None) -> Tuple[bool, str, bytes]:
    """
    Convert HTML content to PDF using Playwright.
    """
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page()
            if url:
                page.goto(url)
            else:
                page.set_content(html_content, wait_until="networkidle")
            pdf_bytes = page.pdf(format="A4", print_background=True)
            browser.close()
        return True, "converted_from_html.pdf", pdf_bytes
    except Exception as e:
        return False, f"Failed to convert HTML to PDF: {str(e)}", b""


def process_html_link(url: str) -> Tuple[bool, str, bytes]:
    """
    Fetch HTML from URL and convert to PDF.
    """
    success, result, html_bytes = fetch_html_from_url(url)
    if not success:
        return False, result, b""

    html_content = result
    success, filename, pdf_bytes = convert_html_to_pdf(html_content, url)
    if not success:
        return False, filename, b""

    try:
        parsed = urlparse(url)
        # Build readable domain — e.g. "play.google" → "Play Google"
        netloc = parsed.netloc.replace("www.", "")
        domain_parts = netloc.split(".")
        # Drop generic TLDs like com/org/net
        domain_parts = [p for p in domain_parts if p.lower() not in ("com", "org", "net", "io", "co")]
        domain_label = " ".join(p.capitalize() for p in domain_parts) if domain_parts else netloc

        # Build readable page name from last path segment
        path_part = parsed.path.strip("/").split("/")[-1] if parsed.path.strip("/") else ""
        # Strip file extensions (.html, .htm, .php, .aspx, etc.)
        for ext in (".html", ".htm", ".php", ".aspx", ".jsp", ".shtml"):
            if path_part.lower().endswith(ext):
                path_part = path_part[: -len(ext)]
                break
        # Replace hyphens/underscores with spaces, title-case
        page_label = path_part.replace("-", " ").replace("_", " ").strip().title() if path_part else "Agreement"

        safe_filename = f"{domain_label} - {page_label}.pdf"[:80]
    except Exception:
        safe_filename = "converted_from_html.pdf"

    return True, safe_filename, pdf_bytes


# ---------------------------------------------------------------------------
# Async versions for FastAPI endpoints
# ---------------------------------------------------------------------------

async def fetch_html_from_url_async(url: str, timeout: int = 30) -> Tuple[bool, str, bytes]:
    """
    Fetch HTML content from a URL using Playwright async API.
    """
    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            page = await browser.new_page()
            await page.goto(url, wait_until="networkidle", timeout=timeout * 1000)
            html_content = await page.content()
            await browser.close()
        return True, html_content, html_content.encode('utf-8')
    except Exception as e:
        return False, f"Failed to fetch URL: {str(e)}", b""


async def convert_html_to_pdf_async(html_content: str, url: str = None) -> Tuple[bool, str, bytes]:
    """
    Convert HTML content to PDF using Playwright async API.
    """
    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            page = await browser.new_page()
            if url:
                await page.goto(url)
            else:
                await page.set_content(html_content, wait_until="networkidle")
            pdf_bytes = await page.pdf(format="A4", print_background=True)
            await browser.close()
        return True, "converted_from_html.pdf", pdf_bytes
    except Exception as e:
        return False, f"Failed to convert HTML to PDF: {str(e)}", b""


async def process_html_link_async(url: str) -> Tuple[bool, str, bytes]:
    """
    Fetch HTML from URL and convert to PDF (async version).
    """
    success, result, html_bytes = await fetch_html_from_url_async(url)
    if not success:
        return False, result, b""

    html_content = result
    success, filename, pdf_bytes = await convert_html_to_pdf_async(html_content, url)
    if not success:
        return False, filename, b""

    try:
        parsed = urlparse(url)
        # Build readable domain — e.g. "play.google" → "Play Google"
        netloc = parsed.netloc.replace("www.", "")
        domain_parts = netloc.split(".")
        # Drop generic TLDs like com/org/net
        domain_parts = [p for p in domain_parts if p.lower() not in ("com", "org", "net", "io", "co")]
        domain_label = " ".join(p.capitalize() for p in domain_parts) if domain_parts else netloc

        # Build readable page name from last path segment
        path_part = parsed.path.strip("/").split("/")[-1] if parsed.path.strip("/") else ""
        # Strip file extensions (.html, .htm, .php, .aspx, etc.)
        for ext in (".html", ".htm", ".php", ".aspx", ".jsp", ".shtml"):
            if path_part.lower().endswith(ext):
                path_part = path_part[: -len(ext)]
                break
        # Replace hyphens/underscores with spaces, title-case
        page_label = path_part.replace("-", " ").replace("_", " ").strip().title() if path_part else "Agreement"

        safe_filename = f"{domain_label} - {page_label}.pdf"[:80]
    except Exception:
        safe_filename = "converted_from_html.pdf"

    return True, safe_filename, pdf_bytes

