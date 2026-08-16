import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { describe, expect, it } from "vitest";
import { TruthPanel } from "./TruthPanel";
import type { LabRace } from "@/lib/singlePickAi";

const confirmedRace = {
  race: { race_key: "jra-20260815-11", date: "2026-08-15", organization: "JRA", venue: "札幌", race_no: 11, distance: 2000, surface: "芝", going: "良", scheduled_start_at: null, status: "CLOSED" },
  model: { champion_id: "v23k", calibration_status: "READY", disclaimer: "テスト用免責", as_of: "2026-08-15T00:00:00Z" },
  horses: [
    { no: 4, name: "オンベイト", style: "先行", withdrawn: false, abilities: { speed: 70, stamina: 60, start: 60, form: 60, going_rates: {}, mapping_status: "OK" }, model: { v23k_score: 70, ai_rank: 1, win_prob_calibrated: 0.3, top3_prob: 0.6, prob_status: "READY" }, market: { popularity: 1, win_odds: 3, slot: null, captured_at: null }, record: {} },
    { no: 5, name: "ラクリメ", style: "差し", withdrawn: false, abilities: { speed: 65, stamina: 60, start: 60, form: 60, going_rates: {}, mapping_status: "OK" }, model: { v23k_score: 65, ai_rank: 2, win_prob_calibrated: 0.2, top3_prob: 0.5, prob_status: "READY" }, market: { popularity: 5, win_odds: 9, slot: null, captured_at: null }, record: {} },
  ],
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
});
