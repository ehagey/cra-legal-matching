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

export interface Aspect {
  label: string;
  description: string;
}

export interface AnalysisResult {
  classification: "IDENTICAL" | "SIMILAR" | "NOT_PRESENT" | "ERROR";
  has_multiple_aspects?: boolean;
  summary: string;
  matches: Match[];
  analysis: string;
  error?: string;
  pdf_filename: string;
  apple_clause: string;
  _aspects?: Aspect[];
}

export interface Match {
  type: "IDENTICAL" | "SIMILAR" | "NOT_PRESENT";
  aspect_label?: string;
  page: number | null;
  section: string;
  section_title: string;
  paragraph: number | null;
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

