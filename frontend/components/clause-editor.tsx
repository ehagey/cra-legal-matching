"use client";

import { useState, useEffect, useMemo } from "react";
import { Plus, Minus, FileText, ClipboardPaste, List, ChevronRight, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  parseBulkClauses,
  looksLikeBulkFormat,
  type ParsedClause,
} from "@/lib/clause-parser";

interface ClauseEditorProps {
  clauses: string[];
  onChange: (clauses: string[]) => void;
}

export function ClauseEditor({ clauses, onChange }: ClauseEditorProps) {
  const [mode, setMode] = useState<"individual" | "bulk">("individual");
  const [bulkText, setBulkText] = useState("");
  const [parsedPreview, setParsedPreview] = useState<ParsedClause[]>([]);

  // Re-parse whenever bulk text changes
  useEffect(() => {
    if (mode === "bulk" && bulkText.trim()) {
      const parsed = parseBulkClauses(bulkText);
      setParsedPreview(parsed);
      // Auto-update clauses with parsed results
      if (parsed.length > 0) {
        onChange(parsed.map((p) => p.fullText));
      }
    } else if (mode === "bulk" && !bulkText.trim()) {
      setParsedPreview([]);
    }
  }, [bulkText, mode]);

  // --- Individual mode helpers ---
  const updateClause = (index: number, value: string) => {
    const next = [...clauses];
    next[index] = value;
    onChange(next);
  };

  const addClause = () => onChange([...clauses, ""]);

  const removeClause = () => {
    if (clauses.length > 1) onChange(clauses.slice(0, -1));
  };

  // --- Mode switch ---
  const switchToMode = (newMode: "individual" | "bulk") => {
    if (newMode === mode) return;
    if (newMode === "bulk") {
      // Switching to bulk: clear bulk text, keep individual clauses as-is
      setBulkText("");
      setParsedPreview([]);
    } else {
      // Switching to individual: if we have parsed clauses, load them individually
      if (parsedPreview.length > 0) {
        onChange(parsedPreview.map((p) => p.fullText));
      } else if (clauses.length === 0 || (clauses.length === 1 && !clauses[0].trim())) {
        onChange([""]);
      }
    }
    setMode(newMode);
  };

  return (
    <Card className="h-full">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-lg">
          <FileText className="h-5 w-5 text-primary" />
          Apple Clauses
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Enter clauses individually or paste them all at once in structured format.
        </p>
        {/* Mode toggle */}
        <div className="flex gap-2 pt-2">
          <Button
            type="button"
            variant={mode === "individual" ? "default" : "outline"}
            size="sm"
            onClick={() => switchToMode("individual")}
          >
            <List className="mr-1 h-4 w-4" />
            Individual
          </Button>
          <Button
            type="button"
            variant={mode === "bulk" ? "default" : "outline"}
            size="sm"
            onClick={() => switchToMode("bulk")}
          >
            <ClipboardPaste className="mr-1 h-4 w-4" />
            Bulk Paste
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {mode === "individual" ? (
          <>
            {clauses.map((clause, i) => (
              <div key={i} className="space-y-1.5">
                <label className="text-sm font-medium text-muted-foreground">
                  Clause {i + 1}
                </label>
                <Textarea
                  value={clause}
                  onChange={(e) => updateClause(i, e.target.value)}
                  placeholder="Paste Apple clause text here…"
                  rows={6}
                  className="resize-y font-mono text-sm"
                />
              </div>
            ))}

            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={addClause}
              >
                <Plus className="mr-1 h-4 w-4" /> Add Clause
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={removeClause}
                disabled={clauses.length <= 1}
              >
                <Minus className="mr-1 h-4 w-4" /> Remove Last
              </Button>
            </div>
          </>
        ) : (
          <>
            {/* Bulk paste textarea */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">
                Paste all clauses in structured format
              </label>
              <Textarea
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                placeholder={`Paste clauses in this format:\n\nLimitation of Liability Clause:\n\nSection 13: "Apple And Its Affiliates…"\n\nSection 3.1.d: "You will be solely responsible…"\n\nJurisdiction Clause:\n\nSection 17: "This Agreement will be governed…"`}
                rows={14}
                className="resize-y font-mono text-sm"
              />
            </div>

            {/* Parse preview */}
            {bulkText.trim() && (
              <div className="space-y-3">
                {parsedPreview.length > 0 ? (
                  <>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">
                        {parsedPreview.length} clause{parsedPreview.length !== 1 ? "s" : ""} detected
                      </Badge>
                    </div>
                    <div className="max-h-64 overflow-y-auto space-y-2 rounded-md border p-3 bg-muted/30">
                      {parsedPreview.map((parsed, i) => (
                        <div
                          key={i}
                          className="rounded-md border bg-background p-3 text-sm space-y-1"
                        >
                          <div className="flex items-center gap-2">
                            <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                            <span className="font-medium text-primary">
                              {parsed.title}
                            </span>
                            <span className="text-muted-foreground">›</span>
                            <span className="font-medium">
                              {parsed.sectionRef}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-2 pl-5">
                            {parsed.body.slice(0, 150)}
                            {parsed.body.length > 150 ? "…" : ""}
                          </p>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>
                      Could not detect clauses. Make sure the format follows the
                      pattern: a title line ending with &quot;Clause:&quot; followed by
                      section references like &quot;Section 13: &quot;...&quot;&quot;
                    </span>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
