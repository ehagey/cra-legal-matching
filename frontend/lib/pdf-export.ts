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
  let yPos = margin;

  // Helper to check if result is from a PDF (not HTML link)
  const isPdf = (filename: string): boolean => {
    return filename.toLowerCase().endsWith(".pdf") || !filename.startsWith("http");
  };

  // Helper to format classification text
  const formatClassification = (classification: string): string => {
    return classification.replace(/_/g, " ");
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
    
    const maxWidth = pageWidth - 2 * margin;
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

  // Simple header
  doc.setFontSize(14);
  doc.setFont(undefined, "bold");
  doc.text("Legal Clause Analysis", margin, yPos);
  yPos += 8;
  
  doc.setFontSize(9);
  doc.setFont(undefined, "normal");
  doc.text(`Generated: ${new Date().toLocaleDateString()}`, margin, yPos);
  yPos += 15;

  // Process each clause
  for (const clause of sortedClauses) {
    const clauseResults = clauseGroups[clause];
    const clauseIdx = clauseIndices[clause] ?? sortedClauses.indexOf(clause);
    const clauseNum = clauseIdx + 1;

    checkPageBreak(30);

    // Clause header
    doc.setFontSize(12);
    doc.setFont(undefined, "bold");
    doc.text(`Clause ${clauseNum}`, margin, yPos);
    yPos += 10;

    // Clause text
    doc.setFontSize(9);
    doc.setFont(undefined, "normal");
    doc.setTextColor(100, 100, 100);
    const clauseText = clause.length > 400 ? clause.substring(0, 400) + "..." : clause;
    addWrappedText(clauseText, 9);
    doc.setTextColor(0, 0, 0);
    yPos += 8;

    // Process each result for this clause
    for (const result of clauseResults) {
      checkPageBreak(40);

      // Document name
      doc.setFontSize(10);
      doc.setFont(undefined, "bold");
      doc.text(result.pdf_filename, margin, yPos);
      yPos += 7;

      // Classification and summary
      doc.setFontSize(9);
      doc.setFont(undefined, "normal");
      doc.text(`Classification: ${formatClassification(result.classification)}`, margin, yPos);
      yPos += 6;
      
      if (result.summary) {
        addWrappedText(result.summary, 9);
        yPos += 3;
      }

      // Matches
      if (result.matches && result.matches.length > 0) {
        doc.setFontSize(9);
        doc.setFont(undefined, "normal");
        doc.text(`${result.matches.length} match${result.matches.length !== 1 ? "es" : ""} found`, margin, yPos);
        yPos += 8;

        result.matches.forEach((match, idx) => {
          checkPageBreak(50);

          doc.setFontSize(9);
          doc.setFont(undefined, "bold");
          doc.text(`Match ${idx + 1} - ${match.type}`, margin, yPos);
          yPos += 7;

          // Location info
          doc.setFontSize(8);
          doc.setFont(undefined, "normal");
          const isPdfResult = isPdf(result.pdf_filename);
          const locationParts: string[] = [];
          if (isPdfResult && match.page) locationParts.push(`Page ${match.page}`);
          if (match.section) locationParts.push(`Section ${match.section}`);
          if (match.paragraph) locationParts.push(`Paragraph ${match.paragraph}`);
          if (locationParts.length > 0) {
            doc.text(locationParts.join(" · "), margin, yPos);
            yPos += 5;
          }
          
          if (match.section_title) {
            doc.text(match.section_title, margin, yPos);
            yPos += 5;
          }

          // Quoted text
          if (match.full_text) {
            doc.setFontSize(8);
            doc.setFont(undefined, "normal");
            doc.setDrawColor(220, 220, 220);
            doc.setLineWidth(0.3);
            const textLines = doc.splitTextToSize(match.full_text, pageWidth - 2 * margin - 10);
            const textBoxHeight = textLines.length * 4 + 6;
            doc.rect(margin, yPos, pageWidth - 2 * margin, textBoxHeight);
            doc.setTextColor(60, 60, 60);
            textLines.forEach((line: string, lineIdx: number) => {
              doc.text(line, margin + 3, yPos + 4 + lineIdx * 4);
            });
            doc.setTextColor(0, 0, 0);
            yPos += textBoxHeight + 6;
          }

          // Differences
          if (match.differences && match.differences.length > 0) {
            doc.setFontSize(8);
            doc.setFont(undefined, "normal");
            match.differences.forEach((diff) => {
              const diffText = `${diff.aspect}: Apple="${diff.apple}" vs Their="${diff.theirs}"`;
              addWrappedText(diffText, 8);
              yPos += 2;
            });
          }

          // Legal note
          if (match.legal_note) {
            doc.setFontSize(8);
            doc.setFont(undefined, "normal");
            doc.setTextColor(100, 100, 100);
            addWrappedText(`Note: ${match.legal_note}`, 8);
            doc.setTextColor(0, 0, 0);
            yPos += 2;
          }

          yPos += 5;
        });
      }

      // Overall analysis
      if (result.analysis) {
        checkPageBreak(30);
        doc.setFontSize(8);
        doc.setFont(undefined, "normal");
        doc.setTextColor(100, 100, 100);
        addWrappedText(result.analysis, 8);
        doc.setTextColor(0, 0, 0);
        yPos += 5;
      }

      // Error
      if (result.error) {
        doc.setFontSize(8);
        doc.setFont(undefined, "normal");
        doc.setTextColor(200, 0, 0);
        doc.text(`Error: ${result.error}`, margin, yPos);
        doc.setTextColor(0, 0, 0);
        yPos += 6;
      }

      yPos += 10;
    }

    // Add spacing between clauses
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
