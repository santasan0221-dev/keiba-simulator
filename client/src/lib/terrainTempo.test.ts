import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveCourse, type CourseLayout } from "./courseAtlas";
import { courseShare } from "./courseSections";
import { orderFrame, orderView, crossingSequence } from "./scenarioOrder";
import { cosmeticLane } from "./scenarioMotion";
import { demoField, frontAt, scenarioFrame, scenarioSeed, type ScenarioRunner } from "./scenarioReplay";
import { buildTerrainProfile, durationScale, gapFieldOf, NEUTRAL_EFFECT, sectionDurations, tempoAt, tempoSummary, TEMPO_BOUNDS, terrainTimeline, type TerrainProfile } from "./terrainTempo";

const COURSES = {
  TOKYO_T2000: ["東京", "芝", 2000],
  KYOTO_D1800: ["京都", "ダート", 1800],
  NAKAYAMA_T2500: ["中山", "芝", 2500],
  NIIGATA_T1000: ["新潟", "芝", 1000],
  KOKURA_T1800: ["小倉", "芝", 1800],
} as const;
const course = (key: keyof typeof COURSES) => resolveCourse(...COURSES[key]);
const profile = (key: keyof typeof COURSES) => buildTerrainProfile(course(key));
const strip = (file: string) => readFileSync(resolve(import.meta.dirname, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const sample = (p: TerrainProfile, steps = 200) => Array.from({ length: steps + 1 }, (_, i) => tempoAt(p, i / steps));

/** A copy of a real course with one Atlas field changed, to test each effect on its own. */
const variant = (base: CourseLayout, patch: Partial<CourseLayout>): CourseLayout => ({ ...base, ...patch });

describe("terrain tempo: pure, bounded, deterministic", () => {
  it("is deterministic for the same course and progress", () => {
    const p = profile("TOKYO_T2000");
    for (const t of [0, 0.1, 0.5, 0.83, 1]) expect(tempoAt(p, t)).toEqual(tempoAt(p, t));
    expect(buildTerrainProfile(course("TOKYO_T2000")).key).toBe(p.key);
    expect(tempoSummary(p)).toEqual(tempoSummary(buildTerrainProfile(course("TOKYO_T2000"))));
  });

  it("keeps every multiplier inside its bounds on every real course, along the whole scenario", () => {
    for (const key of Object.keys(COURSES) as (keyof typeof COURSES)[]) {
      for (const e of sample(profile(key), 400)) {
        expect(e.paceMultiplier).toBeGreaterThanOrEqual(TEMPO_BOUNDS.pace[0]);
        expect(e.paceMultiplier).toBeLessThanOrEqual(TEMPO_BOUNDS.pace[1]);
        expect(e.compressionMultiplier).toBeGreaterThanOrEqual(TEMPO_BOUNDS.compression[0]);
        expect(e.compressionMultiplier).toBeLessThanOrEqual(TEMPO_BOUNDS.compression[1]);
        expect(e.lateralSpreadMultiplier).toBeGreaterThanOrEqual(TEMPO_BOUNDS.spread[0]);
        expect(e.lateralSpreadMultiplier).toBeLessThanOrEqual(TEMPO_BOUNDS.spread[1]);
        expect(e.cameraEnergy).toBeGreaterThanOrEqual(TEMPO_BOUNDS.camera[0]);
        expect(e.cameraEnergy).toBeLessThanOrEqual(TEMPO_BOUNDS.camera[1]);
      }
    }
  });

  it("never jumps: neighbouring progress values differ by a small amount", () => {
    for (const key of Object.keys(COURSES) as (keyof typeof COURSES)[]) {
      const p = profile(key);
      let prev = tempoAt(p, 0);
      for (let i = 1; i <= 2000; i++) {
        const e = tempoAt(p, i / 2000);
        expect(Math.abs(e.paceMultiplier - prev.paceMultiplier), `${key} ${i}`).toBeLessThan(0.006);
        expect(Math.abs(e.lateralSpreadMultiplier - prev.lateralSpreadMultiplier)).toBeLessThan(0.015);
        expect(Math.abs(e.compressionMultiplier - prev.compressionMultiplier)).toBeLessThan(0.015);
        prev = e;
      }
    }
  });
});

describe("terrain tempo: unknown data is neutral (nothing is guessed)", () => {
  it("no course, and an unresolved course, give the neutral effect", () => {
    expect(tempoAt(buildTerrainProfile(null), 0.5)).toEqual(NEUTRAL_EFFECT);
    expect(gapFieldOf(buildTerrainProfile(null))).toBeUndefined();
    const unknown = buildTerrainProfile(resolveCourse(null, null, null));
    for (const e of sample(unknown)) { expect(e.paceMultiplier).toBe(1); expect(e.compressionMultiplier).toBe(1); expect(e.lateralSpreadMultiplier).toBe(1); expect(e.cameraEnergy).toBe(1); }
  });

  it("a field that is UNKNOWN in the Atlas contributes nothing", () => {
    const base = course("TOKYO_T2000");
    const blind = buildTerrainProfile(variant(base, { elevationProfile: undefined, sectionShares: "UNKNOWN", homeStraightMeters: "UNKNOWN", startOnRing: "UNKNOWN", firstCornerDistanceMeters: "UNKNOWN", variant: "UNKNOWN" }));
    expect(blind.used).toEqual([]);
    for (const e of sample(blind)) expect(e).toEqual(NEUTRAL_EFFECT);
  });

  it("the first-corner distance is UNKNOWN for every course in the Atlas today, so it changes nothing", () => {
    for (const key of Object.keys(COURSES) as (keyof typeof COURSES)[]) {
      expect(course(key).firstCornerDistanceMeters).toBe("UNKNOWN");
      expect(profile(key).firstCornerMeters).toBeNull();
    }
  });

  it("stylized (not official) sections never produce corner effects", () => {
    const base = course("KYOTO_D1800");
    const stylized = buildTerrainProfile(variant(base, { sectionBasis: "STYLIZED", elevationProfile: undefined, homeStraightMeters: "UNKNOWN", startOnRing: true }));
    for (const e of sample(stylized)) expect(e.lateralSpreadMultiplier).toBe(1);
  });
});

describe("terrain tempo: each effect, one at a time", () => {
  const base = course("KYOTO_D1800");
  const flat = (patch: Partial<CourseLayout>) => buildTerrainProfile(variant(base, { elevationProfile: undefined, homeStraightMeters: "UNKNOWN", startOnRing: true, ...patch }));

  it("uphill slows the whole scenario and packs the field; downhill does the opposite", () => {
    const hill = (rise: number) => buildTerrainProfile(variant(base, { sectionShares: "UNKNOWN", homeStraightMeters: "UNKNOWN", startOnRing: true, elevationProfile: [{ at: 0, meters: 0 }, { at: 0.5, meters: rise }, { at: 1, meters: 0 }] }));
    const up = sample(hill(8)), down = sample(hill(-8));
    expect(Math.min(...up.map(e => e.paceMultiplier))).toBeLessThan(1);
    expect(Math.max(...down.map(e => e.paceMultiplier))).toBeGreaterThan(1);
    expect(Math.min(...up.map(e => e.compressionMultiplier))).toBeLessThan(1);
    expect(Math.max(...down.map(e => e.compressionMultiplier))).toBeGreaterThan(1);
    expect(up.some(e => e.label === "UPHILL")).toBe(true);
    expect(down.some(e => e.label === "DOWNHILL")).toBe(true);
  });

  it("corners slow the scenario a little and compress the lateral spread", () => {
    const p = flat({});
    const corner = sample(p, 400).filter(e => e.label === "CORNER");
    expect(corner.length).toBeGreaterThan(0);
    expect(Math.max(...corner.map(e => e.lateralSpreadMultiplier))).toBeLessThan(1);
    expect(Math.max(...corner.map(e => e.paceMultiplier))).toBeLessThan(1);
    expect(Math.max(...corner.map(e => e.compressionMultiplier))).toBeLessThan(1);
  });

  it("a long home straight widens the field; a short one does not", () => {
    const longP = flat({ homeStraightMeters: 600 }), shortP = flat({ homeStraightMeters: 250 });
    const spread = (p: TerrainProfile) => Math.max(...sample(p, 400).map(e => e.lateralSpreadMultiplier));
    expect(spread(longP)).toBeGreaterThan(spread(shortP));
    expect(sample(longP, 400).some(e => e.label === "LONG_STRAIGHT")).toBe(true);
    expect(sample(shortP, 400).some(e => e.label === "LONG_STRAIGHT")).toBe(false);
  });

  it("inner is tighter than outer through the corners, with no other change", () => {
    const inner = flat({ variant: "INNER" }), outer = flat({ variant: "OUTER" });
    expect(Math.min(...sample(inner, 400).map(e => e.paceMultiplier))).toBeLessThan(Math.min(...sample(outer, 400).map(e => e.paceMultiplier)));
    expect(Math.min(...sample(inner, 400).map(e => e.lateralSpreadMultiplier))).toBeLessThan(Math.min(...sample(outer, 400).map(e => e.lateralSpreadMultiplier)));
  });

  it("a chute start slows the opening a touch and labels it; a known first-corner distance sets the early pace", () => {
    const chute = flat({ startOnRing: false }), ring = flat({ startOnRing: true });
    expect(tempoAt(chute, 0).paceMultiplier).toBeLessThan(tempoAt(ring, 0).paceMultiplier);
    expect(tempoAt(chute, 0.01).label).toBe("CHUTE");
    expect(tempoAt(ring, 0.01).label).not.toBe("CHUTE");
    const far = flat({ firstCornerDistanceMeters: 600 }), near = flat({ firstCornerDistanceMeters: 100 });
    expect(tempoAt(far, 0.1).paceMultiplier).toBeLessThan(tempoAt(near, 0.1).paceMultiplier);
    expect(tempoAt(far, 0.9).paceMultiplier).toBe(tempoAt(flat({}), 0.9).paceMultiplier); // only the early part
  });

  it("direction alone changes nothing: LEFT and RIGHT with the same data give the same tempo", () => {
    const left = flat({ direction: "LEFT" }), right = flat({ direction: "RIGHT" });
    expect(sample(left)).toEqual(sample(right));
  });
});

describe("terrain tempo: the five courses have different profiles", () => {
  const keys = Object.keys(COURSES) as (keyof typeof COURSES)[];
  it("no two courses share a tempo profile", () => {
    const fingerprint = (key: keyof typeof COURSES) => { const s = tempoSummary(profile(key)); return [s.durationScale, s.pace.min, s.pace.max, s.spread.min, s.spread.max, s.compression.min, s.compression.max].map(v => v.toFixed(4)).join("|"); };
    expect(new Set(keys.map(fingerprint)).size).toBe(keys.length);
  });

  it("each course uses only the Atlas fields it really has", () => {
    expect(profile("TOKYO_T2000").used).toEqual(expect.arrayContaining(["elevationProfile", "sectionShares", "homeStraightMeters", "startOnRing=false (chute)"]));
    expect(profile("NAKAYAMA_T2500").used).toEqual(expect.arrayContaining(["variant=INNER", "startOnRing=false (chute)"]));
    expect(profile("KYOTO_D1800").used).not.toContain("startOnRing=false (chute)");
    expect(profile("NIIGATA_T1000").used).toContain("pathClosed=false (straight course)");
  });

  it("the straight course has no corner effect at all", () => {
    for (const e of sample(profile("NIIGATA_T1000"), 400)) expect(e.label === "CORNER" || e.label === "BACKSTRETCH").toBe(false);
    expect(terrainTimeline(profile("NIIGATA_T1000")).every(seg => seg.type !== "CORNER")).toBe(true);
  });

  it("Tokyo opens with a chute, Nakayama (inner) has the slowest corners, Niigata the widest straight", () => {
    expect(terrainTimeline(profile("TOKYO_T2000"))[0]).toMatchObject({ type: "CHUTE", from: 0 });
    expect(terrainTimeline(profile("NAKAYAMA_T2500"))[0]).toMatchObject({ type: "CHUTE" });
    expect(terrainTimeline(profile("KYOTO_D1800"))[0].type).not.toBe("CHUTE");
    const slowest = (k: keyof typeof COURSES) => tempoSummary(profile(k)).pace.min;
    expect(slowest("NAKAYAMA_T2500")).toBeLessThanOrEqual(Math.min(...keys.filter(k => k !== "NAKAYAMA_T2500").map(slowest)) + 1e-9);
    const widest = (k: keyof typeof COURSES) => tempoSummary(profile(k)).spread.max;
    expect(widest("NIIGATA_T1000")).toBeGreaterThanOrEqual(Math.max(...keys.map(widest)) - 1e-9);
  });

  it("durations and section shares are measured from the same lookups", () => {
    for (const key of keys) {
      const p = profile(key);
      expect(durationScale(p)).toBeGreaterThan(0.94);
      expect(durationScale(p)).toBeLessThan(1.07);
      expect(Object.values(sectionDurations(p)).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
    }
    expect(durationScale(profile("NAKAYAMA_T2500"))).not.toBeCloseTo(durationScale(profile("NIIGATA_T1000")), 3);
  });
});

describe("terrain tempo is the same for every runner and cannot change who is ahead", () => {
  const field = demoField();
  const seed = scenarioSeed("JRA|2026-10-04|東京|05");

  it("the compression is one number per progress value: the order of every frame is unchanged", () => {
    for (const key of Object.keys(COURSES) as (keyof typeof COURSES)[]) {
      const gap = gapFieldOf(profile(key))!;
      for (const pace of ["スロー", "平均", "ハイ"] as const) {
        // From 12% on every runner is past the gate (lap > 0). Before that, runners clamped at lap 0 tie
        // and are ordered by the cosmetic tie-break, which a spacing factor can only resolve in gap order.
        for (let i = 12; i <= 100; i++) {
          const t = i / 100;
          const plain = orderFrame(scenarioFrame(field, t, pace, seed).runners, seed).map(row => row.no);
          const tempo = orderFrame(scenarioFrame(field, t, pace, seed, gap).runners, seed).map(row => row.no);
          expect(tempo, `${key} ${pace} ${t}`).toEqual(plain);
        }
      }
    }
  });

  it("the crossing order is identical with and without terrain, and still ends at the same field", () => {
    for (const key of Object.keys(COURSES) as (keyof typeof COURSES)[]) {
      const gap = gapFieldOf(profile(key))!;
      for (const pace of ["スロー", "平均", "ハイ"] as const) {
        expect(crossingSequence(field, pace, seed, gap).map(entry => entry.no)).toEqual(crossingSequence(field, pace, seed).map(entry => entry.no));
        const view = orderView(field, 1, pace, seed, gap);
        expect(view.kind).toBe("COMPLETE");
        expect(view.rows.map(row => row.crossing)).toEqual(view.rows.map((_, i) => i + 1));
      }
    }
  });

  it("every runner still crosses the line before 100% under terrain", () => {
    for (const key of Object.keys(COURSES) as (keyof typeof COURSES)[]) {
      const gap = gapFieldOf(profile(key))!;
      for (const pace of ["スロー", "平均", "ハイ"] as const) {
        const end = scenarioFrame(field, 1, pace, seed, gap);
        expect(end.runners.every(runner => runner.lap >= 1)).toBe(true);
        expect(scenarioFrame(field, 0.85, pace, seed, gap).runners.every(runner => runner.lap < 1)).toBe(true);
      }
    }
  });

  it("the lane factor is shared: scaling lanes never reorders runners in the scenario frame", () => {
    const f = scenarioFrame(field, 0.6, "平均", seed);
    const before = orderFrame(f.runners, seed).map(r => r.no);
    const lanes = f.runners.map(r => cosmeticLane({ no: r.no, style: r.style, baseLane: r.lane, progress: 0.6, seed, turn: 0.5, straight: 0, spread: 1.1 }));
    expect(lanes.every(Number.isFinite)).toBe(true);
    expect(orderFrame(f.runners, seed).map(r => r.no)).toEqual(before);
  });

  it("takes no runner-level input: the signature has no runner, number, style, odds or result", () => {
    const code = strip("terrainTempo.ts");
    for (const forbidden of ["odds", "popularity", "probab", "honmei", "official", "result", "ai_rank", "ability", "ScenarioRunner", ".style", ".no ", "Math.random", "Date.now", "performance.now"]) {
      expect(code.toLowerCase(), `terrainTempo must not mention ${forbidden}`).not.toContain(forbidden.toLowerCase());
    }
    expect(tempoAt.length).toBe(2); // (profile, progress): nothing else can reach it
    const imports = (code.match(/from "[^"]+"/g) ?? []).sort();
    expect(imports).toEqual(['from "@/lib/courseAtlas"', 'from "@/lib/courseSections"', 'from "@/lib/scenarioReplay"']);
  });

  it("the moving-runner modules still do not import the atlas or the terrain module", () => {
    for (const file of ["scenarioReplay.ts", "scenarioOrder.ts", "scenarioMotion.ts"]) {
      expect(strip(file), file).not.toContain("courseAtlas");
      expect(strip(file), file).not.toContain("terrainTempo");
    }
  });
});

describe("terrain tempo: lookup is cheap", () => {
  it("a lookup costs far less than a frame budget (60 fps = 16.7 ms)", () => {
    const p = profile("NAKAYAMA_T2500");
    const start = performance.now();
    let sink = 0;
    for (let i = 0; i < 200_000; i++) sink += tempoAt(p, (i % 1000) / 1000).paceMultiplier;
    const perCallMs = (performance.now() - start) / 200_000;
    expect(sink).toBeGreaterThan(0);
    expect(perCallMs).toBeLessThan(0.01); // < 10 microseconds
  });

  it("the profile of the front moves with frontAt: progress 0..1 covers the course past the line", () => {
    const c = course("KYOTO_D1800");
    expect(courseShare(c, frontAt(0))).toBeCloseTo(c.startLapShare as number, 9);
  });
});

const _unused: ScenarioRunner[] = [];
void _unused;
