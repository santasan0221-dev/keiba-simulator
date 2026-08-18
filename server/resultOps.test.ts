import { afterEach, describe, expect, it } from "vitest";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getJob, startResultJob } from "./resultOps";

const original = {
  workdir: process.env.SINGLE_PICK_AI_WORKDIR,
  python: process.env.SINGLE_PICK_AI_PYTHON,
  status: process.env.FAKE_BATCH_STATUS,
};

function installFakeRunner() {
  const dir = mkdtempSync(join(tmpdir(), "keiba-result-ops-"));
  const runner = join(dir, "fake-python");
  writeFileSync(runner, `#!/bin/sh
if printf '%s' "$*" | grep -q 'run_daily_result_trigger'; then
  sleep 0.1
  printf '{"race_date":"2026-08-18","selected_races":3,"result_count":2,"skipped":[{"reason":"ALREADY_RECORDED"}],"retryable_failures":0,"review_required_failures":0,"batch_status":"%s"}\\n' "\${FAKE_BATCH_STATUS:-COMPLETE}"
else
  printf '{"status":"completed"}\\n'
fi
`);
  chmodSync(runner, 0o755);
  process.env.SINGLE_PICK_AI_WORKDIR = dir;
  process.env.SINGLE_PICK_AI_PYTHON = runner;
}

async function waitForTerminal(jobId: string) {
  for (let i = 0; i < 40; i += 1) {
    const job = getJob(jobId);
    if (job && !["QUEUED", "RUNNING"].includes(job.status)) return job;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error("job did not finish");
}

afterEach(() => {
  process.env.SINGLE_PICK_AI_WORKDIR = original.workdir;
  process.env.SINGLE_PICK_AI_PYTHON = original.python;
  process.env.FAKE_BATCH_STATUS = original.status;
});

describe("official result operation jobs", () => {
  it("runs post-analysis only after COMPLETE", async () => {
    process.env.FAKE_BATCH_STATUS = "COMPLETE";
    installFakeRunner();
    const job = await startResultJob("2026-08-18", "test-admin");
    const finished = await waitForTerminal(job.jobId);
    expect(finished.status).toBe("COMPLETE");
    expect(finished.resultCount).toBe(2);
    expect(finished.alreadyRecorded).toBe(1);
    expect(finished.postAnalysis.status).toBe("COMPLETED");
  });

  it("does not run post-analysis for PARTIAL", async () => {
    process.env.FAKE_BATCH_STATUS = "PARTIAL";
    installFakeRunner();
    const job = await startResultJob("2026-08-19", "test-admin");
    const finished = await waitForTerminal(job.jobId);
    expect(finished.status).toBe("PARTIAL");
    expect(finished.postAnalysis.status).toBe("NOT_STARTED");
  });

  it("does not run post-analysis for FAILED", async () => {
    process.env.FAKE_BATCH_STATUS = "FAILED";
    installFakeRunner();
    const job = await startResultJob("2026-08-20", "test-admin");
    const finished = await waitForTerminal(job.jobId);
    expect(finished.status).toBe("FAILED");
    expect(finished.postAnalysis.status).toBe("NOT_STARTED");
  });

  it("rejects duplicate active jobs for one date", async () => {
    process.env.FAKE_BATCH_STATUS = "COMPLETE";
    installFakeRunner();
    const first = await startResultJob("2026-08-21", "test-admin");
    await expect(startResultJob("2026-08-21", "test-admin")).rejects.toThrow("RESULT_JOB_ALREADY_RUNNING");
    await waitForTerminal(first.jobId);
  });
});
