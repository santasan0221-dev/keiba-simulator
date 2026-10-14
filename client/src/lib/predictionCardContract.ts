// Normalized API DTO, copied from single_pick_ai's canonical prediction_card_v1.
export interface CardMark { rank: number; symbol: string; horse_no: number; horse_name: string; short: string | null; medium: string | null; evidence: string | null; unknown: string[] }
export interface PredictionCard {
  version: "prediction_card_v1"; status: "OK" | "UNAVAILABLE"; title: string;
  race: {race_key: string; title: string; organization: string}; marks: CardMark[];
  explanation: {available: boolean}; pairwise: {upper: number; lower: number; text: string}[];
  selectivity: {grade: string; label: string} | null; disclaimer: string;
  source_versions: {six_marks_version: string | null; explanation_version: string | null; selectivity_version: string | null};
}
