/**
 * FIXED SCENARIO CONTRACT (approved with aa2a150). These tests pin behaviour; they are not tuning targets.
 * Nothing may be re-tuned to raise or lower the agreement of the scenario with MARKET TOP, the publication mark,
 * AI TOP or the official result: those are diagnostics only and never reach the simulation.
 *
 *   1. average pace, neutral field: every style's mean normalised crossing rank is within 0.42 .. 0.58
 *   2. slow pace favours FRONT / PACE
 *   3. fast pace favours MID / CLOSER
 *   4. rewriting MARKET / AI / mark / result fields leaves the scenario output unchanged
 *   5. no horse-number bias
 *   6. the same race + seed + variant reproduces the scenario exactly
 */
import { describe, expect, it } from "vitest";
import { resolveCourse } from "./courseAtlas";
import { buildHorseProfiles, horseHistoryOf, type HorseHistory } from "./horseScenarioProfile";
import { crossingSequence } from "./scenarioOrder";
import { buildScenarioField } from "./scenarioRunnerField";
import { normalizeStyle, scenarioFrame, scenarioSeedFor, VARIANTS, type Pace, type ScenarioRunner, type ScenarioStyle } from "./scenarioReplay";
import { buildTerrainProfile } from "./terrainTempo";
import type { LabHorse, LabRace } from "./singlePickAi";

const TOKYO = buildTerrainProfile(resolveCourse("東京", "芝", 2000));
/** The style mix of the real data: 1 front-runner, 3 pace, 3 mid, 5 closers, 4 unknown (of 16). */
const REAL_MIX: ScenarioStyle[] = ["逃げ", "先行", "先行", "先行", "差し", "差し", "差し", "追込", "追込", "追込", "追込", "追込", "不明", "不明", "不明", "不明"];
const mixField = (): ScenarioRunner[] => REAL_MIX.map((style, i) => ({ no: i + 1, name: null, style }));

/** Mean normalised crossing rank (0 = first, 1 = last) of every style group, no profiles, over many seeded scenarios. */
function styleMeans(pace: Pace, seeds = 400): Record<ScenarioStyle, number> {
  const sum: Record<string, number> = {}, count: Record<string, number> = {};
  for (let s = 0; s < seeds; s++) {
    const runners = mixField();
    const seed = scenarioSeedFor(`contract|${s}`);
    const field = buildScenarioField({ terrain: TOKYO, runners, seed });
    crossingSequence(runners, pace, seed, field).forEach((entry, i) => {
      const style = runners.find(r => r.no === entry.no)!.style;
      sum[style] = (sum[style] ?? 0) + i / (runners.length - 1);
      count[style] = (count[style] ?? 0) + 1;
    });
  }
  return Object.fromEntries(Object.keys(sum).map(style => [style, sum[style] / count[style]])) as Record<ScenarioStyle, number>;
}
const avg = (m: Record<ScenarioStyle, number>, styles: ScenarioStyle[]) => styles.reduce((a, s) => a + m[s], 0) / styles.length;

describe("contract 1-3: run style against pace (neutral field)", () => {
  it("average pace: every style's mean normalised rank is within 0.42 .. 0.58", () => {
    const m = styleMeans("平均");
    for (const style of ["逃げ", "先行", "差し", "追込", "不明"] as const) {
      expect(m[style], `${style} = ${m[style].toFixed(3)}`).toBeGreaterThanOrEqual(0.42);
      expect(m[style], `${style} = ${m[style].toFixed(3)}`).toBeLessThanOrEqual(0.58);
    }
  });

  it("slow pace favours FRONT / PACE over MID / CLOSER", () => {
    const m = styleMeans("スロー");
    expect(avg(m, ["逃げ", "先行"])).toBeLessThan(avg(m, ["差し", "追込"]) - 0.05);
  });

  it("fast pace favours MID / CLOSER over FRONT / PACE", () => {
    const m = styleMeans("ハイ");
    expect(avg(m, ["差し", "追込"])).toBeLessThan(avg(m, ["逃げ", "先行"]) - 0.05);
  });
});

describe("contract 4: nothing but pre-race history reaches the scenario", () => {
  const horse = (no: number): LabHorse => ({
    no, name: `H${no}`, style: (["逃げ", "先行", "差し", "追込", null] as const)[no % 5],
    withdrawn: false,
    abilities: { speed: 90 - no, stamina: 60, start: 50, form: 40, going_rates: { 良: 30 }, mapping_status: "P2_V23K_PLUS_AS_OF_HISTORY" },
    model: { v23k_score: 90 - no, ai_rank: no, win_prob_calibrated: 0.4, top3_prob: 0.7, prob_status: "READY", win_probability: 0.3, top3_probability: 0.7, market_win_probability: 0.25 },
    display: { base_mark: "◎", final_mark: no === 1 ? "◎" : "△", v23k_rank: no, mark_adjustment_reason: null, anxiety_tags: [], plus_tags: [], dismiss_reason_tags: [], danger_score: no },
    market: { popularity: no, win_odds: 1.5 + no, slot: "x", captured_at: "x" },
    record: { starts: 4 + (no % 7), wins: no % 2, seconds: no % 3 === 0 ? 1 : 0, thirds: 1, stamina_distance_band_top3: 10 + no * 5, going_top3_rates: { 良: 15 + no * 3, 稍重: 10, 重: null, 不良: null }, start_front_run_share: no * 4, form_recent3_top3: no * 7, avg_finish: no },
  });
  const race = (rewrite: boolean): LabRace => {
    const horses = Array.from({ length: 14 }, (_, i) => horse(i + 1));
    const r: any = { race: { race_key: "JRA|2026-10-04|東京|05", date: "2026-10-04", organization: "JRA", venue: "東京", race_no: 5, distance: 2000, surface: "芝", going: "良", scheduled_start_at: null, status: "RESULTED" }, model: { champion_id: null, calibration_status: "x", disclaimer: "", as_of: null }, horses, branches: [], market_ev: { note: "", status: "READY", rows: [{ horse_no: 1, ev: 9 }] }, provenance: {}, honmei: { horse_no: 1 }, ai_top: { horse_no: 2 }, bet_decision: { decision: "BUY" }, result: { status: "CONFIRMED", official_order: horses.map((h, i) => ({ finish: i + 1, horse_no: h.no, horse_name: h.name, popularity: i + 1 })), ai_pick: null, payouts: null }, publication_marks: { 1: "◎" } };
    if (rewrite) {
      r.horses = horses.map((h, i) => ({ ...h,
        abilities: { speed: i * 3, stamina: 5, start: 5, form: 99, going_rates: { 良: 1 }, mapping_status: "X" },
        model: { ...h.model, v23k_score: i, ai_rank: 14 - i, win_probability: 0.9 - i * 0.01, top3_probability: 0.1, market_win_probability: 0.01 * i },
        display: { ...h.display!, final_mark: i % 2 ? "◎" : "×", danger_score: 99 - i },
        market: { popularity: 14 - i, win_odds: 99 - i, slot: null, captured_at: null },
        record: { ...h.record, form_recent3_top3: 100 - i, avg_finish: 14 - i } }));
      r.honmei = { horse_no: 9 }; r.ai_top = { horse_no: 11 }; r.bet_decision = { decision: "PASS" }; r.market_ev = { note: "x", status: "UNAVAILABLE", rows: [] };
      r.result = { status: "CONFIRMED", official_order: [...r.result.official_order].reverse(), ai_pick: null, payouts: null };
      r.publication_marks = { 14: "◎" };
    }
    return r as LabRace;
  };
  /** The same pipeline the page runs: history only -> profiles -> field -> crossing order. */
  const scenario = (r: LabRace, variant: (typeof VARIANTS)[number] = "STANDARD") => {
    const course = resolveCourse(r.race.venue, r.race.surface, r.race.distance);
    const runners: ScenarioRunner[] = r.horses.filter(h => typeof h.no === "number" && !h.withdrawn).map(h => ({ no: h.no as number, name: h.name, style: normalizeStyle(h.style) }));
    const histories = r.horses.map(horseHistoryOf).filter((h): h is HorseHistory => h !== null);
    const profiles = buildHorseProfiles(histories, { organization: r.race.organization, going: r.race.going });
    const seed = scenarioSeedFor(r.race.race_key, variant);
    const field = buildScenarioField({ terrain: buildTerrainProfile(course), runners, profiles, seed });
    return { runners, seed, field, orders: (["スロー", "平均", "ハイ"] as Pace[]).map(pace => crossingSequence(runners, pace, seed, field).map(e => e.no)) };
  };

  it("rewriting MARKET / AI / marks / bet decision / result / form leaves every scenario output identical", () => {
    for (const variant of VARIANTS) {
      const a = scenario(race(false), variant), b = scenario(race(true), variant);
      expect(b.orders).toEqual(a.orders);
      expect(b.field.id).toBe(a.field.id);
      for (const t of [0, 0.3, 0.6, 0.9, 1]) {
        expect(scenarioFrame(b.runners, t, "平均", b.seed, b.field)).toEqual(scenarioFrame(a.runners, t, "平均", a.seed, a.field));
      }
    }
  });
});

describe("contract 5: no horse-number bias", () => {
  it("on a neutral same-style field the mean place is flat across horse numbers and the order is never ascending", () => {
    const n = 14, runs = 600;
    const sum = new Array<number>(n).fill(0);
    let ascending = 0;
    for (let s = 0; s < runs; s++) {
      const runners: ScenarioRunner[] = Array.from({ length: n }, (_, i) => ({ no: i + 1, name: null, style: "先行" }));
      const seed = scenarioSeedFor(`bias|${s}`);
      const order = crossingSequence(runners, "平均", seed, buildScenarioField({ terrain: TOKYO, runners, seed })).map(e => e.no);
      order.forEach((no, i) => { sum[no - 1] += i + 1; });
      if (order.every((no, i) => no === i + 1)) ascending += 1;
    }
    for (const total of sum) expect(Math.abs(total / runs - (n + 1) / 2)).toBeLessThan(1);
    expect(ascending).toBe(0);
  });
});

describe("contract 6: exact reproduction", () => {
  it("the same race, seed and variant reproduces the scenario; another variant is another scenario", () => {
    const runners = mixField();
    const key = "JRA|2026-10-04|東京|05";
    const make = (variant: (typeof VARIANTS)[number]) => { const seed = scenarioSeedFor(key, variant); return { seed, field: buildScenarioField({ terrain: TOKYO, runners: runners.slice(), seed }) }; };
    for (const variant of VARIANTS) {
      const a = make(variant), b = make(variant);
      expect(crossingSequence(runners.slice(), "平均", a.seed, a.field)).toEqual(crossingSequence(runners.slice(), "平均", b.seed, b.field));
      for (const t of [0.1, 0.5, 0.95, 1]) expect(scenarioFrame(runners.slice(), t, "平均", a.seed, a.field)).toEqual(scenarioFrame(runners.slice(), t, "平均", b.seed, b.field));
    }
    const orders = VARIANTS.map(v => { const m = make(v); return crossingSequence(runners.slice(), "平均", m.seed, m.field).map(e => e.no).join(); });
    expect(new Set(orders).size).toBe(VARIANTS.length);
  });
});
