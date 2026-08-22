import { describe, expect, it } from "vitest";
import type { LabRace } from "@/lib/singlePickAi";
import type { FreeRuleCandidate } from "./freeScopeRule";
import { FREE_RULE_ID, getFreeScopeState, isEligibleFreeCandidate, parseFreeScopeManifest, selectFreeCandidates, verifyFreeRace } from "./freeScopeRule";

const candidate = (overrides: Partial<FreeRuleCandidate> = {}): FreeRuleCandidate => ({
  race_key: "JRA|2026-08-22|札幌|09",
  organization: "JRA",
  venue: "札幌",
  race_no: 9,
  scheduled_start_at: "2026-08-22T14:25:00+09:00",
  status: "PREDICTED",
  distance: 1800,
  surface: "芝",
  top_pick: null,
  prediction_as_of: "2026-08-20T17:30:00+09:00",
  calibration_status: "READY",
  is_prerace: true,
  ...overrides,
});

const publishedManifest = {
  schema_version: "free-scope-v1",
  rule_id: FREE_RULE_ID,
  target_week: "2026-W34",
  locked_at: "2026-08-20T18:00:00+09:00",
  input_snapshot_sha256: "a".repeat(64),
  status: "PUBLISHED",
  entries: [{
    race_date: "2026-08-22",
    race_key: "JRA|2026-08-22|札幌|09",
    model_as_of: "2026-08-20T17:30:00+09:00",
    scheduled_start_at: "2026-08-22T14:25:00+09:00",
  }],
} as const;

describe("free_prerace_v1", () => {
  it("accepts only READY, pre-race JRA Saturday/Sunday races numbered 9 through 12 with an as-of", () => {
    expect(isEligibleFreeCandidate(candidate())).toBe(true);
    expect(isEligibleFreeCandidate(candidate({ race_no: 8 }))).toBe(false);
    expect(isEligibleFreeCandidate(candidate({ race_no: 13 }))).toBe(false);
    expect(isEligibleFreeCandidate(candidate({ organization: "NAR" }))).toBe(false);
    expect(isEligibleFreeCandidate(candidate({ scheduled_start_at: "2026-08-21T14:25:00+09:00" }))).toBe(false);
    expect(isEligibleFreeCandidate(candidate({ calibration_status: "PENDING" }))).toBe(false);
    expect(isEligibleFreeCandidate(candidate({ prediction_as_of: null }))).toBe(false);
    expect(isEligibleFreeCandidate(candidate({ is_prerace: false }))).toBe(false);
  });

  it("selects no more than one fixed candidate for each weekend day", async () => {
    const entries = await selectFreeCandidates("2026-W34", [
      candidate({ race_key: "JRA|2026-08-22|札幌|09", race_no: 9 }),
      candidate({ race_key: "JRA|2026-08-22|札幌|10", race_no: 10 }),
      candidate({ race_key: "JRA|2026-08-23|新潟|11", race_no: 11, scheduled_start_at: "2026-08-23T15:45:00+09:00" }),
      candidate({ race_key: "JRA|2026-08-23|新潟|12", race_no: 12, scheduled_start_at: "2026-08-23T16:20:00+09:00" }),
      candidate({ race_key: "JRA|2026-08-23|新潟|08", race_no: 8, scheduled_start_at: "2026-08-23T14:15:00+09:00" }),
    ]);
    expect(entries).toHaveLength(2);
    expect(entries.filter((entry) => entry.scheduled_start_at?.startsWith("2026-08-22"))).toHaveLength(1);
    expect(entries.filter((entry) => entry.scheduled_start_at?.startsWith("2026-08-23"))).toHaveLength(1);
    await expect(selectFreeCandidates("2026-W34", entries)).resolves.toEqual(entries);
  });

  it("fails closed for a non-published empty manifest and never substitutes a race", () => {
    const manifest = parseFreeScopeManifest({ schema_version: "free-scope-v1", rule_id: FREE_RULE_ID, target_week: null, locked_at: null, input_snapshot_sha256: null, status: "NOT_PUBLISHED", entries: [] });
    expect(getFreeScopeState(manifest).kind).toBe("NOT_PUBLISHED");
    expect(parseFreeScopeManifest({ ...publishedManifest, entries: [] })).not.toBeNull();
    expect(getFreeScopeState(parseFreeScopeManifest({ ...publishedManifest, entries: [] })).kind).toBe("NO_ELIGIBLE_RACE");
  });

  it("rejects a race when the fixed as-of, start time, key, or calibration state differs", () => {
    const entry = publishedManifest.entries[0];
    const race = {
      race: { race_key: entry.race_key, scheduled_start_at: entry.scheduled_start_at },
      model: { as_of: entry.model_as_of, calibration_status: "READY" },
    } as unknown as LabRace;
    expect(verifyFreeRace(entry, race)).toEqual({ ok: true });
    expect(verifyFreeRace(entry, { ...race, model: { ...race.model, as_of: "2026-08-20T18:01:00+09:00" } })).toMatchObject({ ok: false });
    expect(verifyFreeRace(entry, { ...race, race: { ...race.race, scheduled_start_at: "2026-08-22T14:30:00+09:00" } })).toMatchObject({ ok: false });
    expect(verifyFreeRace(entry, { ...race, model: { ...race.model, calibration_status: "PENDING" } })).toMatchObject({ ok: false });
  });
});
