"use client";

import { useState, useCallback, useRef } from "react";
import type { AnalysisResult, ProgressEvent } from "@/lib/types";
import { startAnalysis, subscribeProgress } from "@/lib/api";

interface AnalysisState {
  loading: boolean;
  completed: number;
  total: number;
  currentItem: string;
  results: AnalysisResult[];
  error: string | null;
}

export function useAnalysis() {
  const [state, setState] = useState<AnalysisState>({
    loading: false,
    completed: 0,
    total: 0,
    currentItem: "",
    results: [],
    error: null,
  });

  const unsubRef = useRef<(() => void) | null>(null);

  const run = useCallback(async (clauses: string[], htmlLinks: string[], files: File[]) => {
    // Reset
    setState({
      loading: true,
      completed: 0,
      total: 0,
      currentItem: "Starting analysis…",
      results: [],
      error: null,
    });

    try {
      const { job_id } = await startAnalysis(clauses, htmlLinks, files);

      // Subscribe to SSE
      unsubRef.current = subscribeProgress(
        job_id,
        (ev: ProgressEvent) => {
          setState((prev) => ({
            ...prev,
            completed: ev.completed,
            total: ev.total,
            currentItem: ev.current_item,
            results: ev.done ? ev.results : prev.results,
            loading: !ev.done,
            error: ev.error,
          }));
        },
        (errMsg: string) => {
          setState((prev) => ({ ...prev, loading: false, error: errMsg }));
        }
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setState((prev) => ({ ...prev, loading: false, error: message }));
    }
  }, []);

  const cancel = useCallback(() => {
    unsubRef.current?.();
    setState((prev) => ({ ...prev, loading: false }));
  }, []);

  return { ...state, run, cancel };
}

