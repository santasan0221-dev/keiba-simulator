import type { Horse, HorseDataSources, InputSource } from "@/lib/horseTypes";
import type { ScenarioProvenance } from "@/lib/scenarioProvenance";

export type SimulationCalibration = {
  abilityConfidence: number;
  goingConfidence: number;
  noiseMagnitude: number;
};

const SOURCE_CONFIDENCE: Record<InputSource, number> = {
  "v23k実値": 1,
  "as-of履歴実値": 0.82,
  "暫定値": 0.32,
  "未取得": 0.18,
};

const ABILITY_FIELDS = ["speed", "stamina", "start", "form"] as const;

const sourceConfidence = (source: InputSource | undefined, fallback: InputSource = "暫定値") => SOURCE_CONFIDENCE[source ?? fallback];

const defaultSourceForField = (horse: Horse, field: (typeof ABILITY_FIELDS)[number]): InputSource => {
  // Legacy/sample horses predate provenance metadata; their speed value is an
  // authored model input, while the other ability fields remain provisional.
  return !horse.dataSources && field === "speed" ? "v23k実値" : "暫定値";
};

export const calibratedAbilityValue = (
  horse: Horse,
  field: (typeof ABILITY_FIELDS)[number],
  baseline = 70,
) => {
  const confidence = sourceConfidence(horse.dataSources?.[field], defaultSourceForField(horse, field));
  return baseline + (horse[field] - baseline) * confidence;
};

export const getSimulationCalibration = (horse: Horse): SimulationCalibration => {
  const sources = horse.dataSources;
  const abilityConfidence = ABILITY_FIELDS.reduce(
    (total, field) => total + sourceConfidence(sources?.[field], defaultSourceForField(horse, field)),
    0,
  ) / ABILITY_FIELDS.length;
  const goingConfidence = sourceConfidence(sources?.goingRates?.良);
  // Provisional inputs should widen—not cosmetically smooth—the simulated
  // distribution. The 20-point floor preserves the prior calibration for
  // fully known fields; incomplete ability mapping adds up to 18 points.
  const noiseMagnitude = 20 + (1 - abilityConfidence) * 18;
  return { abilityConfidence, goingConfidence, noiseMagnitude };
};

export const getCalibratedAbilitySources = (horse: Horse) => ({
  speed: calibratedAbilityValue(horse, "speed"),
  stamina: calibratedAbilityValue(horse, "stamina"),
  start: calibratedAbilityValue(horse, "start"),
  form: calibratedAbilityValue(horse, "form"),
});

export const formatWinRate = (value: number) => value >= 0 && value < 0.1 ? "<0.1" : value.toFixed(1);

// WHAT-IF is a browser-side sandbox, not the calibrated single_pick_ai
// probability -- see AI TRUTH PANEL / SIMULATION_DISCLAIMER for that
// separation. This module only judges whether the WHAT-IF distribution
// ITSELF has collapsed onto a favorite in a way that overstates confidence
// (e.g. several horses showing exactly 0% while one shows ~50%), and flags
// that presentation risk. It is never a statement about real-world accuracy.
export type ConcentrationReliability = "LOW_RELIABILITY" | "NORMAL";

export type ProbabilityConcentration = {
  entropyBits: number;
  /** 0 (single horse "certain") to 1 (uniform field). */
  normalizedEntropy: number;
  /** Win-rate share of the single most-favored horse, 0-1. */
  topShare: number;
  reliability: ConcentrationReliability;
};

// A field this lopsided (entropy well below uniform) is exactly the shape
// that produces misleadingly-precise "0.0%" rows for real contenders; below
// this normalized-entropy threshold the UI should visibly flag the output
// as low-reliability rather than let raw numbers imply false certainty.
// Half of the information-theoretic maximum spread: a defensible round
// cutoff, verified against the reported failure case (49.7/35.7/14.5/0.1
// plus six horses at exactly 0%, normalizedEntropy ~0.435) and a uniform
// field (normalizedEntropy = 1.0) landing on the expected sides of it.
const LOW_RELIABILITY_ENTROPY_THRESHOLD = 0.5;

export function computeProbabilityConcentration(
  results: ReadonlyArray<{ winRate: number }>,
): ProbabilityConcentration {
  const total = results.reduce((sum, horse) => sum + Math.max(0, horse.winRate), 0);
  if (results.length === 0 || total <= 0) {
    return { entropyBits: 0, normalizedEntropy: 0, topShare: 0, reliability: "LOW_RELIABILITY" };
  }
  const probabilities = results.map((horse) => Math.max(0, horse.winRate) / total);
  const entropyBits = -probabilities.reduce(
    (sum, p) => (p > 0 ? sum + p * Math.log2(p) : sum), 0,
  );
  const maxEntropy = Math.log2(results.length);
  const normalizedEntropy = maxEntropy > 0 ? entropyBits / maxEntropy : 0;
  const topShare = Math.max(...probabilities);
  const reliability: ConcentrationReliability =
    normalizedEntropy < LOW_RELIABILITY_ENTROPY_THRESHOLD ? "LOW_RELIABILITY" : "NORMAL";
  return { entropyBits, normalizedEntropy, topShare, reliability };
}

// Reliability-diagram diagnostic: bins saved WHAT-IF scenarios (only those
// captured from a real single_pick_ai race with a CONFIRMED official
// result) by predicted win-rate, and reports the empirical win rate within
// each bin. This measures whether WHAT-IF's own numbers have historically
// tracked outcomes -- it does NOT calibrate or correct WHAT-IF output, and
// must never feed EV/NO BET or formal candidate selection.
export type CalibrationBinResult = {
  binLabel: string;
  predictedRangeLow: number;
  predictedRangeHigh: number;
  sampleCount: number;
  empiricalWinRate: number | null;
};

export type WhatIfCalibrationDiagnostic = {
  eligibleScenarioCount: number;
  totalSampleCount: number;
  bins: CalibrationBinResult[];
};

export type CalibrationSnapshot = {
  results: ReadonlyArray<{ no: number; winRate: number }>;
  provenance?: ScenarioProvenance;
};

const CALIBRATION_BIN_WIDTH = 10;
const CALIBRATION_BIN_COUNT = 100 / CALIBRATION_BIN_WIDTH;

export function computeWhatIfCalibrationDiagnostic(
  history: ReadonlyArray<CalibrationSnapshot>,
): WhatIfCalibrationDiagnostic {
  const bins = Array.from({ length: CALIBRATION_BIN_COUNT }, (_, index) => ({
    low: index * CALIBRATION_BIN_WIDTH,
    high: (index + 1) * CALIBRATION_BIN_WIDTH,
    hits: 0,
    count: 0,
  }));

  let eligibleScenarioCount = 0;
  for (const snapshot of history) {
    const provenance = snapshot.provenance;
    if (!provenance || provenance.kind !== "single_pick_ai") continue;
    const officialResult = provenance.officialResult;
    if (!officialResult || officialResult.status !== "CONFIRMED") continue;
    const winnerNo = officialResult.official_order?.find((entry) => entry.finish === 1)?.horse_no;
    if (winnerNo === undefined || winnerNo === null) continue;
    eligibleScenarioCount += 1;
    for (const horse of snapshot.results) {
      const clamped = Math.min(100 - Number.EPSILON, Math.max(0, horse.winRate));
      const binIndex = Math.min(bins.length - 1, Math.floor(clamped / CALIBRATION_BIN_WIDTH));
      bins[binIndex].count += 1;
      if (horse.no === winnerNo) bins[binIndex].hits += 1;
    }
  }

  const totalSampleCount = bins.reduce((sum, bin) => sum + bin.count, 0);
  return {
    eligibleScenarioCount,
    totalSampleCount,
    bins: bins.map((bin) => ({
      binLabel: `${bin.low}-${bin.high}%`,
      predictedRangeLow: bin.low,
      predictedRangeHigh: bin.high,
      sampleCount: bin.count,
      empiricalWinRate: bin.count > 0 ? (bin.hits / bin.count) * 100 : null,
    })),
  };
}

export type { HorseDataSources };
