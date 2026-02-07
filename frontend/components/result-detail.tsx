"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, FileText, AlertTriangle, BookOpen } from "lucide-react";
import type { AnalysisResult, Match } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

// ---- Single match card ----

function MatchCard({ match, index }: { match: Match; index: number }) {
  const [open, setOpen] = useState(false);
  const isIdentical = match.type === "IDENTICAL";

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button className="flex w-full items-center gap-3 rounded-lg border bg-muted/30 px-4 py-3 text-left transition-colors hover:bg-muted/50">
          {open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
          <span className="text-sm font-medium">Match {index + 1}</span>
          <Badge variant={isIdentical ? "success" : "warning"} className="text-xs">
            {match.type}
          </Badge>
          <span className="ml-auto truncate text-xs text-muted-foreground">
            {match.section_title || `Section ${match.section}`}
          </span>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="space-y-4 rounded-b-lg border border-t-0 bg-background p-4">
          {/* Location */}
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div>
              <span className="text-xs text-muted-foreground">Page</span>
              <p className="font-medium">{match.page}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Section</span>
              <p className="font-medium">{match.section}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Paragraph</span>
              <p className="font-medium">{match.paragraph}</p>
            </div>
          </div>

          {/* Quoted text */}
          {match.full_text && (
            <div className="rounded-md border-l-4 border-primary/30 bg-muted/40 p-3">
              <p className="mb-1 text-xs font-medium text-muted-foreground">Quoted Text</p>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{match.full_text}</p>
            </div>
          )}

          {/* Differences */}
          {match.differences && match.differences.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Key Differences</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="pb-2 pr-4 font-medium">Aspect</th>
                      <th className="pb-2 pr-4 font-medium">Apple</th>
                      <th className="pb-2 font-medium">Theirs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {match.differences.map((diff, di) => (
                      <tr key={di} className="border-b last:border-0">
                        <td className="py-2 pr-4 font-medium text-muted-foreground">{diff.aspect}</td>
                        <td className="py-2 pr-4">{diff.apple}</td>
                        <td className="py-2">{diff.theirs}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Legal note */}
          {match.legal_note && (
            <div className="flex gap-2 rounded-md bg-amber-500/10 p-3 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <p className="text-amber-800 dark:text-amber-300">{match.legal_note}</p>
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ---- Full result card ----

interface ResultDetailProps {
  result: AnalysisResult;
}

export function ResultDetail({ result }: ResultDetailProps) {
  const [showAnalysis, setShowAnalysis] = useState(false);
  const isError = result.classification === "ERROR";

  return (
    <Card className={isError ? "border-destructive/30" : ""}>
      <CardContent className="space-y-4 p-5">
        {/* Header row */}
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{result.pdf_filename}</span>
            </div>
            <p className="text-sm text-muted-foreground">{result.summary}</p>
          </div>
          {classificationBadgeLarge(result.classification)}
        </div>

        {/* Error details */}
        {isError && result.error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{result.error}</div>
        )}

        {/* Matches */}
        {result.matches.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">
              {result.matches.length} match{result.matches.length !== 1 ? "es" : ""} found
            </p>
            {result.matches.map((match, idx) => (
              <MatchCard key={idx} match={match} index={idx} />
            ))}
          </div>
        )}

        {/* Analysis toggle */}
        {result.analysis && (
          <Collapsible open={showAnalysis} onOpenChange={setShowAnalysis}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1.5 text-xs">
                <BookOpen className="h-3.5 w-3.5" />
                {showAnalysis ? "Hide" : "Show"} Full Analysis
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-2 rounded-md bg-muted/40 p-4 text-sm leading-relaxed">{result.analysis}</div>
            </CollapsibleContent>
          </Collapsible>
        )}

      </CardContent>
    </Card>
  );
}

function classificationBadgeLarge(c: string) {
  switch (c) {
    case "IDENTICAL":
      return (
        <Badge variant="success" className="px-3 py-1 text-sm">
          IDENTICAL
        </Badge>
      );
    case "SIMILAR":
      return (
        <Badge variant="warning" className="px-3 py-1 text-sm">
          SIMILAR
        </Badge>
      );
    case "NOT_PRESENT":
      return (
        <Badge variant="neutral" className="px-3 py-1 text-sm">
          NOT PRESENT
        </Badge>
      );
    case "ERROR":
      return (
        <Badge variant="destructive" className="px-3 py-1 text-sm">
          ERROR
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className="px-3 py-1 text-sm">
          {c}
        </Badge>
      );
  }
}

