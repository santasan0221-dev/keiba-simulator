import { describe, expect, it } from "vitest";
import { getRankAccuracySummary, getVirtualRoiSummary } from "./raceOutcomeAnalysis";

const horses = [
  { no: 4, name: "オンベイト", model: { ai_rank: 1 } },
  { no: 5, name: "ラクリメ", model: { ai_rank: 2 } },
  { no: 2, name: "テスト馬", model: { ai_rank: 3 } },
] as never[];

const confirmed = {
  status: "CONFIRMED",
  official_order: [
    { finish: 1, horse_no: 4, horse_name: "オンベイト", popularity: 1 },
    { finish: 2, horse_no: 5, horse_name: "ラクリメ", popularity: 5 },
  ],
  ai_pick: { horse_no: 4, horse_name: "オンベイト", ai_rank: 1, finish: 1, won: true, placed: true },
  payouts: { win: [{ horse_no: 4, payout: 420 }], place: [{ horse_no: 4, payout: 180 }] },
} as const;

describe("race outcome analysis", () => {
  it("compares AI ranks only with official positions that are actually supplied", () => {
    const summary = getRankAccuracySummary(horses, confirmed);
    expect(summary).toMatchObject({ available: true, exactMatches: 2, topPickFinish: 1 });
    expect(summary.compared).toHaveLength(2);
    expect(summary.meanAbsoluteRankError).toBe(0);
  });

  it("does not infer rank accuracy before confirmation or beyond supplied official positions", () => {
    const summary = getRankAccuracySummary(horses, null);
    expect(summary.available).toBe(false);
    expect(summary.compared).toHaveLength(0);
  });

  it("calculates virtual return rates only from a matched official payout", () => {
    const roi = getVirtualRoiSummary(confirmed);
    expect(roi.rows[0]).toMatchObject({ payout: 420, returned: 420, returnRate: 420 });
    expect(roi.rows[1]).toMatchObject({ payout: 180, returned: 180, returnRate: 180 });
  });

  it("withholds ROI when the pick outcome or payout is not supplied", () => {
    const missing = { ...confirmed, ai_pick: { ...confirmed.ai_pick, finish: null, won: null, placed: null }, payouts: null };
    const roi = getVirtualRoiSummary(missing);
    expect(roi.available).toBe(false);
    expect(roi.rows.every((row) => row.returnRate === null)).toBe(true);
  });
});
