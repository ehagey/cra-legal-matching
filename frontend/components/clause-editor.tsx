"use client";

import { Plus, Minus, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ClauseEditorProps {
  clauses: string[];
  onChange: (clauses: string[]) => void;
}

export function ClauseEditor({ clauses, onChange }: ClauseEditorProps) {
  const updateClause = (index: number, value: string) => {
    const next = [...clauses];
    next[index] = value;
    onChange(next);
  };

  const addClause = () => onChange([...clauses, ""]);

  const removeClause = () => {
    if (clauses.length > 1) onChange(clauses.slice(0, -1));
  };

  return (
    <Card className="h-full">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-lg">
          <FileText className="h-5 w-5 text-primary" />
          Apple Clauses
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Enter the Apple Developer Agreement clauses you want to compare.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {clauses.map((clause, i) => (
          <div key={i} className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground">Clause {i + 1}</label>
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
          <Button type="button" variant="outline" size="sm" className="flex-1" onClick={addClause}>
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
      </CardContent>
    </Card>
  );
}

