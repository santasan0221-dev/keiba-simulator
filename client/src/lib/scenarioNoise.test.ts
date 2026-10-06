import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { MAX_NOISE, noiseAt, noiseKnots, NOISE_SECTIONS } from "./scenarioNoise";
import { scenarioSeed, scenarioSeedFor } from "./scenarioReplay";

const strip = (file: string) => readFileSync(resolve(import.meta.dirname, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

describe("seeded noise", () => {
  it("is exactly reproducible for the same race, variant and runner, and differs between variants and runners", () => {
    const key = "JRA|2026-10-04|東京|05";
    expect(noiseKnots(scenarioSeedFor(key), 3)).toEqual(noiseKnots(scenarioSeedFor(key), 3));
    expect(noiseKnots(scenarioSeedFor(key, "ALT_A"), 3)).toEqual(noiseKnots(scenarioSeedFor(key, "ALT_A"), 3));
    expect(noiseKnots(scenarioSeedFor(key, "ALT_A"), 3)).not.toEqual(noiseKnots(scenarioSeedFor(key, "STANDARD"), 3));
    expect(noiseKnots(scenarioSeedFor(key, "ALT_A"), 3)).not.toEqual(noiseKnots(scenarioSeedFor(key, "ALT_B"), 3));
    expect(noiseKnots(scenarioSeedFor(key), 3)).not.toEqual(noiseKnots(scenarioSeedFor(key), 4));
  });

  it("every value stays within +-3% (usually +-1..2%) at every section and in between", () => {
    let over2 = 0, total = 0;
    for (let s = 0; s < 300; s++) for (let no = 1; no <= 18; no++) {
      const knots = noiseKnots(scenarioSeed(`n|${s}`), no);
      knots.forEach((value, i) => expect(Math.abs(value)).toBeLessThanOrEqual(NOISE_SECTIONS[i].amplitude + 1e-12));
      for (let lap = 0; lap <= 1.1; lap += 0.01) { const v = noiseAt(knots, lap); expect(Math.abs(v)).toBeLessThanOrEqual(MAX_NOISE + 1e-12); total += 1; over2 += Math.abs(v) > 0.02; }
    }
    expect(over2 / total).toBeLessThan(0.1); // beyond +-2% is rare
  });

  it("has zero mean: no runner and no horse number gets a lasting plus or minus", () => {
    const sums = new Array<number>(18).fill(0);
    const runs = 1500;
    for (let s = 0; s < runs; s++) for (let no = 1; no <= 18; no++) { const knots = noiseKnots(scenarioSeed(`mean|${s}`), no); for (let lap = 0; lap <= 1; lap += 0.05) sums[no - 1] += noiseAt(knots, lap); }
    for (const sum of sums) expect(Math.abs(sum / (runs * 21))).toBeLessThan(0.0006);
  });

  it("is smooth: no value changes per frame and neighbouring laps differ by little", () => {
    for (let s = 0; s < 100; s++) {
      const knots = noiseKnots(scenarioSeed(`smooth|${s}`), 1);
      let prev = noiseAt(knots, 0);
      for (let lap = 0.001; lap <= 1.1; lap += 0.001) { const v = noiseAt(knots, lap); expect(Math.abs(v - prev)).toBeLessThan(0.0012); prev = v; }
    }
  });

  it("uses no random source: only the seed, runner and section", () => {
    const code = strip("scenarioNoise.ts");
    for (const forbidden of ["Math.random", "Date.now", "performance.now", "crypto"]) expect(code).not.toContain(forbidden);
  });
});
