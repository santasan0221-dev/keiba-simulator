import type { LabRace } from "@/lib/singlePickAi";

/**
 * single_pick_ai's market probability is the takeout-corrected simple form
 * 0.8 / win odds (scripts/keiba_lab_api.py _market_ev,
 * "simple_corrected_market_prob"). The backend value is used whenever it
 * sent one; this constant only covers horses the backend left unpriced
 * because the AI win probability was missing (odds alone still give a market
 * view). The integration test pins it to the backend's numbers.
 */
export const MARKET_RETURN_RATE = 0.8;

export type HorseMarketRow = {
  no: number | null;
  name: string | null;
  mark: string | null;
  aiRank: number | null;
  /** P(finish == 1), schema v2 `model.win_probability`. Never the legacy win_prob_calibrated column. */
  winProbability: number | null;
  /** P(finish <= 3), schema v2 `model.top3_probability`. */
  top3Probability: number | null;
  winOdds: number | null;
  popularity: number | null;
  marketProbability: number | null;
  /** winProbability − marketProbability; null unless both exist. */
  aiMinusMarket: number | null;
  /** Backend `market_ev.rows[].expected_return` (= win_probability × win odds). */
  expectedReturn: number | null;
};

type MarketEvRow = { no?: unknown; expected_return?: unknown; simple_corrected_market_prob?: unknown };

const probability = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1 ? value : null;
const positive = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;

export function buildHorseMarketRows(race: LabRace): HorseMarketRow[] {
  const evByNo = new Map<number, MarketEvRow>();
  for (const row of (race.market_ev?.rows ?? []) as MarketEvRow[]) {
    if (typeof row.no === "number") evByNo.set(row.no, row);
  }
  return [...race.horses]
    .sort((left, right) => (left.model.ai_rank ?? Number.MAX_SAFE_INTEGER) - (right.model.ai_rank ?? Number.MAX_SAFE_INTEGER))
    .map((horse) => {
      const ev = horse.no === null ? undefined : evByNo.get(horse.no);
      const winProbability = probability(horse.model.win_probability);
      const winOdds = positive(horse.market?.win_odds);
      const marketProbability = probability(ev?.simple_corrected_market_prob) ?? (winOdds === null ? null : Math.min(1, MARKET_RETURN_RATE / winOdds));
      const expectedReturn = winProbability === null ? null : typeof ev?.expected_return === "number" && Number.isFinite(ev.expected_return) ? ev.expected_return : null;
      return {
        no: horse.no,
        name: horse.name,
        mark: horse.display?.final_mark ?? null,
        aiRank: horse.model.ai_rank,
        winProbability,
        top3Probability: probability(horse.model.top3_probability),
        winOdds,
        popularity: positive(horse.market?.popularity),
        marketProbability,
        aiMinusMarket: winProbability !== null && marketProbability !== null ? winProbability - marketProbability : null,
        expectedReturn,
      };
    });
}

/** Latest odds capture time across the field, for the table's freshness line. */
export function oddsCapturedAt(race: LabRace): string | null {
  const times = race.horses.map((horse) => horse.market?.captured_at).filter((value): value is string => Boolean(value));
  return times.sort().at(-1) ?? null;
}
