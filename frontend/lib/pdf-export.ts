import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
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

  // Add title page
  doc.setFontSize(24);
  doc.setFont(undefined, "bold");
  doc.setTextColor(30, 58, 138); // Blue color
  doc.text("Legal Clause Analysis", pageWidth / 2, 60, { align: "center" });
  
  doc.setFontSize(14);
  doc.setFont(undefined, "normal");
  doc.setTextColor(0, 0, 0);
  doc.text("Comprehensive Agreement Comparison Report", pageWidth / 2, 75, { align: "center" });
  
  doc.setFontSize(10);
  doc.text(`Generated: ${new Date().toLocaleDateString("en-US", { 
    year: "numeric", 
    month: "long", 
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  })}`, pageWidth / 2, 90, { align: "center" });
  
  doc.setFontSize(10);
  doc.text(`Total Clauses Analyzed: ${sortedClauses.length}`, pageWidth / 2, 105, { align: "center" });
  doc.text(`Total Documents Compared: ${results.length}`, pageWidth / 2, 115, { align: "center" });
  
  yPos = 140;
  doc.addPage();
  yPos = margin;

  // Table of Contents
  doc.setFontSize(16);
  doc.setFont(undefined, "bold");
  doc.text("Table of Contents", margin, yPos);
  yPos += 10;

  doc.setFontSize(10);
  doc.setFont(undefined, "normal");
  sortedClauses.forEach((clause, idx) => {
    const clauseIdx = clauseIndices[clause] ?? idx;
    const clauseNum = clauseIdx + 1;
    const clausePreview = clause.length > 60 ? clause.substring(0, 60) + "..." : clause;
    doc.text(`Clause ${clauseNum}: ${clausePreview}`, margin + 5, yPos);
    yPos += 7;
  });

  yPos += 10;
  doc.addPage();
  yPos = margin;

  // Process each clause
  for (const clause of sortedClauses) {
    const clauseResults = clauseGroups[clause];
    const clauseIdx = clauseIndices[clause] ?? sortedClauses.indexOf(clause);
    const clauseNum = clauseIdx + 1;

    checkPageBreak(40);

    // Clause header with background
    doc.setFillColor(30, 58, 138); // Blue background
    doc.rect(margin, yPos - 8, pageWidth - 2 * margin, 15, "F");
    
    doc.setFontSize(16);
    doc.setFont(undefined, "bold");
    doc.setTextColor(255, 255, 255); // White text
    doc.text(`Clause ${clauseNum}`, margin + 5, yPos);
    doc.setTextColor(0, 0, 0);
    yPos += 15;

    // Clause text in a box
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.5);
    const clauseText = clause.length > 500 ? clause.substring(0, 500) + "..." : clause;
    const clauseLines = doc.splitTextToSize(clauseText, pageWidth - 2 * margin - 10);
    const clauseBoxHeight = clauseLines.length * 5 + 10;
    
    doc.rect(margin, yPos, pageWidth - 2 * margin, clauseBoxHeight);
    doc.setFontSize(10);
    doc.setFont(undefined, "normal");
    doc.setTextColor(60, 60, 60);
    clauseLines.forEach((line: string, idx: number) => {
      doc.text(line, margin + 5, yPos + 7 + idx * 5);
    });
    doc.setTextColor(0, 0, 0);
    yPos += clauseBoxHeight + 10;

    // Summary table for this clause
    const summaryData = clauseResults.map((result) => [
      result.pdf_filename.length > 40 ? result.pdf_filename.substring(0, 40) + "..." : result.pdf_filename,
      formatClassification(result.classification),
      result.summary || "N/A"
    ]);

    autoTable(doc, {
      startY: yPos,
      head: [["Document", "Classification", "Summary"]],
      body: summaryData,
      theme: "striped",
      headStyles: {
        fillColor: [30, 58, 138],
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 10
      },
      bodyStyles: {
        fontSize: 9
      },
      columnStyles: {
        0: { cellWidth: 60 },
        1: { cellWidth: 40, halign: "center" },
        2: { cellWidth: 90 }
      },
      margin: { left: margin, right: margin }
    });

    yPos = (doc as any).lastAutoTable.finalY + 15;

    // Process each result for this clause in detail
    for (const result of clauseResults) {
      checkPageBreak(50);

      // Document section header
      doc.setFillColor(240, 240, 240);
      doc.rect(margin, yPos - 5, pageWidth - 2 * margin, 10, "F");
      
      doc.setFontSize(12);
      doc.setFont(undefined, "bold");
      doc.text(`Document: ${result.pdf_filename}`, margin + 5, yPos);
      yPos += 12;

      // Classification badge
      const classificationColors: Record<string, [number, number, number]> = {
        IDENTICAL: [34, 197, 94],   // green
        SIMILAR: [234, 179, 8],     // yellow/amber
        NOT_PRESENT: [156, 163, 175], // gray
        ERROR: [239, 68, 68],       // red
      };
      const color = classificationColors[result.classification] || [0, 0, 0];
      doc.setFillColor(color[0], color[1], color[2]);
      doc.roundedRect(margin, yPos - 4, 50, 8, 2, 2, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(9);
      doc.setFont(undefined, "bold");
      doc.text(formatClassification(result.classification), margin + 25, yPos + 1, { align: "center" });
      doc.setTextColor(0, 0, 0);
      yPos += 12;

      // Matches table
      if (result.matches && result.matches.length > 0) {
        doc.setFontSize(11);
        doc.setFont(undefined, "bold");
        doc.text(`Matches Found: ${result.matches.length}`, margin, yPos);
        yPos += 8;

        const matchesData = result.matches.map((match, idx) => {
          const isPdfResult = isPdf(result.pdf_filename);
          const pageInfo = isPdfResult && match.page ? `Page ${match.page}` : "N/A";
          const sectionInfo = match.section || "N/A";
          const paragraphInfo = match.paragraph ? `Para ${match.paragraph}` : "N/A";
          const typeColor = match.type === "IDENTICAL" ? [34, 197, 94] : [234, 179, 8];
          
          return [
            `Match ${idx + 1}`,
            match.type,
            pageInfo,
            sectionInfo,
            paragraphInfo,
            match.section_title || "N/A"
          ];
        });

        autoTable(doc, {
          startY: yPos,
          head: [["#", "Type", "Page", "Section", "Paragraph", "Section Title"]],
          body: matchesData,
          theme: "striped",
          headStyles: {
            fillColor: [30, 58, 138],
            textColor: [255, 255, 255],
            fontStyle: "bold",
            fontSize: 9
          },
          bodyStyles: {
            fontSize: 8
          },
          columnStyles: {
            0: { cellWidth: 15, halign: "center" },
            1: { cellWidth: 25, halign: "center" },
            2: { cellWidth: 20, halign: "center" },
            3: { cellWidth: 25, halign: "center" },
            4: { cellWidth: 25, halign: "center" },
            5: { cellWidth: 80 }
          },
          margin: { left: margin, right: margin },
          didParseCell: (data: any) => {
            if (data.column.index === 1 && data.cell.text[0] === "IDENTICAL") {
              data.cell.styles.fillColor = [220, 252, 231];
            } else if (data.column.index === 1 && data.cell.text[0] === "SIMILAR") {
              data.cell.styles.fillColor = [254, 249, 195];
            }
          }
        });

        yPos = (doc as any).lastAutoTable.finalY + 10;

        // Detailed match information
        result.matches.forEach((match, idx) => {
          checkPageBreak(80);

          doc.setFontSize(10);
          doc.setFont(undefined, "bold");
          doc.setFillColor(245, 245, 245);
          doc.rect(margin, yPos - 4, pageWidth - 2 * margin, 8, "F");
          doc.text(`Match ${idx + 1} Details (${match.type})`, margin + 5, yPos);
          yPos += 10;

          // Quoted text
          if (match.full_text) {
            doc.setFontSize(9);
            doc.setFont(undefined, "bold");
            doc.text("Quoted Text:", margin, yPos);
            yPos += 6;
            doc.setFont(undefined, "normal");
            doc.setDrawColor(220, 220, 220);
            doc.setLineWidth(0.3);
            const textLines = doc.splitTextToSize(match.full_text, pageWidth - 2 * margin - 10);
            const textBoxHeight = textLines.length * 4.5 + 8;
            doc.rect(margin, yPos, pageWidth - 2 * margin, textBoxHeight);
            doc.setTextColor(40, 40, 40);
            textLines.forEach((line: string, lineIdx: number) => {
              doc.text(line, margin + 5, yPos + 5 + lineIdx * 4.5);
            });
            doc.setTextColor(0, 0, 0);
            yPos += textBoxHeight + 8;
          }

          // Differences table
          if (match.differences && match.differences.length > 0) {
            doc.setFontSize(9);
            doc.setFont(undefined, "bold");
            doc.text("Key Differences:", margin, yPos);
            yPos += 6;

            const diffData = match.differences.map((diff) => [
              diff.aspect || "N/A",
              diff.apple || "N/A",
              diff.theirs || "N/A"
            ]);

            autoTable(doc, {
              startY: yPos,
              head: [["Aspect", "Apple's Version", "Their Version"]],
              body: diffData,
              theme: "striped",
              headStyles: {
                fillColor: [59, 130, 246],
                textColor: [255, 255, 255],
                fontStyle: "bold",
                fontSize: 9
              },
              bodyStyles: {
                fontSize: 8
              },
              columnStyles: {
                0: { cellWidth: 50 },
                1: { cellWidth: 60 },
                2: { cellWidth: 60 }
              },
              margin: { left: margin, right: margin }
            });

            yPos = (doc as any).lastAutoTable.finalY + 8;
          }

          // Legal note
          if (match.legal_note) {
            doc.setFontSize(9);
            doc.setFont(undefined, "bold");
            doc.text("Legal Note:", margin, yPos);
            yPos += 6;
            doc.setFont(undefined, "italic");
            doc.setDrawColor(255, 237, 213);
            doc.setFillColor(255, 237, 213);
            const noteLines = doc.splitTextToSize(match.legal_note, pageWidth - 2 * margin - 10);
            const noteBoxHeight = noteLines.length * 4.5 + 8;
            doc.rect(margin, yPos, pageWidth - 2 * margin, noteBoxHeight, "FD");
            doc.setTextColor(120, 53, 15);
            noteLines.forEach((line: string, lineIdx: number) => {
              doc.text(line, margin + 5, yPos + 5 + lineIdx * 4.5);
            });
            doc.setTextColor(0, 0, 0);
            doc.setFont(undefined, "normal");
            yPos += noteBoxHeight + 8;
          }

          yPos += 5;
        });
      }

      // Overall analysis
      if (result.analysis) {
        checkPageBreak(40);
        doc.setFontSize(10);
        doc.setFont(undefined, "bold");
        doc.setFillColor(240, 249, 255);
        doc.rect(margin, yPos - 4, pageWidth - 2 * margin, 8, "F");
        doc.text("Overall Analysis", margin + 5, yPos);
        yPos += 10;
        doc.setFont(undefined, "normal");
        addWrappedText(result.analysis, 9);
        yPos += 5;
      }

      // Error
      if (result.error) {
        doc.setFontSize(9);
        doc.setFillColor(254, 242, 242);
        doc.rect(margin, yPos - 4, pageWidth - 2 * margin, 8, "F");
        doc.setTextColor(239, 68, 68);
        doc.setFont(undefined, "bold");
        doc.text(`Error: ${result.error}`, margin + 5, yPos);
        doc.setTextColor(0, 0, 0);
        doc.setFont(undefined, "normal");
        yPos += 10;
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
