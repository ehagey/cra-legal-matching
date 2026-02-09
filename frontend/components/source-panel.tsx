"use client";

import { useRef, useState, useEffect } from "react";
import { Upload, Link2, X, FileUp, Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface SourcePanelProps {
  files: File[];
  htmlLinks: string;
  onFilesChange: (files: File[]) => void;
  onLinksChange: (links: string) => void;
}

export function SourcePanel({ files, htmlLinks, onFilesChange, onLinksChange }: SourcePanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [previewUrls, setPreviewUrls] = useState<Map<number, string>>(new Map());
  const [htmlPreviewIndex, setHtmlPreviewIndex] = useState<number | null>(null);
  const [htmlPreviewUrls, setHtmlPreviewUrls] = useState<Map<number, string>>(new Map());
  const [htmlPreviewLoading, setHtmlPreviewLoading] = useState<Map<number, boolean>>(new Map());
  const [isDragging, setIsDragging] = useState(false);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files).filter((f) => f.type === "application/pdf");
      onFilesChange([...files, ...newFiles]);
    }
    // Reset input so the same file can be selected again
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const droppedFiles = Array.from(e.dataTransfer.files).filter(
      (f) => f.type === "application/pdf"
    );
    if (droppedFiles.length > 0) {
      onFilesChange([...files, ...droppedFiles]);
    }
  };

  const removeFile = (index: number) => {
    onFilesChange(files.filter((_, i) => i !== index));
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const getFileUrl = (file: File, index: number): string => {
    if (!previewUrls.has(index)) {
      const url = URL.createObjectURL(file);
      setPreviewUrls((prev) => new Map(prev).set(index, url));
      return url;
    }
    return previewUrls.get(index)!;
  };

  const linkList = htmlLinks
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("http"));

  const previewHtmlAsPdf = async (url: string, index: number) => {
    setHtmlPreviewLoading((prev) => new Map(prev).set(index, true));
    try {
      const formData = new FormData();
      formData.append("html_link", url);

      const password = localStorage.getItem("app_password") || "";
      const response = await fetch("http://localhost:8000/api/preview-html", {
        method: "POST",
        headers: { "X-App-Password": password },
        body: formData,
      });

      if (!response.ok) {
        let errorMessage = "Failed to scrape HTML";
        try {
          const errorData = await response.json();
          errorMessage = errorData.detail || errorMessage;
        } catch {
          errorMessage = `Server error: ${response.status} ${response.statusText}`;
        }
        throw new Error(errorMessage);
      }

      const text = await response.text();
      setHtmlPreviewUrls((prev) => new Map(prev).set(index, text));
      setHtmlPreviewIndex(index);
    } catch (error) {
      console.error("Error scraping HTML:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to scrape HTML. Make sure the URL is accessible.";
      alert(errorMessage);
    } finally {
      setHtmlPreviewLoading((prev) => {
        const next = new Map(prev);
        next.delete(index);
        return next;
      });
    }
  };

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      previewUrls.forEach((url) => URL.revokeObjectURL(url));
      htmlPreviewUrls.forEach((url) => URL.revokeObjectURL(url));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Card className="h-full">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Upload className="h-5 w-5 text-primary" />
          Comparison Sources
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Upload PDFs and/or provide HTML links to compare against.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* PDF Upload */}
        <div className="space-y-3">
          <label className="text-sm font-medium">PDF Documents</label>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf"
            multiple
            className="hidden"
            onChange={handleFileSelect}
          />
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`relative w-full rounded-lg border-2 border-dashed transition-colors ${
              isDragging
                ? "border-primary bg-primary/5 scale-[1.02]"
                : "border-muted-foreground/25 hover:border-primary/50"
            }`}
          >
            <Button
              type="button"
              variant="ghost"
              className="w-full h-24 flex-col gap-2 hover:bg-transparent"
              onClick={() => inputRef.current?.click()}
            >
              <FileUp className={`h-6 w-6 transition-transform ${isDragging ? "scale-110" : ""}`} />
              <span className="text-sm font-medium">
                {isDragging ? "Drop PDF files here" : "Choose PDF Files or drag & drop"}
              </span>
              <span className="text-xs text-muted-foreground">PDF files only</span>
            </Button>
          </div>

          {files.length > 0 && (
            <div className="space-y-2">
              {files.map((file, i) => (
                <div key={`${file.name}-${i}`} className="space-y-2">
                  <div className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2">
                    <div className="flex items-center gap-2 truncate">
                      <FileUp className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="truncate text-sm font-medium">{file.name}</span>
                      <Badge variant="secondary" className="shrink-0 text-xs">
                        {formatSize(file.size)}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0"
                        onClick={() => setPreviewIndex(previewIndex === i ? null : i)}
                        title={previewIndex === i ? "Hide preview" : "Show preview"}
                      >
                        {previewIndex === i ? (
                          <EyeOff className="h-3.5 w-3.5" />
                        ) : (
                          <Eye className="h-3.5 w-3.5" />
                        )}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0"
                        onClick={() => removeFile(i)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  {previewIndex === i && (
                    <div className="rounded-md border bg-muted/20 p-2">
                      <iframe
                        src={getFileUrl(file, i)}
                        className="h-[600px] w-full rounded border"
                        title={`Preview of ${file.name}`}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* HTML Links */}
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm font-medium">
            <Link2 className="h-4 w-4" />
            HTML Links
          </label>
          <Textarea
            value={htmlLinks}
            onChange={(e) => onLinksChange(e.target.value)}
            placeholder={"https://example.com/agreement\nhttps://another-platform.com/terms"}
            rows={4}
            className="font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground">
            One URL per line. These will be automatically scraped.
          </p>

          {linkList.length > 0 && (
            <div className="space-y-2">
              {linkList.map((link, i) => (
                <div key={`${link}-${i}`} className="space-y-2">
                  <div className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2">
                    <div className="flex items-center gap-2 truncate">
                      <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="truncate text-sm font-mono text-xs">{link}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0"
                        onClick={() => {
                          if (htmlPreviewIndex === i) {
                            setHtmlPreviewIndex(null);
                          } else {
                            previewHtmlAsPdf(link, i);
                          }
                        }}
                        disabled={htmlPreviewLoading.get(i) === true}
                        title={htmlPreviewIndex === i ? "Hide preview" : "Preview scraped text"}
                      >
                        {htmlPreviewLoading.get(i) ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : htmlPreviewIndex === i ? (
                          <EyeOff className="h-3.5 w-3.5" />
                        ) : (
                          <Eye className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                  </div>
                  {htmlPreviewIndex === i && htmlPreviewUrls.has(i) && (
                    <div className="rounded-md border bg-muted/20 p-2">
                      <textarea
                        readOnly
                        value={htmlPreviewUrls.get(i) || ""}
                        className="h-[600px] w-full rounded border bg-background p-3 font-mono text-xs"
                        title={`Scraped text from ${link}`}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

