"use client";

import type { AnalysisResult } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ResultsMatrixProps {
  results: AnalysisResult[];
}

function classificationBadge(c: string) {
  switch (c) {
    case "IDENTICAL":
      return <Badge variant="success">IDENTICAL</Badge>;
    case "SIMILAR":
      return <Badge variant="warning">SIMILAR</Badge>;
    case "NOT_PRESENT":
      return <Badge variant="neutral">NOT PRESENT</Badge>;
    case "ERROR":
      return <Badge variant="destructive">ERROR</Badge>;
    default:
      return <Badge variant="outline">{c}</Badge>;
  }
}

export function ResultsMatrix({ results }: ResultsMatrixProps) {
  // Build unique axes
  const clauses = [...new Set(results.map((r) => r.apple_clause))];
  const pdfs = [...new Set(results.map((r) => r.pdf_filename))];

  // Build lookup
  const lookup = new Map<string, string>();
  for (const r of results) {
    lookup.set(`${r.apple_clause}|||${r.pdf_filename}`, r.classification);
  }

  if (clauses.length === 0 || pdfs.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Overview Matrix</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="py-2 pr-4 text-left font-medium text-muted-foreground">Clause</th>
                {pdfs.map((pdf) => (
                  <th key={pdf} className="px-3 py-2 text-center font-medium text-muted-foreground">
                    {pdf}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {clauses.map((clause, idx) => (
                <tr key={idx} className="border-b last:border-0">
                  <td className="max-w-[200px] truncate py-3 pr-4 text-sm" title={clause}>
                    {clause.length > 50 ? clause.slice(0, 50) + "…" : clause}
                  </td>
                  {pdfs.map((pdf) => (
                    <td key={pdf} className="px-3 py-3 text-center">
                      {classificationBadge(lookup.get(`${clause}|||${pdf}`) || "N/A")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

