import { describe, expect, it } from "vitest";
import fixture from "@/__fixtures__/lab-race-v2.json";
import type { LabRace, LabResultListItem } from "@/lib/singlePickAi";
import {
  AGREEMENT_COPY,
  agreementOf,
  countdownLabel,
  finishOfHorse,
  honmeiAccuracy,
  listPicks,
  pickCards,
  rankingRows,
  verdictOf,
} from "./raceView";

const base = fixture as unknown as LabRace;

function race(overrides: Partial<LabRace> = {}): LabRace {
  return { ...structuredClone(base), ...overrides };
}

/** Publication ◎ = #1, AI評価1位 = #3, market top = #5 (all different). */
function splitRace(): LabRace {
  const value = race();
  value.honmei = { status: "AVAILABLE", mark: "◎", horse_no: 1, horse_name: "サンダーリーフ", win_probability: 0.241 };
  value.ai_top = { status: "AVAILABLE", horse_no: 3, horse_name: "アオイノキセキ", win_probability: 0.3 };
  value.honmei_view = {
    sources: { market: { source: "MARKET", status: "AVAILABLE", horse_no: 5, win_probability: 0.2 } },
    ranking: { status: "OK", reason_codes: [], ranked: [{ rank: 1, horse_no: 3, horse_name: "アオイノキセキ", win_probability: 0.3 }, { rank: 2, horse_no: 1, horse_name: "サンダーリーフ", win_probability: 0.241 }] },
  };
  return value;
}

describe("◎ is the publication honmei only", () => {
  it("puts ◎ on the publication honmei card and never on AI TOP / MARKET TOP", () => {
    const cards = pickCards(splitRace());
    expect(cards.honmei.mark).toBe("◎");
    expect(cards.honmei.horseNo).toBe(1);
    expect(cards.aiTop.mark).toBeNull();
    expect(cards.aiTop.horseNo).toBe(3);
    expect(cards.marketTop.mark).toBeNull();
    expect(cards.marketTop.horseNo).toBe(5);
  });

  it("never marks the ai_top horse ◎ in the ranking, even when it is ranked first", () => {
    const rows = rankingRows(splitRace());
    const honmeiRows = rows.filter(row => row.mark === "◎");
    expect(honmeiRows.map(row => row.no)).toEqual([1]);
    const aiTopRow = rows.find(row => row.isAiTop)!;
    expect(aiTopRow.no).toBe(3);
    expect(aiTopRow.mark).not.toBe("◎");
    expect(rows[0].no).toBe(3);
  });

  it("refuses ◎ everywhere when the API reports the publication honmei unavailable", () => {
    const value = splitRace();
    value.honmei = { status: "UNAVAILABLE", reason: "MULTIPLE_PUBLICATION_HONMEI:2", mark: null, horse_no: null, horse_name: null, win_probability: null };
    expect(pickCards(value).honmei.available).toBe(false);
    expect(pickCards(value).honmei.mark).toBeNull();
    expect(rankingRows(value).some(row => row.mark === "◎")).toBe(false);
  });

  it("falls back to exactly one saved final_mark ◎ when an older API omits honmei", () => {
    const cards = pickCards(race());
    expect(cards.honmei.available).toBe(true);
    expect(cards.honmei.horseNo).toBe(1);
    const duplicate = race();
    duplicate.horses[1].display = { ...duplicate.horses[1].display!, final_mark: "◎" };
    expect(pickCards(duplicate).honmei.available).toBe(false);
  });

  it("does not invent AI TOP or MARKET TOP when the API does not publish them", () => {
    const cards = pickCards(race());
    expect(cards.aiTop.available).toBe(false);
    expect(cards.aiTop.horseNo).toBeNull();
    expect(cards.marketTop.available).toBe(false);
  });
});

describe("BUY / WATCH / PASS / UNKNOWN", () => {
  it("prefers the API bet_decision verbatim", () => {
    expect(verdictOf({ bet_decision: { status: "WATCH", reasons: [] } })).toBe("WATCH");
  });
  it("mirrors the backend classifier from the legacy decision block", () => {
    const d = (status: string, raw_status: string, gate_status: string | null) => ({ decision: { status, raw_status, gate_status, reason: null, gate_reason: null, bet: null } });
    expect(verdictOf(d("BET", "SENBATSU", "selected"))).toBe("BUY");
    expect(verdictOf(d("NO_BET", "SKIP", "original_skip"))).toBe("PASS");
    expect(verdictOf(d("UNKNOWN", "NORMAL", "rejected"))).toBe("WATCH");
    expect(verdictOf(d("UNKNOWN", "UNKNOWN", null))).toBe("UNKNOWN");
    expect(verdictOf({})).toBe("UNKNOWN");
  });
});

describe("AI × MARKET agreement", () => {
  it("reports DISAGREE, PARTIAL, AGREEMENT and MARKET UNAVAILABLE honestly", () => {
    expect(agreementOf(splitRace()).state).toBe("DISAGREE");
    const partial = splitRace();
    partial.honmei_view!.sources!.market!.horse_no = 3;
    expect(agreementOf(partial).state).toBe("PARTIAL");
    const all = splitRace();
    all.honmei!.horse_no = 3;
    all.honmei_view!.sources!.market!.horse_no = 3;
    expect(agreementOf(all).state).toBe("AGREEMENT");
    const noMarket = splitRace();
    noMarket.honmei_view!.sources!.market = { source: "MARKET", status: "NOT_PUBLISHED", horse_no: null, win_probability: null };
    expect(agreementOf(noMarket).state).toBe("MARKET_UNAVAILABLE");
    expect(agreementOf(noMarket).aiMarket).toBeNull();
  });
});

describe("unavailable is never zero", () => {
  it("keeps missing probabilities and odds as null, not 0", () => {
    const value = race();
    value.horses[0].model.win_probability = null;
    value.horses[0].market.win_odds = null;
    const row = rankingRows(value).find(entry => entry.no === 1)!;
    expect(row.aiProbability).toBeNull();
    expect(row.odds).toBeNull();
  });

  it("returns null accuracy (not 0%) before any result is confirmed", () => {
    const pending = [{ race_key: "a", result_status: "PENDING", ai_pick_finish: null, top3_coverage: null, predicted_top3: [{ mark: "◎", horse_no: 1, horse_name: null }] }] as unknown as LabResultListItem[];
    const accuracy = honmeiAccuracy(pending);
    expect(accuracy.confirmed).toBe(0);
    expect(accuracy.winRate).toBeNull();
    expect(accuracy.top3Rate).toBeNull();
    expect(accuracy.meanCoverage).toBeNull();
  });

  it("computes accuracy only over confirmed rows with one ◎", () => {
    const rows = [
      { race_key: "a", result_status: "CONFIRMED", ai_pick_finish: 1, top3_coverage: 1, predicted_top3: [{ mark: "◎", horse_no: 1, horse_name: null }] },
      { race_key: "b", result_status: "CONFIRMED", ai_pick_finish: 5, top3_coverage: 0, predicted_top3: [{ mark: "◎", horse_no: 2, horse_name: null }] },
      { race_key: "c", result_status: "PENDING", ai_pick_finish: null, top3_coverage: null, predicted_top3: [] },
    ] as unknown as LabResultListItem[];
    const accuracy = honmeiAccuracy(rows);
    expect(accuracy).toMatchObject({ confirmed: 2, wins: 1, top3: 1, winRate: 0.5, top3Rate: 0.5, meanCoverage: 0.5 });
  });
});

describe("list picks and helpers", () => {
  it("never shows the list top_pick as ◎ unless its final_mark is ◎", () => {
    const row = { race_key: "k", organization: "NAR", venue: "大井", race_no: 1, scheduled_start_at: null, status: "PREDICTED", distance: null, surface: null, top_pick: { no: 4, name: "X", ai_rank: 1, final_mark: "○", win_prob_calibrated: null, top3_prob: null, prob_status: "" } };
    expect(listPicks(row).honmei.available).toBe(false);
    expect(listPicks({ ...row, top_pick: { ...row.top_pick, final_mark: "◎" } }).honmei.horseNo).toBe(4);
  });

  it("formats countdown without inventing a start time", () => {
    const now = Date.parse("2026-09-30T13:00:00+09:00");
    expect(countdownLabel("2026-09-30T13:25:00+09:00", now)).toBe("発走まで 25分");
    expect(countdownLabel("2026-09-30T15:05:00+09:00", now)).toBe("発走まで 2時間5分");
    expect(countdownLabel("2026-09-30T12:00:00+09:00", now)).toBe("発走済み");
    expect(countdownLabel(null, now)).toBe("発走時刻未取得");
  });

  it("reads a finish from the official order, or a special status, never guesses", () => {
    const order = [3, 4, 5, 6, 7].map((horse_no, index) => ({ finish: index + 1, horse_no, horse_name: "a", popularity: 1 }));
    const result = { status: "CONFIRMED", official_order: order, ai_pick: null, payouts: null };
    expect(finishOfHorse(3, result, [])).toBe("1着");
    expect(finishOfHorse(9, result, [])).toBe("6着以下");
    expect(finishOfHorse(9, { ...result, official_order: order.slice(0, 2) }, [])).toBe("取得不能");
    expect(finishOfHorse(9, result, [{ horse_no: 9, status: "EXCLUDED" }])).toBe("除外");
    expect(finishOfHorse(9, null, [])).toBe("未確定");
    expect(finishOfHorse(null, result, [])).toBe("対象なし");
  });
});

describe("agreement never asserts a comparison with a missing source", () => {
  it("honmei unavailable → INSUFFICIENT_DATA, not DISAGREE, and no ◎ is filled from AI or market", () => {
    const value = splitRace();
    value.honmei = { status: "UNAVAILABLE", reason: "MULTIPLE_PUBLICATION_HONMEI:2", mark: null, horse_no: null, horse_name: null, win_probability: null };
    const agreement = agreementOf(value);
    expect(agreement.state).toBe("INSUFFICIENT_DATA");
    expect(agreement.honmeiAi).toBeNull();
    expect(agreement.honmeiMarket).toBeNull();
    expect(agreement.aiMarket).toBe(false);
    expect(pickCards(value).honmei.available).toBe(false);
    expect(rankingRows(value).some(row => row.mark === "◎")).toBe(false);
  });

  it("market unavailable wins over honmei unavailable (MARKET_UNAVAILABLE), AI unavailable → AI_UNAVAILABLE", () => {
    const both = splitRace();
    both.honmei = { status: "UNAVAILABLE", mark: null, horse_no: null, horse_name: null, win_probability: null };
    both.honmei_view!.sources!.market = { source: "MARKET", status: "NOT_PUBLISHED", horse_no: null, win_probability: null };
    expect(agreementOf(both).state).toBe("MARKET_UNAVAILABLE");
    const noAi = splitRace();
    noAi.ai_top = { status: "UNAVAILABLE", reason: "ORGANIZATION_NOT_ENABLED:NAR", horse_no: null, horse_name: null, win_probability: null };
    expect(agreementOf(noAi).state).toBe("AI_UNAVAILABLE");
  });

  it("only uses AGREEMENT / PARTIAL / DISAGREE when all three sources are present", () => {
    expect(["AGREEMENT", "PARTIAL", "DISAGREE"]).toContain(agreementOf(splitRace()).state);
  });

  it("explanations for unavailable states only state facts (no ◎ mismatch claim)", () => {
    for (const state of ["INSUFFICIENT_DATA", "MARKET_UNAVAILABLE", "AI_UNAVAILABLE"] as const) {
      expect(AGREEMENT_COPY[state].explanation).toMatch(/比較できません/);
      expect(AGREEMENT_COPY[state].explanation).not.toMatch(/異なります|一致しています/);
    }
    expect(AGREEMENT_COPY.INSUFFICIENT_DATA.explanation).toContain("公開◎未取得");
  });
});

describe("caution and bet decision are independent of ◎", () => {
  it("keeps the publication ◎ when a caution is attached, and shows the caution alongside it", () => {
    const value = splitRace();
    value.honmei = { ...value.honmei!, caution: { status: "POPULAR_DISMISSAL", label: "人気上位だが不安要素あり", reasons: ["調教△"], note: null } };
    const card = pickCards(value).honmei;
    expect(card.available).toBe(true);
    expect(card.mark).toBe("◎");
    expect(card.caution).toBe("人気上位だが不安要素あり");
    const row = rankingRows(value).find(entry => entry.no === 1)!;
    expect(row.mark).toBe("◎");
    expect(row.cautions).toContain("人気上位だが不安要素あり");
  });

  it("BUY / WATCH / PASS does not change with, or change, the ◎", () => {
    const value = splitRace();
    for (const status of ["BUY", "WATCH", "PASS", "UNKNOWN"]) {
      value.bet_decision = { status, reasons: [] };
      expect(verdictOf(value)).toBe(status);
      expect(pickCards(value).honmei.horseNo).toBe(1);
    }
    value.honmei = { status: "UNAVAILABLE", mark: null, horse_no: null, horse_name: null, win_probability: null };
    value.bet_decision = { status: "BUY", reasons: [] };
    expect(verdictOf(value)).toBe("BUY");
    expect(pickCards(value).honmei.available).toBe(false);
  });
});
