import { describe, expect, it } from "vitest";
import { aiPickFinishLabel, aiPickOutcomeLabel, getAiPickOutcome, getConfirmedResultSummary } from "./officialRaceResult";

const confirmed = { status: "CONFIRMED", official_order: [{ finish: 1, horse_no: 4, horse_name: "オンベイト", popularity: 1 }], payouts: null };

describe("official race outcome presentation", () => {
  it("marks a first-place AI pick as a hit", () => {
    const result = { ...confirmed, ai_pick: { horse_no: 4, horse_name: "オンベイト", ai_rank: 1, finish: 1, won: true, placed: true } };
    expect(getAiPickOutcome(result)).toBe("hit");
    expect(aiPickOutcomeLabel(result)).toBe("的中（1着）");
  });

  it("keeps a missing finish distinct from pending and outside", () => {
    const result = { ...confirmed, ai_pick: { horse_no: 4, horse_name: "オンベイト", ai_rank: 1, finish: null, won: null, placed: null } };
    expect(getAiPickOutcome(result)).toBe("missing_finish");
    expect(aiPickOutcomeLabel(result)).toBe("本命の着順データなし");
    expect(aiPickFinishLabel(result.ai_pick)).toBe("着順データなし");
    expect(aiPickOutcomeLabel(null)).toBe("結果はまだ確定していません");
  });

  it("distinguishes a place finish from an outside finish without inferring null values", () => {
    const placed = { ...confirmed, ai_pick: { horse_no: 4, horse_name: "オンベイト", ai_rank: 1, finish: 3, won: false, placed: true } };
    const outside = { ...confirmed, ai_pick: { horse_no: 4, horse_name: "オンベイト", ai_rank: 1, finish: 6, won: false, placed: false } };

    expect(aiPickOutcomeLabel(placed)).toBe("複勝圏内（3着以内）");
    expect(aiPickOutcomeLabel(outside)).toBe("見送り（圏外）");
  });

  it("returns a comparison summary only from confirmed Snapshot result data", () => {
    const result = { ...confirmed, ai_pick: { horse_no: 4, horse_name: "オンベイト", ai_rank: 1, finish: 1, won: true, placed: true } };
    expect(getConfirmedResultSummary(result)).toMatchObject({ outcome: "的中（1着）", pick: "AI本命 オンベイト · 1着", order: "1着 オンベイト" });
    expect(getConfirmedResultSummary(null)).toBeNull();
  });
});
