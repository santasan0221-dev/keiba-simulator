/**
 * Integration test against the production lab-api-v2 race-detail shape.
 *
 * The fixtures are NOT hand-written: client/src/__fixtures__/generate_lab_race_fixture.py
 * builds them with single_pick_ai's own prediction pipeline
 * (compute_v23k_horse_diagnostics -> create_run_snapshots) and the real public
 * API builder (build_lab_race_payload), called exactly the way get_lab_race()
 * calls it in production. Regenerate them there when the API contract changes.
 */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import v2Fixture from "@/__fixtures__/lab-race-v2.json";
import legacyFixture from "@/__fixtures__/lab-race-legacy.json";
import { TruthPanel } from "@/components/TruthPanel";
import { buildHorseMarketRows, MARKET_RETURN_RATE } from "@/lib/raceMarketTable";
import type { LabRace } from "@/lib/singlePickAi";

const v2 = v2Fixture as unknown as LabRace;
const legacy = legacyFixture as unknown as LabRace;
const clone = (race: LabRace): LabRace => JSON.parse(JSON.stringify(race));
const text = (markup: string) => markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

function tableRow(markup: string, horseNo: number): string {
  const match = markup.match(new RegExp(`<tr[^>]*data-horse-no="${horseNo}"[^>]*>([\\s\\S]*?)</tr>`));
  if (!match) throw new Error(`no table row for horse #${horseNo}`);
  return text(match[1]);
}

describe("production API shape (lab-api-v2) — fixture sanity", () => {
  it("is the real schema-v2 shape: semantic probabilities present, legacy columns null", () => {
    const honmei = v2.horses.find((horse) => horse.display?.final_mark === "◎")!;
    expect(honmei.model.win_probability).toBe(0.241);
    expect(honmei.model.top3_probability).toBe(0.62);
    expect(honmei.model.win_prob_calibrated).toBeNull();
    expect(v2.market_ev.status).toBe("AVAILABLE");
  });
});

describe("probability semantics", () => {
  it("labels win_probability as 勝率 and top3_probability as 3着内率 for the AI honmei", () => {
    const markup = text(renderToStaticMarkup(<TruthPanel race={v2} />));
    expect(markup).toContain("AI勝率 24.1%");
    expect(markup).toContain("3着内率 62.0%");
  });

  it("never shows the legacy win_prob_calibrated value (a top-3 output) as a win probability", () => {
    const race = clone(v2);
    for (const horse of race.horses) {
      horse.model.win_prob_calibrated = 0.777;
      horse.model.top3_prob = 0.555;
      horse.model.prob_status = "CALIBRATED";
    }
    const markup = renderToStaticMarkup(<TruthPanel race={race} />);
    expect(markup).not.toContain("77.7%");
    expect(markup).not.toContain("0.777");
    expect(markup).not.toContain("55.5%");
    expect(text(markup)).toContain("AI勝率 24.1%");
  });

  it("shows no probability at all for a pre-v2 archive instead of borrowing the legacy columns", () => {
    const race = clone(legacy);
    for (const horse of race.horses) {
      horse.model.win_prob_calibrated = 0.62;
      horse.model.prob_status = "CALIBRATED";
    }
    const markup = renderToStaticMarkup(<TruthPanel race={race} />);
    expect(markup).not.toContain("62.0%");
    expect(markup).not.toContain("0.62");
    expect(text(markup)).toContain("この予測には勝率・3着内率が保存されていません");
    expect(tableRow(markup, 1)).toContain("6.8倍");
  });

  it("does not leak raw API field names or unformatted decimals", () => {
    const markup = renderToStaticMarkup(<TruthPanel race={v2} />);
    for (const raw of ["win_prob_calibrated", "top3_prob", "win_probability", "0.241", "0.62", "1.6388", "0.117647"]) {
      expect(markup).not.toContain(raw);
    }
  });
});

describe("all-horse market table", () => {
  it("renders one row per runner, ordered by the saved AI rank", () => {
    const markup = renderToStaticMarkup(<TruthPanel race={v2} />);
    const order = Array.from(markup.matchAll(/data-horse-no="(\d+)"/g)).map((match) => Number(match[1]));
    expect(order).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("shows win%, top3%, odds, popularity, market%, AI−market and EV for a fully priced horse", () => {
    const row = tableRow(renderToStaticMarkup(<TruthPanel race={v2} />), 1);
    expect(row).toContain("24.1%");
    expect(row).toContain("62.0%");
    expect(row).toContain("6.8倍");
    expect(row).toContain("3番人気");
    expect(row).toContain("11.8%");
    expect(row).toContain("+12.3pt");
    expect(row).toContain("1.64");
    expect(row).toContain("100円→平均164円");
  });

  it("marks a heavily backed horse the AI rates lower with a negative gap and EV below 1", () => {
    const row = tableRow(renderToStaticMarkup(<TruthPanel race={v2} />), 2);
    expect(row).toContain("11.2%");
    expect(row).toContain("2.1倍");
    expect(row).toContain("1番人気");
    expect(row).toContain("38.1%");
    expect(row).toContain("−26.9pt");
    expect(row).toContain("0.24");
  });

  it("keeps missing odds and a missing win probability as — (never 0) and says why", () => {
    const markup = renderToStaticMarkup(<TruthPanel race={v2} />);
    const noOdds = tableRow(markup, 6);
    expect(noOdds).toContain("5.2%");
    expect(noOdds).toContain("8番人気");
    expect(noOdds).not.toMatch(/(^|[^\d])0\.0(%|倍)|±0/);
    const noWin = tableRow(markup, 7);
    expect(noWin).toContain("20.0%");
    expect(noWin).toContain("12.0倍");
    expect(noWin).toContain("6.7%");
    expect(noWin).not.toMatch(/(^|[^\d])0\.0%|±0/);
    expect(text(markup)).toContain("オッズ未取得");
  });

  it("uses the backend's own market probability and EV (no drift from single_pick_ai)", () => {
    const rows = buildHorseMarketRows(v2);
    for (const evRow of v2.market_ev.rows as Array<{ no: number; simple_corrected_market_prob: number; expected_return: number }>) {
      const row = rows.find((candidate) => candidate.no === evRow.no)!;
      expect(row.marketProbability).toBeCloseTo(evRow.simple_corrected_market_prob, 6);
      expect(row.expectedReturn).toBe(evRow.expected_return);
    }
    expect(MARKET_RETURN_RATE).toBe(0.8);
  });

  it("shows the odds capture time and explains EV for beginners", () => {
    const markup = text(renderToStaticMarkup(<TruthPanel race={v2} />));
    expect(markup).toMatch(/オッズ 9\/20 14:50 時点/);
    expect(markup).toContain("期待値 = AI勝率 × 単勝オッズ");
    expect(markup).toContain("AI勝率 = 勝つ確率");
    expect(markup).toContain("3着以内に入る確率");
  });

  it("still shows odds and popularity for a pre-v2 archive, with EV withheld", () => {
    const markup = renderToStaticMarkup(<TruthPanel race={legacy} />);
    const row = tableRow(markup, 1);
    expect(row).toContain("6.8倍");
    expect(row).toContain("3番人気");
    expect(row).toContain("11.8%");
    expect(row).not.toContain("100円→");
  });
});
