import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveCourse } from "./courseAtlas";
import {
  buildHorseProfiles, GOING_EDGE_SPAN, GOING_SAMPLE_SHARE, compat, compatEffect, compatMultiplier, COMPAT_MAX, COMPAT_MIN, confidenceOf, fitMark, MAX_COMPAT_EFFECT, NEUTRAL_PROFILE, UNKNOWN_COMPAT,
  type CompatContext, type HorseEvidence,
} from "./horseScenarioProfile";
import type { LabHorse } from "./singlePickAi";

type Over = { start?: number | null; stamina?: number | null; starts?: number | null; going?: Record<string, number | null>; speed?: number | null };
const horse = (no: number, over: Over = {}): LabHorse => ({
  no, name: `馬${no}`, style: "差し", withdrawn: false,
  abilities: { speed: over.speed ?? 80, stamina: over.stamina ?? null, start: over.start ?? null, form: 70, going_rates: {}, mapping_status: "P2_V23K_PLUS_AS_OF_HISTORY" },
  model: { v23k_score: 80, ai_rank: 1, win_prob_calibrated: null, top3_prob: null, prob_status: "X" },
  market: { popularity: 1, win_odds: 2, slot: null, captured_at: null },
  record: { starts: over.starts ?? null, going_top3_rates: over.going ?? {} },
});
const tokyo = resolveCourse("東京", "芝", 2000);
const ctx = { distance: 2000, going: "良", course: tokyo };
const at: CompatContext = { turn: 1, straight: 1, slope: 1, longStraight: 1, severity: 1, late: 1 };

describe("confidence", () => {
  it("one start never earns a compatibility; more samples earn more", () => {
    expect(confidenceOf(0)).toBe("UNKNOWN");
    expect(confidenceOf(1)).toBe("UNKNOWN");
    expect(confidenceOf(2)).toBe("LOW");
    expect(confidenceOf(4)).toBe("MEDIUM");
    expect(confidenceOf(8)).toBe("HIGH");
    expect(compat(1, 1)).toEqual(UNKNOWN_COMPAT);
  });

  it("low confidence shrinks the effect towards 1", () => {
    const strong = compatEffect(compat(1, 12)) - 1;
    const weak = compatEffect(compat(1, 2)) - 1;
    expect(strong).toBeCloseTo(MAX_COMPAT_EFFECT, 6);
    expect(weak).toBeGreaterThan(0);
    expect(weak).toBeLessThan(strong * 0.4);
    expect(compatEffect(UNKNOWN_COMPAT)).toBe(1);
  });
});

describe("buildHorseProfiles", () => {
  const field = Array.from({ length: 8 }, (_, i) => horse(i + 1, { start: 40 + i * 5, stamina: 50 + i * 4, starts: 9, going: { 良: 60 - i * 5, 稍重: 30, 重: 30 } }));

  it("derives early position from gate speed (field-relative) and stamina-based terms with confidence", () => {
    const profiles = buildHorseProfiles(field, ctx);
    expect(profiles.get(8)!.earlyPositionStrength).toBeGreaterThan(0);
    expect(profiles.get(1)!.earlyPositionStrength).toBeLessThan(0);
    expect(profiles.get(8)!.straightSustain.confidence).toBe("HIGH");
    expect(profiles.get(8)!.straightSustain.edge).toBeGreaterThan(0);
    expect(profiles.get(1)!.distanceCompatibility.edge).toBeLessThan(0);
    expect(profiles.get(1)!.surfaceCompatibility.edge).toBeGreaterThan(profiles.get(8)!.surfaceCompatibility.edge);
  });

  it("never reads the model score, abilities.speed / form, odds or popularity: changing them changes nothing", () => {
    const a = buildHorseProfiles(field, ctx);
    const b = buildHorseProfiles(field.map(h => ({ ...h, abilities: { ...h.abilities, speed: 1, form: 1 }, model: { ...h.model, v23k_score: 1, ai_rank: 9 }, market: { ...h.market, popularity: 9, win_odds: 99 } })), ctx);
    expect(b).toEqual(a);
  });

  it("missing data is neutral: nothing guessed", () => {
    const bare = [1, 2, 3, 4, 5].map(no => horse(no));
    for (const profile of buildHorseProfiles(bare, ctx).values()) expect(profile).toEqual(NEUTRAL_PROFILE(profile.no));
  });

  it("a single start gives no compatibility", () => {
    const one = Array.from({ length: 6 }, (_, i) => horse(i + 1, { start: 40 + i * 5, stamina: 40 + i * 6, starts: 1, going: { 良: 50 + i, 稍重: 20 } }));
    for (const profile of buildHorseProfiles(one, ctx).values()) {
      expect(profile.straightSustain).toEqual(UNKNOWN_COMPAT);
      expect(profile.surfaceCompatibility).toEqual(UNKNOWN_COMPAT);
      expect(profile.earlyPositionStrength).toBe(0);
    }
  });

  it("direction / course / slope / corner terms stay UNKNOWN without per-condition history (the public API has none)", () => {
    for (const profile of buildHorseProfiles(field, ctx).values()) {
      for (const key of ["cornerStability", "lateAcceleration", "turnDirectionCompatibility", "courseShapeCompatibility", "elevationCompatibility"] as const) expect(profile[key]).toEqual(UNKNOWN_COMPAT);
    }
  });

  it("with history, same-direction / near-distance / slope / corner evidence earns shrunken compatibilities", () => {
    const evidence = new Map<number, HorseEvidence>([[1, {
      overall: { n: 12, top3: 0.3 }, direction: { LEFT: { n: 9, top3: 0.6 } }, nearDistance: { n: 6, top3: 0.5 }, sameCourse: { n: 3, top3: 0.7 }, slope: { n: 8, top3: 0.5 }, cornerKeep: { n: 10, rate: 0.9 },
    }]]);
    const profile = buildHorseProfiles(field, ctx, evidence).get(1)!;
    expect(profile.turnDirectionCompatibility.confidence).toBe("HIGH");
    expect(profile.turnDirectionCompatibility.edge).toBeGreaterThan(0);
    expect(profile.distanceCompatibility.confidence).toBe("MEDIUM");
    expect(profile.courseShapeCompatibility.confidence).toBe("LOW");
    expect(profile.elevationCompatibility.edge).toBeGreaterThan(0);
    expect(profile.cornerStability.confidence).toBe("HIGH");
    // Kyoto turf is right-handed: the LEFT-only history says nothing about it.
    expect(buildHorseProfiles(field, { ...ctx, course: resolveCourse("京都", "芝", 1600) }, evidence).get(1)!.turnDirectionCompatibility.edge).toBe(0);
  });
});

describe("going term (tuned after the calibration audit)", () => {
  const going = (today: number, others: number, starts: number) => horse(1, { starts, going: { 良: today, 稍重: others, 重: others } });
  const surface = (h: ReturnType<typeof horse>) => buildHorseProfiles([h, ...[2, 3, 4, 5].map(no => horse(no))], ctx).get(1)!.surfaceCompatibility;

  it("a 25-point top-3 rate gap is half an edge, not three quarters", () => {
    expect(GOING_EDGE_SPAN).toBe(50);
    expect(surface(going(55, 30, 10)).edge).toBeCloseTo(25 / GOING_EDGE_SPAN, 6);
  });

  it("only part of the starts are assumed to be on the going of the day, so ten starts are MEDIUM, not HIGH", () => {
    expect(GOING_SAMPLE_SHARE).toBe(0.5);
    expect(surface(going(100, 20, 10)).confidence).toBe("MEDIUM");
    expect(surface(going(100, 20, 10)).edge).toBe(1);
    expect(surface(going(100, 20, 3)).confidence).toBe("UNKNOWN");
  });
});

describe("interaction with the course", () => {
  const all = (edge: number) => ({ ...NEUTRAL_PROFILE(1), distanceCompatibility: compat(edge, 12), surfaceCompatibility: compat(edge, 12), straightSustain: compat(edge, 12), cornerStability: compat(edge, 12), turnDirectionCompatibility: compat(edge, 12), courseShapeCompatibility: compat(edge, 12), elevationCompatibility: compat(edge, 12) });

  it("a neutral horse is exactly 1.0 everywhere; the combined effect never leaves 0.97..1.03", () => {
    expect(compatMultiplier(NEUTRAL_PROFILE(3), at)).toBe(1);
    expect(compatMultiplier(all(1), at)).toBe(COMPAT_MAX);
    expect(compatMultiplier(all(-1), at)).toBe(COMPAT_MIN);
    expect([COMPAT_MIN, COMPAT_MAX]).toEqual([0.985, 1.015]);
  });

  it("each term only applies where its terrain is: straight on the home straight, corner in turns, slope on slopes", () => {
    const only = (key: "straightSustain" | "cornerStability" | "elevationCompatibility") => ({ ...NEUTRAL_PROFILE(4), [key]: compat(1, 12) });
    const flat: CompatContext = { turn: 0, straight: 0, slope: 0, longStraight: 1, severity: 0.5, late: 1 };
    expect(compatMultiplier(only("straightSustain"), flat)).toBe(1);
    expect(compatMultiplier(only("straightSustain"), { ...flat, straight: 1 })).toBeCloseTo(1 + MAX_COMPAT_EFFECT, 6);
    expect(compatMultiplier(only("cornerStability"), flat)).toBe(1);
    expect(compatMultiplier(only("cornerStability"), { ...flat, turn: 1 })).toBeCloseTo(1 + MAX_COMPAT_EFFECT / 2, 6);
    expect(compatMultiplier(only("elevationCompatibility"), flat)).toBe(1);
    expect(compatMultiplier(only("elevationCompatibility"), { ...flat, slope: 1 })).toBeCloseTo(1 + MAX_COMPAT_EFFECT, 6);
  });

  it("distance shows late in the race, not at the gate", () => {
    const p = { ...NEUTRAL_PROFILE(5), distanceCompatibility: compat(1, 12) };
    expect(compatMultiplier(p, { ...at, late: 0 })).toBe(1);
    expect(compatMultiplier(p, { ...at, late: 1 })).toBeCloseTo(1 + MAX_COMPAT_EFFECT, 6);
  });

  it("COURSE FIT marks are references only: unknown shows －, weak confidence is capped", () => {
    expect(fitMark(UNKNOWN_COMPAT)).toBe("－");
    expect(fitMark(compat(1, 12))).toBe("◎");
    expect(fitMark(compat(1, 2))).toBe("○"); // LOW confidence can never reach ◎
    expect(fitMark(compat(0.5, 5))).toBe("○");
    expect(fitMark(compat(-1, 12))).toBe("△");
  });
});

describe("safety: pre-race inputs only", () => {
  it("source never reads result, odds, popularity, marks, probabilities, the model score, speed or form", () => {
    const code = readFileSync(resolve(import.meta.dirname, "horseScenarioProfile.ts"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "").toLowerCase();
    for (const forbidden of ["odds", "probab", "honmei", "popularity", "result", "official", "ai_rank", "v23k", "win_", "market", "math.random", ".speed", ".form", "display", "final_mark"]) expect(code, forbidden).not.toContain(forbidden);
    expect(code).toContain("import type { labhorse }");
  });
});
