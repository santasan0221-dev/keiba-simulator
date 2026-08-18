# Official result operations

## Scope

The `REAL RACE INPUT` control is an authenticated, admin-only operation. It never executes a command from the browser. The server accepts only an ISO date and runs the two fixed Python module commands below.

```text
python -m scripts.run_daily_result_trigger YYYY-MM-DD
python -m scripts.run_daily_post_result_analysis --date YYYY-MM-DD
```

The post-result command is started only when the first command reports `batch_status=COMPLETE`. The trigger wrapper accepts the date as a positional argument; the current canonical post-analysis CLI accepts the equivalent `--date` option. `PARTIAL` and `FAILED` never produce a success state and never start post-result analysis.

## Required server environment

```text
SINGLE_PICK_AI_WORKDIR=/absolute/path/to/single_pick_ai
SINGLE_PICK_AI_PYTHON=/absolute/path/to/python
KEIBA_LAB_ORIGIN=https://official-keiba-lab.example
```

If either execution variable is absent, `/api/ops/capability` reports `configured=false` and the UI disables the button. If `KEIBA_LAB_ORIGIN` is absent, browser requests carrying an Origin header are rejected by the operations middleware. No token or secret is placed in JavaScript or the repository.

## API

```text
POST /api/ops/results
body: { "race_date": "YYYY-MM-DD" }
response: 202 { "status": "started", "job_id": "result_..." }
```

The caller must be an authenticated admin session. The server validates the date using a strict calendar-date check, uses `execFile` with `shell:false`, applies a 15-minute timeout, parses only JSON output, redacts secret-like values in errors, and keeps one active job per date within the process.

```text
GET /api/ops/jobs/{job_id}
GET /api/ops/result-health?race_date=YYYY-MM-DD
GET /api/ops/capability
```

The job exposes `QUEUED`, `RUNNING`, `COMPLETE`, `PARTIAL`, `FAILED`, or `REVIEW_REQUIRED`, along with `selected_races`, `result_count`, `already_recorded`, `retryable_failures`, `review_required_failures`, `batch_status`, `lastSuccessAt`, and an error summary. Structured server audit events include execution time, date, actor, job ID, status, and non-secret error summaries.

## Known deployment prerequisite

The current keiba-simulator repository has the secure frontend and HTTP boundary, but it does not contain the `single_pick_ai` Python package or a durable cross-instance job queue. Production deployment must provide the canonical `single_pick_ai` checkout at `SINGLE_PICK_AI_WORKDIR` and a process manager or shared lock if multiple server instances are used. The current in-process date lock is fail-safe for a single server process; it must be replaced by a DB/distributed lock before horizontal scaling.

The existing `raceSync` API remains read-only. The existing `更新` button still only reloads the read-only race list. The official-result button is a separate operation and triggers a read-only reload of the selected race and dashboard after a successful job.
