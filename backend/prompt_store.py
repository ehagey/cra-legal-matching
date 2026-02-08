"""Prompt storage and management."""

import json
import os
from pathlib import Path

PROMPT_FILE = Path(__file__).parent / "custom_prompt.json"


def get_custom_prompt() -> dict:
    """
    Get custom prompt from file, or return None if not set.
    
    Returns:
        {"pdf": "...", "text": "..."} or None
    """
    if not PROMPT_FILE.exists():
        return None
    
    try:
        with open(PROMPT_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            return {
                "pdf": data.get("pdf", ""),
                "text": data.get("text", ""),
            }
    except Exception:
        return None


def save_custom_prompt(pdf_prompt: str = None, text_prompt: str = None) -> bool:
    """
    Save custom prompt to file.
    
    Args:
        pdf_prompt: Custom prompt for PDF analysis
        text_prompt: Custom prompt for text analysis
    
    Returns:
        True if saved successfully
    """
    try:
        data = {}
        if PROMPT_FILE.exists():
            try:
                with open(PROMPT_FILE, "r", encoding="utf-8") as f:
                    data = json.load(f)
            except Exception:
                pass
        
        if pdf_prompt is not None:
            data["pdf"] = pdf_prompt
        if text_prompt is not None:
            data["text"] = text_prompt
        
        with open(PROMPT_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        
        return True
    except Exception:
        return False


def reset_custom_prompt() -> bool:
    """Reset custom prompt to default (delete file)."""
    try:
        if PROMPT_FILE.exists():
            os.remove(PROMPT_FILE)
        return True
    except Exception:
        return False

