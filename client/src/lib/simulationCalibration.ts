import type { Horse, HorseDataSources, InputSource } from "@/pages/Home";

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

export type { HorseDataSources };
