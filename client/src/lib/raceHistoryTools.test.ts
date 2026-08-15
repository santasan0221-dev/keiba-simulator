import { describe, expect, it } from "vitest";
import { buildRaceHistoryCsv, buildWeeklyRaceHistoryReport, filterRaceHistory, findNewlyConfirmedRaces, normalizeRaceHistoryFilters } from "./raceHistoryTools";
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

  it("保存済みフィルターを安全に正規化し、期間が逆転した場合は補正する", () => {
    expect(normalizeRaceHistoryFilters({ from: "2026-08-12", to: "2026-08-01", venue: "札幌" })).toEqual({ from: "2026-08-01", to: "2026-08-12", venue: "札幌" });
    expect(normalizeRaceHistoryFilters({ from: 10, venue: ["札幌"] })).toEqual({ from: "", to: "", venue: "" });
  });

  it("週次レポートは確定済み結果だけを集計し、払戻不明をROIへ混ぜない", () => {
    const laterConfirmed: RaceHistoryRace = { ...races[0], raceKey: "NAR|2026-08-08|帯広ば|02", raceDate: "2026-08-08", raceNo: 2, comparedCount: 5, exactMatches: 2, meanAbsoluteRankError: 1.2, winReturnRate: 0, placeReturnRate: null };
    const report = buildWeeklyRaceHistoryReport([...races, laterConfirmed]);
    expect(report).toHaveLength(2);
    expect(report[0]).toMatchObject({ weekKey: "2026-07-27", confirmedRaces: 1, rankAccuracy: 60, averageRoi: 180, roiSampleCount: 2 });
    expect(report[1]).toMatchObject({ weekKey: "2026-08-03", confirmedRaces: 1, rankAccuracy: 40, averageRoi: 0, roiSampleCount: 1 });
  });

  it("未確認のCONFIRMEDレースだけを結果確定通知の対象にする", () => {
    expect(findNewlyConfirmedRaces(races, [])).toEqual([races[0]]);
    expect(findNewlyConfirmedRaces(races, [races[0].raceKey])).toEqual([]);
  });
});
