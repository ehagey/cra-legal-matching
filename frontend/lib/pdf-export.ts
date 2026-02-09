import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { AnalysisResult } from "./types";

/**
 * Convert analysis results to PDF format matching the UI presentation.
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
  const addWrappedText = (text: string, fontSize: number, isBold: boolean = false, color?: [number, number, number]) => {
    doc.setFontSize(fontSize);
    if (isBold) {
      doc.setFont(undefined, "bold");
    } else {
      doc.setFont(undefined, "normal");
    }
    
    if (color) {
      doc.setTextColor(color[0], color[1], color[2]);
    }
    
    const maxWidth = pageWidth - 2 * margin;
    const lines = doc.splitTextToSize(text, maxWidth);
    checkPageBreak(lines.length * (fontSize * 0.4) + 5);
    
    lines.forEach((line: string) => {
      doc.text(line, margin, yPos);
      yPos += fontSize * 0.4;
    });
    
    doc.setTextColor(0, 0, 0);
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
      checkPageBreak(50);

      // Document name (like UI)
      doc.setFontSize(10);
      doc.setFont(undefined, "bold");
      doc.text(result.pdf_filename, margin, yPos);
      yPos += 7;

      // Summary (like UI)
      if (result.summary) {
        doc.setFontSize(9);
        doc.setFont(undefined, "normal");
        doc.setTextColor(100, 100, 100);
        addWrappedText(result.summary, 9);
        doc.setTextColor(0, 0, 0);
        yPos += 5;
      }

      // Classification badge (like UI)
      doc.setFontSize(9);
      doc.setFont(undefined, "bold");
      const classificationText = formatClassification(result.classification);
      doc.text(classificationText, margin, yPos);
      yPos += 8;

      // Error display
      if (result.classification === "ERROR" && result.error) {
        doc.setFontSize(8);
        doc.setFont(undefined, "normal");
        doc.setTextColor(200, 0, 0);
        addWrappedText(result.error, 8);
        doc.setTextColor(0, 0, 0);
        yPos += 5;
      }

      // Matches section (like UI)
      if (result.matches && result.matches.length > 0) {
        doc.setFontSize(9);
        doc.setFont(undefined, "normal");
        doc.text(`${result.matches.length} match${result.matches.length !== 1 ? "es" : ""} found`, margin, yPos);
        yPos += 10;

        result.matches.forEach((match, idx) => {
          checkPageBreak(80);

          // Match header (like UI: "Match 1 - SIMILAR")
          doc.setFontSize(9);
          doc.setFont(undefined, "bold");
          doc.text(`Match ${idx + 1}`, margin, yPos);
          doc.setFont(undefined, "normal");
          doc.text(` - ${match.type}`, margin + 25, yPos);
          yPos += 8;

          // Location info (like UI: Page, Section, Paragraph)
          doc.setFontSize(8);
          doc.setFont(undefined, "normal");
          doc.setTextColor(100, 100, 100);
          const isPdfResult = isPdf(result.pdf_filename);
          
          const locationData: string[][] = [];
          if (isPdfResult && match.page) {
            locationData.push(["Page", match.page.toString()]);
          }
          if (match.section) {
            locationData.push(["Section", match.section]);
          }
          if (match.paragraph) {
            locationData.push(["Paragraph", match.paragraph.toString()]);
          }
          
          if (locationData.length > 0) {
            autoTable(doc, {
              startY: yPos,
              body: locationData,
              theme: "plain",
              bodyStyles: {
                fontSize: 8,
                textColor: [100, 100, 100]
              },
              columnStyles: {
                0: { cellWidth: 40, fontStyle: "normal" },
                1: { cellWidth: 60, fontStyle: "normal" }
              },
              margin: { left: margin, right: margin },
              tableWidth: 100,
              styles: {
                lineColor: [255, 255, 255],
                lineWidth: 0
              }
            });
            yPos = (doc as any).lastAutoTable.finalY + 5;
          }
          
          if (match.section_title) {
            doc.text(match.section_title, margin, yPos);
            yPos += 5;
          }
          doc.setTextColor(0, 0, 0);

          // Quoted Text (like UI - in a box)
          if (match.full_text) {
            doc.setFontSize(8);
            doc.setFont(undefined, "bold");
            doc.text("Quoted Text", margin, yPos);
            yPos += 6;
            
            doc.setFont(undefined, "normal");
            doc.setDrawColor(220, 220, 220);
            doc.setLineWidth(0.5);
            const textLines = doc.splitTextToSize(match.full_text, pageWidth - 2 * margin - 10);
            const textBoxHeight = textLines.length * 4 + 8;
            doc.rect(margin, yPos, pageWidth - 2 * margin, textBoxHeight);
            doc.setTextColor(40, 40, 40);
            textLines.forEach((line: string, lineIdx: number) => {
              doc.text(line, margin + 5, yPos + 5 + lineIdx * 4);
            });
            doc.setTextColor(0, 0, 0);
            yPos += textBoxHeight + 8;
          }

          // Key Differences table (like UI - Aspect | Apple | Theirs)
          if (match.differences && match.differences.length > 0) {
            doc.setFontSize(8);
            doc.setFont(undefined, "bold");
            doc.text("Key Differences", margin, yPos);
            yPos += 6;

            const diffData = match.differences.map((diff) => [
              diff.aspect || "N/A",
              diff.apple || "N/A",
              diff.theirs || "N/A"
            ]);

            autoTable(doc, {
              startY: yPos,
              head: [["Aspect", "Apple", "Theirs"]],
              body: diffData,
              theme: "striped",
              headStyles: {
                fillColor: [250, 250, 250],
                textColor: [0, 0, 0],
                fontStyle: "bold",
                fontSize: 8,
                lineColor: [220, 220, 220],
                lineWidth: 0.5
              },
              bodyStyles: {
                fontSize: 8,
                textColor: [0, 0, 0],
                lineColor: [240, 240, 240],
                lineWidth: 0.3
              },
              columnStyles: {
                0: { cellWidth: 50, fontStyle: "normal" },
                1: { cellWidth: 70, fontStyle: "normal" },
                2: { cellWidth: 70, fontStyle: "normal" }
              },
              margin: { left: margin, right: margin },
              styles: {
                lineColor: [220, 220, 220],
                lineWidth: 0.5
              }
            });

            yPos = (doc as any).lastAutoTable.finalY + 8;
          }

          // Legal note (like UI)
          if (match.legal_note) {
            doc.setFontSize(8);
            doc.setFont(undefined, "normal");
            doc.setTextColor(100, 100, 100);
            addWrappedText(match.legal_note, 8);
            doc.setTextColor(0, 0, 0);
            yPos += 5;
          }

          yPos += 8;
        });
      }

      // Overall analysis (like UI - collapsible section)
      if (result.analysis) {
        checkPageBreak(30);
        doc.setFontSize(8);
        doc.setFont(undefined, "bold");
        doc.text("Full Analysis", margin, yPos);
        yPos += 6;
        doc.setFont(undefined, "normal");
        doc.setTextColor(100, 100, 100);
        addWrappedText(result.analysis, 8);
        doc.setTextColor(0, 0, 0);
        yPos += 8;
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
