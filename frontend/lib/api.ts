import type { AnalyzeResponse, HealthResponse, ProgressEvent } from "./types";

function getPassword(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("app_password") || "";
}

const BASE = ""; // proxied via next.config.mjs rewrites in dev

// SSE connects directly to the backend to avoid Next.js proxy buffering
const SSE_BASE = typeof window !== "undefined"
  ? (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000")
  : "";

// ---- Health ----

export async function checkHealth(): Promise<HealthResponse> {
  const res = await fetch(`${BASE}/api/health`);
  if (!res.ok) throw new Error(`Health check failed: ${res.status}`);
  return res.json();
}

// ---- Validate password ----

export async function validatePassword(password: string): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/api/health`, {
      headers: { "X-App-Password": password },
    });
    // Health endpoint is open, so we use analyze with empty body to check auth
    const authRes = await fetch(`${BASE}/api/analyze`, {
      method: "POST",
      headers: { "X-App-Password": password },
      body: new FormData(), // will fail validation but auth should pass
    });
    // 401 = bad password, 400 = bad input (password is fine)
    return authRes.status !== 401;
  } catch {
    return false;
  }
}

// ---- Start analysis ----

export async function startAnalysis(
  clauses: string[],
  htmlLinks: string[],
  files: File[]
): Promise<AnalyzeResponse> {
  const formData = new FormData();
  formData.append("clauses", JSON.stringify(clauses));
  formData.append("html_links", JSON.stringify(htmlLinks));
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

