"""PDF service for encoding and validation."""

import base64
from typing import Tuple


def encode_pdf_to_base64(pdf_bytes: bytes) -> str:
    """
    Convert PDF bytes to base64 data URL format for OpenRouter API.

    Args:
        pdf_bytes: Raw PDF file bytes

    Returns:
        Base64-encoded data URL string (data:application/pdf;base64,...)
    """
    base64_string = base64.b64encode(pdf_bytes).decode('utf-8')
    return f"data:application/pdf;base64,{base64_string}"


def validate_pdf(pdf_bytes: bytes, max_size_mb: int = 50) -> Tuple[bool, str]:
    """
    Validate PDF file before processing.

    Args:
        pdf_bytes: Raw PDF file bytes
        max_size_mb: Maximum file size in megabytes

    Returns:
        Tuple of (is_valid, error_message)
    """
    max_size_bytes = max_size_mb * 1024 * 1024
    if len(pdf_bytes) > max_size_bytes:
        return False, f"PDF file exceeds maximum size of {max_size_mb}MB"

    if len(pdf_bytes) < 4:
        return False, "File is too small to be a valid PDF"

    if not pdf_bytes[:4].startswith(b'%PDF'):
        return False, "File does not appear to be a valid PDF (missing PDF header)"

    return True, ""

