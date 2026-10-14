import type { PredictionCard } from "./predictionCardContract";
export const predictionCardUiEnabled = (value: unknown = import.meta.env.VITE_PREDICTION_CARD_PUBLIC_ENABLED): boolean => value === "1";
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === "string";
const optionalText = (v: unknown) => v === undefined || v === null || text(v);
const positive = (v: unknown): v is number => Number.isInteger(v) && Number(v) > 0;

/** Validate the existing DTO, never infer reasons, probability or missing fields. */
export function validPredictionCard(value: unknown, raceKey: string | null): value is PredictionCard {
  if (!object(value) || value.version !== "prediction_card_v1" || value.status !== "OK" || !text(value.title) || !text(value.disclaimer)) return false;
  if (!object(value.race) || value.race.race_key !== raceKey || !raceKey || !text(value.race.title) || !["JRA", "NAR"].includes(String(value.race.organization))) return false;
  if (!object(value.source_versions) || value.source_versions.six_marks_version !== "six_marks_v1") return false;
  if (!Array.isArray(value.marks) || ![3, 6].includes(value.marks.length)) return false;
  const symbols = ["◎", "○", "▲", "☆", "△", "△"];
  if (!value.marks.every((m, i) => object(m) && m.rank === i + 1 && m.symbol === symbols[i] && positive(m.horse_no) && text(m.horse_name) && optionalText(m.short) && optionalText(m.medium) && optionalText(m.evidence) && (m.unknown === undefined || (Array.isArray(m.unknown) && m.unknown.every(text))))) return false;
  if (new Set(value.marks.map(m => m.horse_no)).size !== value.marks.length) return false;
  if (value.explanation !== undefined && (!object(value.explanation) || typeof value.explanation.available !== "boolean")) return false;
  if (value.pairwise !== undefined && !Array.isArray(value.pairwise)) return false;
  const nos = new Set(value.marks.map(m => m.horse_no));
  if (Array.isArray(value.pairwise) && !value.pairwise.every(p => object(p) && positive(p.upper) && positive(p.lower) && nos.has(p.upper) && nos.has(p.lower) && text(p.text))) return false;
  if (value.selectivity !== undefined && value.selectivity !== null && (!object(value.selectivity) || !text(value.selectivity.grade) || !text(value.selectivity.label))) return false;
  return true;
}
