import { describe, expect, it } from "vitest";
import { createScenarioProvenance, provenanceBadge, provenanceMetadata } from "./scenarioProvenance";
import type { LabRace } from "./singlePickAi";

const race = {
  race: { race_key: "jra-20260815-11", date: "2026-08-15", organization: "JRA", venue: "札幌", race_no: 11, distance: 2000, surface: "芝", going: "良", scheduled_start_at: null, status: "OPEN" },
  model: { champion_id: "v23k", calibration_status: "UNCALIBRATED_SHADOW_SCORE", disclaimer: "test", as_of: "2026-08-14T00:00:00Z" },
  horses: [], branches: [], market_ev: { note: "test", status: "SKIP", rows: [] }, provenance: {},
} satisfies LabRace;

describe("scenario provenance", () => {
  it("preserves real race identity and calibration status without creating probabilities", () => {
    const provenance = createScenarioProvenance(race, "2026-08-15T01:02:03Z");

    expect(provenance).toMatchObject({ kind: "single_pick_ai", raceKey: "jra-20260815-11", calibrationStatus: "UNCALIBRATED_SHADOW_SCORE", asOf: "2026-08-14T00:00:00Z" });
    expect(provenanceBadge(provenance)).toBe("実データ · UNCALIBRATED_SHADOW_SCORE");
    expect(provenanceMetadata(provenance)).toEqual(expect.arrayContaining([
      ["race_key", "jra-20260815-11"],
      ["校正状態", "UNCALIBRATED_SHADOW_SCORE"],
      ["as_of", "2026-08-14T00:00:00Z"],
      ["取得時刻", "2026-08-15T01:02:03Z"],
    ]));
    expect(provenanceMetadata(provenance)).not.toContainEqual(expect.arrayContaining(["win_prob_calibrated"]));
  });

  it("marks scenarios without a loaded race as sample data", () => {
    const provenance = createScenarioProvenance(null, "2026-08-15T01:02:03Z");

    expect(provenanceBadge(provenance)).toBe("サンプルデータ");
    expect(provenanceMetadata(provenance)).toContainEqual(["実データ元", "サンプルデータ（実レース未読込）"]);
  });

  it("treats legacy snapshots with no provenance as unknown rather than sample or real data", () => {
    expect(provenanceBadge(undefined)).toBe("出所未確認（旧保存形式）");
    expect(provenanceMetadata(undefined)).toContainEqual(["実データ元", "未確認（旧保存形式）"]);
  });
});
