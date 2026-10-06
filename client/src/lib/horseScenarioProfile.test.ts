import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildHorseProfiles, compatMultiplier, COMPAT_MAX, COMPAT_MIN, confidenceOf, CONFIDENCE_WEIGHT, horseHistoryOf, MAX_START_EFFECT, MAX_TERM_EFFECT, NEUTRAL_PROFILE, startEffect, termEffect,
  type HorseHistory, type HorseProfile,
} from "./horseScenarioProfile";
import type { LabHorse } from "./singlePickAi";

const strip = (file: string) => readFileSync(resolve(import.meta.dirname, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

const history = (no: number, over: Partial<HorseHistory> = {}): HorseHistory => ({
  no, starts: 10, wins: 1, seconds: 1, thirds: 1, distanceBandTop3: 30, goingTop3: { 良: 30, 稍重: 30, 重: null, 不良: null }, startFrontRunShare: null, ...over,
});
const profileOf = (h: HorseHistory, context = { organization: "JRA", going: "良" }) => buildHorseProfiles([h], context).get(h.no)!;

describe("confidence comes from the number of starts", () => {
  it("0 and 1 starts are UNKNOWN (neutral); more starts earn more trust", () => {
    expect([0, 1, 1.9].map(confidenceOf)).toEqual(["UNKNOWN", "UNKNOWN", "UNKNOWN"]);
    expect([2, 3.9, 4, 7.9, 8, 20].map(confidenceOf)).toEqual(["LOW", "LOW", "MEDIUM", "MEDIUM", "HIGH", "HIGH"]);
    expect(CONFIDENCE_WEIGHT.UNKNOWN).toBe(0);
  });

  it("a horse with one start has neutral fit terms however extreme its record looks", () => {
    const p = profileOf(history(1, { starts: 1, wins: 1, seconds: 0, thirds: 0, distanceBandTop3: 100, goingTop3: { 良: 100, 稍重: 0 } }));
    expect(p.distanceCompatibility.confidence).toBe("UNKNOWN");
    expect(p.surfaceCompatibility.confidence).toBe("UNKNOWN");
    expect(compatMultiplier(p, { early: 1, late: 1 })).toBe(1);
  });
});

describe("distance compatibility = distance-band top-3 rate - the horse's own overall top-3 rate", () => {
  it("is the horse compared with itself: the same shape of record gives the same edge at any class", () => {
    const strong = profileOf(history(1, { wins: 4, seconds: 3, thirds: 3, distanceBandTop3: 100 })); // overall 100%... clamp
    const a = profileOf(history(2, { wins: 1, seconds: 1, thirds: 1, distanceBandTop3: 60 })); // overall 30, band 60: +30
    const b = profileOf(history(3, { wins: 0, seconds: 0, thirds: 1, distanceBandTop3: 40 })); // overall 10, band 40: +30
    expect(a.distanceCompatibility.edge).toBeCloseTo(1, 9);
    expect(b.distanceCompatibility.edge).toBeCloseTo(1, 9);
    expect(a.distanceCompatibility.confidence).toBe(b.distanceCompatibility.confidence);
    expect(strong.distanceCompatibility.edge).toBeLessThanOrEqual(1);
  });

  it("a worse record in today's band than overall is a negative edge; equal is neutral", () => {
    expect(profileOf(history(1, { distanceBandTop3: 0 })).distanceCompatibility.edge).toBeCloseTo(-1, 9);
    expect(profileOf(history(1, { distanceBandTop3: 30 })).distanceCompatibility.edge).toBeCloseTo(0, 9);
  });

  it("is neutral when the band rate, the starts or the result counts are missing", () => {
    for (const over of [{ distanceBandTop3: null }, { starts: null }, { wins: null }, { starts: 0 }]) expect(profileOf(history(1, over)).distanceCompatibility.confidence).toBe("UNKNOWN");
  });
});

describe("going compatibility = today's going top-3 rate - the mean of the other goings, strongly shrunk", () => {
  it("compares the going of the day with the horse's other goings", () => {
    const p = profileOf(history(1, { goingTop3: { 良: 60, 稍重: 20, 重: 40, 不良: null } }));
    expect(p.surfaceCompatibility.edge).toBeCloseTo((60 - 30) / 50, 9);
  });

  it("is neutral without today's going cell, without another going, or without the going of the day", () => {
    expect(profileOf(history(1, { goingTop3: { 良: null, 稍重: 30 } })).surfaceCompatibility.confidence).toBe("UNKNOWN");
    expect(profileOf(history(1, { goingTop3: { 良: 30, 稍重: null } })).surfaceCompatibility.confidence).toBe("UNKNOWN");
    expect(profileOf(history(1), { organization: "JRA", going: null }).surfaceCompatibility.confidence).toBe("UNKNOWN");
  });

  it("the shrinkage keeps even a saturated, many-start going edge at LOW confidence (at most 0.3% of pace)", () => {
    const p = profileOf(history(1, { starts: 30, goingTop3: { 良: 100, 稍重: 0, 重: 0, 不良: 0 } }));
    expect(p.surfaceCompatibility.edge).toBe(1);
    expect(p.surfaceCompatibility.confidence).toBe("LOW");
    expect(Math.abs(termEffect(p.surfaceCompatibility))).toBeLessThanOrEqual(MAX_TERM_EFFECT * 0.3 + 1e-12);
  });
});

describe("start tendency: JRA only, field-relative, at most 0.5%", () => {
  const field = (org: string) => buildHorseProfiles([0, 10, 20, 30, 64].map((share, i) => history(i + 1, { startFrontRunShare: share })), { organization: org, going: "良" });

  it("is used for JRA fields and never for NAR fields", () => {
    expect([...field("JRA").values()].some(p => p.earlyPositionStrength !== 0)).toBe(true);
    expect([...field("NAR").values()].every(p => p.earlyPositionStrength === 0)).toBe(true);
    expect([...buildHorseProfiles([0, 10, 20, 30, 64].map((share, i) => history(i + 1, { startFrontRunShare: share })), { organization: null, going: "良" }).values()].every(p => p.earlyPositionStrength === 0)).toBe(true);
  });

  it("needs at least four published values in the field, and never exceeds +-0.5%", () => {
    const three = buildHorseProfiles([0, 10, 64].map((share, i) => history(i + 1, { startFrontRunShare: share })), { organization: "JRA", going: "良" });
    expect([...three.values()].every(p => p.earlyPositionStrength === 0)).toBe(true);
    for (const p of field("JRA").values()) expect(Math.abs(startEffect(p))).toBeLessThanOrEqual(MAX_START_EFFECT + 1e-12);
  });

  it("is shrunk by the history's own confidence", () => {
    const p = buildHorseProfiles([0, 10, 20, 30, 64].map((share, i) => history(i + 1, { startFrontRunShare: share, starts: i === 4 ? 2 : 10 })), { organization: "JRA", going: "良" });
    expect(Math.abs(p.get(5)!.earlyPositionStrength)).toBeLessThan(Math.abs(p.get(4)!.earlyPositionStrength) + 1);
    expect(p.get(5)!.confidence).toBe("LOW");
  });
});

describe("strength limits", () => {
  const extreme = (edge: 1 | -1): HorseProfile => ({
    ...NEUTRAL_PROFILE(1), earlyPositionStrength: edge, confidence: "HIGH",
    distanceCompatibility: { edge, confidence: "HIGH", n: 10 }, surfaceCompatibility: { edge, confidence: "HIGH", n: 10 },
  });

  it("one fit term is at most +-1.0%, the start term +-0.5%, and the total stays in 0.985 .. 1.015", () => {
    for (const edge of [1, -1] as const) {
      const p = extreme(edge);
      expect(Math.abs(termEffect(p.distanceCompatibility))).toBeCloseTo(MAX_TERM_EFFECT, 12);
      expect(Math.abs(termEffect(p.surfaceCompatibility))).toBeCloseTo(MAX_TERM_EFFECT, 12);
      expect(Math.abs(startEffect(p))).toBeCloseTo(MAX_START_EFFECT, 12);
      for (const early of [0, 0.5, 1]) for (const late of [0, 0.5, 1]) {
        const m = compatMultiplier(p, { early, late });
        expect(m).toBeGreaterThanOrEqual(COMPAT_MIN);
        expect(m).toBeLessThanOrEqual(COMPAT_MAX);
      }
    }
    expect(compatMultiplier(extreme(1), { early: 1, late: 1 })).toBe(COMPAT_MAX);
    expect(compatMultiplier(extreme(-1), { early: 1, late: 1 })).toBe(COMPAT_MIN);
  });

  it("fields the public API does not carry are always neutral", () => {
    const p = profileOf(history(1));
    for (const key of ["cornerStability", "straightSustain", "lateAcceleration", "turnDirectionCompatibility", "courseShapeCompatibility", "elevationCompatibility"] as const) {
      expect(p[key].confidence).toBe("UNKNOWN");
      expect(p[key].edge).toBe(0);
    }
  });
});

describe("what the profile may read", () => {
  const horse = (over: Record<string, unknown> = {}): LabHorse => ({
    no: 4, name: "x", style: "先行", withdrawn: false,
    abilities: { speed: 80, stamina: 70, start: 60, form: 50, going_rates: { 良: 1 }, mapping_status: "P2" },
    model: { v23k_score: 80, ai_rank: 1, win_prob_calibrated: 0.5, top3_prob: 0.9, prob_status: "READY", win_probability: 0.4, market_win_probability: 0.3 },
    display: { base_mark: "◎", final_mark: "◎", v23k_rank: 1, mark_adjustment_reason: null, anxiety_tags: [], plus_tags: [], dismiss_reason_tags: [], danger_score: 9 },
    market: { popularity: 1, win_odds: 1.5, slot: "x", captured_at: "x" },
    record: { starts: 8, wins: 2, seconds: 1, thirds: 1, stamina_distance_band_top3: 55, going_top3_rates: { 良: 50, 稍重: 10, 重: null, 不良: null }, start_front_run_share: 12, form_recent3_top3: 100, avg_finish: 1, ...over },
  });

  it("changing every non-history field (speed = model score, AI, market, marks, form) changes nothing", () => {
    const a = horseHistoryOf(horse());
    const mutated = horse();
    mutated.abilities = { speed: 1, stamina: 1, start: 1, form: 1, going_rates: {}, mapping_status: "X" };
    mutated.model = { ...mutated.model, v23k_score: 1, ai_rank: 18, win_probability: 0.001, top3_probability: 0.001, market_win_probability: 0.9 };
    mutated.display = { ...mutated.display!, final_mark: "×", danger_score: 0 };
    mutated.market = { popularity: 18, win_odds: 99, slot: null, captured_at: null };
    expect(horseHistoryOf(mutated)).toEqual(a);
    expect(Object.keys(a!).sort()).toEqual(["distanceBandTop3", "goingTop3", "no", "seconds", "starts", "startFrontRunShare", "thirds", "wins"].sort());
  });

  it("the record's form and average finish are not carried: only history stats about fit", () => {
    const a = horseHistoryOf(horse({ form_recent3_top3: 0, avg_finish: 14 }));
    expect(a).toEqual(horseHistoryOf(horse({ form_recent3_top3: 100, avg_finish: 1 })));
  });

  it("a withdrawn horse or one without a number has no history", () => {
    expect(horseHistoryOf({ ...horse(), withdrawn: true })).toBeNull();
    expect(horseHistoryOf({ ...horse(), no: null })).toBeNull();
  });

  it("the source names none of the forbidden inputs", () => {
    const code = strip("horseScenarioProfile.ts");
    for (const forbidden of ["abilities", ".model", ".market", ".display", "speed", "odds", "popularity", "honmei", "ai_top", "publication", "result", "market_ev", "bet_decision", "form_recent3", "avg_finish", "Math.random", "Date.now"]) {
      expect(code.toLowerCase(), `horseScenarioProfile must not mention ${forbidden}`).not.toContain(forbidden.toLowerCase());
    }
    const imports = (code.match(/from "[^"]+"/g) ?? []).sort();
    expect(imports).toEqual(['from "@/lib/singlePickAi"']);
  });
});
