import { describe, expect, it } from "vitest";
import {
  computeProbabilityConcentration,
  computeWhatIfCalibrationDiagnostic,
  formatWinRate,
} from "./simulationCalibration";
import type { ScenarioProvenance } from "@/lib/scenarioProvenance";

describe("formatWinRate", () => {
  it("shows <0.1 instead of a misleading 0.0 for near-zero probabilities", () => {
    expect(formatWinRate(0)).toBe("<0.1");
    expect(formatWinRate(0.05)).toBe("<0.1");
    expect(formatWinRate(0.09999)).toBe("<0.1");
  });

  it("shows the normal one-decimal value at and above 0.1", () => {
    expect(formatWinRate(0.1)).toBe("0.1");
    expect(formatWinRate(49.7)).toBe("49.7");
  });
});

describe("computeProbabilityConcentration", () => {
  it("flags LOW_RELIABILITY when the distribution has collapsed onto a favorite", () => {
    // Reproduces the reported case: several horses displayed as exactly 0%.
    const results = [
      { winRate: 49.7 }, { winRate: 35.7 }, { winRate: 14.5 }, { winRate: 0.1 },
      { winRate: 0 }, { winRate: 0 }, { winRate: 0 }, { winRate: 0 }, { winRate: 0 }, { winRate: 0 },
    ];
    const concentration = computeProbabilityConcentration(results);
    expect(concentration.reliability).toBe("LOW_RELIABILITY");
    // ~0.435: well below the uniform-field value of 1.0.
    expect(concentration.normalizedEntropy).toBeCloseTo(0.435, 2);
    expect(concentration.topShare).toBeCloseTo(0.497, 2);
  });

  it("reports NORMAL reliability for a roughly even field", () => {
    const results = Array.from({ length: 10 }, () => ({ winRate: 10 }));
    const concentration = computeProbabilityConcentration(results);
    expect(concentration.reliability).toBe("NORMAL");
    expect(concentration.normalizedEntropy).toBeCloseTo(1, 5);
  });

  it("fails closed to LOW_RELIABILITY on an empty or all-zero field instead of throwing", () => {
    expect(computeProbabilityConcentration([]).reliability).toBe("LOW_RELIABILITY");
    expect(computeProbabilityConcentration([{ winRate: 0 }, { winRate: 0 }]).reliability).toBe("LOW_RELIABILITY");
  });
});

describe("computeWhatIfCalibrationDiagnostic", () => {
  const provenanceWithResult = (winnerNo: number, status = "CONFIRMED"): ScenarioProvenance => ({
    kind: "single_pick_ai",
    source: "single_pick_ai",
    raceKey: "JRA|2026-08-13|園田|01",
    venue: "園田",
    calibrationStatus: "READY",
    asOf: "2026-08-13T00:00:00+09:00",
    capturedAt: "2026-08-13T10:00:00+09:00",
    officialResult: {
      status,
      official_order: [
        { finish: 1, horse_no: winnerNo, horse_name: "winner", popularity: null },
      ],
      ai_pick: null,
      payouts: null,
    },
  });

  it("bins predicted WHAT-IF win rates against the empirical winner outcome", () => {
    const history = [
      { results: [{ no: 1, winRate: 75 }, { no: 2, winRate: 25 }], provenance: provenanceWithResult(1) },
      { results: [{ no: 1, winRate: 75 }, { no: 2, winRate: 25 }], provenance: provenanceWithResult(2) },
      { results: [{ no: 1, winRate: 15 }, { no: 2, winRate: 85 }], provenance: provenanceWithResult(2) },
    ];
    const diagnostic = computeWhatIfCalibrationDiagnostic(history);

    expect(diagnostic.eligibleScenarioCount).toBe(3);
    expect(diagnostic.totalSampleCount).toBe(6);
    const bin70 = diagnostic.bins.find((b) => b.predictedRangeLow === 70);
    // Two horses predicted at 75%: one won, one lost -> empirical 50%.
    expect(bin70?.sampleCount).toBe(2);
    expect(bin70?.empiricalWinRate).toBeCloseTo(50, 5);
    const bin10 = diagnostic.bins.find((b) => b.predictedRangeLow === 10);
    expect(bin10?.sampleCount).toBe(1);
    expect(bin10?.empiricalWinRate).toBeCloseTo(0, 5);
  });

  it("excludes sample-data and unresolved-result scenarios from the diagnostic", () => {
    const history = [
      { results: [{ no: 1, winRate: 60 }], provenance: { kind: "sample" as const, source: "sample" as const, capturedAt: "x" } },
      { results: [{ no: 1, winRate: 60 }], provenance: provenanceWithResult(1, "PENDING") },
      { results: [{ no: 1, winRate: 60 }] },
    ];
    const diagnostic = computeWhatIfCalibrationDiagnostic(history);
    expect(diagnostic.eligibleScenarioCount).toBe(0);
    expect(diagnostic.totalSampleCount).toBe(0);
  });

  it("returns an empty-but-well-formed diagnostic for no history, never fabricating a rate", () => {
    const diagnostic = computeWhatIfCalibrationDiagnostic([]);
    expect(diagnostic.eligibleScenarioCount).toBe(0);
    expect(diagnostic.bins.every((b) => b.empiricalWinRate === null)).toBe(true);
  });
});
