import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveCourse } from "./courseAtlas";
import { compat, NEUTRAL_PROFILE, type HorseProfile } from "./horseScenarioProfile";
import { demoField, PHASES, VARIANTS, type Pace, type ScenarioRunner, type ScenarioStyle } from "./scenarioReplay";
import { buildSim, PHASE_KEY_LAP, RUNOUT_LAP } from "./scenarioSim";

const tokyo = resolveCourse("東京", "芝", 2000);
const nakayama = resolveCourse("中山", "芝", 2500);
const niigata = resolveCourse("新潟", "芝", 1000);
const unknown = resolveCourse(null, null, null);
const mixed = (n = 14): ScenarioRunner[] => Array.from({ length: n }, (_, i) => ({ no: i + 1, name: null, style: (["逃げ", "先行", "先行", "差し", "差し", "差し", "追込"] as ScenarioStyle[])[i % 7] }));
const build = (over: Partial<Parameters<typeof buildSim>[0]> = {}) => buildSim({ raceKey: "JRA|2026-10-04|東京|05", variant: "STANDARD", runners: mixed(), course: tokyo, pace: "平均", ...over });

describe("determinism and variants", () => {
  it("same race + same variant is identical, frame by frame", () => {
    const a = build(), b = build();
    expect(b.crossOrder).toEqual(a.crossOrder);
    for (const t of [0, 0.13, 0.5, 0.77, 0.97, 1]) expect(b.frameAt(t)).toEqual(a.frameAt(t));
  });

  it("another variant is another run (but a similar kind of race)", () => {
    const orders = VARIANTS.map(variant => build({ variant }).crossOrder.join(","));
    expect(new Set(orders).size).toBeGreaterThanOrEqual(2);
    const a = build({ variant: "ALT_A" }), s = build();
    // Different noise moves positions a little, not the whole field: the typical lap gap stays small.
    const gap = s.frameAt(0.6).runners.map((r, i) => Math.abs(r.lap - a.frameAt(0.6).runners[i].lap));
    expect(Math.max(...gap)).toBeLessThan(0.08);
  });
});

describe("full finish: everyone crosses the line and runs on", () => {
  const sim = build();
  it("every runner passes the goal line before progress 1, in a well-defined order", () => {
    expect(sim.crossT.every(t => t > 0 && t < 1)).toBe(true);
    expect(sim.allCrossedT).toBeLessThan(1);
    expect(sim.allCrossedT).toBe(Math.max(...sim.crossT));
    expect([...sim.crossOrder].sort((a, b) => a - b)).toEqual(sim.nos);
    const times = sim.crossOrder.map(no => sim.crossT[sim.nos.indexOf(no)]);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it("runners are past the line at the end but never beyond the run-out limit; nobody stops dead at the line", () => {
    const end = sim.frameAt(1).runners;
    expect(end.every(r => r.crossed && r.lap > 1 && r.lap <= 1 + RUNOUT_LAP + 1e-6)).toBe(true);
    // Just after crossing, a runner is still moving (smooth run-out, no sudden stop).
    sim.nos.forEach((_, i) => {
      const t = sim.crossT[i];
      const before = sim.lapOf(i, t), later = sim.lapOf(i, Math.min(1, t + 0.01));
      expect(later).toBeGreaterThan(before);
    });
    // And it slows smoothly: per-step speed never halves from one step to the next.
    for (let i = 0; i < sim.nos.length; i++) {
      let previousStep = 0;
      for (let k = Math.floor(sim.crossT[i] * 1000); k < 1000; k++) {
        const step = sim.lapOf(i, (k + 1) / 1000) - sim.lapOf(i, k / 1000);
        if (previousStep > 1e-6) expect(step).toBeGreaterThan(previousStep * 0.5);
        previousStep = step;
      }
    }
  });

  it("laps never go backwards, never jump, never NaN", () => {
    for (let i = 0; i < sim.nos.length; i++) {
      let previous = 0;
      for (let k = 0; k <= 1000; k++) {
        const lap = sim.lapOf(i, k / 1000);
        expect(Number.isFinite(lap)).toBe(true);
        expect(lap).toBeGreaterThanOrEqual(previous - 1e-9);
        expect(lap - previous).toBeLessThan(0.02);
        previous = lap;
      }
    }
  });

  it("the order keeps changing past 95% (no freeze) in at least some runs", () => {
    let changed = 0;
    for (let i = 0; i < 20; i++) {
      const s = build({ raceKey: `freeze-check-${i}` });
      const at = (t: number) => s.frameAt(t).runners.slice().sort((a, b) => b.lap - a.lap).map(r => r.no).join(",");
      if (at(0.95) !== at(s.allCrossedT)) changed += 1;
    }
    expect(changed).toBeGreaterThan(0);
  });

  it("every course (straight, loop, unknown) runs to a full finish", () => {
    for (const course of [tokyo, nakayama, niigata, unknown, resolveCourse("小倉", "芝", 1800), resolveCourse("京都", "ダート", 1800)]) {
      for (const pace of ["スロー", "平均", "ハイ"] as Pace[]) {
        const s = build({ course, pace });
        expect(s.crossT.every(t => t < 1)).toBe(true);
        expect(s.frameAt(1).runners.every(r => r.crossed)).toBe(true);
      }
    }
  });

  it("handles an empty field and a single runner", () => {
    expect(build({ runners: [] }).frameAt(0.5).runners).toEqual([]);
    const one = build({ runners: [{ no: 3, name: null, style: "逃げ" }] });
    expect(one.crossOrder).toEqual([3]);
    expect(one.frameAt(1).runners[0].crossed).toBe(true);
  });
});

describe("phases follow the front of the field", () => {
  const sim = build();
  it("phase keyframes are increasing and FINISH is the leader's goal crossing", () => {
    const keys = PHASES.map(phase => sim.phaseKey[phase]);
    expect(keys[0]).toBe(0);
    for (let i = 1; i < keys.length; i++) expect(keys[i]).toBeGreaterThan(keys[i - 1]);
    expect(sim.leaderLapAt(sim.phaseKey.FINISH)).toBeCloseTo(PHASE_KEY_LAP.FINISH, 2);
    expect(sim.phaseAt(0)).toBe("START");
    expect(sim.phaseAt(1)).toBe("FINISH");
  });
});

describe("the scenario is not an outcome machine", () => {
  const meanRankByStyle = (pace: Pace, course = tokyo) => {
    const acc: Record<string, number[]> = {};
    for (let i = 0; i < 30; i++) {
      const runners = mixed(14).map((r, k) => ({ ...r, style: mixed(14)[(k + i) % 14].style }));
      const sim = build({ raceKey: `balance-${i}`, runners, pace, course });
      sim.crossOrder.forEach((no, index) => (acc[runners.find(r => r.no === no)!.style] ??= []).push(index / 13));
    }
    return Object.fromEntries(Object.entries(acc).map(([style, list]) => [style, list.reduce((a, b) => a + b, 0) / list.length]));
  };

  it("at an average pace no run style is systematically first or last", () => {
    for (const course of [tokyo, nakayama, niigata]) {
      for (const value of Object.values(meanRankByStyle("平均", course))) {
        expect(value).toBeGreaterThan(0.35);
        expect(value).toBeLessThan(0.65);
      }
    }
  });

  it("the assumed pace tilts the order the expected way (slow: front, fast: closers) without deciding it", () => {
    const slow = meanRankByStyle("スロー"), fast = meanRankByStyle("ハイ");
    expect(slow["逃げ"]).toBeLessThan(slow["追込"]);
    expect(fast["追込"]).toBeLessThan(fast["逃げ"]);
    for (const value of [...Object.values(slow), ...Object.values(fast)]) { expect(value).toBeGreaterThan(0.1); expect(value).toBeLessThan(0.9); }
  });

  it("with neutral horses of one style, no horse is first more than a third of the time and orders differ run to run", () => {
    const runners = Array.from({ length: 12 }, (_, i) => ({ no: i + 1, name: null, style: "先行" as const }));
    const first = new Map<number, number>();
    const orders = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const sim = buildSim({ raceKey: `neutral-${i}`, variant: "STANDARD", runners, course: tokyo, pace: "平均" });
      first.set(sim.crossOrder[0], (first.get(sim.crossOrder[0]) ?? 0) + 1);
      orders.add(sim.crossOrder.join(","));
    }
    expect(Math.max(...first.values())).toBeLessThanOrEqual(33);
    expect(first.size).toBeGreaterThanOrEqual(8);
    expect(orders.size).toBeGreaterThan(95);
  });

  it("a confident compatibility tilts the odds but does not decide the race", () => {
    const runners = Array.from({ length: 12 }, (_, i) => ({ no: i + 1, name: null, style: "先行" as const }));
    const extreme: HorseProfile = { ...NEUTRAL_PROFILE(1), straightSustain: compat(1, 12), distanceCompatibility: compat(1, 12), surfaceCompatibility: compat(1, 12) };
    const moderate: HorseProfile = { ...NEUTRAL_PROFILE(1), distanceCompatibility: compat(0.5, 6), surfaceCompatibility: compat(0.5, 12) };
    const run = (profile: HorseProfile) => {
      let sum = 0, wins = 0;
      for (let i = 0; i < 60; i++) {
        const rank = buildSim({ raceKey: `compat-${i}`, variant: "STANDARD", runners, profiles: new Map([[1, profile]]), course: tokyo, pace: "平均" }).crossOrder.indexOf(1) + 1;
        sum += rank; if (rank === 1) wins += 1;
      }
      return { mean: sum / 60, wins: wins / 60 };
    };
    const strong = run(extreme), mild = run(moderate);
    expect(strong.mean).toBeLessThan(mild.mean);
    expect(mild.mean).toBeLessThan(6.5 - 1.5); // better than the neutral average of 6.5
    expect(strong.wins).toBeLessThan(0.9);
    expect(mild.wins).toBeLessThan(0.55);
  });

  it("missing profiles and an unknown Atlas are neutral and still produce a scenario", () => {
    const s = build({ course: unknown, profiles: undefined });
    expect(s.terrain.neutral).toBe(true);
    expect(s.crossOrder).toHaveLength(14);
    expect(demoField().length).toBe(10);
  });
});

describe("cost: built once, looked up per frame", () => {
  it("builds an 18-runner run quickly and answers frame lookups cheaply", () => {
    const start = performance.now();
    const sim = build({ runners: mixed(18), course: nakayama });
    const built = performance.now() - start;
    expect(built).toBeLessThan(250);
    const t0 = performance.now();
    for (let i = 0; i < 2000; i++) sim.frameAt((i % 1000) / 1000);
    expect((performance.now() - t0) / 2000).toBeLessThan(0.5);
  });
});

describe("safety: the simulation reads no result, odds, marks or probabilities", () => {
  const code = readFileSync(resolve(import.meta.dirname, "scenarioSim.ts"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  it("never references post-race, market or prediction fields and never uses Math.random", () => {
    for (const forbidden of ["odds", "probab", "honmei", "popularity", "result", "official", "ai_rank", "v23k", "win_", "market", "Math.random", "singlePickAi", "abilit", "publication", "ai_top"]) expect(code.toLowerCase(), forbidden).not.toContain(forbidden.toLowerCase());
    expect(code.match(/from "[^"]+"/g)!.sort()).toEqual([
      'from "@/lib/courseAtlas"', 'from "@/lib/courseSections"', 'from "@/lib/horseScenarioProfile"', 'from "@/lib/scenarioNoise"', 'from "@/lib/scenarioReplay"', 'from "@/lib/terrainTempo"',
    ]);
  });
  it("labels the order a virtual scenario outcome and avoids finish-position wording", () => {
    for (const file of ["scenarioOrder.ts", "../components/trace/ScenarioOrderPanel.tsx", "scenarioSim.ts"]) {
      const text = readFileSync(resolve(import.meta.dirname, file), "utf8");
      for (const forbidden of ["1着", "2着", "3着", "winner", "予想着順", "勝ち馬", "predicted"]) expect(text, `${file}: ${forbidden}`).not.toContain(forbidden);
    }
  });
});
