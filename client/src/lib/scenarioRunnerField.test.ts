import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveCourse } from "./courseAtlas";
import { buildHorseProfiles, horseHistoryOf, NEUTRAL_PROFILE, type HorseProfile } from "./horseScenarioProfile";
import { crossingSequence, orderFrame, orderView, rankHistory } from "./scenarioOrder";
import { buildScenarioField, offsetTables, RUNNER_MAX, RUNNER_MIN, runnerFactor } from "./scenarioRunnerField";
import { FRONT_END, OFFSET_MAX, scenarioFrame, scenarioSeedFor, type Pace, type ScenarioRunner, type ScenarioStyle } from "./scenarioReplay";
import { buildTerrainProfile } from "./terrainTempo";
import type { LabHorse } from "./singlePickAi";

const strip = (file: string) => readFileSync(resolve(import.meta.dirname, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const COURSES = [["東京", "芝", 2000], ["京都", "ダート", 1800], ["中山", "芝", 2500], ["新潟", "芝", 1000], ["小倉", "芝", 1800]] as const;
const PACES: Pace[] = ["スロー", "平均", "ハイ"];
const field = (n: number, style: ScenarioStyle = "先行"): ScenarioRunner[] => Array.from({ length: n }, (_, i) => ({ no: i + 1, name: null, style }));
const mixed = (n: number): ScenarioRunner[] => Array.from({ length: n }, (_, i) => ({ no: i + 1, name: null, style: (["逃げ", "先行", "差し", "追込"] as const)[i % 4] }));
const extremeProfile = (no: number, edge: 1 | -1): HorseProfile => ({ ...NEUTRAL_PROFILE(no), earlyPositionStrength: edge, confidence: "HIGH", distanceCompatibility: { edge, confidence: "HIGH", n: 10 }, surfaceCompatibility: { edge, confidence: "HIGH", n: 10 } });
const terrainOf = (c: (typeof COURSES)[number]) => buildTerrainProfile(resolveCourse(...c));

describe("per-runner offset: bounded and smooth", () => {
  it("a runner's combined factor never leaves 0.97 .. 1.03, whatever the profile and noise", () => {
    for (let s = 0; s < 80; s++) for (const edge of [1, -1] as const) {
      const tables = offsetTables({ runners: field(10), profiles: new Map(field(10).map(r => [r.no, extremeProfile(r.no, edge)])), seed: scenarioSeedFor(`b|${s}`) });
      expect(tables.size).toBe(10);
      for (const table of tables.values()) for (const v of table) { expect(v).toBeGreaterThanOrEqual(-OFFSET_MAX - 1e-9); expect(v).toBeLessThanOrEqual(OFFSET_MAX + 1e-9); }
    }
    for (const lap of [0, 0.05, 0.3, 0.6, 0.9, 1.05]) for (const edge of [1, -1] as const) {
      const f = runnerFactor(extremeProfile(1, edge), [0.03, 0.025, 0.02, 0.02, 0.02, 0.03, 0.02], lap);
      expect(f).toBeGreaterThanOrEqual(RUNNER_MIN); expect(f).toBeLessThanOrEqual(RUNNER_MAX);
    }
  });

  it("the offset moves smoothly: no jump from one progress step to the next", () => {
    for (let s = 0; s < 40; s++) {
      const tables = offsetTables({ runners: field(8), profiles: new Map(field(8).map(r => [r.no, extremeProfile(r.no, r.no % 2 ? 1 : -1)])), seed: scenarioSeedFor(`j|${s}`) });
      for (const table of tables.values()) for (let k = 1; k < table.length; k++) expect(Math.abs(table[k] - table[k - 1])).toBeLessThan(0.00015);
    }
  });

  it("a runner without a profile still gets the seeded noise (zero mean); with noise off the offset is exactly zero", () => {
    const quiet = offsetTables({ runners: field(6), seed: scenarioSeedFor("q"), noise: false });
    for (const table of quiet.values()) expect(Math.max(...table.map(Math.abs))).toBe(0);
    const noisy = offsetTables({ runners: field(6), seed: scenarioSeedFor("q") });
    expect([...noisy.values()].some(table => Math.max(...table.map(Math.abs)) > 0)).toBe(true);
  });
});

describe("full finish and containment hold with the offsets, on every course and pace", () => {
  it("every runner crosses before 100% and nobody runs past FRONT_END + OFFSET_MAX", () => {
    for (const course of COURSES) {
      const terrain = terrainOf(course);
      for (let s = 0; s < 25; s++) for (const edge of [1, -1] as const) {
        const runners = mixed(16);
        const seed = scenarioSeedFor(`ff|${course[0]}|${s}`, s % 2 ? "ALT_A" : "STANDARD");
        const profiles = new Map(runners.map(r => [r.no, extremeProfile(r.no, (r.no + s) % 2 ? edge : (-edge as 1 | -1))]));
        const gap = buildScenarioField({ terrain, runners, profiles, seed });
        for (const pace of PACES) {
          const end = scenarioFrame(runners, 1, pace, seed, gap);
          expect(Math.min(...end.runners.map(r => r.lap)), `${course[0]} ${pace}`).toBeGreaterThanOrEqual(1);
          expect(Math.max(...end.runners.map(r => r.lap))).toBeLessThanOrEqual(FRONT_END + OFFSET_MAX + 1e-9);
          expect(Math.max(...scenarioFrame(runners, 0.85, pace, seed, gap).runners.map(r => r.lap))).toBeLessThan(1);
          expect(crossingSequence(runners, pace, seed, gap)).toHaveLength(16);
        }
      }
    }
  });

  it("the crossing order equals the order the drawn runners passed the line, and the final frame agrees with it", () => {
    const runners = mixed(14);
    const seed = scenarioSeedFor("agree");
    const profiles = new Map(runners.map(r => [r.no, extremeProfile(r.no, r.no % 2 ? 1 : -1)]));
    const gap = buildScenarioField({ terrain: terrainOf(COURSES[0]), runners, profiles, seed });
    for (const pace of PACES) {
      const sequence = crossingSequence(runners, pace, seed, gap);
      for (let i = 1; i < sequence.length; i++) expect(sequence[i].t).toBeGreaterThanOrEqual(sequence[i - 1].t);
      const finalOrder = orderFrame(scenarioFrame(runners, 1, pace, seed, gap).runners, seed).map(r => r.no);
      // the offsets are frozen once the front reaches the line, so the final frame agrees with the crossing order (a swap needs a near-exact tie)
      const moved = sequence.map((entry, i) => Math.abs(finalOrder.indexOf(entry.no) - i));
      expect(Math.max(...moved)).toBeLessThanOrEqual(2);
      // and the completed view is the crossing sequence itself: a row's rank and its "n-th to cross" always agree
      const done = orderView(runners, 1, pace, seed, gap);
      expect(done.rows.map(row => row.no)).toEqual(sequence.map(entry => entry.no));
      expect(done.rows.every((row, i) => row.rank === i + 1 && row.crossing === i + 1)).toBe(true);
      const history = rankHistory(runners, pace, seed, gap);
      sequence.forEach((entry, i) => expect(history.get(entry.no)!.GOAL).toBe(i + 1));
    }
  });
});

describe("a neutral field carries no horse-number or position bias", () => {
  it("16 same-style neutral runners: flat mean place per number, no ascending order, every runner can lead", () => {
    const runners = field(16);
    const terrain = terrainOf(COURSES[0]);
    const runs = 500;
    const sum = new Array<number>(16).fill(0);
    const first = new Array<number>(16).fill(0);
    let ascending = 0;
    for (let s = 0; s < runs; s++) {
      const seed = scenarioSeedFor(`neutral|${s}`);
      const gap = buildScenarioField({ terrain, runners, seed });
      const order = crossingSequence(runners, "平均", seed, gap).map(entry => entry.no);
      order.forEach((no, i) => { sum[no - 1] += i + 1; });
      first[order[0] - 1] += 1;
      if (order.every((no, i) => no === i + 1)) ascending += 1;
    }
    const means = sum.map(total => total / runs);
    for (const mean of means) expect(Math.abs(mean - 8.5)).toBeLessThan(1.1);
    const corr = (() => { const n = 16, mx = (n + 1) / 2, my = means.reduce((a, b) => a + b, 0) / n; let num = 0, dx = 0, dy = 0; means.forEach((m, i) => { num += (i + 1 - mx) * (m - my); dx += (i + 1 - mx) ** 2; dy += (m - my) ** 2; }); return num / Math.sqrt(dx * dy); })();
    expect(Math.abs(corr)).toBeLessThan(0.55);
    expect(Math.max(...first) / runs).toBeLessThan(0.14); // uniform would be 0.0625
    expect(Math.min(...first)).toBeGreaterThan(0);
    expect(ascending).toBe(0);
  });

  it("same race + same variant reproduces the whole scenario; another variant changes it", () => {
    const runners = mixed(14);
    const terrain = terrainOf(COURSES[2]);
    const make = (variant: "STANDARD" | "ALT_A" | "ALT_B") => { const seed = scenarioSeedFor("JRA|2026-09-12|中山|08", variant); return { seed, gap: buildScenarioField({ terrain, runners, seed }) }; };
    const order = (v: ReturnType<typeof make>) => crossingSequence(runners, "平均", v.seed, v.gap).map(e => e.no).join();
    expect(order(make("ALT_A"))).toBe(order(make("ALT_A")));
    expect(scenarioFrame(runners, 0.7, "平均", make("ALT_B").seed, make("ALT_B").gap)).toEqual(scenarioFrame(runners, 0.7, "平均", make("ALT_B").seed, make("ALT_B").gap));
    expect(new Set((["STANDARD", "ALT_A", "ALT_B"] as const).map(v => order(make(v)))).size).toBeGreaterThan(1);
  });

  it("no rank jumps by more than a few places in one progress step (no five-runner shuffles)", () => {
    for (const course of COURSES) {
      const runners = mixed(16);
      const seed = scenarioSeedFor(`jump|${course[0]}`);
      const profiles = new Map(runners.map(r => [r.no, extremeProfile(r.no, r.no % 2 ? 1 : -1)]));
      const gap = buildScenarioField({ terrain: terrainOf(course), runners, profiles, seed });
      // From 5% on every runner is past the gate (runners clamped at lap 0 tie there and are ordered by the cosmetic tie-break).
      const from = 20;
      let prev = new Map(orderFrame(scenarioFrame(runners, from / 400, "平均", seed, gap).runners, seed).map(r => [r.no, r.rank]));
      let worst = 0;
      for (let i = from + 1; i <= 400; i++) {
        const next = new Map(orderFrame(scenarioFrame(runners, i / 400, "平均", seed, gap).runners, seed).map(r => [r.no, r.rank]));
        for (const [no, rank] of next) worst = Math.max(worst, Math.abs(rank - prev.get(no)!));
        prev = next;
      }
      expect(worst, course[0]).toBeLessThanOrEqual(4);
    }
  });
});

describe("calibration: run style does not decide the order at the average pace", () => {
  // A field with the style mix of the real data (1 front-runner, 3 pace, 3 mid, 5 closers, 4 unknown of 16), no profiles:
  // only style, pace, the seeded order and noise. An evenly split field (4 of each) is not what races look like.
  const REAL_MIX: ScenarioStyle[] = ["逃げ", "先行", "先行", "先行", "差し", "差し", "差し", "追込", "追込", "追込", "追込", "追込", "不明", "不明", "不明", "不明"];
  const meanRankByStyle = (pace: Pace, seeds = 300) => {
    const base: ScenarioRunner[] = REAL_MIX.map((style, i) => ({ no: i + 1, name: null, style }));
    const sum: Record<string, number> = {}, count: Record<string, number> = {};
    for (let s = 0; s < seeds; s++) {
      const runners = base.slice();
      const seed = scenarioSeedFor(`cal|${s}`);
      const gap = buildScenarioField({ terrain: terrainOf(COURSES[0]), runners, seed });
      crossingSequence(runners, pace, seed, gap).forEach((entry, i) => { const st = runners.find(r => r.no === entry.no)!.style; sum[st] = (sum[st] ?? 0) + i / 15; count[st] = (count[st] ?? 0) + 1; });
    }
    return Object.fromEntries(Object.keys(sum).map(st => [st, sum[st] / count[st]])) as Record<ScenarioStyle, number>;
  };

  it("at the average pace every style group ends within 0.40 .. 0.60 of the field", () => {
    const m = meanRankByStyle("平均");
    for (const style of ["逃げ", "先行", "差し", "追込", "不明"] as const) { expect(m[style], style).toBeGreaterThan(0.4); expect(m[style], style).toBeLessThan(0.6); }
  });

  it("the pace still tilts the order by design: a slow pace favours the front, a fast pace the closers", () => {
    const slow = meanRankByStyle("スロー"), fast = meanRankByStyle("ハイ");
    expect(slow["逃げ"]).toBeLessThan(slow["追込"]);
    expect(fast["追込"]).toBeLessThan(fast["逃げ"]);
  });
});

describe("what reaches the field", () => {
  const horse = (no: number, over: Record<string, unknown> = {}): LabHorse => ({
    no, name: "x", style: "先行", withdrawn: false,
    abilities: { speed: 80 - no, stamina: 70, start: 60, form: 50, going_rates: {}, mapping_status: "P2" },
    model: { v23k_score: 80 - no, ai_rank: no, win_prob_calibrated: 0.5, top3_prob: 0.9, prob_status: "READY", win_probability: 0.4, market_win_probability: 0.3 },
    display: { base_mark: "◎", final_mark: "◎", v23k_rank: no, mark_adjustment_reason: null, anxiety_tags: [], plus_tags: [], dismiss_reason_tags: [], danger_score: 9 },
    market: { popularity: no, win_odds: 1 + no, slot: "x", captured_at: "x" },
    record: { starts: 8, wins: 1, seconds: 1, thirds: 1, stamina_distance_band_top3: 20 + no * 4, going_top3_rates: { 良: 20 + no, 稍重: 10, 重: null, 不良: null }, start_front_run_share: no * 5, ...over },
  });

  it("the whole field is identical when every non-history field is rewritten (odds, AI, marks, speed, form, result)", () => {
    const base = Array.from({ length: 12 }, (_, i) => horse(i + 1));
    const rewritten = base.map((h, i) => ({ ...h,
      abilities: { speed: 1 + i, stamina: 99 - i, start: 1, form: 99, going_rates: { 良: 1 }, mapping_status: "X" },
      model: { ...h.model, v23k_score: 1 + i, ai_rank: 12 - i, win_probability: 0.001 * (i + 1), market_win_probability: 0.5 },
      display: { ...h.display!, final_mark: i % 2 ? "◎" : "×", danger_score: i },
      market: { popularity: 12 - i, win_odds: 50 - i, slot: null, captured_at: null } }));
    const runners = field(12);
    const seed = scenarioSeedFor("leak");
    const build = (horses: LabHorse[]) => buildScenarioField({ terrain: terrainOf(COURSES[0]), runners, profiles: buildHorseProfiles(horses.map(horseHistoryOf).filter((h): h is NonNullable<typeof h> => h !== null), { organization: "JRA", going: "良" }), seed });
    const a = build(base), b = build(rewritten);
    expect(a.id).toBe(b.id);
    for (const t of [0, 0.2, 0.5, 0.8, 0.95, 1]) for (const r of runners) expect(a.offset!(r.no, t)).toBe(b.offset!(r.no, t));
    for (const pace of PACES) expect(crossingSequence(runners, pace, seed, a).map(e => e.no)).toEqual(crossingSequence(runners, pace, seed, b).map(e => e.no));
  });

  it("the module reads only style, the profiles (history), the course tempo and the seed", () => {
    const code = strip("scenarioRunnerField.ts");
    for (const forbidden of ["odds", "popularity", "honmei", "ai_top", "publication", "result", "market", "model", "abilities", "speed", "Math.random", "Date.now"]) {
      expect(code.toLowerCase(), `scenarioRunnerField must not mention ${forbidden}`).not.toContain(forbidden.toLowerCase());
    }
    expect((code.match(/from "[^"]+"/g) ?? []).sort()).toEqual(['from "@/lib/horseScenarioProfile"', 'from "@/lib/scenarioNoise"', 'from "@/lib/scenarioReplay"', 'from "@/lib/terrainTempo"']);
  });

  it("the order modules do not import the profile, the noise or the terrain (they only accept the opaque field)", () => {
    for (const file of ["scenarioReplay.ts", "scenarioOrder.ts"]) for (const banned of ["horseScenarioProfile", "scenarioNoise", "scenarioRunnerField", "terrainTempo", "courseAtlas"]) expect(strip(file), `${file} imports ${banned}`).not.toContain(banned);
  });
});
