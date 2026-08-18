export type OfficialResultJob = {
  jobId: string;
  raceDate: string;
  status: "QUEUED" | "RUNNING" | "COMPLETE" | "PARTIAL" | "FAILED" | "REVIEW_REQUIRED";
  batchStatus: string | null;
  selectedRaces: number | null;
  resultCount: number | null;
  alreadyRecorded: number | null;
  retryableFailures: number | null;
  reviewRequiredFailures: number | null;
  lastSuccessAt: string | null;
  error: string | null;
  postAnalysis: { status: "NOT_STARTED" | "RUNNING" | "COMPLETED" | "REVIEW_REQUIRED"; error?: string };
  createdAt: string;
  updatedAt: string;
  actor: string;
};

export type ResultHealth = {
  raceDate: string;
  configured: boolean;
  status: string;
  predictedRaces: number | null;
  resultFetchedRaces: number | null;
  pendingRaces: number | null;
  reviewRequired: number | null;
  lastAutomaticFetchAt: string | null;
  nextAutomaticFetchAt: string | null;
  jobId: string | null;
};

async function opsFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { credentials: "include", headers: { "content-type": "application/json", ...(init?.headers ?? {}) }, ...init });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body?.error === "string" ? body.error : `運用API HTTP ${response.status}`);
  return body as T;
}

export async function startOfficialResultJob(raceDate: string) {
  return opsFetch<{ status: "started"; job_id: string }>("/api/ops/results", { method: "POST", body: JSON.stringify({ race_date: raceDate }) });
}
export async function fetchOfficialResultJob(jobId: string) {
  return opsFetch<OfficialResultJob>(`/api/ops/jobs/${encodeURIComponent(jobId)}`);
}
export async function fetchResultHealth(raceDate: string) {
  return opsFetch<ResultHealth>(`/api/ops/result-health?race_date=${encodeURIComponent(raceDate)}`);
}
export async function fetchOpsCapability() {
  return opsFetch<{ configured: boolean }>("/api/ops/capability");
}
