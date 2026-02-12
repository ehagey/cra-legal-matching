"""Prompt templates for LLM analysis."""


# ---------------------------------------------------------------------------
# Default templates shown in the Prompt Editor UI (with-aspects variants)
# These use {apple_clause}, {pdf_filename}, {text_content} as placeholders.
# The {aspects_block} and {has_multiple} are dynamically injected at runtime
# and are NOT editable by the user — they are shown here for transparency.
# ---------------------------------------------------------------------------

DEFAULT_PDF_PROMPT = """You are a legal analyst comparing developer agreement clauses. Your task is to analyze the attached PDF document ("{pdf_filename}") and find clauses that match or relate to specific aspects of the following Apple Developer Agreement clause.

APPLE CLAUSE:
{apple_clause}

THE FOLLOWING ASPECTS HAVE BEEN IDENTIFIED IN THE APPLE CLAUSE. You MUST report on EVERY aspect listed below:
(Aspects are automatically extracted in Phase 1 and injected here at runtime.)

INSTRUCTIONS:
1. Read the ENTIRE PDF document carefully.
2. For EACH aspect listed above, search the document for any clause that addresses the same legal concept.
3. For each aspect, find the BEST matching clause in the document. If multiple sections address the same aspect, pick the most relevant one.
4. For each match, provide precise citations including:
   - Page number (exact page where the clause appears)
   - Section/Article number (e.g., "Section 10.2", "Article 5")
   - Paragraph number within that section
   - Section title/heading
   - Full quoted text of the matching clause

5. Classify each match as:
   - IDENTICAL: Same legal effect, wording may differ slightly but meaning is equivalent
   - SIMILAR: Related clause with meaningful differences that could affect legal interpretation
   - NOT_PRESENT: No comparable clause exists in this document for this aspect

6. For SIMILAR matches, provide a side-by-side comparison of key differences:
   - What aspect differs
   - Apple's version (quote from the Apple clause)
   - Their version (quote from this document)
   - Legal note explaining the significance

7. Provide an overall classification for the document:
   - IDENTICAL: At least one aspect match is IDENTICAL
   - SIMILAR: Only SIMILAR matches found
   - NOT_PRESENT: No comparable clauses found for any aspect

OUTPUT FORMAT:
Valid JSON only with: classification, has_multiple_aspects, summary, matches[], analysis.
Each match must have: type, aspect_label, page, section, section_title, paragraph, full_text, differences[], legal_note.

CRITICAL RULES:
- You MUST include exactly one match entry for EACH aspect — no more, no less
- If an aspect is not found in the document, include a match with type: "NOT_PRESENT" and empty section/full_text
- For IDENTICAL matches, differences array should be empty
- Return ONLY valid JSON, no markdown code blocks, no explanatory text
- Full quoted text must be EXACT verbatim copies — preserve original capitalization and formatting"""

DEFAULT_TEXT_PROMPT = """You are a legal analyst comparing developer agreement clauses. Your task is to analyze the following document text ("{pdf_filename}") and find clauses that match or relate to specific aspects of the following Apple Developer Agreement clause.

DOCUMENT TEXT TO ANALYZE:
{text_content}

APPLE CLAUSE:
{apple_clause}

THE FOLLOWING ASPECTS HAVE BEEN IDENTIFIED IN THE APPLE CLAUSE. You MUST report on EVERY aspect listed below:
(Aspects are automatically extracted in Phase 1 and injected here at runtime.)

INSTRUCTIONS:
1. Read the ENTIRE document text carefully.
2. For EACH aspect listed above, search the document for any clause that addresses the same legal concept.
3. For each aspect, find the BEST matching clause in the document. If multiple sections address the same aspect, pick the most relevant one.
4. For each match, provide precise citations including:
   - Section/Article number (e.g., "Section 10.2", "Article 5")
   - Paragraph number within that section
   - Section title/heading
   - Full quoted text of the matching clause

5. Classify each match as:
   - IDENTICAL: Same legal effect, wording may differ slightly but meaning is equivalent
   - SIMILAR: Related clause with meaningful differences that could affect legal interpretation
   - NOT_PRESENT: No comparable clause exists in this document for this aspect

6. For SIMILAR matches, provide a side-by-side comparison of key differences:
   - What aspect differs
   - Apple's version (quote from the Apple clause)
   - Their version (quote from this document)
   - Legal note explaining the significance

7. Provide an overall classification for the document:
   - IDENTICAL: At least one aspect match is IDENTICAL
   - SIMILAR: Only SIMILAR matches found
   - NOT_PRESENT: No comparable clauses found for any aspect

OUTPUT FORMAT:
Valid JSON only with: classification, has_multiple_aspects, summary, matches[], analysis.
Each match must have: type, aspect_label, page, section, section_title, paragraph, full_text, differences[], legal_note.

CRITICAL RULES:
- You MUST include exactly one match entry for EACH aspect — no more, no less
- If an aspect is not found in the document, include a match with type: "NOT_PRESENT" and empty section/full_text
- For IDENTICAL matches, differences array should be empty
- Return ONLY valid JSON, no markdown code blocks, no explanatory text
- Full quoted text must be EXACT verbatim copies — preserve original capitalization and formatting"""


# ---------------------------------------------------------------------------
# Phase 1: Extract aspects from an Apple clause
# ---------------------------------------------------------------------------

ASPECT_EXTRACTION_PROMPT = """You are a legal analyst. Analyze the following Apple Developer Agreement clause and identify its distinct legal concepts/aspects.

APPLE CLAUSE:
{apple_clause}

INSTRUCTIONS:
1. Read the clause carefully and identify every distinct legal concept, right, obligation, or provision it contains.
2. Each aspect should be a self-contained legal idea that can be independently searched for in another agreement.
3. Give each aspect a short label (2-5 words) and a brief description of what Apple's position is on that aspect.
4. Order aspects from most important to least important.

OUTPUT FORMAT:
You MUST respond with valid JSON only, using this exact schema:

{{
  "aspects": [
    {{
      "label": "<2-5 word label, e.g., 'Warranty Disclaimer'>",
      "description": "<1-2 sentence description of Apple's position on this aspect>"
    }}
  ]
}}

IMPORTANT:
- Return ONLY valid JSON, no markdown code blocks, no explanatory text
- Each aspect must be a genuinely distinct legal concept — do NOT split artificially
- Typically a clause will have 2-5 aspects. A very short clause may have just 1.
- The description should clearly state what Apple's clause says about this aspect, using the original language where possible
- Each aspect must be understood in the context of the FULL clause — do not treat aspects as isolated statements. Their meaning and legal effect may depend on other provisions in the same clause."""


def build_aspect_extraction_prompt(apple_clause: str) -> str:
    """Build prompt for extracting aspects from an Apple clause."""
    return ASPECT_EXTRACTION_PROMPT.replace("{apple_clause}", apple_clause)


# ---------------------------------------------------------------------------
# Phase 2: Compare with pre-defined aspects
# ---------------------------------------------------------------------------

def build_comparison_prompt(apple_clause: str, pdf_filename: str, text_content: str = None, custom_prompt: str = None, aspects: list = None) -> str:
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
    
    # Build the aspect list block if pre-defined aspects are provided
    aspects_block = ""
    if aspects and len(aspects) > 0:
        aspect_lines = []
        for i, asp in enumerate(aspects, 1):
            aspect_lines.append(f'   {i}. "{asp["label"]}": {asp["description"]}')
        aspects_block = "\n".join(aspect_lines)

    # Use default prompts
    if text_content:
        if aspects_block:
            template = """You are a legal analyst comparing developer agreement clauses. Your task is to analyze the following document text ("{pdf_filename}") and find clauses that match or relate to specific aspects of the following Apple Developer Agreement clause.

DOCUMENT TEXT TO ANALYZE:
{text_content}

APPLE CLAUSE:
{apple_clause}

THE FOLLOWING ASPECTS HAVE BEEN IDENTIFIED IN THE APPLE CLAUSE. You MUST report on EVERY aspect listed below:
{aspects_block}

INSTRUCTIONS:
1. Read the ENTIRE document text carefully.
2. For EACH aspect listed above, search the document for any clause that addresses the same legal concept.
3. For each aspect, find the BEST matching clause in the document. If multiple sections address the same aspect, pick the most relevant one.
4. For each match, provide precise citations including:
   - Section/Article number (e.g., "Section 10.2", "Article 5")
   - Paragraph number within that section
   - Section title/heading
   - Full quoted text of the matching clause

5. Classify each match as:
   - IDENTICAL: Same legal effect, wording may differ slightly but meaning is equivalent
   - SIMILAR: Related clause with meaningful differences that could affect legal interpretation
   - NOT_PRESENT: No comparable clause exists in this document for this aspect

6. For SIMILAR matches, provide a side-by-side comparison of key differences:
   - What aspect differs
   - Apple's version (quote from the Apple clause)
   - Their version (quote from this document)
   - Legal note explaining the significance

7. Provide an overall classification for the document:
   - IDENTICAL: At least one aspect match is IDENTICAL
   - SIMILAR: Only SIMILAR matches found
   - NOT_PRESENT: No comparable clauses found for any aspect

OUTPUT FORMAT:
You MUST respond with valid JSON only, using this exact schema:

{{
  "classification": "IDENTICAL" | "SIMILAR" | "NOT_PRESENT",
  "has_multiple_aspects": {has_multiple},
  "summary": "Brief one-line finding",
  "matches": [
    {{
      "type": "IDENTICAL" | "SIMILAR" | "NOT_PRESENT",
      "aspect_label": "<MUST be one of the exact aspect labels listed above>",
      "page": <number or null>,
      "section": "<section number or empty string if NOT_PRESENT>",
      "section_title": "<section heading or empty string if NOT_PRESENT>",
      "paragraph": <number or null>,
      "full_text": "<exact quoted text or empty string if NOT_PRESENT>",
      "differences": [
        {{
          "aspect": "<what differs>",
          "apple": "<Apple's version — quote from the Apple clause>",
          "theirs": "<their version — quote from this document>"
        }}
      ],
      "legal_note": "<explanation of legal significance>"
    }}
  ],
  "analysis": "<Overall comparison summary>"
}}

CRITICAL RULES:
- You MUST include exactly one match entry for EACH aspect listed above — no more, no less
- The "aspect_label" in each match MUST exactly match one of the aspect labels provided above
- If an aspect is not found in the document, include a match with type: "NOT_PRESENT" and empty section/full_text
- For IDENTICAL matches, differences array should be empty
- Return ONLY valid JSON, no markdown code blocks, no explanatory text
- Full quoted text must be EXACT verbatim copies — preserve original capitalization and formatting
- In "differences", the "apple" value must quote from the Apple clause and "theirs" must quote from this document"""
        else:
            template = """You are a legal analyst comparing developer agreement clauses. Your task is to analyze the following document text ("{pdf_filename}") and find ALL clauses that match or relate to the following Apple Developer Agreement clause.

DOCUMENT TEXT TO ANALYZE:
{text_content}

APPLE CLAUSE TO FIND:
{apple_clause}

INSTRUCTIONS:
1. Read the ENTIRE document text carefully
2. Analyze the Apple clause above. If it contains multiple distinct legal concepts or ideas, break them down and analyze each one separately.
3. Find ALL clauses that match or relate to the Apple clause (or each distinct concept within it).
4. For each match, provide precise citations including:
   - Section/Article number (e.g., "Section 10.2", "Article 5")
   - Paragraph number within that section
   - Section title/heading
   - Full quoted text of the matching clause

5. Classify each match as:
   - IDENTICAL: Same legal effect, wording may differ slightly but meaning is equivalent
   - SIMILAR: Related clause with meaningful differences that could affect legal interpretation

6. For SIMILAR matches, provide a side-by-side comparison of key differences:
   - What aspect differs
   - Apple's version
   - Their version
   - Legal note explaining the significance

7. Provide an overall classification for the document:
   - IDENTICAL: At least one match is IDENTICAL
   - SIMILAR: Only SIMILAR matches found, no IDENTICAL
   - NOT_PRESENT: No comparable clauses found

8. Every match MUST include an "aspect_label" field: a short label (2-5 words) identifying which legal concept it addresses.

OUTPUT FORMAT:
You MUST respond with valid JSON only:

{{
  "classification": "IDENTICAL" | "SIMILAR" | "NOT_PRESENT",
  "has_multiple_aspects": true | false,
  "summary": "Brief one-line finding",
  "matches": [
    {{
      "type": "IDENTICAL" | "SIMILAR",
      "aspect_label": "<2-5 word label>",
      "page": <number or null>,
      "section": "<section number>",
      "section_title": "<section heading>",
      "paragraph": <number>,
      "full_text": "<exact quoted text>",
      "differences": [
        {{
          "aspect": "<what differs>",
          "apple": "<Apple's version>",
          "theirs": "<their version>"
        }}
      ],
      "legal_note": "<legal significance>"
    }}
  ],
  "analysis": "<Overall comparison summary>"
}}

IMPORTANT:
- Return ONLY valid JSON, no markdown code blocks
- If no matches found, return classification: "NOT_PRESENT" with empty matches array
- For IDENTICAL matches, differences array should be empty
- Every match MUST have an aspect_label
- Full quoted text must be EXACT verbatim copies — preserve original casing"""

        result = template.replace("{apple_clause}", apple_clause).replace("{pdf_filename}", pdf_filename).replace("{text_content}", text_content)
        if aspects_block:
            result = result.replace("{aspects_block}", aspects_block)
            result = result.replace("{has_multiple}", "true" if len(aspects) > 1 else "false")
        return result

    # PDF-based prompt
    if aspects_block:
        template = """You are a legal analyst comparing developer agreement clauses. Your task is to analyze the attached PDF document ("{pdf_filename}") and find clauses that match or relate to specific aspects of the following Apple Developer Agreement clause.

APPLE CLAUSE:
{apple_clause}

THE FOLLOWING ASPECTS HAVE BEEN IDENTIFIED IN THE APPLE CLAUSE. You MUST report on EVERY aspect listed below:
{aspects_block}

INSTRUCTIONS:
1. Read the ENTIRE PDF document carefully.
2. For EACH aspect listed above, search the document for any clause that addresses the same legal concept.
3. For each aspect, find the BEST matching clause in the document. If multiple sections address the same aspect, pick the most relevant one.
4. For each match, provide precise citations including:
   - Page number (exact page where the clause appears)
   - Section/Article number (e.g., "Section 10.2", "Article 5")
   - Paragraph number within that section
   - Section title/heading
   - Full quoted text of the matching clause

5. Classify each match as:
   - IDENTICAL: Same legal effect, wording may differ slightly but meaning is equivalent
   - SIMILAR: Related clause with meaningful differences that could affect legal interpretation
   - NOT_PRESENT: No comparable clause exists in this document for this aspect

6. For SIMILAR matches, provide a side-by-side comparison of key differences:
   - What aspect differs
   - Apple's version (quote from the Apple clause)
   - Their version (quote from this document)
   - Legal note explaining the significance

7. Provide an overall classification for the document:
   - IDENTICAL: At least one aspect match is IDENTICAL
   - SIMILAR: Only SIMILAR matches found
   - NOT_PRESENT: No comparable clauses found for any aspect

OUTPUT FORMAT:
You MUST respond with valid JSON only, using this exact schema:

{{
  "classification": "IDENTICAL" | "SIMILAR" | "NOT_PRESENT",
  "has_multiple_aspects": {has_multiple},
  "summary": "Brief one-line finding",
  "matches": [
    {{
      "type": "IDENTICAL" | "SIMILAR" | "NOT_PRESENT",
      "aspect_label": "<MUST be one of the exact aspect labels listed above>",
      "page": <number or null>,
      "section": "<section number or empty string if NOT_PRESENT>",
      "section_title": "<section heading or empty string if NOT_PRESENT>",
      "paragraph": <number or null>,
      "full_text": "<exact quoted text or empty string if NOT_PRESENT>",
      "differences": [
        {{
          "aspect": "<what differs>",
          "apple": "<Apple's version — quote from the Apple clause>",
          "theirs": "<their version — quote from this document>"
        }}
      ],
      "legal_note": "<explanation of legal significance>"
    }}
  ],
  "analysis": "<Overall comparison summary>"
}}

CRITICAL RULES:
- You MUST include exactly one match entry for EACH aspect listed above — no more, no less
- The "aspect_label" in each match MUST exactly match one of the aspect labels provided above
- If an aspect is not found in the document, include a match with type: "NOT_PRESENT" and empty section/full_text
- For IDENTICAL matches, differences array should be empty
- Return ONLY valid JSON, no markdown code blocks, no explanatory text
- Page numbers must be accurate - cite the exact page where text appears
- Full quoted text must be EXACT verbatim copies — preserve original capitalization and formatting
- In "differences", the "apple" value must quote from the Apple clause and "theirs" must quote from this document"""
    else:
        template = """You are a legal analyst comparing developer agreement clauses. Your task is to analyze the attached PDF document ("{pdf_filename}") and find ALL clauses that match or relate to the following Apple Developer Agreement clause.

APPLE CLAUSE TO FIND:
{apple_clause}

INSTRUCTIONS:
1. Read the ENTIRE PDF document carefully
2. Analyze the Apple clause above. If it contains multiple distinct legal concepts or ideas, break them down and analyze each one separately.
3. Find ALL clauses that match or relate to the Apple clause (or each distinct concept within it).
4. For each match, provide precise citations including:
   - Page number (exact page where the clause appears)
   - Section/Article number (e.g., "Section 10.2", "Article 5")
   - Paragraph number within that section
   - Section title/heading
   - Full quoted text of the matching clause

5. Classify each match as:
   - IDENTICAL: Same legal effect, wording may differ slightly but meaning is equivalent
   - SIMILAR: Related clause with meaningful differences that could affect legal interpretation

6. For SIMILAR matches, provide a side-by-side comparison of key differences:
   - What aspect differs
   - Apple's version
   - Their version
   - Legal note explaining the significance

7. Provide an overall classification for the document:
   - IDENTICAL: At least one match is IDENTICAL
   - SIMILAR: Only SIMILAR matches found, no IDENTICAL
   - NOT_PRESENT: No comparable clauses found

8. Every match MUST include an "aspect_label" field: a short label (2-5 words) identifying which legal concept it addresses.

OUTPUT FORMAT:
You MUST respond with valid JSON only:

{{
  "classification": "IDENTICAL" | "SIMILAR" | "NOT_PRESENT",
  "has_multiple_aspects": true | false,
  "summary": "Brief one-line finding",
  "matches": [
    {{
      "type": "IDENTICAL" | "SIMILAR",
      "aspect_label": "<2-5 word label>",
      "page": <number>,
      "section": "<section number>",
      "section_title": "<section heading>",
      "paragraph": <number>,
      "full_text": "<exact quoted text>",
      "differences": [
        {{
          "aspect": "<what differs>",
          "apple": "<Apple's version>",
          "theirs": "<their version>"
        }}
      ],
      "legal_note": "<legal significance>"
    }}
  ],
  "analysis": "<Overall comparison summary>"
}}

IMPORTANT:
- Return ONLY valid JSON, no markdown code blocks
- If no matches found, return classification: "NOT_PRESENT" with empty matches array
- For IDENTICAL matches, differences array should be empty
- Every match MUST have an aspect_label
- Page numbers must be accurate
- Full quoted text must be EXACT verbatim copies — preserve original casing"""

    result = template.replace("{apple_clause}", apple_clause).replace("{pdf_filename}", pdf_filename)
    if aspects_block:
        result = result.replace("{aspects_block}", aspects_block)
        result = result.replace("{has_multiple}", "true" if len(aspects) > 1 else "false")
    return result

