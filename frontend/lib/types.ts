// ---- API request types ----

export interface AnalyzeRequest {
  clauses: string[];
  htmlLinks: string[];
  files: File[];
}

// ---- API response types ----

export interface AnalyzeResponse {
  job_id: string;
}

export interface ProgressEvent {
  completed: number;
  total: number;
  current_item: string;
  done: boolean;
  error: string | null;
  results: AnalysisResult[];
}

export interface AnalysisResult {
  classification: "IDENTICAL" | "SIMILAR" | "NOT_PRESENT" | "ERROR";
  summary: string;
  matches: Match[];
  analysis: string;
  error?: string;
  pdf_filename: string;
  apple_clause: string;
}

export interface Match {
  type: "IDENTICAL" | "SIMILAR";
  page: number;
  section: string;
  section_title: string;
  paragraph: number;
  full_text: string;
  differences: Difference[];
  legal_note: string;
}

export interface Difference {
  aspect: string;
  apple: string;
  theirs: string;
}

export interface HealthResponse {
  status: string;
  model: string;
  error: string | null;
}

