"use client";

import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { Search } from "lucide-react";

import { Header } from "@/components/header";
import { AuthGate } from "@/components/auth-gate";
import { ClauseEditor } from "@/components/clause-editor";
import { SourcePanel } from "@/components/source-panel";
import { ProgressOverlay } from "@/components/progress-overlay";
import { ResultsMatrix } from "@/components/results-matrix";
import { ResultDetail } from "@/components/result-detail";
import { PromptEditor } from "@/components/prompt-editor";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useAnalysis } from "@/hooks/use-analysis";
import type { AnalysisResult } from "@/lib/types";
import { exportResultsToCSV, downloadCSV } from "@/lib/csv-export";
import { exportResultsToExcel, downloadExcel } from "@/lib/excel-export";
import { Download, Settings, FileSpreadsheet } from "lucide-react";

export default function Home() {
  // --- Auth ---
  const [authenticated, setAuthenticated] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    // Verify stored password is still valid on app load
    const saved = localStorage.getItem("app_password");
    if (saved) {
      import("@/lib/api").then(({ validatePassword }) => {
        validatePassword(saved)
          .then((isValid) => {
            if (!isValid) {
              // Password is invalid, clear it and require re-auth
              localStorage.removeItem("app_password");
              setAuthenticated(false);
            } else {
              setAuthenticated(true);
            }
          })
          .catch(() => {
            // On error, clear password and require re-auth
            localStorage.removeItem("app_password");
            setAuthenticated(false);
          })
          .finally(() => {
            setCheckingAuth(false);
          });
      });
    } else {
      setCheckingAuth(false);
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("app_password");
    setAuthenticated(false);
  };

  // --- Inputs ---
  const [clauses, setClauses] = useState<string[]>([""]);
  const [files, setFiles] = useState<File[]>([]);
  const [htmlLinks, setHtmlLinks] = useState("");
  
  // --- Custom Prompts ---
  const [customPrompts, setCustomPrompts] = useState<{ pdf: string; text: string }>({ pdf: "", text: "" });
  const [showPromptEditor, setShowPromptEditor] = useState(false);

  // --- Analysis ---
  const analysis = useAnalysis();

  // Show toast on completion / error
  useEffect(() => {
    if (!analysis.loading && analysis.results.length > 0 && !analysis.error) {
      toast.success(`Analysis complete — ${analysis.results.length} comparison(s) processed.`);
    }
    if (analysis.error && analysis.error !== "AUTH_REQUIRED") {
      toast.error(analysis.error);
    }
    if (analysis.error === "AUTH_REQUIRED") {
      // Password is invalid, clear it and force re-authentication
      localStorage.removeItem("app_password");
      setAuthenticated(false);
      toast.error("Authentication failed. Please log in again.");
    }
  }, [analysis.loading, analysis.results.length, analysis.error]);

  // --- Derived ---
  const linkList = useMemo(
    () =>
      htmlLinks
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.startsWith("http")),
    [htmlLinks]
  );

  const canSubmit = useMemo(() => {
    const hasClause = clauses.some((c) => c.trim().length > 0);
    const hasSource = files.length > 0 || linkList.length > 0;
    return hasClause && hasSource && !analysis.loading;
  }, [clauses, files, linkList, analysis.loading]);

  const handleAnalyze = () => {
    const nonEmpty = clauses.filter((c) => c.trim());
    if (nonEmpty.length === 0) {
      toast.error("Enter at least one clause.");
      return;
    }
    if (files.length === 0 && linkList.length === 0) {
      toast.error("Upload at least one PDF or provide an HTML link.");
      return;
    }
    analysis.run(nonEmpty, linkList, files, customPrompts.pdf || undefined, customPrompts.text || undefined);
  };

  // --- Filtering ---
  const [filterClassification, setFilterClassification] = useState("ALL");
  const [filterPdf, setFilterPdf] = useState("ALL");

  const uniquePdfs = useMemo(
    () => [...new Set(analysis.results.map((r) => r.pdf_filename))],
    [analysis.results]
  );

  const filteredResults = useMemo(() => {
    let res = analysis.results;
    if (filterClassification !== "ALL") res = res.filter((r) => r.classification === filterClassification);
    if (filterPdf !== "ALL") res = res.filter((r) => r.pdf_filename === filterPdf);
    return res;
  }, [analysis.results, filterClassification, filterPdf]);

  // Group by clause
  const clauseGroups = useMemo(() => {
    const groups: Record<string, AnalysisResult[]> = {};
    for (const r of filteredResults) {
      const key = r.apple_clause;
      if (!groups[key]) groups[key] = [];
      groups[key].push(r);
    }
    return groups;
  }, [filteredResults]);

  const clauseKeys = Object.keys(clauseGroups);

  // --- Render ---
  if (checkingAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Verifying access...</p>
        </div>
      </div>
    );
  }

  if (!authenticated) {
    return <AuthGate onAuthenticated={() => setAuthenticated(true)} />;
  }

  return (
    <div className="min-h-screen bg-background">
      <Header authenticated={authenticated} onLogout={handleLogout} />

      {/* Progress overlay */}
      {analysis.loading && (
        <ProgressOverlay
          completed={analysis.completed}
          total={analysis.total}
          currentItem={analysis.currentItem}
        />
      )}

      <main className="container mx-auto space-y-8 px-4 py-8">
        {/* Prompt Editor Toggle */}
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowPromptEditor(!showPromptEditor)}
          >
            <Settings className="h-4 w-4 mr-2" />
            {showPromptEditor ? "Hide" : "Show"} Prompt Editor
          </Button>
        </div>

        {/* Prompt Editor */}
        {showPromptEditor && (
          <PromptEditor
            onPromptChange={(pdf, text) => setCustomPrompts({ pdf, text })}
          />
        )}

        {/* Inputs */}
        <div className="grid gap-6 lg:grid-cols-2">
          <ClauseEditor clauses={clauses} onChange={setClauses} />
          <SourcePanel files={files} htmlLinks={htmlLinks} onFilesChange={setFiles} onLinksChange={setHtmlLinks} />
        </div>

        {/* Analyze button */}
        <div className="space-y-2">
          <Button
            size="lg"
            className="w-full text-base"
            disabled={!canSubmit}
            onClick={handleAnalyze}
          >
            <Search className="mr-2 h-5 w-5" />
            Analyze Clauses
          </Button>
          {!canSubmit && (
            <p className="text-center text-sm text-muted-foreground">
              {!clauses.some((c) => c.trim().length > 0) && "Enter at least one clause. "}
              {files.length === 0 && linkList.length === 0 && "Upload a PDF or enter an HTML link."}
            </p>
          )}
        </div>

        {/* Results */}
        {analysis.results.length > 0 && (
          <section className="space-y-6 animate-fade-in">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-semibold">Results</h2>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const workbook = exportResultsToExcel(analysis.results);
                    const timestamp = new Date().toISOString().split("T")[0];
                    downloadExcel(workbook, `legal-analysis-${timestamp}.xlsx`);
                    toast.success("Excel file downloaded successfully");
                  }}
                >
                  <FileSpreadsheet className="mr-2 h-4 w-4" />
                  Download Excel
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const csv = exportResultsToCSV(analysis.results);
                    const timestamp = new Date().toISOString().split("T")[0];
                    downloadCSV(csv, `legal-analysis-${timestamp}.csv`);
                    toast.success("CSV downloaded successfully");
                  }}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Download CSV
                </Button>
              </div>
            </div>

            {/* Matrix */}
            <ResultsMatrix results={analysis.results} />

            {/* Filters */}
            <div className="flex flex-wrap gap-3">
              <select
                className="rounded-md border bg-background px-3 py-2 text-sm"
                value={filterClassification}
                onChange={(e) => setFilterClassification(e.target.value)}
              >
                <option value="ALL">All Classifications</option>
                <option value="IDENTICAL">Identical</option>
                <option value="SIMILAR">Similar</option>
                <option value="NOT_PRESENT">Not Present</option>
                <option value="ERROR">Error</option>
              </select>
              <select
                className="rounded-md border bg-background px-3 py-2 text-sm"
                value={filterPdf}
                onChange={(e) => setFilterPdf(e.target.value)}
              >
                <option value="ALL">All Agreements</option>
                {uniquePdfs.map((pdf) => (
                  <option key={pdf} value={pdf}>
                    {pdf}
                  </option>
                ))}
              </select>
              <Badge variant="secondary" className="self-center">
                {filteredResults.length} result{filteredResults.length !== 1 ? "s" : ""}
              </Badge>
            </div>

            {/* Tabbed details */}
            {clauseKeys.length > 0 ? (
              <Tabs defaultValue={clauseKeys[0]} className="w-full">
                <TabsList className="mb-4 flex-wrap">
                  {clauseKeys.map((key, i) => (
                    <TabsTrigger key={key} value={key} className="max-w-[200px] truncate">
                      Clause {i + 1}
                    </TabsTrigger>
                  ))}
                </TabsList>

                {clauseKeys.map((key) => (
                  <TabsContent key={key} value={key} className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      <span className="font-medium">Clause:</span> {key}
                    </p>
                    {clauseGroups[key].map((result, ri) => (
                      <ResultDetail key={ri} result={result} />
                    ))}
                  </TabsContent>
                ))}
              </Tabs>
            ) : (
              <p className="text-center text-muted-foreground">No results match the selected filters.</p>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

