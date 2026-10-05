import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveCourse } from "./courseAtlas";
import { TEMPO_MAX, TEMPO_MIN, terrainProfile } from "./terrainTempo";

const sweep = (fn: (share: number) => number) => Array.from({ length: 201 }, (_, i) => fn(i / 200));

describe("terrain tempo from the Course Atlas", () => {
  const courses = [["東京", "芝", 2000], ["京都", "ダート", 1800], ["中山", "芝", 2500], ["新潟", "芝", 1000], ["小倉", "芝", 1800], ["阪神", "芝", 1600]] as const;

  it("stays inside the tempo limits and never produces NaN on any course", () => {
    for (const [venue, surface, distance] of courses) {
      const profile = terrainProfile(resolveCourse(venue, surface, distance));
      for (const value of sweep(profile.tempoAt)) {
        expect(Number.isFinite(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(TEMPO_MIN * 0.98);
        expect(value).toBeLessThanOrEqual(TEMPO_MAX);
      }
      for (const fn of [profile.compressAt, profile.spreadAt]) for (const value of sweep(fn)) expect(value >= 0 && value <= 1).toBe(true);
    }
  });

  it("slows uphill and lists the slopes the Atlas knows", () => {
    const tokyo = terrainProfile(resolveCourse("東京", "芝", 2000));
    expect(Math.min(...sweep(tokyo.tempoAt))).toBeLessThan(0.99);
    expect(tokyo.effects.map(effect => effect.id)).toContain("UPHILL");
    const nakayama = terrainProfile(resolveCourse("中山", "芝", 2500));
    expect(nakayama.effects.map(effect => effect.id)).toEqual(expect.arrayContaining(["UPHILL", "TIGHT_TURN"]));
  });

  it("long straights spread the field, corners compress it, the straight course has no corners", () => {
    const profile = terrainProfile(resolveCourse("東京", "芝", 2000));
    expect(profile.effects.map(effect => effect.id)).toContain("LONG_STRAIGHT");
    expect(Math.max(...sweep(profile.spreadAt))).toBeGreaterThan(0);
    expect(Math.max(...sweep(profile.compressAt))).toBeGreaterThan(0);
    const niigata = terrainProfile(resolveCourse("新潟", "芝", 1000));
    expect(Math.max(...sweep(niigata.compressAt))).toBe(0);
    expect(niigata.effects.map(effect => effect.id)).not.toContain("CORNER_3_4");
  });

  it("tight loops squeeze harder than wide ovals", () => {
    expect(terrainProfile(resolveCourse("小倉", "芝", 1800)).cornerSeverity).toBeGreaterThan(terrainProfile(resolveCourse("東京", "芝", 2000)).cornerSeverity);
  });

  it("unknown courses are neutral: tempo 1, no effects", () => {
    const profile = terrainProfile(resolveCourse(null, null, null));
    expect(profile.neutral).toBe(true);
    expect(sweep(profile.tempoAt).every(value => value === 1)).toBe(true);
    expect(profile.effects).toEqual([]);
    expect(profile.earlyCompressAt(0)).toBe(0);
  });

  it("gate-end squeeze (short run to the first corner / chute) fades out with distance run", () => {
    for (const [venue, surface, distance] of courses) {
      const profile = terrainProfile(resolveCourse(venue, surface, distance));
      expect(profile.earlyCompressAt(0)).toBeGreaterThanOrEqual(profile.earlyCompressAt(0.1));
      expect(profile.earlyCompressAt(0.6)).toBe(0);
    }
  });

  it("reads only the Course Atlas: no horse, market, pick or result data", () => {
    const code = readFileSync(resolve(import.meta.dirname, "terrainTempo.ts"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "").toLowerCase();
    for (const forbidden of ["odds", "probab", "honmei", "popularity", "result", "official", "ai_rank", "math.random", "horse", "abilit"]) expect(code, forbidden).not.toContain(forbidden);
    expect(code.match(/from "[^"]+"/g)!.sort()).toEqual(['from "@/lib/courseatlas"', 'from "@/lib/coursesections"']);
  });
});
