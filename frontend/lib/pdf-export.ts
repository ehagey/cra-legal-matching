import jsPDF from "jspdf";
import type { AnalysisResult } from "./types";

/**
 * Convert analysis results to PDF format with one section per clause.
 */
export function exportResultsToPDF(results: AnalysisResult[]): jsPDF {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const maxWidth = pageWidth - 2 * margin;
  let yPos = margin;

  // Helper to check if result is from a PDF (not HTML link)
  const isPdf = (filename: string): boolean => {
    return filename.toLowerCase().endsWith(".pdf") || !filename.startsWith("http");
  };

  // Helper to add a new page if needed
  const checkPageBreak = (requiredHeight: number) => {
    if (yPos + requiredHeight > pageHeight - margin) {
      doc.addPage();
      yPos = margin;
    }
  };

  // Helper to add text with word wrapping
  const addWrappedText = (text: string, fontSize: number, isBold: boolean = false) => {
    doc.setFontSize(fontSize);
    if (isBold) {
      doc.setFont(undefined, "bold");
    } else {
      doc.setFont(undefined, "normal");
    }
    
    const lines = doc.splitTextToSize(text, maxWidth);
    checkPageBreak(lines.length * (fontSize * 0.4) + 5);
    
    lines.forEach((line: string) => {
      doc.text(line, margin, yPos);
      yPos += fontSize * 0.4;
    });
    
    yPos += 3;
  };

  // Group results by clause and preserve order
  const clauseGroups: Record<string, AnalysisResult[]> = {};
  const clauseOrder: string[] = [];
  const clauseIndices: Record<string, number> = {};
  
  for (const result of results) {
    const clause = result.apple_clause;
    if (!clauseGroups[clause]) {
      clauseGroups[clause] = [];
      clauseOrder.push(clause);
      const clauseIdx = (result as any)._clause_idx;
      if (clauseIdx !== undefined) {
        clauseIndices[clause] = clauseIdx;
      }
    }
    clauseGroups[clause].push(result);
  }
  
  // Sort clauses by their original index
  const sortedClauses = [...clauseOrder].sort((a, b) => {
    const idxA = clauseIndices[a] ?? clauseOrder.indexOf(a);
    const idxB = clauseIndices[b] ?? clauseOrder.indexOf(b);
    return idxA - idxB;
  });

  // Add title
  doc.setFontSize(18);
  doc.setFont(undefined, "bold");
  doc.text("Legal Clause Analysis Report", margin, yPos);
  yPos += 15;

  doc.setFontSize(10);
  doc.setFont(undefined, "normal");
  doc.text(`Generated: ${new Date().toLocaleDateString()}`, margin, yPos);
  yPos += 10;

  // Process each clause
  for (const clause of sortedClauses) {
    const clauseResults = clauseGroups[clause];
    const clauseIdx = clauseIndices[clause] ?? sortedClauses.indexOf(clause);
    const clauseNum = clauseIdx + 1;

    checkPageBreak(30);

    // Clause header
    doc.setFontSize(14);
    doc.setFont(undefined, "bold");
    const clauseTitle = `Clause ${clauseNum}`;
    doc.text(clauseTitle, margin, yPos);
    yPos += 10;

    // Clause text
    doc.setFontSize(10);
    doc.setFont(undefined, "normal");
    const clauseText = clause.length > 200 ? clause.substring(0, 200) + "..." : clause;
    addWrappedText(`Clause Text: ${clauseText}`, 9);
    yPos += 5;

    // Process each result for this clause
    for (const result of clauseResults) {
      checkPageBreak(40);

      // Document name
      doc.setFontSize(11);
      doc.setFont(undefined, "bold");
      doc.text(`Document: ${result.pdf_filename}`, margin, yPos);
      yPos += 8;

      // Classification
      doc.setFontSize(10);
      doc.setFont(undefined, "normal");
      const classificationColors: Record<string, [number, number, number]> = {
        IDENTICAL: [34, 197, 94], // green
        SIMILAR: [234, 179, 8],   // yellow/amber
        NOT_PRESENT: [156, 163, 175], // gray
        ERROR: [239, 68, 68],      // red
      };
      const color = classificationColors[result.classification] || [0, 0, 0];
      doc.setTextColor(color[0], color[1], color[2]);
      doc.text(`Classification: ${result.classification}`, margin, yPos);
      doc.setTextColor(0, 0, 0);
      yPos += 6;

      // Summary
      if (result.summary) {
        addWrappedText(`Summary: ${result.summary}`, 9);
      }

      // Matches
      if (result.matches && result.matches.length > 0) {
        doc.setFontSize(10);
        doc.setFont(undefined, "bold");
        doc.text(`Matches Found: ${result.matches.length}`, margin, yPos);
        yPos += 8;

        result.matches.forEach((match, idx) => {
          checkPageBreak(50);

          doc.setFontSize(9);
          doc.setFont(undefined, "bold");
          doc.text(`Match ${idx + 1} (${match.type})`, margin, yPos);
          yPos += 6;

          doc.setFont(undefined, "normal");
          const isPdfResult = isPdf(result.pdf_filename);
          
          if (isPdfResult && match.page) {
            doc.text(`Page: ${match.page}`, margin, yPos);
            yPos += 5;
          }
          
          if (match.section) {
            doc.text(`Section: ${match.section}`, margin, yPos);
            yPos += 5;
          }
          
          if (match.section_title) {
            addWrappedText(`Section Title: ${match.section_title}`, 9);
          }
          
          if (match.paragraph) {
            doc.text(`Paragraph: ${match.paragraph}`, margin, yPos);
            yPos += 5;
          }

          if (match.full_text) {
            doc.setFont(undefined, "bold");
            doc.text("Quoted Text:", margin, yPos);
            yPos += 5;
            doc.setFont(undefined, "normal");
            addWrappedText(match.full_text, 8);
          }

          if (match.differences && match.differences.length > 0) {
            doc.setFont(undefined, "bold");
            doc.text("Differences:", margin, yPos);
            yPos += 5;
            doc.setFont(undefined, "normal");
            
            match.differences.forEach((diff) => {
              const diffText = `${diff.aspect}: Apple="${diff.apple}" vs Their="${diff.theirs}"`;
              addWrappedText(diffText, 8);
            });
          }

          if (match.legal_note) {
            doc.setFont(undefined, "italic");
            addWrappedText(`Legal Note: ${match.legal_note}`, 8);
            doc.setFont(undefined, "normal");
          }

          yPos += 5;
        });
      }

      // Analysis
      if (result.analysis) {
        checkPageBreak(30);
        doc.setFontSize(9);
        doc.setFont(undefined, "bold");
        doc.text("Overall Analysis:", margin, yPos);
        yPos += 6;
        doc.setFont(undefined, "normal");
        addWrappedText(result.analysis, 8);
      }

      // Error
      if (result.error) {
        doc.setFontSize(9);
        doc.setTextColor(239, 68, 68);
        doc.text(`Error: ${result.error}`, margin, yPos);
        doc.setTextColor(0, 0, 0);
        yPos += 6;
      }

      yPos += 10;
    }

    // Add page break between clauses
    if (sortedClauses.indexOf(clause) < sortedClauses.length - 1) {
      yPos += 10;
      if (yPos > pageHeight - 40) {
        doc.addPage();
        yPos = margin;
      }
    }
  }

  return doc;
}

/**
 * Download PDF file.
 */
export function downloadPDF(doc: jsPDF, filename: string = "legal-analysis-results.pdf") {
  doc.save(filename);
}

