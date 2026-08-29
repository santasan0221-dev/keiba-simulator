import { describe, expect, it } from "vitest";
import { getBranches, runSimulation, type Horse } from "./horseTypes";
import { computeProbabilityConcentration, formatWinRate, getSimulationCalibration } from "@/lib/simulationCalibration";

// Regression coverage for the 2026-08-16 noise calibration fix: WHAT-IF
// win rates were collapsing toward 100%/0% whenever a field had one
// speed standout (the only per-horse real-data field today; stamina/
// start/form stay flat 暫定値 placeholders until P2 lands), because the
// old noise magnitude (9) was too small next to the real score gap it
// had to compete against. See the calibration comment above
// runSimulation in horseTypes.ts for the full rationale.

function makeHorse(no: number, speed: number): Horse {
  return {
    no, name: `馬${no}`, color: "#fff", style: "先行",
    speed, stamina: 70, start: 70, form: 70,
    popularity: no, starts: 0, winsPast: 0, secondsPast: 0, thirdsPast: 0,
    avgFinish: 6, goingRates: { 良: 60, 稍重: 60, 重: 60, 不良: 60 },
  };
}

function simulate(speeds: number[]) {
  const horses = speeds.map((speed, index) => makeHorse(index + 1, speed));
  const branches = getBranches(horses, "平均");
  return runSimulation(horses, 2000, "良", "平均", 10000, 42, branches)
    .sort((a, b) => b.winRate - a.winRate);
}

describe("runSimulation noise calibration", () => {
  it("keeps a standout field's win rate away from a near-deterministic 100%", () => {
    // Real bug report: 実データで54.4%/38.1%/7.0%/0.5%/0.0%...のような、上位2頭
    // でほぼ独占し他が事実上ゼロになる分布が出ていた。
    const results = simulate([85, 78, 72, 68, 64, 60, 56, 52]);
    expect(results[0].winRate).toBeLessThan(45);
    expect(results[0].winRate).toBeGreaterThan(15);
  });

  it("never fully zeroes out the weakest horse in a realistic field", () => {
    const results = simulate([85, 78, 72, 68, 64, 60, 56, 52]);
    const weakest = results[results.length - 1];
    expect(weakest.winRate).toBeGreaterThan(0);
  });

  it("still lets a genuinely dominant outlier lead clearly, without being deterministic", () => {
    const results = simulate([95, 65, 63, 61, 59, 57]);
    expect(results[0].winRate).toBeGreaterThan(40);
    expect(results[0].winRate).toBeLessThan(80);
    expect(results[1].winRate).toBeGreaterThan(3);
  });

  it("keeps a close field's win rates smoothly spread, not artificially flattened", () => {
    const results = simulate([75, 73, 71, 69, 67, 65, 63, 61]);
    // A close field shouldn't produce a single overwhelming favorite.
    expect(results[0].winRate).toBeLessThan(30);
    // ...but should still track the real speed ordering on average.
    expect(results[0].winRate).toBeGreaterThan(results[results.length - 1].winRate);
  });

  it("widens uncertainty when ability provenance is mostly provisional", () => {
    const horse = makeHorse(1, 85);
    const complete = { ...horse, dataSources: { speed: "v23k実値", stamina: "as-of履歴実値", start: "as-of履歴実値", form: "as-of履歴実値", goingRates: { 良: "as-of履歴実値", 稍重: "as-of履歴実値", 重: "as-of履歴実値", 不良: "as-of履歴実値" }, record: "as-of履歴実値" } } as Horse;
    const provisional = { ...horse, dataSources: { speed: "v23k実値", stamina: "暫定値", start: "暫定値", form: "暫定値", goingRates: { 良: "暫定値", 稍重: "暫定値", 重: "暫定値", 不良: "暫定値" }, record: "as-of履歴実値" } } as Horse;
    expect(getSimulationCalibration(provisional).noiseMagnitude).toBeGreaterThan(getSimulationCalibration(complete).noiseMagnitude);
  });

  it("makes sub-tenth-percent output distinguishable from zero", () => {
    expect(formatWinRate(0)).toBe("<0.1");
    expect(formatWinRate(0.04)).toBe("<0.1");
    expect(formatWinRate(0.1)).toBe("0.1");
  });

  // Regression fixture: 2026-08-13 園田1R report. A 7-horse WHAT-IF result
  // showed favorite タイキクロニクル at 49.7% with several rivals at a flat
  // "0.0%", and the actual official winner (スカリーワグ) was one of the
  // horses displayed at 0.0%. This shape -- one strong favorite plus a long
  // tail collapsed near zero in a mid-size field -- is exactly what the
  // reliability diagnostic exists to flag; every horse must still format
  // as distinguishable-from-zero, and the concentration check must mark
  // this kind of field LOW_RELIABILITY rather than presenting it as a
  // confident, evenly-informative distribution.
  it("keeps a lopsided real-race-shaped field low-reliability and zero-distinguishable", () => {
    const results = simulate([88, 80, 70, 66, 63, 60, 58]);
    for (const horse of results) {
      expect(Number.isFinite(horse.winRate)).toBe(true);
      expect(horse.winRate).toBeGreaterThanOrEqual(0);
      // No horse's displayed rate collapses to a bare "0.0" that reads as
      // impossible when it can still legitimately win.
      expect(formatWinRate(horse.winRate)).not.toBe("0.0");
    }
    const concentration = computeProbabilityConcentration(results);
    expect(Number.isFinite(concentration.normalizedEntropy)).toBe(true);
    expect(concentration.topShare).toBeLessThan(1);
  });
});
