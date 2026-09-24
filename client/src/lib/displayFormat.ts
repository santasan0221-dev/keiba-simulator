/**
 * Consumer-facing number formatting. One place decides how probabilities,
 * odds, counts and EV read on screen, so the same value never shows as
 * 0.241 on one page and 24.1% on another. Missing or invalid inputs render
 * as "—", never as 0.
 */

const MISSING = "—";
const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/** A probability in [0, 1] as a percent with one decimal ("24.1%"). */
export function formatPercent(probability: number | null | undefined): string {
  if (!isFiniteNumber(probability) || probability < 0 || probability > 1) return MISSING;
  return `${(probability * 100).toFixed(1)}%`;
}

/** A difference of two probabilities, in percentage points with a sign ("+12.3pt"). */
export function formatPointDiff(difference: number | null | undefined): string {
  if (!isFiniteNumber(difference)) return MISSING;
  const points = (difference * 100).toFixed(1);
  if (points === "0.0" || points === "-0.0") return "±0.0pt";
  return difference > 0 ? `+${points}pt` : `−${points.slice(1)}pt`;
}

export function formatOdds(odds: number | null | undefined): string {
  if (!isFiniteNumber(odds) || odds <= 0) return MISSING;
  return `${(Math.round(odds * 10) / 10).toFixed(1)}倍`;
}

export function formatPopularity(popularity: number | null | undefined): string {
  if (!isFiniteNumber(popularity) || popularity <= 0) return MISSING;
  return `${Math.round(popularity)}番人気`;
}

/** Counts are always whole numbers with thousands separators. */
export function formatCount(count: number | null | undefined): string {
  if (!isFiniteNumber(count)) return MISSING;
  return Math.round(count).toLocaleString("ja-JP");
}

export type ExpectedReturnDisplay = { ratio: string; per100Yen: string; tone: "positive" | "neutral" | "negative" };

/**
 * EV (AI win probability × win odds) as the ratio plus a beginner reading:
 * "100円→平均164円" = if the AI probability were right, 100 yen returns 164
 * yen on average. A reference value, not a promise of profit.
 */
export function formatExpectedReturn(expectedReturn: number | null | undefined): ExpectedReturnDisplay | null {
  if (!isFiniteNumber(expectedReturn) || expectedReturn < 0) return null;
  const ratio = expectedReturn.toFixed(2);
  const tone = ratio === "1.00" ? "neutral" : expectedReturn > 1 ? "positive" : "negative";
  return { ratio, per100Yen: `100円→平均${Math.round(expectedReturn * 100)}円`, tone };
}

/** An ISO timestamp as "9/20 14:50" in JST. */
export function formatJstTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
