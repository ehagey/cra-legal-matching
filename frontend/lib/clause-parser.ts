/**
 * Parser for bulk-paste clause format.
 *
 * Expected input format:
 *
 *   Limitation of Liability Clause:
 *
 *   Section 13: "Apple And Its Affiliates …"
 *
 *   Section 3.1.d: "You will be solely responsible …"
 *
 *   Jurisdiction Clause:
 *
 *   Section 17: "This Agreement will be governed …"
 *
 * Each top-level title (line ending with "Clause:") groups its sub-sections.
 * Each section reference (Section X, Schedule X, Article X, Exhibit X, etc.)
 * followed by quoted text becomes its own clause for independent analysis.
 *
 * The output preserves the parent clause title so downstream display can
 * group sub-sections that belong to the same clause.
 */

export interface ParsedClause {
  /** Parent clause title, e.g. "Limitation of Liability Clause" */
  title: string;
  /** Section reference, e.g. "Section 13" or "Schedule 1, Section 5.2" */
  sectionRef: string;
  /** The quoted clause body text */
  body: string;
  /** Full text sent for analysis: title + section ref + body */
  fullText: string;
}

// Matches lines like "Limitation of Liability Clause:" or "Press release clause:"
// Must end with "Clause:" (case-insensitive), possibly followed by whitespace
const TITLE_RE = /^(.+\bClause\s*):?\s*$/i;

// Matches section references at the start of a line, e.g.:
//   Section 13:
//   Section 3.1.d:
//   Schedule 1, Section 5.2:
//   Schedule 1, Exhibit B, Section 6:
//   Article 5:
const SECTION_REF_RE =
  /^((?:Schedule\s+\d+(?:\.\d+)*\s*,\s*)?(?:Exhibit\s+\w+\s*,\s*)?(?:Section|Article)\s+[\d.]+(?:\.\w+)*(?:\s+of\s+Schedule\s+\d+(?:\s+and\s+\d+)?)?)\s*:\s*/i;

/**
 * Detect whether a block of text looks like the structured multi-clause format.
 * Returns true if it contains at least one title line AND one section reference.
 */
export function looksLikeBulkFormat(text: string): boolean {
  const lines = text.split("\n");
  let hasTitle = false;
  let hasSection = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (TITLE_RE.test(trimmed)) hasTitle = true;
    if (SECTION_REF_RE.test(trimmed)) hasSection = true;
    if (hasTitle && hasSection) return true;
  }
  return false;
}

/**
 * Parse bulk-paste text into individual clauses.
 *
 * Each section under a title heading becomes its own clause.
 * Returns an array of ParsedClause objects, or an empty array
 * if the text does not match the expected format.
 */
export function parseBulkClauses(text: string): ParsedClause[] {
  const results: ParsedClause[] = [];
  const lines = text.split("\n");

  let currentTitle = "";
  let currentSectionRef = "";
  let currentBody = "";
  let inSection = false;

  const flushSection = () => {
    if (currentSectionRef && currentBody.trim()) {
      const body = currentBody.trim();
      // Remove surrounding quotes if present
      const cleanBody = body.replace(/^[""\u201c]|[""\u201d]$/g, "").trim();
      const titlePart = currentTitle ? `${currentTitle}:\n` : "";
      const fullText = `${titlePart}${currentSectionRef}: "${cleanBody}"`;

      results.push({
        title: currentTitle,
        sectionRef: currentSectionRef,
        body: cleanBody,
        fullText,
      });
    }
    currentSectionRef = "";
    currentBody = "";
    inSection = false;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip empty lines
    if (!trimmed) continue;

    // Check for title line (e.g. "Limitation of Liability Clause:")
    const titleMatch = trimmed.match(TITLE_RE);
    if (titleMatch) {
      // Flush any pending section
      flushSection();
      // Clean up the title - remove trailing colon and "Clause" suffix for cleaner display,
      // but actually keep the full title as-is
      currentTitle = titleMatch[1].trim();
      // Remove trailing colon if present
      if (currentTitle.endsWith(":")) {
        currentTitle = currentTitle.slice(0, -1).trim();
      }
      continue;
    }

    // Check for section reference (e.g. "Section 13: ...")
    const sectionMatch = trimmed.match(SECTION_REF_RE);
    if (sectionMatch) {
      // Flush previous section if any
      flushSection();
      currentSectionRef = sectionMatch[1].trim();
      // The rest of the line after the section ref is the start of the body
      const rest = trimmed.slice(sectionMatch[0].length).trim();
      currentBody = rest;
      inSection = true;
      continue;
    }

    // Continuation of current section body
    if (inSection) {
      currentBody += "\n" + trimmed;
    }
  }

  // Flush last section
  flushSection();

  return results;
}

/**
 * Convert parsed clauses back into a string array for the existing analysis flow.
 * Each element is the fullText of a parsed clause.
 */
export function parsedClausesToStrings(parsed: ParsedClause[]): string[] {
  return parsed.map((p) => p.fullText);
}

