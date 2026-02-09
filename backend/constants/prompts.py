"""Prompt templates for LLM analysis."""


def build_comparison_prompt(apple_clause: str, pdf_filename: str, text_content: str = None, custom_prompt: str = None) -> str:
    """
    Build the prompt for comparing an Apple clause against a competitor agreement.

    Args:
        apple_clause: The Apple developer agreement clause text
        pdf_filename: Name of the document being analyzed
        text_content: Optional text content (if provided, used instead of PDF)
        custom_prompt: Optional custom prompt template (overrides default)

    Returns:
        Formatted prompt string
    """
    # Use custom prompt if provided (from request)
    if custom_prompt:
        # Replace placeholders in custom prompt
        prompt = custom_prompt.replace("{apple_clause}", apple_clause).replace("{pdf_filename}", pdf_filename)
        if text_content:
            prompt = prompt.replace("{text_content}", text_content)
        return prompt
    
    # Check for saved custom prompts (from file)
    try:
        from prompt_store import get_custom_prompt
        custom = get_custom_prompt()
        if custom:
            if text_content and custom.get("text"):
                template = custom["text"]
                return template.replace("{apple_clause}", apple_clause).replace("{pdf_filename}", pdf_filename).replace("{text_content}", text_content)
            elif not text_content and custom.get("pdf"):
                template = custom["pdf"]
                return template.replace("{apple_clause}", apple_clause).replace("{pdf_filename}", pdf_filename)
    except ImportError:
        pass  # prompt_store not available, use defaults
    
    # Use default prompts
    if text_content:
        # Use text content directly in prompt
        template = """You are a legal analyst comparing developer agreement clauses. Your task is to analyze the following document text ("{pdf_filename}") and find ALL clauses that match or relate to the following Apple Developer Agreement clause.

DOCUMENT TEXT TO ANALYZE:
{text_content}

APPLE CLAUSE TO FIND:
{apple_clause}

INSTRUCTIONS:
1. Read the ENTIRE document text carefully
2. Analyze the Apple clause above. If it contains multiple distinct legal concepts or ideas, break them down and analyze each one separately. For example, if the clause covers both "termination rights" and "refund policies", treat these as separate concepts and find matches for each independently.
3. Find ALL clauses that match or relate to the Apple clause (or each distinct concept within it) (not just the best match)
4. For each match, provide precise citations including:
   - Section/Article number (e.g., "Section 10.2", "Article 5")
   - Paragraph number within that section
   - Section title/heading
   - Full quoted text of the matching clause

4. Classify each match as:
   - IDENTICAL: Same legal effect, wording may differ slightly but meaning is equivalent
   - SIMILAR: Related clause with meaningful differences that could affect legal interpretation
   - NOT_PRESENT: No comparable clause exists in this document

5. For SIMILAR matches, provide a side-by-side comparison of key differences:
   - What aspect differs (e.g., "termination notice period", "liability cap", "jurisdiction")
   - Apple's version
   - Their version
   - Legal note explaining the significance of the difference

6. Provide an overall classification for the document:
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
        return template.replace("{apple_clause}", apple_clause).replace("{pdf_filename}", pdf_filename).replace("{text_content}", text_content)
    
    # Original PDF-based prompt
    template = """You are a legal analyst comparing developer agreement clauses. Your task is to analyze the attached PDF document ("{pdf_filename}") and find ALL clauses that match or relate to the following Apple Developer Agreement clause.

APPLE CLAUSE TO FIND:
{apple_clause}

INSTRUCTIONS:
1. Read the ENTIRE PDF document carefully
2. Analyze the Apple clause above. If it contains multiple distinct legal concepts or ideas, break them down and analyze each one separately. For example, if the clause covers both "termination rights" and "refund policies", treat these as separate concepts and find matches for each independently.
3. Find ALL clauses that match or relate to the Apple clause (or each distinct concept within it) (not just the best match)
4. For each match, provide precise citations including:
   - Page number (exact page where the clause appears)
   - Section/Article number (e.g., "Section 10.2", "Article 5")
   - Paragraph number within that section
   - Section title/heading
   - Full quoted text of the matching clause

4. Classify each match as:
   - IDENTICAL: Same legal effect, wording may differ slightly but meaning is equivalent
   - SIMILAR: Related clause with meaningful differences that could affect legal interpretation
   - NOT_PRESENT: No comparable clause exists in this document

5. For SIMILAR matches, provide a side-by-side comparison of key differences:
   - What aspect differs (e.g., "termination notice period", "liability cap", "jurisdiction")
   - Apple's version
   - Their version
   - Legal note explaining the significance of the difference

6. Provide an overall classification for the document:
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
    return template.replace("{apple_clause}", apple_clause).replace("{pdf_filename}", pdf_filename)

