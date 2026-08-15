import { describe, expect, it } from "vitest";
import { buildRaceHistoryCsv, filterRaceHistory } from "./raceHistoryTools";
import type { RaceHistoryRace } from "@/components/RaceHistoryDashboard";

const races: RaceHistoryRace[] = [
  { raceKey: "NAR|2026-08-01|帯広ば|01", raceDate: "2026-08-01", organization: "NAR", venue: "帯広ば", raceNo: 1, raceStatus: "CLOSED", calibrationStatus: "READY", asOf: "2026-08-01T08:00:00Z", resultStatus: "CONFIRMED", aiPickFinish: 1, aiPickOutcome: "的中", comparedCount: 5, exactMatches: 3, meanAbsoluteRankError: 0.4, winReturnRate: 240, placeReturnRate: 120, lastSyncedAt: "2026-08-01T10:00:00Z", confirmedAt: "2026-08-01T10:00:00Z" },
  { raceKey: "JRA|2026-08-12|札幌|11", raceDate: "2026-08-12", organization: "JRA", venue: "札幌", raceNo: 11, raceStatus: "PREDICTED", calibrationStatus: "READY", asOf: "2026-08-12T08:00:00Z", resultStatus: null, aiPickFinish: null, aiPickOutcome: null, comparedCount: null, exactMatches: null, meanAbsoluteRankError: null, winReturnRate: null, placeReturnRate: null, lastSyncedAt: "2026-08-12T08:00:00Z", confirmedAt: null },
];

describe("raceHistoryTools", () => {
  it("期間と競馬場を同時に絞り込む", () => {
    expect(filterRaceHistory(races, { from: "2026-08-01", to: "2026-08-05", venue: "帯広ば" })).toEqual([races[0]]);
    expect(filterRaceHistory(races, { from: "2026-08-02", to: "", venue: "" })).toEqual([races[1]]);
  });

  it("フィルター条件と未確定を含む履歴行をBOM付きCSVへ出力する", () => {
    const filtered = filterRaceHistory(races, { from: "2026-08-01", to: "2026-08-31", venue: "帯広ば" });
    const csv = buildRaceHistoryCsv(filtered, { from: "2026-08-01", to: "2026-08-31", venue: "帯広ば" });
    expect(csv.startsWith("\uFEFFAI OUTCOME ARCHIVE")).toBe(true);
    expect(csv).toContain("対象期間,2026-08-01〜2026-08-31");
    expect(csv).toContain("NAR|2026-08-01|帯広ば|01");
    expect(csv).not.toContain("JRA|2026-08-12|札幌|11");
    expect(csv).toContain("resultStatus");
  });
});
