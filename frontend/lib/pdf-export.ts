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

  // Simple header
  doc.setFontSize(16);
  doc.setFont(undefined, "bold");
  doc.setTextColor(30, 58, 138);
  doc.text("Legal Clause Analysis", margin, yPos);
  yPos += 8;
  
  doc.setFontSize(10);
  doc.setFont(undefined, "normal");
  doc.setTextColor(0, 0, 0);
  doc.text(`Generated: ${new Date().toLocaleDateString()}`, margin, yPos);
  yPos += 15;

  // Process each clause
  for (const clause of sortedClauses) {
    const clauseResults = clauseGroups[clause];
    const clauseIdx = clauseIndices[clause] ?? sortedClauses.indexOf(clause);
    const clauseNum = clauseIdx + 1;

    checkPageBreak(40);

    // Clause header
    doc.setFontSize(14);
    doc.setFont(undefined, "bold");
    doc.text(`Clause ${clauseNum}`, margin, yPos);
    yPos += 8;

    // Clause text (simplified)
    doc.setFontSize(9);
    doc.setFont(undefined, "normal");
    doc.setTextColor(100, 100, 100);
    const clauseText = clause.length > 300 ? clause.substring(0, 300) + "..." : clause;
    addWrappedText(clauseText, 9);
    doc.setTextColor(0, 0, 0);
    yPos += 5;

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

      // Document name
      doc.setFontSize(11);
      doc.setFont(undefined, "bold");
      doc.text(result.pdf_filename, margin, yPos);
      yPos += 8;

      // Classification
      const classificationColors: Record<string, [number, number, number]> = {
        IDENTICAL: [34, 197, 94],   // green
        SIMILAR: [234, 179, 8],     // yellow/amber
        NOT_PRESENT: [156, 163, 175], // gray
        ERROR: [239, 68, 68],       // red
      };
      const color = classificationColors[result.classification] || [0, 0, 0];
      doc.setFontSize(10);
      doc.setFont(undefined, "normal");
      doc.setTextColor(color[0], color[1], color[2]);
      doc.text(`Classification: ${formatClassification(result.classification)}`, margin, yPos);
      doc.setTextColor(0, 0, 0);
      yPos += 6;
      
      // Summary
      if (result.summary) {
        doc.setFontSize(9);
        addWrappedText(result.summary, 9);
        yPos += 3;
      }

      // Matches
      if (result.matches && result.matches.length > 0) {
        doc.setFontSize(10);
        doc.setFont(undefined, "bold");
        doc.text(`${result.matches.length} match${result.matches.length !== 1 ? "es" : ""} found`, margin, yPos);
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
          checkPageBreak(60);

          doc.setFontSize(10);
          doc.setFont(undefined, "bold");
          doc.text(`Match ${idx + 1} - ${match.type}`, margin, yPos);
          yPos += 7;

          // Location info
          doc.setFontSize(9);
          doc.setFont(undefined, "normal");
          const isPdfResult = isPdf(result.pdf_filename);
          const locationParts: string[] = [];
          if (isPdfResult && match.page) locationParts.push(`Page ${match.page}`);
          if (match.section) locationParts.push(`Section ${match.section}`);
          if (match.paragraph) locationParts.push(`Paragraph ${match.paragraph}`);
          if (locationParts.length > 0) {
            doc.text(locationParts.join(" · "), margin, yPos);
            yPos += 6;
          }
          
          if (match.section_title) {
            doc.text(match.section_title, margin, yPos);
            yPos += 6;
          }

          // Quoted text
          if (match.full_text) {
            doc.setFontSize(9);
            doc.setFont(undefined, "bold");
            doc.text("Quoted Text:", margin, yPos);
            yPos += 5;
            doc.setFont(undefined, "normal");
            doc.setDrawColor(240, 240, 240);
            doc.setLineWidth(0.5);
            const textLines = doc.splitTextToSize(match.full_text, pageWidth - 2 * margin - 10);
            const textBoxHeight = textLines.length * 4.5 + 8;
            doc.rect(margin, yPos, pageWidth - 2 * margin, textBoxHeight);
            doc.setTextColor(60, 60, 60);
            textLines.forEach((line: string, lineIdx: number) => {
              doc.text(line, margin + 5, yPos + 5 + lineIdx * 4.5);
            });
            doc.setTextColor(0, 0, 0);
            yPos += textBoxHeight + 6;
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
            yPos += 5;
            doc.setFont(undefined, "normal");
            addWrappedText(match.legal_note, 8);
            yPos += 3;
          }

          yPos += 5;
        });
      }

      // Overall analysis
      if (result.analysis) {
        checkPageBreak(30);
        doc.setFontSize(9);
        doc.setFont(undefined, "bold");
        doc.text("Analysis:", margin, yPos);
        yPos += 6;
        doc.setFont(undefined, "normal");
        addWrappedText(result.analysis, 8);
        yPos += 5;
      }

      // Error
      if (result.error) {
        doc.setFontSize(9);
        doc.setTextColor(239, 68, 68);
        doc.setFont(undefined, "bold");
        doc.text(`Error: ${result.error}`, margin, yPos);
        doc.setTextColor(0, 0, 0);
        doc.setFont(undefined, "normal");
        yPos += 8;
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
