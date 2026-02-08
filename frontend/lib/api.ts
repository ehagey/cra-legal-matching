import type { AnalyzeResponse, HealthResponse, ProgressEvent } from "./types";

function getPassword(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("app_password") || "";
}

const BASE = ""; // proxied via next.config.mjs rewrites

// SSE also uses the proxy in production (Next.js handles SSE properly)
const SSE_BASE = BASE;

// ---- Health ----

export async function checkHealth(): Promise<HealthResponse> {
  const res = await fetch(`${BASE}/api/health`);
  if (!res.ok) throw new Error(`Health check failed: ${res.status}`);
  return res.json();
}

// ---- Validate password ----

export async function validatePassword(password: string): Promise<boolean> {
  try {
    // Test against a protected endpoint to verify password
    // Use analyze endpoint with minimal valid data to test auth
    const formData = new FormData();
    formData.append("clauses", JSON.stringify(["test"]));
    formData.append("html_links", JSON.stringify([]));
    
    const authRes = await fetch(`${BASE}/api/analyze`, {
      method: "POST",
      headers: { "X-App-Password": password },
      body: formData,
    });
    
    // 401 = bad password (auth failed)
    // 400 = bad input but auth passed (password is valid)
    // 200 = success (password is valid)
    if (authRes.status === 401) {
      return false;
    }
    // If we get 400, it means auth passed but validation failed (which is fine for password check)
    // If we get 200, auth passed and request was valid
    return authRes.status === 400 || authRes.status === 200;
  } catch (error) {
    // Network error or other issues
    console.error("Password validation error:", error);
    return false;
  }
}

// ---- Start analysis ----

export async function startAnalysis(
  clauses: string[],
  htmlLinks: string[],
  files: File[],
  customPromptPdf?: string,
  customPromptText?: string
): Promise<AnalyzeResponse> {
  const formData = new FormData();
  formData.append("clauses", JSON.stringify(clauses));
  formData.append("html_links", JSON.stringify(htmlLinks));
  if (customPromptPdf) {
    formData.append("custom_prompt_pdf", customPromptPdf);
  }
  if (customPromptText) {
    formData.append("custom_prompt_text", customPromptText);
  }
  for (const file of files) {
    formData.append("files", file);
  }

  const res = await fetch(`${BASE}/api/analyze`, {
    method: "POST",
    headers: { "X-App-Password": getPassword() },
    body: formData,
  });

  if (res.status === 401) throw new Error("AUTH_REQUIRED");
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(body.detail || `Request failed: ${res.status}`);
  }

  return res.json();
}

// ---- SSE progress ----

export function subscribeProgress(
  jobId: string,
  onProgress: (event: ProgressEvent) => void,
  onError: (error: string) => void
): () => void {
  const eventSource = new EventSource(`${SSE_BASE}/api/progress/${jobId}`);

  eventSource.addEventListener("progress", (e) => {
    try {
      const data: ProgressEvent = JSON.parse(e.data);
      onProgress(data);
      if (data.done) {
        eventSource.close();
      }
    } catch (err) {
      onError("Failed to parse progress event");
    }
  });

  eventSource.onerror = () => {
    onError("Connection to progress stream lost");
    eventSource.close();
  };

  return () => eventSource.close();
}

