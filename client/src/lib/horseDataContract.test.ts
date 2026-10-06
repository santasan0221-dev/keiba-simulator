import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildHorseProfiles, horseHistoryOf, overallTop3Rate, type HorseHistory } from "./horseScenarioProfile";

/**
 * Data-source contract for the per-horse scenario terms (approved 2026-10-07).
 *
 * usable   style; record.start_front_run_share; record.stamina_distance_band_top3 (the distance-band top-3 rate);
 *          record.going_top3_rates; record.starts (confidence only);
 *          record.wins / seconds / thirds ONLY to form the horse's own overall top-3 rate
 *          overall_top3_rate = (wins + seconds + thirds) / starts, which is the baseline the distance and
 *          going-band rates are compared against (a horse is measured against ITSELF).
 * forbidden abilities.*, model.*, market.*, display.*, honmei, ai_top, publication_marks, result, market_ev,
 *          bet_decision, form_recent3_top3, avg_finish; anything about the race being simulated.
 */
const lib = (file: string) => readFileSync(resolve(import.meta.dirname, file), "utf8");
const strip = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const profile = strip(lib("horseScenarioProfile.ts"));

const history = (over: Partial<HorseHistory> = {}): HorseHistory => ({
  no: 1, starts: 10, wins: 1, seconds: 1, thirds: 1, distanceBandTop3: 40, goingTop3: {}, startFrontRunShare: null, ...over,
});
const distanceEdge = (h: HorseHistory) => buildHorseProfiles([h], { organization: "JRA", going: null }).get(h.no)!.distanceCompatibility;

describe("record.* keys the profile may read", () => {
  it("horseHistoryOf reads exactly the approved keys and no other", () => {
    const body = profile.slice(profile.indexOf("export function horseHistoryOf"), profile.indexOf("export type HorseProfile"));
    const keys = Array.from(new Set(Array.from(body.matchAll(/record\.([a-z_0-9]+)/g)).map(match => match[1]))).sort();
    expect(keys).toEqual(["going_top3_rates", "seconds", "stamina_distance_band_top3", "start_front_run_share", "starts", "thirds", "wins"].sort());
  });

  it("never touches the other horse fields", () => {
    for (const forbidden of ["abilities", "model.", "market", "display", "honmei", "ai_top", "publication", "result", "market_ev", "bet_decision", "form_recent3", "avg_finish", "Math.random"]) {
      expect(profile, forbidden).not.toContain(forbidden);
    }
    expect(profile.match(/from "[^"]+"/g)).toEqual(['from "@/lib/singlePickAi"']);
  });
});

describe("wins / seconds / thirds are only the horse's own baseline", () => {
  it("the three words appear only in the history type, its reader and overallTop3Rate", () => {
    const typeBlock = profile.slice(profile.indexOf("export type HorseHistory"), profile.indexOf("const num ="));
    const reader = profile.slice(profile.indexOf("export function horseHistoryOf"), profile.indexOf("export type HorseProfile"));
    const baseline = profile.slice(profile.indexOf("export function overallTop3Rate"), profile.indexOf("function distanceCompat"));
    const rest = profile.replace(typeBlock, "").replace(reader, "").replace(baseline, "");
    for (const word of ["wins", "seconds", "thirds"]) expect(rest, `${word} outside the baseline`).not.toMatch(new RegExp(`\\b${word}\\b`));
  });

  it("the other scenario modules do not read them (or any record field) at all", () => {
    for (const file of ["scenarioReplay.ts", "scenarioOrder.ts", "scenarioMotion.ts", "scenarioNoise.ts", "scenarioRunnerField.ts", "terrainTempo.ts"]) {
      const code = strip(lib(file));
      for (const word of ["wins", "seconds", "thirds", "record."]) expect(code, `${file}: ${word}`).not.toContain(word);
    }
  });

  it("overall_top3_rate = (wins + seconds + thirds) / starts, in percent; null when anything is missing", () => {
    expect(overallTop3Rate({ starts: 10, wins: 2, seconds: 1, thirds: 3 })).toBeCloseTo(60, 9);
    expect(overallTop3Rate({ starts: 4, wins: 0, seconds: 0, thirds: 0 })).toBe(0);
    for (const broken of [{ starts: null }, { starts: 0 }, { wins: null }, { seconds: null }, { thirds: null }]) {
      expect(overallTop3Rate({ starts: 10, wins: 1, seconds: 1, thirds: 1, ...broken })).toBeNull();
    }
  });

  it("is not an ability correction: how the top-3 finishes split between 1st, 2nd and 3rd changes nothing", () => {
    const a = distanceEdge(history({ wins: 3, seconds: 0, thirds: 0 }));
    const b = distanceEdge(history({ wins: 0, seconds: 0, thirds: 3 }));
    const c = distanceEdge(history({ wins: 1, seconds: 1, thirds: 1 }));
    expect(b).toEqual(a);
    expect(c).toEqual(a);
  });

  it("is not an ability correction: a strong and a weak horse with the same band-minus-overall gap get the same edge", () => {
    const weak = distanceEdge(history({ wins: 1, seconds: 1, thirds: 1, distanceBandTop3: 40 })); // overall 30, band 40
    const strong = distanceEdge(history({ wins: 3, seconds: 2, thirds: 1, distanceBandTop3: 70 })); // overall 60, band 70
    expect(strong).toEqual(weak);
    expect(weak.edge).toBeGreaterThan(0);
  });

  it("only the gap to the horse's own baseline matters: same band rate, a higher own baseline gives a lower edge", () => {
    const low = distanceEdge(history({ wins: 1, seconds: 1, thirds: 1, distanceBandTop3: 50 }));
    const high = distanceEdge(history({ wins: 3, seconds: 2, thirds: 1, distanceBandTop3: 50 }));
    expect(high.edge).toBeLessThan(low.edge);
  });

  it("the going term and the start term ignore wins / seconds / thirds entirely", () => {
    const base = history({ goingTop3: { 良: 50, 稍重: 20, 重: 20 } });
    const other = history({ goingTop3: { 良: 50, 稍重: 20, 重: 20 }, wins: 0, seconds: 0, thirds: 0 });
    const going = (h: HorseHistory) => buildHorseProfiles([h], { organization: "JRA", going: "良" }).get(h.no)!.surfaceCompatibility;
    expect(going(other)).toEqual(going(base));
  });

  it("a missing baseline makes the distance term neutral, never an estimate", () => {
    for (const broken of [{ wins: null }, { seconds: null }, { thirds: null }, { starts: null }]) {
      expect(distanceEdge(history(broken))).toMatchObject({ edge: 0, confidence: "UNKNOWN" });
    }
  });
});

describe("the record read from a horse", () => {
  it("carries the three counts through unchanged and nothing derived from the race being simulated", () => {
    const horse = { no: 4, withdrawn: false, record: { starts: 8, wins: 2, seconds: 1, thirds: 0, stamina_distance_band_top3: 33.3, start_front_run_share: 40, going_top3_rates: { 良: 30 }, avg_finish: 3.2, form_recent3_top3: 100, result: "1", latest_history_date: "2099-01-01" } };
    const h = horseHistoryOf(horse as never)!;
    expect(h).toEqual({ no: 4, starts: 8, wins: 2, seconds: 1, thirds: 0, distanceBandTop3: 33.3, goingTop3: { 良: 30 }, startFrontRunShare: 40 });
    expect(JSON.stringify(h)).not.toMatch(/avg_finish|form_recent3|result|2099/);
  });
});
