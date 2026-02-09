"use client";

import { useState, useEffect } from "react";
import { Save, RotateCcw, FileText, Globe, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";

interface PromptEditorProps {
  onPromptChange?: (pdf: string, text: string) => void;
}

export function PromptEditor({ onPromptChange }: PromptEditorProps) {
  const [pdfPrompt, setPdfPrompt] = useState("");
  const [textPrompt, setTextPrompt] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasCustom, setHasCustom] = useState(false);

  // Load prompts on mount
  useEffect(() => {
    loadPrompts();
  }, []);

  const loadPrompts = async () => {
    try {
      const password = localStorage.getItem("app_password") || "";
      const res = await fetch("/api/prompt", {
        headers: { "X-App-Password": password },
      });

      if (!res.ok) {
        if (res.status === 401) {
          throw new Error("AUTH_REQUIRED");
        }
        throw new Error("Failed to load prompts");
      }

      const data = await res.json();
      setPdfPrompt(data.pdf || "");
      setTextPrompt(data.text || "");
      setHasCustom(data.has_custom || false);
    } catch (error) {
      console.error("Failed to load prompts:", error);
      if (error instanceof Error && error.message === "AUTH_REQUIRED") {
        toast.error("Authentication required");
      } else {
        toast.error("Failed to load prompts");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const password = localStorage.getItem("app_password") || "";
      const formData = new FormData();
      if (pdfPrompt.trim()) formData.append("pdf", pdfPrompt);
      if (textPrompt.trim()) formData.append("text", textPrompt);

      const res = await fetch("/api/prompt", {
        method: "POST",
        headers: { "X-App-Password": password },
        body: formData,
      });

      if (!res.ok) {
        if (res.status === 401) {
          throw new Error("AUTH_REQUIRED");
        }
        const error = await res.json().catch(() => ({ detail: "Failed to save" }));
        throw new Error(error.detail || "Failed to save prompt");
      }

      setHasCustom(true);
      toast.success("Prompt saved successfully");
      onPromptChange?.(pdfPrompt, textPrompt);
    } catch (error) {
      console.error("Failed to save prompt:", error);
      if (error instanceof Error && error.message === "AUTH_REQUIRED") {
        toast.error("Authentication required");
      } else {
        toast.error(error instanceof Error ? error.message : "Failed to save prompt");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!confirm("Reset prompt to default? This will delete your custom prompt.")) {
      return;
    }

    setSaving(true);
    try {
      const password = localStorage.getItem("app_password") || "";
      const formData = new FormData();
      formData.append("reset", "true");

      const res = await fetch("/api/prompt", {
        method: "POST",
        headers: { "X-App-Password": password },
        body: formData,
      });

      if (!res.ok) {
        if (res.status === 401) {
          throw new Error("AUTH_REQUIRED");
        }
        throw new Error("Failed to reset prompt");
      }

      await loadPrompts();
      setHasCustom(false);
      toast.success("Prompt reset to default");
      onPromptChange?.("", "");
    } catch (error) {
      console.error("Failed to reset prompt:", error);
      if (error instanceof Error && error.message === "AUTH_REQUIRED") {
        toast.error("Authentication required");
      } else {
        toast.error("Failed to reset prompt");
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">Loading prompt...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">Analysis Prompt</CardTitle>
            <CardDescription className="text-xs mt-1">
              Customize the prompt sent to the AI. Use {"{apple_clause}"}, {"{pdf_filename}"}, and {"{text_content}"} as placeholders.
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleReset}
              disabled={saving || !hasCustom}
              title={hasCustom ? "Reset to default" : "Already using default"}
            >
              <RotateCcw className="h-4 w-4 mr-1" />
              Reset
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-1" />
                  Save
                </>
              )}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="pdf" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="pdf" className="gap-2">
              <FileText className="h-4 w-4" />
              PDF Prompt
            </TabsTrigger>
            <TabsTrigger value="text" className="gap-2">
              <Globe className="h-4 w-4" />
              Text/HTML Prompt
            </TabsTrigger>
          </TabsList>
          <TabsContent value="pdf" className="mt-4">
            <Textarea
              value={pdfPrompt}
              onChange={(e) => setPdfPrompt(e.target.value)}
              placeholder="Enter custom prompt for PDF analysis..."
              className="font-mono text-xs min-h-[400px]"
            />
            <p className="text-xs text-muted-foreground mt-2">
              Placeholders: {"{apple_clause}"} - The clause to find, {"{pdf_filename}"} - Document name
            </p>
          </TabsContent>
          <TabsContent value="text" className="mt-4">
            <Textarea
              value={textPrompt}
              onChange={(e) => setTextPrompt(e.target.value)}
              placeholder="Enter custom prompt for text/HTML analysis..."
              className="font-mono text-xs min-h-[400px]"
            />
            <p className="text-xs text-muted-foreground mt-2">
              Placeholders: {"{apple_clause}"} - The clause to find, {"{pdf_filename}"} - Document name, {"{text_content}"} - Scraped text
            </p>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

