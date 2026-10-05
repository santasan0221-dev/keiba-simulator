import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { MAX_NOISE, noiseAt, noiseKnots, NOISE_SECTIONS } from "./scenarioNoise";
import { scenarioSeed } from "./scenarioReplay";

describe("seeded scenario noise", () => {
  it("is bounded by ±3% everywhere and by each section's own amplitude at its knot", () => {
    for (let no = 1; no <= 18; no++) {
      const knots = noiseKnots(scenarioSeed("race", "ALT_A"), no);
      knots.forEach((value, i) => expect(Math.abs(value)).toBeLessThanOrEqual(NOISE_SECTIONS[i].amplitude + 1e-12));
      for (let lap = 0; lap <= 1.06; lap += 0.01) expect(Math.abs(noiseAt(knots, lap))).toBeLessThanOrEqual(MAX_NOISE + 1e-12);
    }
    expect(Math.max(...NOISE_SECTIONS.map(section => section.amplitude))).toBeLessThanOrEqual(MAX_NOISE);
  });

  it("same race + variant + runner reproduces exactly; another variant or runner differs", () => {
    const a = noiseKnots(scenarioSeed("race", "STANDARD"), 5);
    expect(noiseKnots(scenarioSeed("race", "STANDARD"), 5)).toEqual(a);
    expect(noiseKnots(scenarioSeed("race", "ALT_A"), 5)).not.toEqual(a);
    expect(noiseKnots(scenarioSeed("race", "STANDARD"), 6)).not.toEqual(a);
  });

  it("is smooth along the run (no per-frame jitter)", () => {
    const knots = noiseKnots(scenarioSeed("race"), 3);
    let previous = noiseAt(knots, 0);
    for (let lap = 0.001; lap <= 1; lap += 0.001) {
      const value = noiseAt(knots, lap);
      expect(Math.abs(value - previous)).toBeLessThan(0.002);
      previous = value;
    }
  });

  it("uses no Math.random and no race data", () => {
    const code = readFileSync(resolve(import.meta.dirname, "scenarioNoise.ts"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(code).not.toContain("Math.random");
    expect(code.match(/from "[^"]+"/g)).toEqual(['from "@/lib/scenarioReplay"']);
  });
});
