import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TruthPanel } from "./TruthPanel";
import { RaceHistoryDashboardView, type RaceHistoryData } from "./RaceHistoryDashboard";
import type { LabRace } from "@/lib/singlePickAi";

const pendingRace = { race: { race_key: "NAR|2026-08-15|帯広ば|01", venue: "帯広ば", race_no: 1, date: "2026-08-15", distance: 2000, going: "良" }, model: { calibration_status: "UNCALIBRATED_SHADOW_SCORE", as_of: "2026-08-15T08:00:00+09:00", disclaimer: "統制フィクスチャ" }, horses: [{ no: 1, name: "同期本命", model: { ai_rank: 1, win_prob_calibrated: null, top3_prob: null, prob_status: "UNCALIBRATED_SHADOW_SCORE" } }], result: null } as unknown as LabRace;
const confirmedRace = { ...pendingRace, result: { status: "CONFIRMED", official_order: [{ finish: 1, horse_no: 1, horse_name: "同期本命", popularity: 1 }], ai_pick: { horse_no: 1, horse_name: "同期本命", ai_rank: 1, finish: 1, won: true, placed: true }, payouts: { win: [{ horse_no: 1, payout: 240 }], place: [{ horse_no: 1, payout: 120 }] } } } as unknown as LabRace;
const pendingHistory: RaceHistoryData = { source: { enabled: true, refreshMinutes: 15, syncStartedAt: null, lastAttemptAt: null, lastSuccessAt: "2026-08-15T00:00:00.000Z", nextRetryAt: null, consecutiveFailures: 0, lastError: null }, races: [{ raceKey: "NAR|2026-08-15|帯広ば|01", raceDate: "2026-08-15", organization: "NAR", venue: "帯広ば", raceNo: 1, raceStatus: "CLOSED", calibrationStatus: "UNCALIBRATED_SHADOW_SCORE", asOf: null, resultStatus: null, aiPickFinish: null, aiPickOutcome: null, comparedCount: null, exactMatches: null, meanAbsoluteRankError: null, winReturnRate: null, placeReturnRate: null, lastSyncedAt: "2026-08-15T00:00:00.000Z", confirmedAt: null }], recentRuns: [] };
const confirmedHistory: RaceHistoryData = { ...pendingHistory, races: [{ ...pendingHistory.races[0], resultStatus: "CONFIRMED", aiPickFinish: 1, aiPickOutcome: "hit", comparedCount: 1, exactMatches: 1, meanAbsoluteRankError: 0, winReturnRate: 240, placeReturnRate: 120, confirmedAt: "2026-08-15T00:10:00.000Z" }] };

describe("Race sync confirmed flow", () => {
  it("pendingからCONFIRMEDへの同期後にTRUTH PANELと履歴指標を同時に更新する", () => {
    const pending = renderToStaticMarkup(<><TruthPanel race={pendingRace} /><RaceHistoryDashboardView data={pendingHistory} /></>);
    const confirmed = renderToStaticMarkup(<><TruthPanel race={confirmedRace} /><RaceHistoryDashboardView data={confirmedHistory} /></>);
    expect(pending).toContain("結果はまだ確定していません");
    expect(pending).toContain("CONFIRMED RACES");
    expect(confirmed).toContain("公式確定");
    expect(confirmed).toContain("的中（1着）");
    expect(confirmed).toContain("240.0%");
    expect(confirmed).toContain("帯広ば 1R");
    expect(confirmed).toContain("1件を表示");
  });

  it("バックグラウンド同期中は履歴ダッシュボードにローディング状態を表示する", () => {
    const syncing: RaceHistoryData = { ...pendingHistory, source: { ...pendingHistory.source!, syncStartedAt: "2026-08-15T00:05:00.000Z" } };
    const markup = renderToStaticMarkup(<RaceHistoryDashboardView data={syncing} />);
    expect(markup).toContain("バックグラウンド同期中");
    expect(markup).toContain("spin");
  });
});
