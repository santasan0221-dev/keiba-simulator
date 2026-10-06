import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveCourse } from "./courseAtlas";
import { NOISE_SECTIONS } from "./scenarioNoise";
import type { Pace, ScenarioRunner, ScenarioStyle } from "./scenarioReplay";
import { buildSim } from "./scenarioSim";
import { approachOf, PACE_TILT, STYLE_PEAK, styleCurve } from "./styleModelV2";

const COURSES = [["東京", "芝", 2000], ["中山", "芝", 2500], ["京都", "ダート", 1800], ["新潟", "芝", 1000], ["小倉", "芝", 1800], ["阪神", "芝", 1600], ["札幌", "芝", 1800], ["中京", "芝", 2000]] as const;
const STYLES: ScenarioStyle[] = ["逃げ", "先行", "差し", "追込"];
const field = (n = 16): ScenarioRunner[] => Array.from({ length: n }, (_, i) => ({ no: i + 1, name: null, style: STYLES[i % 4] }));

/** Runs `fn` with the noise amplitudes zeroed (the module constants are restored afterwards). */
function withoutNoise<T>(fn: () => T): T {
  const sections = NOISE_SECTIONS as unknown as { amplitude: number }[];
  const saved = sections.map(s => s.amplitude);
  sections.forEach(s => { s.amplitude = 0; });
  try { return fn(); } finally { sections.forEach((s, i) => { s.amplitude = saved[i]; }); }
}

describe("physical sections", () => {
  it("reads the final approach from the Atlas in order, and falls back to fixed fractions where it cannot", () => {
    for (const [venue, surface, distance] of COURSES) {
      const a = approachOf(resolveCourse(venue, surface, distance));
      expect(a.back).toBeLessThan(a.third);
      expect(a.third).toBeLessThan(a.final);
      expect(a.final).toBeLessThan(a.home);
      expect(a.home).toBeLessThan(1);
    }
    expect(approachOf(resolveCourse("東京", "芝", 2000)).known).toBe(true);
    expect(approachOf(resolveCourse("新潟", "芝", 1000)).known).toBe(false);
    expect(approachOf(resolveCourse(null, null, null)).known).toBe(false);
  });
});

describe("style curves", () => {
  const course = resolveCourse("東京", "芝", 2000);
  const approach = approachOf(course);
  const at = (style: ScenarioStyle, pace: Pace, lap: number) => styleCurve({ style, pace, approach })(lap);

  it("front styles lead and closers lag in the middle of the race; unknown stays level", () => {
    for (const pace of ["スロー", "平均", "ハイ"] as Pace[]) {
      expect(at("逃げ", pace, 0.4)).toBeGreaterThan(at("先行", pace, 0.4));
      expect(at("先行", pace, 0.4)).toBeGreaterThan(0);
      expect(at("差し", pace, 0.4)).toBeLessThan(0);
      expect(at("追込", pace, 0.4)).toBeLessThan(at("差し", pace, 0.4));
      for (const lap of [0, 0.3, 0.7, 1]) expect(at("不明", pace, lap)).toBe(0);
    }
  });

  it("converges smoothly to level at the goal at the average pace, with no step anywhere", () => {
    for (const style of STYLES) {
      const f = styleCurve({ style, pace: "平均", approach });
      expect(f(0)).toBe(0);
      expect(f(1)).toBeCloseTo(0, 12);
      expect(Math.abs(f(1.2))).toBeLessThan(1e-12);
      let prev = f(0), maxStep = 0;
      for (let k = 1; k <= 2000; k++) { const v = f(k / 2000); maxStep = Math.max(maxStep, Math.abs(v - prev)); prev = v; }
      expect(maxStep).toBeLessThan(0.0005); // nothing close to the 0.055 peak in one 1/2000 step
      // zero slope at the line: the gap does not "drop to zero" on arrival, it flattens out
      let steepest = 0;
      for (let k = 500; k < 1000; k++) steepest = Math.max(steepest, Math.abs(f((k + 1) / 1000) - f(k / 1000)) / 0.001);
      expect(Math.abs(f(0.9995) - f(1)) / 0.0005).toBeLessThan(steepest * 0.05 + 1e-9);
    }
  });

  it("closers close their gap from the final turn: most of it is gone before the home straight", () => {
    const f = styleCurve({ style: "追込", pace: "平均", approach });
    expect(Math.abs(f(approach.third))).toBeGreaterThan(Math.abs(STYLE_PEAK["追込"]) * 0.95);
    expect(Math.abs(f(approach.home))).toBeLessThan(Math.abs(STYLE_PEAK["追込"]) * 0.2);
  });

  it("the pace tilt is the only thing left at the line: slow keeps the front ahead, fast favours the closers", () => {
    const end = (style: ScenarioStyle, pace: Pace) => at(style, pace, 1);
    expect(end("逃げ", "スロー")).toBe(PACE_TILT["スロー"]["逃げ"]);
    expect(end("逃げ", "スロー")).toBeGreaterThan(end("追込", "スロー"));
    expect(end("追込", "ハイ")).toBeGreaterThan(end("逃げ", "ハイ"));
    for (const style of STYLES) expect(end(style, "平均")).toBeCloseTo(0, 12);
  });
});

describe("terrain cannot reorder the styles (neutral fields, noise off)", () => {
  /** Mean normalised rank per style with crossings within 0.002 progress treated as ties. */
  const styleMeans = (terrainOn: boolean, pace: Pace) => withoutNoise(() => {
    const acc: Record<string, number[]> = {};
    COURSES.forEach(([v, s, d], c) => {
      const base = resolveCourse(v, s, d);
      // "terrain off" = a course without terrain data (neutral tempo, no compression); same field and seeds
      const course = terrainOn ? base : resolveCourse(null, null, null);
      for (let i = 0; i < 6; i++) {
        const runners = field();
        const sim = buildSim({ raceKey: `t${c}-${i}`, variant: "STANDARD", runners, course, pace });
        const times = runners.map(r => sim.crossT[sim.nos.indexOf(r.no)]);
        const order = times.map((t, k) => [t, k] as const).sort((a, b) => a[0] - b[0]);
        const rank = new Array<number>(times.length).fill(0);
        let start = 0;
        for (let k = 1; k <= order.length; k++) {
          if (k === order.length || order[k][0] - order[k - 1][0] > 0.002) {
            for (let j = start; j < k; j++) rank[order[j][1]] = (start + k - 1) / 2 / (order.length - 1);
            start = k;
          }
        }
        runners.forEach((r, k) => (acc[r.style] ??= []).push(rank[k]));
      }
    });
    return Object.fromEntries(Object.entries(acc).map(([style, v]) => [style, v.reduce((a, b) => a + b, 0) / v.length]));
  });

  it("at the average pace every style is level at the line, with terrain on or off", () => {
    for (const on of [true, false]) for (const [style, mean] of Object.entries(styleMeans(on, "平均"))) expect(mean, `${style} terrain=${on}`).toBeCloseTo(0.5, 2);
  });

  it("with a slow pace the front styles are ahead and with a fast pace the closers are, with terrain on or off", () => {
    for (const on of [true, false]) {
      const slow = styleMeans(on, "スロー"), fast = styleMeans(on, "ハイ");
      expect(slow["逃げ"]).toBeLessThan(0.5);
      expect(slow["先行"]).toBeLessThan(0.5);
      expect(slow["追込"]).toBeGreaterThan(0.5);
      expect(fast["追込"]).toBeLessThan(0.5);
      expect(fast["差し"]).toBeLessThan(0.5);
      expect(fast["逃げ"]).toBeGreaterThan(0.5);
    }
  });

  it("the style formation is visible on the way (front ahead, closers behind) and gone at the line", () => {
    const sim = withoutNoise(() => buildSim({ raceKey: "formation", variant: "STANDARD", runners: field(), course: resolveCourse("東京", "芝", 2000), pace: "平均" }));
    const lead = (style: ScenarioStyle, t: number) => {
      const laps = sim.nos.map((_, i) => sim.lapOf(i, t)), mean = laps.reduce((a, b) => a + b, 0) / laps.length;
      const own = sim.nos.map((no, i) => (STYLES[(no - 1) % 4] === style ? laps[i] - mean : null)).filter((x): x is number => x !== null);
      return own.reduce((a, b) => a + b, 0) / own.length;
    };
    const mid = sim.leaderReachT(0.5);
    expect(lead("逃げ", mid)).toBeGreaterThan(0.02);
    expect(lead("追込", mid)).toBeLessThan(-0.02);
    const goal = sim.allCrossedT;
    for (const style of STYLES) expect(Math.abs(lead(style, goal))).toBeLessThan(0.003);
  });
});

describe("safety: the style model reads only the style, the pace and the Atlas", () => {
  it("source never references horse, market, pick or result data", () => {
    const code = readFileSync(resolve(import.meta.dirname, "styleModelV2.ts"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "").toLowerCase();
    for (const forbidden of ["odds", "probab", "honmei", "popularity", "result", "official", "ai_rank", "math.random", "horse", "abilit"]) expect(code, forbidden).not.toContain(forbidden);
    expect(code.match(/from "[^"]+"/g)!.sort()).toEqual(['from "@/lib/courseatlas"', 'from "@/lib/coursesections"', 'from "@/lib/scenarioreplay"']);
  });
});
