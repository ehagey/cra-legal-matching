import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { AnalysisResult, Aspect, Match } from "./types";

function parseTitle(clause: string): string {
  const lines = clause.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length >= 2 && /clause\s*:?\s*$/i.test(lines[0])) {
    return lines[0].replace(/:?\s*$/, "").trim();
  }
  return clause.length > 80 ? clause.slice(0, 80) + "…" : clause;
}

function shortDoc(name: string): string {
  if (name.startsWith("http")) {
    try {
      const u = new URL(name);
      const p = u.pathname.split("/").filter(Boolean);
      const h = u.hostname.replace("www.", "").replace("developer.", "").replace("admin.", "");
      return p.length > 0 ? `${h} / ${p[p.length - 1]}` : h;
    } catch { return name; }
  }
  return name;
}

const GREEN: [number, number, number] = [22, 101, 52];
const AMBER: [number, number, number] = [133, 77, 14];
const RED: [number, number, number] = [153, 27, 27];
const GRAY: [number, number, number] = [100, 116, 139];
const DARK: [number, number, number] = [15, 23, 42];
const SUB: [number, number, number] = [51, 65, 85];

function cc(c: string): [number, number, number] {
  if (c === "IDENTICAL") return GREEN;
  if (c === "SIMILAR") return AMBER;
  if (c === "NOT_PRESENT") return RED;
  return GRAY;
}

function displayType(t: string): string {
  return t === "NOT_PRESENT" ? "NOT PRESENT" : t;
}

export function downloadPDF(results: AnalysisResult[]) {
  const doc = new jsPDF("portrait", "mm", "a4");
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 14;
  const usable = W - 2 * M;
  const bottom = H - 14; // safe bottom boundary
  let y = M;

  /** Add page if not enough space. */
  const need = (h: number) => {
    if (y + h > bottom) { doc.addPage(); y = M; }
  };

  /** Print wrapped text line-by-line with page-break safety. */
  const wrappedText = (text: string, fontSize: number, color: [number, number, number], style: string = "normal", indent: number = 0) => {
    doc.setFontSize(fontSize);
    doc.setFont("helvetica", style);
    doc.setTextColor(...color);
    const lines: string[] = doc.splitTextToSize(text, usable - indent);
    const lineH = fontSize * 0.5;
    const step = lineH + 0.5;
    for (const line of lines) {
      need(step);
      doc.text(line, M + indent, y + lineH);
      y += step;
    }
    y += 1;
  };

  /** Print quoted text with a gray left bar, handling page breaks. */
  const quotedText = (text: string) => {
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(51, 65, 85);
    const lines: string[] = doc.splitTextToSize(text, usable - 12);
    const lineH = 3.5;
    const step = lineH + 0.4;
    let barStart = y;

    for (const line of lines) {
      if (y + step > bottom) {
        // Draw bar for current page segment before breaking
        if (y > barStart) {
          doc.setDrawColor(203, 213, 225);
          doc.setLineWidth(0.6);
          doc.line(M + 5, barStart, M + 5, y);
          doc.setLineWidth(0.2);
        }
        doc.addPage();
        y = M;
        barStart = y;
        // Reset font after page break
        doc.setFontSize(7.5);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(51, 65, 85);
      }
      doc.text(line, M + 8, y + lineH);
      y += step;
    }
    // Draw bar for final segment
    if (y > barStart) {
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.6);
      doc.line(M + 5, barStart, M + 5, y);
      doc.setLineWidth(0.2);
    }
    y += 2;
  };

  // --- Data prep ---
  const clauses: string[] = [];
  const docs: string[] = [];
  for (const r of results) {
    if (!clauses.includes(r.apple_clause)) clauses.push(r.apple_clause);
    if (!docs.includes(r.pdf_filename)) docs.push(r.pdf_filename);
  }
  const aspects: Record<string, Aspect[]> = {};
  for (const r of results) {
    const c = r.apple_clause;
    if (!aspects[c] && r._aspects?.length) aspects[c] = r._aspects;
  }
  for (const c of clauses) {
    if (aspects[c]) continue;
    const ls: string[] = [];
    for (const r of results) {
      if (r.apple_clause !== c) continue;
      for (const m of r.matches || []) if (m.aspect_label && !ls.includes(m.aspect_label)) ls.push(m.aspect_label);
    }
    aspects[c] = ls.length ? ls.map((l) => ({ label: l, description: "" })) : [{ label: "General", description: "" }];
  }
  const lk: Record<string, Record<string, AnalysisResult>> = {};
  for (const r of results) {
    if (!lk[r.apple_clause]) lk[r.apple_clause] = {};
    lk[r.apple_clause][r.pdf_filename] = r;
  }

  // ===== TITLE =====
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...DARK);
  doc.text("Legal Clause Analysis Report", M, y + 8);
  y += 14;
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...GRAY);
  doc.text(`${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}  •  ${clauses.length} clauses  •  ${docs.length} documents`, M, y);
  y += 6;
  doc.setDrawColor(226, 232, 240);
  doc.line(M, y, W - M, y);
  y += 6;

  // ===== CLAUSES =====
  for (let ci = 0; ci < clauses.length; ci++) {
    const clause = clauses[ci];
    const title = parseTitle(clause);
    const asps = aspects[clause] || [];

    need(14);

    // Clause heading
      doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...DARK);
    const titleLines: string[] = doc.splitTextToSize(`${ci + 1}. ${title}`, usable);
    for (const tl of titleLines) {
      need(6);
      doc.text(tl, M, y + 5);
      y += 6;
    }
    y += 1;

    // Full Apple clause text
    wrappedText(clause, 8, GRAY, "normal", 2);
    y += 2;

    // Per-document results
    for (const dn of docs) {
      const r = lk[clause]?.[dn];
      if (!r) continue;

      need(8);

      // Document name + classification
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...SUB);
      doc.text(shortDoc(dn), M + 2, y + 3);
      doc.setTextColor(...cc(r.classification));
      doc.text(displayType(r.classification), W - M - 2, y + 3, { align: "right" });
      y += 6;

      if (r.classification === "ERROR") {
        wrappedText(r.error || "Error", 8, RED, "normal", 4);
        continue;
      }

      // Match lookup
      const byAsp: Record<string, Match> = {};
      for (const m of r.matches || []) if (m.aspect_label) byAsp[m.aspect_label] = m;

      // Each aspect
      for (const asp of asps) {
        const m = byAsp[asp.label];

        need(8);

        // Aspect label line
        const mtype = m ? m.type : "NOT_PRESENT";
        const badge = displayType(mtype);
        const secInfo = m?.section ? `  |  Section ${m.section}${m.section_title ? " - " + m.section_title : ""}` : "";
        const aspectLine = `${asp.label}  —  ${badge}${secInfo}`;

        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...cc(mtype));
        const aspLines: string[] = doc.splitTextToSize(aspectLine, usable - 6);
        for (const al of aspLines) {
          need(4);
          doc.text(al, M + 4, y + 3);
          y += 4;
        }

        if (!m || m.type === "NOT_PRESENT") {
          need(4);
          doc.setFontSize(7.5);
          doc.setFont("helvetica", "italic");
          doc.setTextColor(...RED);
          doc.text("No matching clause found in this document.", M + 6, y + 2.5);
          y += 5;
          continue;
        }

        // Quoted text with left bar
        if (m.full_text) {
          need(5);
          quotedText(m.full_text);
        }

        // Differences table
        if (m.differences && m.differences.length > 0) {
          need(8);
          const diffHead = [["Aspect", "Apple's Version", "Their Version"]];
          const diffBody = m.differences.map((d) => [d.aspect || "", d.apple || "", d.theirs || ""]);

          autoTable(doc, {
            startY: y,
            head: diffHead,
            body: diffBody,
            margin: { left: M + 4, right: M },
            styles: { fontSize: 7, cellPadding: 1.5, overflow: "linebreak", lineColor: [226, 232, 240], lineWidth: 0.2 },
            headStyles: { fillColor: [241, 245, 249], textColor: [71, 85, 105], fontStyle: "bold", fontSize: 7 },
            columnStyles: {
              0: { cellWidth: 30, fontStyle: "bold" },
              1: { cellWidth: (usable - 4 - 30) / 2 },
              2: { cellWidth: (usable - 4 - 30) / 2 },
            },
          });
          // @ts-ignore
          y = (doc as any).lastAutoTable.finalY + 2;
        }

        // Legal note
        if (m.legal_note) {
          need(5);
          wrappedText(`Note: ${m.legal_note}`, 7.5, AMBER, "italic", 6);
        }
      }

      y += 2;
    }

    // Separator between clauses
    y += 3;
    if (ci < clauses.length - 1) {
      need(2);
      doc.setDrawColor(226, 232, 240);
      doc.line(M, y, W - M, y);
      y += 4;
    }
  }

  // Page numbers
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(160, 174, 192);
    doc.text(`${i} / ${pages}`, W / 2, H - 6, { align: "center" });
  }

  doc.save(`legal-analysis-${new Date().toISOString().split("T")[0]}.pdf`);
}
