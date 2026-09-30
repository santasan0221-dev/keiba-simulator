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

import { FINISH_LAP, PHASE_KEYFRAME, phaseAt, scenarioFrame, scenarioSeed } from "./scenarioReplay";

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

  it("never produces a winner: at 100% every runner is level and short of the line", () => {
    for (const pace of ["スロー", "平均", "ハイ"] as const) {
      const frame = scenarioFrame(field, 1, pace, seed);
      expect(new Set(frame.runners.map(runner => runner.lap)).size).toBe(1);
      expect(new Set(frame.runners.map(runner => runner.lengthsBehind)).size).toBe(1);
      expect(frame.runners[0].lap).toBeLessThan(FINISH_LAP);
      expect(frame.runners.map(runner => runner.no)).toEqual(field.map(runner => runner.no).sort((a, b) => a - b));
    }
    expect(formationAt(field, "FINISH", "ハイ").every(entry => entry.group === "ゴール前（順位なし）")).toBe(true);
  });

  it("is deterministic per race_key and replay, and the seed never changes the FINISH picture", () => {
    expect(scenarioFrame(field, 0.37, "ハイ", seed)).toEqual(scenarioFrame(field, 0.37, "ハイ", seed));
    expect(scenarioSeed("JRA|2026-09-30|中山|11")).toBe(seed);
    const other = scenarioSeed("NAR|2026-09-30|大井|04");
    expect(other).not.toBe(seed);
    const finishA = scenarioFrame(field, 1, "平均", seed).runners.map(r => [r.no, r.lap, r.lengthsBehind]);
    const finishB = scenarioFrame(field, 1, "平均", other).runners.map(r => [r.no, r.lap, r.lengthsBehind]);
    expect(finishA).toEqual(finishB);
  });

  it("frames carry only number, name, style and drawing coordinates -- no probability or ability fields", () => {
    const keys = Object.keys(scenarioFrame(field, 0.5, "平均", seed).runners[0]).sort();
    expect(keys).toEqual(["lane", "lap", "lengthsBehind", "name", "no", "style"]);
  });
});
