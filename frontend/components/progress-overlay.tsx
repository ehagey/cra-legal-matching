"use client";

import { Loader2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";

interface ProgressOverlayProps {
  completed: number;
  total: number;
  currentItem: string;
}

export function ProgressOverlay({ completed, total, currentItem }: ProgressOverlayProps) {
  // Only show "preparing" if total is 0 or explicitly says preparing
  const isPreparing = total === 0 || currentItem.toLowerCase().includes("preparing");
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const showProgress = total > 0 && !isPreparing;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <Card className="w-full max-w-md animate-fade-in shadow-2xl">
        <CardContent className="space-y-6 p-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <Loader2 className="h-7 w-7 animate-spin text-primary" />
          </div>

          <div className="space-y-1">
            <h3 className="text-lg font-semibold">
              {isPreparing ? "Preparing Analysis" : "Analyzing Clauses"}
            </h3>
            <p className="text-sm text-muted-foreground">{currentItem}</p>
          </div>

          {showProgress && (
            <div className="space-y-2">
              <Progress value={pct} className="h-3" />
              <p className="text-sm font-medium text-foreground">
                {completed} of {total} comparisons
              </p>
              <p className="text-xs text-muted-foreground">
                {pct}% complete
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

