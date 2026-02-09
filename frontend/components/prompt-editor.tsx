"use client";

import { useState, useEffect } from "react";
import { FileText, Globe, Loader2 } from "lucide-react";
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

  // Load default prompts on mount
  useEffect(() => {
    loadDefaultPrompts();
  }, []);

  const loadDefaultPrompts = async () => {
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

  // Notify parent when prompts change
  useEffect(() => {
    onPromptChange?.(pdfPrompt, textPrompt);
  }, [pdfPrompt, textPrompt, onPromptChange]);

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="text-lg">Analysis Prompt</CardTitle>
          <CardDescription className="text-xs mt-1">
            Customize the prompt sent to the AI for this analysis. Use {"{apple_clause}"}, {"{pdf_filename}"}, and {"{text_content}"} as placeholders.
          </CardDescription>
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

