import * as XLSX from "xlsx";
import type { AnalysisResult } from "./types";

/**
 * Convert analysis results to Excel format with one sheet per clause.
 */
export function exportResultsToExcel(results: AnalysisResult[]): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new();

  // Group results by clause
  const clauseGroups: Record<string, AnalysisResult[]> = {};
  for (const result of results) {
    const clause = result.apple_clause;
    if (!clauseGroups[clause]) {
      clauseGroups[clause] = [];
    }
    clauseGroups[clause].push(result);
  }

  // Helper to check if result is from a PDF (not HTML link)
  const isPdf = (filename: string): boolean => {
    return filename.toLowerCase().endsWith(".pdf") || !filename.startsWith("http");
  };

  // Create one sheet per clause
  for (const [clause, clauseResults] of Object.entries(clauseGroups)) {
    const rows: any[] = [];

    // Header row
    rows.push([
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
    ]);

    // Data rows - one row per match, or one row per result if no matches
    for (const result of clauseResults) {
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

          rows.push([
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
          ]);
        }
      } else {
        // No matches - one row for the result
        rows.push([
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
        ]);
      }
    }

    // Create worksheet
    const worksheet = XLSX.utils.aoa_to_sheet(rows);

    // Set column widths for better readability
    const colWidths = [
      { wch: 30 }, // Document
      { wch: 15 }, // Classification
      { wch: 40 }, // Summary
      { wch: 12 }, // Match Type
      { wch: 12 }, // Section
      { wch: 30 }, // Section Title
      { wch: 8 },  // Page
      { wch: 10 }, // Paragraph
      { wch: 50 }, // Full Text
      { wch: 60 }, // Differences
      { wch: 50 }, // Legal Note
      { wch: 60 }, // Overall Analysis
      { wch: 30 }, // Error
    ];
    worksheet["!cols"] = colWidths;

    // Create sheet name from clause (Excel sheet names are limited to 31 chars)
    let sheetName = clause.substring(0, 31);
    // Excel doesn't allow certain characters in sheet names
    sheetName = sheetName.replace(/[\\/?*\[\]]/g, "_");
    // Ensure unique sheet names
    let finalSheetName = sheetName;
    let counter = 1;
    while (workbook.SheetNames.includes(finalSheetName)) {
      finalSheetName = `${sheetName.substring(0, 28)}_${counter}`;
      counter++;
    }

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, finalSheetName);
  }

  return workbook;
}

/**
 * Download Excel file.
 */
export function downloadExcel(workbook: XLSX.WorkBook, filename: string = "legal-analysis-results.xlsx") {
  XLSX.writeFile(workbook, filename);
}

