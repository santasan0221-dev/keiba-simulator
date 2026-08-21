import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const JOB_TIMEOUT_MS = 15 * 60 * 1000;

export type ResultJobStatus = "QUEUED" | "RUNNING" | "COMPLETE" | "PARTIAL" | "FAILED" | "REVIEW_REQUIRED";
export type ResultJob = {
  jobId: string;
  raceDate: string;
  status: ResultJobStatus;
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

type SafeReport = Record<string, unknown>;
const jobs = new Map<string, ResultJob>();
const activeByDate = new Map<string, string>();

function configured() {
  return Boolean(process.env.SINGLE_PICK_AI_WORKDIR && process.env.SINGLE_PICK_AI_PYTHON);
}

function assertDate(value: string) {
  if (!DATE_RE.test(value)) throw new Error("race_date must use YYYY-MM-DD");
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error("race_date is not a valid calendar date");
  }
}

function now() { return new Date().toISOString(); }
function safeError(value: unknown): string {
  const text = value instanceof Error ? value.message : String(value);
  return text.replace(/(token|secret|password|authorization|api[_-]?key)\s*[=:]\s*[^\s,;]+/gi, "$1=[REDACTED]").slice(0, 1000);
}
function lastJson(stdout: string): SafeReport | null {
  const lines = stdout.split(/\r?\n/).map(line => line.trim()).filter(Boolean).reverse();
  for (const line of lines) {
    try {
      const value = JSON.parse(line);
      if (value && typeof value === "object" && !Array.isArray(value)) return value as SafeReport;
    } catch { /* wrapper output may contain progress lines */ }
  }
  return null;
}
function audit(event: string, job: ResultJob, extra: Record<string, unknown> = {}) {
  console.info(JSON.stringify({
    event,
    occurredAt: now(),
    jobId: job.jobId,
    raceDate: job.raceDate,
    actor: job.actor,
    status: job.status,
    ...extra,
  }));
}
async function runFixed(args: string[]) {
  if (!configured()) throw new Error("LOCAL_RESULT_OPS_NOT_CONFIGURED");
  const command = process.env.SINGLE_PICK_AI_PYTHON!;
  const workdir = process.env.SINGLE_PICK_AI_WORKDIR!;
  const result = await execFileAsync(command, args, {
    cwd: workdir,
    shell: false,
    timeout: JOB_TIMEOUT_MS,
    maxBuffer: 4 * 1024 * 1024,
    env: { ...process.env, PYTHONUNBUFFERED: "1" },
  });
  return { report: lastJson(result.stdout), stdout: result.stdout, stderr: result.stderr };
}
function applyBatchReport(job: ResultJob, report: SafeReport | null) {
  const source = report ?? {};
  job.batchStatus = typeof source.batch_status === "string" ? source.batch_status : null;
  job.selectedRaces = typeof source.selected_races === "number" ? source.selected_races : null;
  job.resultCount = typeof source.result_count === "number" ? source.result_count : null;
  const skipped = Array.isArray(source.skipped) ? source.skipped : [];
  job.alreadyRecorded = skipped.filter((row) => row && typeof row === "object" && (row as Record<string, unknown>).reason === "ALREADY_RECORDED").length;
  job.retryableFailures = typeof source.retryable_failures === "number" ? source.retryable_failures : null;
  job.reviewRequiredFailures = typeof source.review_required_failures === "number" ? source.review_required_failures : null;
  if (job.batchStatus === "COMPLETE") job.status = "COMPLETE";
  else if (job.batchStatus === "PARTIAL") job.status = "PARTIAL";
  else job.status = "FAILED";
}

export function getJob(jobId: string) { return jobs.get(jobId) ?? null; }
export function isOpsConfigured() { return configured(); }

export async function startResultJob(raceDate: string, actor: string): Promise<ResultJob> {
  assertDate(raceDate);
  if (!configured()) throw new Error("LOCAL_RESULT_OPS_NOT_CONFIGURED");
  const existing = activeByDate.get(raceDate);
  if (existing) throw new Error(`RESULT_JOB_ALREADY_RUNNING:${existing}`);
  const timestamp = now();
  const job: ResultJob = {
    jobId: `result_${raceDate.replaceAll("-", "")}_${randomUUID().slice(0, 8)}`,
    raceDate, status: "QUEUED", batchStatus: null, selectedRaces: null, resultCount: null,
    alreadyRecorded: null, retryableFailures: null, reviewRequiredFailures: null,
    lastSuccessAt: null, error: null, postAnalysis: { status: "NOT_STARTED" },
    createdAt: timestamp, updatedAt: timestamp, actor,
  };
  jobs.set(job.jobId, job);
  activeByDate.set(raceDate, job.jobId);
  audit("official_result_job_started", job);
  void executeResultJob(job);
  return job;
}

async function executeResultJob(job: ResultJob) {
  job.status = "RUNNING"; job.updatedAt = now(); audit("official_result_batch_running", job);
  try {
    // Fixed command only. The current canonical analysis CLI accepts --date.
    const batch = await runFixed(["-m", "scripts.run_daily_result_trigger", job.raceDate]);
    applyBatchReport(job, batch.report);
    const batchStatus = typeof batch.report?.batch_status === "string" ? batch.report.batch_status : null;
    if (batchStatus !== "COMPLETE") {
      job.status = batchStatus === "PARTIAL" ? "PARTIAL" : "FAILED";
      job.error = `result batch status: ${job.batchStatus ?? "UNKNOWN"}`;
      audit("official_result_batch_not_complete", job, { error: job.error });
      return;
    }
    job.postAnalysis = { status: "RUNNING" }; job.updatedAt = now(); audit("post_result_analysis_running", job);
    const analysis = await runFixed(["-m", "scripts.run_daily_post_result_analysis", "--date", job.raceDate]);
    const report = analysis.report ?? {};
    if (report.status === "completed") {
      job.postAnalysis = { status: "COMPLETED" };
      job.lastSuccessAt = now();
      audit("official_result_job_completed", job);
    } else {
      job.postAnalysis = { status: "REVIEW_REQUIRED", error: "post-result analysis returned review_required" };
      job.status = "REVIEW_REQUIRED";
      job.error = "post-result analysis requires review";
      audit("post_result_analysis_review_required", job, { error: job.error });
    }
  } catch (error) {
    job.status = "FAILED";
    job.error = safeError(error);
    audit("official_result_job_failed", job, { error: job.error });
  } finally {
    job.updatedAt = now();
    if (activeByDate.get(job.raceDate) === job.jobId) activeByDate.delete(job.raceDate);
  }
}

export function getResultHealth(raceDate: string) {
  assertDate(raceDate);
  const latest = Array.from(jobs.values()).filter(job => job.raceDate === raceDate).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null;
  return {
    raceDate,
    configured: configured(),
    status: latest ? latest.status : "NO_RUN",
    predictedRaces: latest?.selectedRaces ?? null,
    resultFetchedRaces: latest?.resultCount ?? null,
    pendingRaces: latest?.retryableFailures ?? null,
    reviewRequired: latest?.reviewRequiredFailures ?? null,
    lastAutomaticFetchAt: latest?.lastSuccessAt ?? null,
    nextAutomaticFetchAt: null,
    jobId: latest?.jobId ?? null,
  };
}
