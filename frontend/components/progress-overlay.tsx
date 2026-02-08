"use client";

import { Loader2, CheckCircle2, XCircle, FileText, Globe, Search } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface ProgressOverlayProps {
  completed: number;
  total: number;
  currentItem: string;
}

export function ProgressOverlay({ completed, total, currentItem }: ProgressOverlayProps) {
  // Determine phase and status
  const isScraping = currentItem.toLowerCase().includes("scraping");
  const isParsing = currentItem.toLowerCase().includes("parsing");
  const isComparing = currentItem.toLowerCase().includes("comparing") || currentItem.toLowerCase().includes("clause");
  const isDone = currentItem.startsWith("✓");
  const isError = currentItem.startsWith("✗") || currentItem.toLowerCase().startsWith("error");
  
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const showProgress = total > 0 && (isComparing || isDone);
  const isPreparing = total === 0 && !isComparing;

  // Get icon based on phase
  const getIcon = () => {
    if (isError) return <XCircle className="h-7 w-7 text-destructive" />;
    if (isDone) return <CheckCircle2 className="h-7 w-7 text-green-500" />;
    if (isScraping) return <Globe className="h-7 w-7 text-primary animate-pulse" />;
    if (isParsing) return <FileText className="h-7 w-7 text-primary animate-pulse" />;
    if (isComparing) return <Search className="h-7 w-7 text-primary animate-pulse" />;
    return <Loader2 className="h-7 w-7 animate-spin text-primary" />;
  };

  // Get title based on phase
  const getTitle = () => {
    if (isScraping) return "Scraping Websites";
    if (isParsing) return "Parsing PDFs";
    if (isComparing || showProgress) return "Analyzing Clauses";
    if (isPreparing) return "Preparing Analysis";
    return "Processing";
  };

  // Format current item message
  const formatMessage = (msg: string) => {
    // Remove status prefixes for display
    return msg.replace(/^[✓✗]\s*/, "").trim();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <Card className="w-full max-w-lg animate-fade-in shadow-2xl">
        <CardContent className="space-y-6 p-8">
          {/* Icon */}
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            {getIcon()}
          </div>

          {/* Title and Status */}
          <div className="space-y-2 text-center">
            <h3 className="text-xl font-semibold">{getTitle()}</h3>
            <div className="min-h-[2.5rem]">
              <p className="text-sm text-muted-foreground break-words">
                {formatMessage(currentItem)}
              </p>
            </div>
          </div>

          {/* Progress Bar and Stats */}
          {showProgress && (
            <div className="space-y-3">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-foreground">Progress</span>
                  <Badge variant="secondary" className="font-mono">
                    {completed} / {total}
                  </Badge>
                </div>
                <Progress value={pct} className="h-3" />
              </div>
              <p className="text-center text-xs text-muted-foreground">
                {pct}% complete
              </p>
            </div>
          )}

          {/* Phase indicator */}
          {!showProgress && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
              <span className="text-xs text-muted-foreground">
                {isScraping && "Extracting text from web pages"}
                {isParsing && "Processing PDF documents"}
                {isPreparing && "Setting up analysis"}
              </span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

