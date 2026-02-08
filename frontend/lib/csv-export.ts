import type { AnalysisResult } from "./types";

/**
 * Convert analysis results to a well-formatted CSV string.
 */
export function exportResultsToCSV(results: AnalysisResult[]): string {
  const rows: string[] = [];

  // Header row
  rows.push(
    [
      "Clause",
      "Document",
      "Classification",
      "Summary",
      "Match Type",
      "Section",
      "Section Title",
      "Page",
      "Paragraph",
      "Full Text",
      "Differences",
      "Legal Note",
      "Overall Analysis",
      "Error",
    ].join(",")
  );

  // Helper to check if result is from a PDF (not HTML link)
  const isPdf = (filename: string): boolean => {
    // PDFs typically end with .pdf or don't start with http/https
    return filename.toLowerCase().endsWith(".pdf") || !filename.startsWith("http");
  };

  // Data rows - one row per match, or one row per result if no matches
  for (const result of results) {
    const isPdfResult = isPdf(result.pdf_filename);
    
    if (result.matches && result.matches.length > 0) {
      // One row per match
      for (const match of result.matches) {
        const differences = match.differences || [];
        
        // Format differences as a readable string
        let differencesText = "";
        if (differences.length > 0) {
          differencesText = differences
            .map((diff) => {
              return `${diff.aspect || "N/A"}: Apple="${diff.apple || ""}" vs Their="${diff.theirs || ""}"`;
            })
            .join(" | ");
        }
        
        // Only show page number for PDFs
        const pageNumber = isPdfResult && match.page ? match.page.toString() : "";
        
        rows.push(
          escapeCSV([
            result.apple_clause,
            result.pdf_filename,
            result.classification,
            result.summary,
            match.type,
            match.section || "",
            match.section_title || "",
            pageNumber,
            match.paragraph?.toString() || "",
            match.full_text || "",
            differencesText,
            match.legal_note || "",
            result.analysis || "",
            result.error || "",
          ])
        );
      }
    } else {
      // No matches - one row for the result
      rows.push(
        escapeCSV([
          result.apple_clause,
          result.pdf_filename,
          result.classification,
          result.summary,
          "", // Match Type
          "", // Section
          "", // Section Title
          "", // Page (only for PDFs, but no match anyway)
          "", // Paragraph
          "", // Full Text
          "", // Differences
          "", // Legal Note
          result.analysis || "",
          result.error || "",
        ])
      );
    }
  }

  return rows.join("\n");
}

/**
 * Escape a value for CSV (handle commas, quotes, newlines).
 */
function escapeCSV(values: string[]): string {
  return values.map((value) => {
    if (value === null || value === undefined) {
      return "";
    }
    const str = String(value);
    // If contains comma, quote, or newline, wrap in quotes and escape quotes
    if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }).join(",");
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

