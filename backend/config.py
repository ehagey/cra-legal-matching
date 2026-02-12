"""Configuration module for Legal Clause Analyzer API."""

import os
from typing import Tuple
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# OpenRouter API Configuration
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"
MODEL_NAME = "openai/gpt-5-mini"
PDF_ENGINE = "pdf-text"
TEMPERATURE = 0
MAX_TOKENS = 100000

# Jina AI Configuration
JINA_API_KEY = os.getenv("JINA_API_KEY", "")
JINA_API_URL = "https://r.jina.ai"

# Constraints
MAX_PDF_SIZE_MB = 50

# Auth
APP_PASSWORD = os.getenv("APP_PASSWORD", "")

# CORS
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")


def validate_config() -> Tuple[bool, str]:
    """Validate that all required configuration is present."""
    if not OPENROUTER_API_KEY:
        return False, "OPENROUTER_API_KEY not found in environment variables."
    if not OPENROUTER_API_KEY.strip():
        return False, "OPENROUTER_API_KEY is empty."
    if not APP_PASSWORD:
        return False, "APP_PASSWORD not found in environment variables."
    return True, ""

