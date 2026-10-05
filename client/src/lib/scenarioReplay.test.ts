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

import { crossingTimes, FRONT_END, frontAt, PHASE_KEYFRAME, phaseAt, scenarioFrame, scenarioSeed } from "./scenarioReplay";

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

  it("the order of crossing depends on style and pace only, never on the race_key seed", () => {
    const other = scenarioSeed("NAR|2026-09-30|大井|04");
    for (const pace of ["スロー", "平均", "ハイ"] as const) {
      const order = (key: number) => [...crossingTimes(field, pace, key).entries()].sort((x, y) => x[1] - y[1]).map(([no]) => no);
      expect(order(seed)).toEqual(order(other));
    }
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
