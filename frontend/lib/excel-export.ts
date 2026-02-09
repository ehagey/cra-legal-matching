import * as XLSX from "xlsx";
import type { AnalysisResult } from "./types";

/**
 * Convert analysis results to Excel format with one sheet per clause.
 */
export function exportResultsToExcel(results: AnalysisResult[]): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new();

  // Group results by clause and preserve order
  const clauseGroups: Record<string, AnalysisResult[]> = {};
  const clauseOrder: string[] = []; // Track order of first appearance
  const clauseIndices: Record<string, number> = {}; // Track clause index for ordering
  
  for (const result of results) {
    const clause = result.apple_clause;
    // Track clause order based on first appearance
    if (!clauseGroups[clause]) {
      clauseGroups[clause] = [];
      clauseOrder.push(clause);
      // Try to get clause index from result if available (for ordering)
      const clauseIdx = (result as any)._clause_idx;
      if (clauseIdx !== undefined) {
        clauseIndices[clause] = clauseIdx;
      }
    }
    clauseGroups[clause].push(result);
  }
  
  // Sort clauses by their original index if available, otherwise by first appearance
  const sortedClauses = [...clauseOrder].sort((a, b) => {
    const idxA = clauseIndices[a] ?? clauseOrder.indexOf(a);
    const idxB = clauseIndices[b] ?? clauseOrder.indexOf(b);
    return idxA - idxB;
  });

  // Helper to check if result is from a PDF (not HTML link)
  const isPdf = (filename: string): boolean => {
    return filename.toLowerCase().endsWith(".pdf") || !filename.startsWith("http");
  };

  // Create one sheet per clause in original order
  for (const clause of sortedClauses) {
    const clauseResults = clauseGroups[clause];
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
    // Use clause index + shortened text for better naming
    const clauseIdx = clauseIndices[clause] ?? sortedClauses.indexOf(clause);
    const clauseNum = clauseIdx + 1;
    
    // Try to create a meaningful name
    let sheetName = (clause || "").trim();
    if (!sheetName || sheetName.length === 0 || sheetName === "…") {
      // Fallback to numbered name if clause is empty or just truncation marker
      sheetName = `Clause ${clauseNum}`;
    } else {
      // Remove truncation marker if present
      if (sheetName.endsWith("…")) {
        sheetName = sheetName.slice(0, -1);
      }
      // Take first line or first 20 chars, then add clause number
      const firstLine = sheetName.split('\n')[0].split('\r')[0].trim();
      const shortText = firstLine.length > 20 ? firstLine.substring(0, 20) : firstLine;
      if (shortText.length > 0) {
        sheetName = `Clause ${clauseNum}: ${shortText}`;
      } else {
        sheetName = `Clause ${clauseNum}`;
      }
    }
    
    // Excel doesn't allow certain characters in sheet names
    sheetName = sheetName.replace(/[\\/?*\[\]:]/g, "_");
    
    // Truncate to 31 chars (Excel limit)
    if (sheetName.length > 31) {
      sheetName = sheetName.substring(0, 31);
    }
    
    // Ensure we have a valid name (not empty)
    if (!sheetName || sheetName.trim().length === 0) {
      sheetName = `Clause ${clauseNum}`;
    }
    
    // Ensure unique sheet names
    let finalSheetName = sheetName.trim();
    let counter = 1;
    while (workbook.SheetNames.includes(finalSheetName)) {
      const baseName = sheetName.length > 25 ? sheetName.substring(0, 25) : sheetName;
      finalSheetName = `${baseName}_${counter}`;
      counter++;
      // Safety check to prevent infinite loop
      if (counter > 100) break;
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

