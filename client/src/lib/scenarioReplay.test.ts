import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { demoField, formationAt, normalizeStyle, PHASES } from "./scenarioReplay";

describe("formation scenario (RESEARCH_ONLY)", () => {
  it("is built from run style and pace only -- no ability, speed, stamina or probability inputs", () => {
    const source = readFileSync(resolve(import.meta.dirname, "scenarioReplay.ts"), "utf8");
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    for (const forbidden of ["speed", "stamina", "probability", "odds", "abilities", "win_", "Math.random"]) {
      expect(code, `scenarioReplay must not read ${forbidden}`).not.toContain(forbidden);
    }
  });

  it("is deterministic and keeps every runner in every phase", () => {
    const field = demoField();
    for (const phase of PHASES) {
      const a = formationAt(field, phase, "平均");
      expect(a).toEqual(formationAt(field, phase, "平均"));
      expect(a.map(p => p.no).sort((x, y) => x - y)).toEqual(field.map(r => r.no));
    }
  });

  it("puts front-runners ahead early and never assigns a style to an unknown runner", () => {
    const early = formationAt([{ no: 1, name: null, style: "追込" }, { no: 2, name: null, style: "逃げ" }, { no: 3, name: null, style: normalizeStyle("不明") }], "EARLY", "平均");
    expect(early[0].no).toBe(2);
    expect(early.find(p => p.no === 3)!.group).toBe("脚質不明");
  });
});

import { crossingTimes, FRONT_END, frontAt, PHASE_KEYFRAME, phaseAt, scenarioFrame, scenarioSeed, scenarioSeedFor, STANDARD_VARIANT, type ScenarioRunner } from "./scenarioReplay";

describe("continuous scenario timeline", () => {
  const field = demoField();
  const seed = scenarioSeed("JRA|2026-09-30|中山|11");

  it("maps progress to the six phase windows", () => {
    expect([0, 0.05, 0.15, 0.4, 0.6, 0.8, 0.97, 1].map(phaseAt)).toEqual(["START", "START", "EARLY", "BACKSTRETCH", "TURN", "FINAL", "FINISH", "FINISH"]);
  });

  it("moves continuously: small progress steps never jump a runner", () => {
    let previous = scenarioFrame(field, 0, "平均", seed);
    for (let step = 1; step <= 400; step++) {
      const frame = scenarioFrame(field, step / 400, "平均", seed);
      for (const runner of frame.runners) {
        const before = previous.runners.find(entry => entry.no === runner.no)!;
        expect(Math.abs(runner.lap - before.lap)).toBeLessThan(0.02);
        expect(Math.abs(runner.lane - before.lane)).toBeLessThan(0.05);
      }
      previous = frame;
    }
  });

  it("hits each phase formation exactly at its keyframe", () => {
    const frame = scenarioFrame(field, PHASE_KEYFRAME.EARLY, "平均", seed);
    const leader = [...frame.runners].sort((a, b) => a.lengthsBehind - b.lengthsBehind)[0];
    expect(leader.style).toBe("逃げ");
  });

  it("runs through the line: every runner crosses before 100%, the field is past the line at 100%, and nobody stops dead", () => {
    expect(frontAt(0)).toBe(0);
    expect(frontAt(1)).toBeCloseTo(FRONT_END, 9);
    let previous = frontAt(0);
    let slowest = Infinity;
    for (let step = 1; step <= 1000; step++) {
      const front = frontAt(step / 1000);
      expect(front).toBeGreaterThan(previous); // strictly increasing: nothing ever pauses
      slowest = Math.min(slowest, (front - previous) * 1000);
      previous = front;
    }
    expect(slowest).toBeGreaterThan(0.3); // the front is still moving at 100%
    for (const pace of ["スロー", "平均", "ハイ"] as const) {
      const end = scenarioFrame(field, 1, pace, seed);
      expect(end.runners.every(runner => runner.lap >= 1)).toBe(true);
      const mid = scenarioFrame(field, 0.85, pace, seed);
      expect(mid.runners.every(runner => runner.lap < 1)).toBe(true);
      const times = crossingTimes(field, pace, seed);
      expect(times.size).toBe(field.length);
      for (const time of times.values()) { expect(time).toBeGreaterThan(0.85); expect(time).toBeLessThan(1); }
      expect(new Set([...times.values()]).size).toBe(field.length); // distinct crossing moments
    }
  });

  it("the field is spread at the line (a real crossing order), not collapsed to one position", () => {
    for (const pace of ["スロー", "平均", "ハイ"] as const) {
      const laps = scenarioFrame(field, 1, pace, seed).runners.map(runner => runner.lap);
      expect(new Set(laps).size).toBe(field.length);
    }
    expect(formationAt(field, "FINISH", "ハイ").some(entry => entry.group === "前団")).toBe(true);
  });

  it("the seed only permutes runners inside a style group: with one runner per style the order is seed-independent", () => {
    const mixed: ScenarioRunner[] = [{ no: 1, name: null, style: "追込" }, { no: 2, name: null, style: "逃げ" }, { no: 3, name: null, style: "差し" }, { no: 4, name: null, style: "先行" }];
    const order = (key: number, pace: "スロー" | "平均" | "ハイ") => [...crossingTimes(mixed, pace, key).entries()].sort((x, y) => x[1] - y[1]).map(([no]) => no);
    const other = scenarioSeed("NAR|2026-09-30|大井|04");
    for (const pace of ["スロー", "平均", "ハイ"] as const) expect(order(seed, pace)).toEqual(order(other, pace));
  });

  it("is deterministic per race_key and replay", () => {
    expect(scenarioFrame(field, 0.37, "ハイ", seed)).toEqual(scenarioFrame(field, 0.37, "ハイ", seed));
    expect(scenarioFrame(field, 1, "平均", seed)).toEqual(scenarioFrame(field, 1, "平均", seed));
    expect(crossingTimes(field, "平均", seed)).toEqual(crossingTimes(field, "平均", seed));
    expect(scenarioSeed("JRA|2026-09-30|中山|11")).toBe(seed);
    expect(scenarioSeed("NAR|2026-09-30|大井|04")).not.toBe(seed);
  });

  it("frames carry only number, name, style and drawing coordinates -- no probability or ability fields", () => {
    const keys = Object.keys(scenarioFrame(field, 0.5, "平均", seed).runners[0]).sort();
    expect(keys).toEqual(["lane", "lap", "lengthsBehind", "name", "no", "style"]);
  });
});

describe("seeded order inside a run-style group (no horse-number bias)", () => {
  const unknownField = (n: number): ScenarioRunner[] => Array.from({ length: n }, (_, i) => ({ no: i + 1, name: null, style: "不明" as const }));
  const crossingNos = (runners: ScenarioRunner[], key: number, pace: "スロー" | "平均" | "ハイ" = "平均") =>
    [...scenarioFrame(runners, 1, pace, key).runners].sort((a, b) => b.lap - a.lap).map(runner => runner.no);

  it("a field of all-unknown styles is not crossed in horse-number order", () => {
    const field = unknownField(12);
    const ascending = field.map(runner => runner.no).join();
    let inOrder = 0;
    for (let i = 0; i < 300; i++) if (crossingNos(field, scenarioSeed(`JRA|2026-10-04|東京|${i}`)).join() === ascending) inOrder++;
    expect(inOrder).toBe(0);
  });

  it("same race + same variant reproduces exactly; a different variant can reorder", () => {
    const field = unknownField(14);
    const key = "JRA|2026-10-04|東京|05";
    expect(scenarioSeedFor(key)).toBe(scenarioSeed(key));
    expect(scenarioSeedFor(key, STANDARD_VARIANT)).toBe(scenarioSeed(key));
    expect(crossingNos(field, scenarioSeedFor(key, "ALT_A"))).toEqual(crossingNos(field, scenarioSeedFor(key, "ALT_A")));
    expect(scenarioFrame(field, 0.5, "平均", scenarioSeedFor(key, "ALT_B"))).toEqual(scenarioFrame(field, 0.5, "平均", scenarioSeedFor(key, "ALT_B")));
    const orders = ["STANDARD", "ALT_A", "ALT_B"].map(variant => crossingNos(field, scenarioSeedFor(key, variant)).join());
    expect(new Set(orders).size).toBeGreaterThan(1);
  });

  it("audit: on a neutral synthetic field no horse number is favoured (mean place flat, no rank correlation)", () => {
    const n = 16, runs = 1500;
    const field = unknownField(n);
    const sum = new Array(n).fill(0);
    let corr = 0;
    for (let i = 0; i < runs; i++) {
      const order = crossingNos(field, scenarioSeed(`audit|${i}`));
      const place = new Map(order.map((no, index) => [no, index + 1]));
      let d2 = 0;
      for (let no = 1; no <= n; no++) { sum[no - 1] += place.get(no)!; d2 += (place.get(no)! - no) ** 2; }
      corr += 1 - (6 * d2) / (n * (n * n - 1)); // Spearman correlation between number and place
    }
    const means = sum.map(total => total / runs);
    for (const mean of means) expect(Math.abs(mean - (n + 1) / 2)).toBeLessThan(0.6);
    expect(Math.abs(corr / runs)).toBeLessThan(0.05);
    // and the same audit per run style: the first-in-group slot is spread over every number
    for (const style of ["逃げ", "先行", "差し", "追込"] as const) {
      const group: ScenarioRunner[] = Array.from({ length: 8 }, (_, i) => ({ no: i + 1, name: null, style }));
      const firsts = new Set<number>();
      for (let i = 0; i < 400; i++) firsts.add(crossingNos(group, scenarioSeed(`first|${style}|${i}`))[0]);
      expect(firsts.size).toBe(8);
    }
  });

  it("a missing seed falls back to one fixed order (never to horse-number order, never random)", () => {
    const field = unknownField(10);
    const a = formationAt(field, "FINAL", "平均").map(entry => entry.no);
    expect(formationAt(field, "FINAL", "平均").map(entry => entry.no)).toEqual(a);
    expect(a.join()).not.toBe(field.map(runner => runner.no).join());
  });

  it("the order reads nothing but style, pace and the seed (source scan)", () => {
    const code = readFileSync(resolve(import.meta.dirname, "scenarioReplay.ts"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    for (const forbidden of ["odds", "popularity", "probab", "honmei", "official", "result", "Math.random", "Date.now"]) expect(code.toLowerCase(), forbidden).not.toContain(forbidden.toLowerCase());
  });
});
