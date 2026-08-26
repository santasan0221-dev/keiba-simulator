import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { describe, expect, it } from "vitest";
import { TruthPanel } from "./TruthPanel";
import type { LabRace } from "@/lib/singlePickAi";

const confirmedRace = {
  race: { race_key: "jra-20260815-11", date: "2026-08-15", organization: "JRA", venue: "札幌", race_no: 11, distance: 2000, surface: "芝", going: "良", scheduled_start_at: null, status: "CLOSED" },
  model: { champion_id: "v23k", calibration_status: "READY", disclaimer: "テスト用免責", as_of: "2026-08-15T00:00:00Z" },
  horses: [
    { no: 4, name: "オンベイト", style: "先行", withdrawn: false, abilities: { speed: 70, stamina: 60, start: 60, form: 60, going_rates: {}, mapping_status: "OK" }, model: { v23k_score: 70, ai_rank: 1, win_prob_calibrated: 0.3, top3_prob: 0.6, prob_status: "CALIBRATED" }, display: { base_mark: "◎", final_mark: "◎", v23k_rank: 1, mark_adjustment_reason: "据え置き", anxiety_tags: [], plus_tags: [], dismiss_reason_tags: [], danger_score: 0 }, market: { popularity: 1, win_odds: 3, slot: null, captured_at: null }, record: {} },
    { no: 5, name: "ラクリメ", style: "差し", withdrawn: false, abilities: { speed: 65, stamina: 60, start: 60, form: 60, going_rates: {}, mapping_status: "OK" }, model: { v23k_score: 65, ai_rank: 2, win_prob_calibrated: 0.2, top3_prob: 0.5, prob_status: "CALIBRATED" }, display: { base_mark: "○", final_mark: "○", v23k_rank: 2, mark_adjustment_reason: "据え置き", anxiety_tags: [], plus_tags: [], dismiss_reason_tags: [], danger_score: 0 }, market: { popularity: 5, win_odds: 9, slot: null, captured_at: null }, record: {} },
  ],
  decision: { status: "BET", raw_status: "SENBATSU", reason: "SAVED_SELECTION", gate_status: "selected", gate_reason: "all checks passed", bet: { bet_type: "単勝", picks: [4], pick_names: ["オンベイト"], stake: 100, odds: 3, odds_source: "official", multi_bets: null } },
  branches: [], market_ev: { note: "", status: "", rows: [] }, provenance: {},
  result: { status: "CONFIRMED", official_order: [{ finish: 1, horse_no: 4, horse_name: "オンベイト", popularity: 1 }, { finish: 2, horse_no: 5, horse_name: "ラクリメ", popularity: 5 }], ai_pick: { horse_no: 4, horse_name: "オンベイト", ai_rank: 1, finish: 1, won: true, placed: true }, payouts: { win: [{ horse_no: 4, payout: 420 }], place: [{ horse_no: 4, payout: 180 }] } },
} satisfies LabRace;

describe("TruthPanel", () => {
  it("shows rank accuracy and payout-matched ROI for confirmed real results", () => {
    const markup = renderToStaticMarkup(<TruthPanel race={confirmedRace} />);

    expect(markup).toContain("RANK ACCURACY");
    expect(markup).toContain("順位一致 2頭");
    expect(markup).toContain("VIRTUAL ROI");
    expect(markup).toContain("420.0%");
    expect(markup).toContain("180.0%");
  });

  it("does not render calculated accuracy or ROI before results are confirmed", () => {
    const markup = renderToStaticMarkup(<TruthPanel race={{ ...confirmedRace, result: null }} />);

    expect(markup).not.toContain("RANK ACCURACY");
    expect(markup).not.toContain("VIRTUAL ROI");
    expect(markup).toContain("結果はまだ確定していません");
  });

  it("withholds numeric probabilities unless each horse is explicitly READY", () => {
    const markup = renderToStaticMarkup(<TruthPanel race={{ ...confirmedRace, horses: confirmedRace.horses.map((horse) => ({ ...horse, model: { ...horse.model, prob_status: "UNCALIBRATED_SHADOW_SCORE" } })) }} />);
    expect(markup).toContain("校正済み確率は表示しません");
    expect(markup).not.toContain("0.3");
    expect(markup).not.toContain("0.6");
  });

  it("withholds out-of-range probability payloads", () => {
    const markup = renderToStaticMarkup(<TruthPanel race={{ ...confirmedRace, horses: confirmedRace.horses.map((horse) => ({ ...horse, model: { ...horse.model, win_prob_calibrated: 1.2, top3_prob: -0.1 } })) }} />);
    expect(markup).toContain("校正済み確率は表示しません");
    expect(markup).not.toContain("win_prob_calibrated");
    expect(markup).not.toContain("top3_prob");
  });

  it("uses final_mark honmei even when the raw model rank differs", () => {
    const horses = [
      { ...confirmedRace.horses[0], no: 9, name: "モデル素点一位", model: { ...confirmedRace.horses[0].model, ai_rank: 1 }, display: { ...confirmedRace.horses[0].display, final_mark: "消し", v23k_rank: 9 } },
      { ...confirmedRace.horses[1], no: 6, name: "最終本命", model: { ...confirmedRace.horses[1].model, ai_rank: 5 }, display: { ...confirmedRace.horses[1].display, final_mark: "◎", v23k_rank: 1 } },
    ];
    const markup = renderToStaticMarkup(<TruthPanel race={{ ...confirmedRace, horses }} />);
    expect(markup).toMatch(/AI本命[\s\S]*最終本命/);
    expect(markup).not.toMatch(/AI本命[\s\S]{0,80}モデル素点一位/);
    expect(markup).toContain("モデル素点順位（参考）");
    expect(markup).toContain("評価指数（勝率ではありません）");
  });

  it("keeps honmei visible for explicit no-bet without a bet slip", () => {
    const decision = { status: "NO_BET", raw_status: "SKIP", reason: "EXPLICIT_SKIP", gate_status: "original_skip", gate_reason: "条件外", bet: null };
    const markup = renderToStaticMarkup(<TruthPanel race={{ ...confirmedRace, decision }} />);
    expect(markup).toContain("◎ #4 オンベイト");
    expect(markup).toContain("判断：見送り");
    expect(markup).not.toContain("正式買い目");
  });

  it("does not convert unknown or a provisional candidate into no-bet", () => {
    const decision = { status: "UNKNOWN", raw_status: "NORMAL", reason: "PREDICTION_DECISION_UNAVAILABLE", gate_status: "missing_real_odds", gate_reason: "real odds unavailable", bet: null };
    const markup = renderToStaticMarkup(<TruthPanel race={{ ...confirmedRace, decision }} />);
    expect(markup).toContain("判断：判定データなし");
    expect(markup).not.toContain("判断：見送り");
    expect(markup).not.toContain("正式買い目");
  });

  it("shows a formal bet only for BET with a selected gate", () => {
    const selected = renderToStaticMarkup(<TruthPanel race={confirmedRace} />);
    const unselected = renderToStaticMarkup(<TruthPanel race={{ ...confirmedRace, decision: { ...confirmedRace.decision, gate_status: "missing_real_odds" } }} />);
    expect(selected).toContain("判断：BET");
    expect(selected).toContain("正式買い目");
    expect(unselected).not.toContain("正式買い目");
  });

  it("does not fall back to ai_rank when final honmei is missing or duplicated", () => {
    const missing = confirmedRace.horses.map((horse) => ({ ...horse, display: { ...horse.display, final_mark: null } }));
    const duplicated = confirmedRace.horses.map((horse) => ({ ...horse, display: { ...horse.display, final_mark: "◎" } }));
    for (const horses of [missing, duplicated]) {
      const markup = renderToStaticMarkup(<TruthPanel race={{ ...confirmedRace, horses }} />);
      expect(markup).toContain("AI本命：取得不能");
      expect(markup).toContain('<div class="truth-primary-pick"><span>AI本命</span><strong>AI本命：取得不能</strong>');
    }
  });

  it("renders the 8/26 Monbetsu contract without post-race results", () => {
    const horses = [
      { ...confirmedRace.horses[0], no: 9, name: "キタノローズ", model: { ...confirmedRace.horses[0].model, ai_rank: 1, v23k_score: 37.2 }, display: { ...confirmedRace.horses[0].display, final_mark: "消し", v23k_rank: 9 } },
      { ...confirmedRace.horses[1], no: 6, name: "シルバーライダー", model: { ...confirmedRace.horses[1].model, ai_rank: 5, v23k_score: 50 }, display: { ...confirmedRace.horses[1].display, final_mark: "◎", v23k_rank: 1 } },
      { ...confirmedRace.horses[1], no: 1, name: "サクラピアチェーレ", model: { ...confirmedRace.horses[1].model, ai_rank: 3, v23k_score: 49.1 }, display: { ...confirmedRace.horses[1].display, final_mark: "○", v23k_rank: 2 } },
    ];
    const decision = { status: "UNKNOWN", raw_status: "UNKNOWN", reason: "PREDICTION_DECISION_UNAVAILABLE", gate_status: null, gate_reason: null, bet: null };
    const race = { ...confirmedRace, race: { ...confirmedRace.race, organization: "NAR", venue: "門別", race_no: 9 }, horses, decision, result: null } satisfies LabRace;
    const markup = renderToStaticMarkup(<TruthPanel race={race} />);
    expect(markup).toMatch(/AI本命[\s\S]*◎ #6 シルバーライダー/);
    expect(markup).toContain("○ #1 サクラピアチェーレ");
    expect(markup).toContain("消し #9 キタノローズ");
    expect(markup).toContain("判断：判定データなし");
    expect(markup).not.toContain("正式買い目");
    expect(markup).not.toContain("1着");
  });

  it.each(["JRA", "NAR"])("uses the same display contract for %s", (organization) => {
    const markup = renderToStaticMarkup(<TruthPanel race={{ ...confirmedRace, race: { ...confirmedRace.race, organization } }} />);
    expect(markup).toContain("◎ #4 オンベイト");
    expect(markup).toContain("判断：BET");
  });
});
