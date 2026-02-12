import type { AnalysisResult, Aspect } from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseClauseTitle(appleClause: string): { title: string; sectionRef: string } {
  const lines = appleClause.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length >= 2 && /clause\s*:?\s*$/i.test(lines[0])) {
    const title = lines[0].replace(/:?\s*$/, "").trim();
    const rest = lines.slice(1).join(" ");
    const sectionMatch = rest.match(
      /^((?:Schedule\s+\d+(?:\.\d+)*\s*,\s*)?(?:Exhibit\s+\w+\s*,\s*)?(?:Section|Article)\s+[\d.]+(?:\.\w+)*(?:\s+of\s+Schedule\s+\d+(?:\s+and\s+\d+)?)?)\s*:/i
    );
    const sectionRef = sectionMatch ? sectionMatch[1].trim() : "";
    return { title, sectionRef };
  }
  return { title: appleClause.slice(0, 80), sectionRef: "" };
}

function esc(values: string[]): string {
  return values
    .map((v) => {
      if (v == null) return "";
      const s = String(v);
      if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    })
    .join(",");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a clean, readable CSV.
 *
 * Layout:  Clause # | Clause Title | Document | Overall | Aspect | Match | Section | Matching Text | Differences | Legal Note
 *
 * Repeated clause/doc fields are left blank so the sheet groups visually.
 */
export function exportResultsToCSV(results: AnalysisResult[]): string {
  const rows: string[] = [];

  // --- Determine clause ordering ---
  const clauseOrder: string[] = [];
  const clauseIdx: Record<string, number> = {};
  for (const r of results) {
    if (!(r.apple_clause in clauseIdx)) {
      clauseIdx[r.apple_clause] = clauseOrder.length;
      clauseOrder.push(r.apple_clause);
    }
  }

  // --- Canonical aspects per clause ---
  const clauseAspects: Record<string, Aspect[]> = {};
  for (const r of results) {
    const c = r.apple_clause;
    if (clauseAspects[c]) continue;
    if (r._aspects && r._aspects.length > 0) {
      clauseAspects[c] = r._aspects;
    }
  }
  for (const c of clauseOrder) {
    if (clauseAspects[c]) continue;
    const labels: string[] = [];
    for (const r of results) {
      if (r.apple_clause !== c) continue;
      for (const m of r.matches || []) {
        const l = m.aspect_label || "";
        if (l && !labels.includes(l)) labels.push(l);
      }
    }
    clauseAspects[c] = labels.length > 0
      ? labels.map((l) => ({ label: l, description: "" }))
      : [{ label: "General", description: "" }];
  }

  // --- Documents per clause ---
  const docOrder: string[] = [];
  for (const r of results) {
    if (!docOrder.includes(r.pdf_filename)) docOrder.push(r.pdf_filename);
  }

  // --- Result lookup: clause → doc → result ---
  const lookup: Record<string, Record<string, AnalysisResult>> = {};
  for (const r of results) {
    if (!lookup[r.apple_clause]) lookup[r.apple_clause] = {};
    lookup[r.apple_clause][r.pdf_filename] = r;
  }

  // Header
  rows.push(esc([
    "Clause #",
    "Clause Title",
    "Document",
    "Overall",
    "Aspect",
    "Match",
    "Section",
    "Matching Text",
    "Key Differences",
    "Legal Note",
  ]));

  // --- Rows ---
  for (let ci = 0; ci < clauseOrder.length; ci++) {
    const clause = clauseOrder[ci];
    const clauseNum = ci + 1;
    const { title } = parseClauseTitle(clause);
    const aspects = clauseAspects[clause] || [];

    let firstClauseRow = true;

    for (const doc of docOrder) {
      const r = lookup[clause]?.[doc];
      if (!r) continue;

      let firstDocRow = true;

      // Build match lookup
      const matchByAspect: Record<string, (typeof r.matches)[0]> = {};
      for (const m of r.matches || []) {
        if (m.aspect_label) matchByAspect[m.aspect_label] = m;
      }

      if (r.classification === "ERROR") {
        rows.push(esc([
          firstClauseRow ? `Clause ${clauseNum}` : "",
          firstClauseRow ? title : "",
          doc,
          "ERROR",
          "",
          "",
          "",
          "",
          "",
          r.error || r.summary || "",
        ]));
        firstClauseRow = false;
        continue;
      }

      for (const aspect of aspects) {
        const m = matchByAspect[aspect.label];

        const diffs = m?.differences?.map((d) => `${d.aspect}: ${d.theirs}`).join(" | ") || "";

        rows.push(esc([
          firstClauseRow ? `Clause ${clauseNum}` : "",
          firstClauseRow ? title : "",
          firstDocRow ? doc : "",
          firstDocRow ? (r.classification === "NOT_PRESENT" ? "NOT PRESENT" : r.classification) : "",
          aspect.label,
          m ? (m.type === "NOT_PRESENT" ? "NOT PRESENT" : m.type) : "NOT PRESENT",
          m?.section || "",
          m?.full_text || "",
          diffs,
          m?.legal_note || "",
        ]));

        firstClauseRow = false;
        firstDocRow = false;
      }
    }

    // Blank separator row between clauses
    if (ci < clauseOrder.length - 1) {
      rows.push("");
    }
  }

  return rows.join("\n");
}

/**
 * Download CSV file.
 */
export function downloadCSV(csvContent: string, filename: string = "legal-analysis-results.csv") {
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
