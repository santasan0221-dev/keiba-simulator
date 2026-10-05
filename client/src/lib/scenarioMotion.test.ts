import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { orderFrame } from "./scenarioOrder";
import { cosmeticLane, LANE_MAX, LANE_MIN, type MotionInput } from "./scenarioMotion";
import { demoField, scenarioFrame, scenarioSeed, type ScenarioStyle } from "./scenarioReplay";
import { resolveCourse } from "./courseAtlas";
import { courseShare, straightness, turnness } from "./courseSections";
import { createProgressStore } from "./progressStore";

const seed = scenarioSeed("JRA|2026-09-30|中山|11");
const STYLES: ScenarioStyle[] = ["逃げ", "先行", "差し", "追込", "不明"];
const input = (over: Partial<MotionInput>): MotionInput => ({ no: 3, style: "先行", baseLane: 1, progress: 0.4, seed, turn: 0, straight: 0, ...over });

describe("cosmetic runner motion", () => {
  it("is deterministic per race_key and differs between race_keys", () => {
    expect(cosmeticLane(input({}))).toBe(cosmeticLane(input({})));
    const other = scenarioSeed("NAR|2026-09-30|大井|04");
    const lanes = new Set(Array.from({ length: 12 }, (_, no) => cosmeticLane(input({ no: no + 1, seed: other }))).map(v => v.toFixed(4)));
    expect(lanes.size).toBeGreaterThan(6);
    expect(cosmeticLane(input({ seed: other }))).not.toBe(cosmeticLane(input({})));
  });

  it("always stays inside the track band, for every style, progress, turn and straight state", () => {
    for (const style of STYLES) {
      for (let no = 1; no <= 18; no++) {
        for (let i = 0; i <= 100; i++) {
          for (const [turn, straight] of [[0, 0], [1, 0], [0, 1], [0.5, 0.5]]) {
            const baseLane = style === "逃げ" ? 0 : style === "先行" ? 1 : style === "差し" ? 2 : 3;
            const lane = cosmeticLane(input({ no, style, baseLane: baseLane + 0.35, progress: i / 100, turn, straight }));
            expect(lane).toBeGreaterThanOrEqual(LANE_MIN);
            expect(lane).toBeLessThanOrEqual(LANE_MAX);
          }
        }
      }
    }
    expect(LANE_MIN).toBeGreaterThan(-1.6);
    expect(LANE_MAX).toBeLessThan(4.2);
  });

  it("moves continuously (no jumps) as progress, turn and straight change", () => {
    for (const style of STYLES) {
      let previous = cosmeticLane(input({ style, progress: 0 }));
      for (let i = 1; i <= 2000; i++) {
        const t = i / 2000;
        const lane = cosmeticLane(input({ style, progress: t, turn: Math.min(1, Math.abs(Math.sin(t * 9))), straight: Math.max(0, Math.sin(t * 5)) }));
        expect(Math.abs(lane - previous), `${style} @${t}`).toBeLessThan(0.05);
        previous = lane;
      }
    }
  });

  it("front runners hug the rail through a turn, closers swing wider; the field widens on the home straight", () => {
    const lane = (style: ScenarioStyle, turn: number, straight: number, baseLane: number) => cosmeticLane(input({ no: 2, style, baseLane, progress: 0.3, turn, straight }));
    expect(lane("逃げ", 1, 0, 0.2) - lane("逃げ", 0, 0, 0.2)).toBeLessThan(0);
    expect(lane("追込", 1, 0, 3) - lane("追込", 0, 0, 3)).toBeGreaterThan(-0.7 + 0.0); // squeezed, but shifted wider than the front runners
    expect(lane("追込", 1, 0, 3)).toBeGreaterThan(lane("逃げ", 1, 0, 0.2));
    expect(lane("追込", 0, 1, 3)).toBeGreaterThan(lane("追込", 0, 0, 3));
  });

  it("calms down towards FINAL so the converged field is steady", () => {
    for (let no = 1; no <= 14; no++) {
      const a = cosmeticLane(input({ no, progress: 0.96, baseLane: 2, style: "差し" }));
      const b = cosmeticLane(input({ no, progress: 1, baseLane: 2, style: "差し" }));
      expect(Math.abs(a - b)).toBeLessThan(0.04);
    }
  });

  it("never changes who is ahead: the order is read from the scenario frame, not from the lanes", () => {
    const field = demoField();
    for (let i = 0; i <= 100; i++) {
      const frame = scenarioFrame(field, i / 100, "平均", seed);
      const before = orderFrame(frame.runners, seed).map(r => r.no);
      const course = resolveCourse("東京", "芝", 2000);
      // cosmetic lanes computed for every runner do not feed back into the order
      frame.runners.forEach(runner => { const share = courseShare(course, runner.lap); cosmeticLane({ no: runner.no, style: runner.style, baseLane: runner.lane, progress: i / 100, seed, turn: turnness(course, share), straight: straightness(course, share) }); });
      expect(orderFrame(frame.runners, seed).map(r => r.no)).toEqual(before);
    }
  });

  it("reads only number, style, seed, progress and geometry: no odds, popularity, pick, probability or result", () => {
    const code = readFileSync(resolve(import.meta.dirname, "scenarioMotion.ts"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "").toLowerCase();
    for (const forbidden of ["odds", "probab", "honmei", "popularity", "ai_rank", "result", "official", "win_", "math.random", "abilit"]) expect(code, forbidden).not.toContain(forbidden);
    expect(code.match(/from "[^"]+"/g)).toEqual(['from "@/lib/scenarioreplay"']);
  });
});

describe("progress store", () => {
  it("notifies subscribers, clamps, ignores no-op writes and unsubscribes", () => {
    const store = createProgressStore(0.2);
    const seen: number[] = [];
    const off = store.subscribe(v => seen.push(v));
    store.set(0.5); store.set(0.5); store.set(7); store.set(-3); store.set(Number.NaN);
    expect(seen).toEqual([0.5, 1, 0]);
    off(); store.set(0.9);
    expect(seen).toEqual([0.5, 1, 0]);
    expect(store.get()).toBe(0.9);
  });
});
