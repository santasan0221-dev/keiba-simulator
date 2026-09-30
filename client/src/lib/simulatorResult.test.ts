import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import fixture from "@/__fixtures__/lab-race-v2.json";
import type { LabRace, LabResultListItem } from "@/lib/singlePickAi";
import { officialResultView, shouldPollResult } from "./simulatorResult";

const race = (): LabRace => {
  const value = structuredClone(fixture) as unknown as LabRace;
  value.honmei = { status: "AVAILABLE", mark: "◎", horse_no: 1, horse_name: "サンダーリーフ", win_probability: 0.241 };
  value.ai_top = { status: "AVAILABLE", horse_no: 3, horse_name: "アオイノキセキ", win_probability: 0.3 };
  value.honmei_view = { sources: { market: { source: "MARKET", status: "AVAILABLE", horse_no: 2, win_probability: 0.3 } } };
  value.result = { status: "CONFIRMED", official_order: [3, 2, 5, 1, 4].map((no, i) => ({ finish: i + 1, horse_no: no, horse_name: `馬${no}`, popularity: null })), ai_pick: null, payouts: null };
  return value;
};
const row = (over: Partial<LabResultListItem> = {}): LabResultListItem => ({
  race_key: "JRA|2026-09-20|東京|11", race_date: "2026-09-20", organization: "JRA", venue: "東京", race_no: 11, scheduled_start_at: "2026-09-20T06:00:00+00:00",
  prediction_id: "p", prediction_created_at: null, predicted_top3: [{ mark: "◎", horse_no: 1, horse_name: "サンダーリーフ" }],
  official_top3: [3, 2, 5], ai_pick_finish: 4, top3_coverage: 0.333333, result_status: "CONFIRMED", special_statuses: [], result_fetched_at: null, ...over,
});

describe("official result in the simulator (canonical only)", () => {
  it("confirmed → top 3 from the official order, ◎ / AI TOP / MARKET TOP finishes, coverage", () => {
    const view = officialResultView(row(), race());
    expect(view.state).toBe("CONFIRMED");
    expect(view.label).toBe("OFFICIAL RESULT");
    expect(view.top3.map(entry => [entry.finish, entry.horseNo, entry.horseName])).toEqual([[1, 3, "馬3"], [2, 2, "馬2"], [3, 5, "馬5"]]);
    expect(view.honmei).toEqual({ horseNo: 1, finish: "4着" });
    expect(view.aiTop).toEqual({ horseNo: 3, finish: "1着" });
    expect(view.marketTop).toEqual({ horseNo: 2, finish: "2着" });
    expect(view.coverage).toBe("33.3%");
  });

  it("pending is never a result: no top 3, no 0着, no 着外", () => {
    const view = officialResultView(row({ result_status: "PENDING", official_top3: [], ai_pick_finish: null, top3_coverage: null }), race());
    expect(view.state).toBe("PENDING");
    expect(view.label).toBe("RESULT PENDING");
    expect(view.message).toContain("公式結果を確認中");
    expect(view.top3).toEqual([]);
    expect(JSON.stringify(view)).not.toMatch(/0着|着外|6着以下/);
  });

  it("REVIEW_REQUIRED is not treated as a result even if a stale detail result exists", () => {
    const view = officialResultView(row({ result_status: "REVIEW_REQUIRED" }), race());
    expect(view.state).toBe("REVIEW_REQUIRED");
    expect(view.label).toBe("REVIEW REQUIRED");
    expect(view.top3).toEqual([]);
    expect(view.honmei.finish).toBe("—");
  });

  it("a special status on the ◎ is shown as that status, not a position", () => {
    const view = officialResultView(row({ ai_pick_finish: null, special_statuses: [{ horse_no: 1, status: "EXCLUDED" }] }), race());
    expect(view.honmei.finish).toBe("除外");
    expect(view.specials).toContain("#1 除外");
  });

  it("missing row or failed request → UNAVAILABLE, never pending or 0", () => {
    expect(officialResultView(undefined, race()).state).toBe("UNAVAILABLE");
    expect(officialResultView(row(), race(), true).state).toBe("UNAVAILABLE");
  });

  it("never reads the scenario", () => {
    const source = readFileSync(resolve(import.meta.dirname, "simulatorResult.ts"), "utf8");
    expect(source).not.toMatch(/scenarioReplay|scenarioFrame|formationAt/);
  });

  it("polls only while pending/review after post time, and only a few times", () => {
    const start = "2026-09-30T04:00:00Z";
    expect(shouldPollResult("PENDING", start, Date.parse(start) + 1, 0)).toBe(true);
    expect(shouldPollResult("PENDING", start, Date.parse(start) - 1, 0)).toBe(false);
    expect(shouldPollResult("CONFIRMED", start, Date.parse(start) + 1, 0)).toBe(false);
    expect(shouldPollResult("REVIEW_REQUIRED", start, Date.parse(start) + 1, 12)).toBe(false);
  });
});
