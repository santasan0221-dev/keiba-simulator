/**
 * Horse scenario profile: a few small, pre-race "how this horse has run" terms and how much they are
 * trusted. The only input is a minimal history record read from `record.*` (as-of-history stats that are
 * all dated before the race), so nothing else can reach this module: not the model score or any AI /
 * market probability, not odds or popularity, not published marks, not the result. `abilities.speed` is
 * the model score itself and is never read.
 *
 * Features (nothing else is used; anything absent is neutral, never estimated):
 *   1. start tendency       JRA only, field-relative, at most +-0.5%
 *   2. distance             today's distance-band top-3 rate minus the horse's own overall top-3 rate
 *   3. going                today's going top-3 rate minus the horse's mean over its other goings
 *   4. starts               confidence only
 *   Not published, so always UNKNOWN: same course, turn direction, corner, elevation, late kick.
 *
 * Both fit terms compare a horse with ITSELF, so they say how well today's conditions suit it, not how
 * good it is; a strong horse and a weak horse with the same shape of record get the same edge.
 */
import type { LabHorse } from "@/lib/singlePickAi";

export type Confidence = "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
/** edge: -1 (suits poorly) .. +1 (suits well); 0 = neutral. */
export type Compat = { edge: number; confidence: Confidence; n: number };
export const UNKNOWN_COMPAT: Compat = { edge: 0, confidence: "UNKNOWN", n: 0 };

/** One fit term moves a runner's pace by at most this much (1.0%). */
export const MAX_TERM_EFFECT = 0.01;
/** The start tendency moves it by at most this much (0.5%). */
export const MAX_START_EFFECT = 0.005;
/** All terms together never leave this band. */
export const COMPAT_MIN = 0.985;
export const COMPAT_MAX = 1.015;
export const CONFIDENCE_WEIGHT: Record<Confidence, number> = { HIGH: 1, MEDIUM: 0.6, LOW: 0.3, UNKNOWN: 0 };

/** A top-3 rate gap (percentage points) of this size is a full edge. */
export const DISTANCE_EDGE_SPAN = 30;
export const GOING_EDGE_SPAN = 50;
/**
 * The number of starts behind the distance band / the going of the day is not published. Only a share of
 * the starts is assumed to be on it; the going share is smaller (strong shrinkage). Only `starts` (capped)
 * sets the confidence, never a guessed sample size beyond these shares.
 */
export const DISTANCE_SAMPLE_SHARE = 0.5;
export const GOING_SAMPLE_SHARE = 0.25;
export const SAMPLE_CAP = 10;

/** Effective sample size to confidence. One start never earns more than UNKNOWN. */
export function confidenceOf(n: number): Confidence {
  if (!Number.isFinite(n) || n < 2) return "UNKNOWN";
  return n >= 8 ? "HIGH" : n >= 4 ? "MEDIUM" : "LOW";
}

export const compat = (edge: number, n: number): Compat => {
  const confidence = confidenceOf(n);
  return confidence === "UNKNOWN" ? UNKNOWN_COMPAT : { edge: Math.max(-1, Math.min(1, edge)), confidence, n };
};

/** The pre-race history of one horse, the only thing the profile reads. Rates are percentages (0..100). */
export type HorseHistory = {
  no: number;
  starts: number | null;
  wins: number | null;
  seconds: number | null;
  thirds: number | null;
  /** Top-3 rate in the distance band of today's race (the record's own `distance_band`). */
  distanceBandTop3: number | null;
  /** Top-3 rate by going: 良 / 稍重 / 重 / 不良. */
  goingTop3: Record<string, number | null>;
  /** Share of past starts in which the horse ran at the front early; published for JRA horses only. */
  startFrontRunShare: number | null;
};

const num = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);

/** Reads a horse's history from `record.*` only. A withdrawn horse or one without a number has none. */
export function horseHistoryOf(horse: Pick<LabHorse, "no" | "withdrawn" | "record">): HorseHistory | null {
  if (typeof horse.no !== "number" || horse.withdrawn) return null;
  const record = horse.record ?? {};
  const going = record.going_top3_rates;
  return {
    no: horse.no,
    starts: num(record.starts),
    wins: num(record.wins),
    seconds: num(record.seconds),
    thirds: num(record.thirds),
    distanceBandTop3: num(record.stamina_distance_band_top3),
    goingTop3: going && typeof going === "object" ? Object.fromEntries(Object.entries(going as Record<string, unknown>).map(([key, value]) => [key, num(value)])) : {},
    startFrontRunShare: num(record.start_front_run_share),
  };
}

export type HorseProfile = {
  no: number;
  /** -1..1, field-relative; 0 when not published (always 0 outside JRA). */
  earlyPositionStrength: number;
  distanceCompatibility: Compat;
  /** Going of the day (the horse's own top-3 rate on it against its other goings). */
  surfaceCompatibility: Compat;
  /** Confidence of the history itself, from the number of starts. */
  confidence: Confidence;
  // Not published by the public API: always UNKNOWN / neutral.
  cornerStability: Compat;
  straightSustain: Compat;
  lateAcceleration: Compat;
  turnDirectionCompatibility: Compat;
  courseShapeCompatibility: Compat;
  elevationCompatibility: Compat;
};

export const NEUTRAL_PROFILE = (no: number): HorseProfile => ({
  no, earlyPositionStrength: 0, distanceCompatibility: UNKNOWN_COMPAT, surfaceCompatibility: UNKNOWN_COMPAT, confidence: "UNKNOWN",
  cornerStability: UNKNOWN_COMPAT, straightSustain: UNKNOWN_COMPAT, lateAcceleration: UNKNOWN_COMPAT,
  turnDirectionCompatibility: UNKNOWN_COMPAT, courseShapeCompatibility: UNKNOWN_COMPAT, elevationCompatibility: UNKNOWN_COMPAT,
});

export type RaceContext = { organization: string | null; going: string | null };

const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;

/**
 * The horse's OWN overall top-3 rate in percent, (wins + seconds + thirds) / starts, from its as-of-history record.
 * Data-source contract: this is the only place `wins` / `seconds` / `thirds` are read, and the value is used only as
 * the horse's own baseline that its distance-band rate is compared with. It is never an ability correction on its
 * own, and nothing about the race being simulated (result, odds, marks) can enter it. Null when anything is missing.
 */
export function overallTop3Rate(history: Pick<HorseHistory, "starts" | "wins" | "seconds" | "thirds">): number | null {
  const { starts, wins, seconds, thirds } = history;
  if (starts === null || starts < 1 || wins === null || seconds === null || thirds === null) return null;
  return ((wins + seconds + thirds) / starts) * 100;
}

function distanceCompat(history: HorseHistory): Compat {
  const { starts, distanceBandTop3 } = history;
  const overall = overallTop3Rate(history);
  if (starts === null || overall === null || distanceBandTop3 === null) return UNKNOWN_COMPAT;
  return compat((distanceBandTop3 - overall) / DISTANCE_EDGE_SPAN, Math.min(starts, SAMPLE_CAP) * DISTANCE_SAMPLE_SHARE);
}

function goingCompat(history: HorseHistory, going: string | null): Compat {
  if (!going || history.starts === null) return UNKNOWN_COMPAT;
  const today = history.goingTop3[going];
  const others = Object.entries(history.goingTop3).filter(([key, value]) => key !== going && typeof value === "number").map(([, value]) => value as number);
  if (typeof today !== "number" || others.length === 0) return UNKNOWN_COMPAT;
  return compat((today - mean(others)) / GOING_EDGE_SPAN, Math.min(history.starts, SAMPLE_CAP) * GOING_SAMPLE_SHARE);
}

/** Field-relative z-score of the start tendency, scaled into -1..1. Needs at least four published values. */
function startStrengths(histories: HorseHistory[]): Map<number, number> {
  const published = histories.filter(h => h.startFrontRunShare !== null);
  if (published.length < 4) return new Map();
  const values = published.map(h => h.startFrontRunShare as number);
  const m = mean(values);
  const sd = Math.sqrt(mean(values.map(v => (v - m) ** 2)));
  if (sd < 1e-9) return new Map();
  return new Map(published.map(h => [h.no, Math.max(-1.5, Math.min(1.5, ((h.startFrontRunShare as number) - m) / sd)) / 1.5]));
}

/** Pre-race profiles by horse number. A horse without a history is not in the map (the caller treats it as neutral). */
export function buildHorseProfiles(histories: HorseHistory[], context: RaceContext): Map<number, HorseProfile> {
  const jra = context.organization === "JRA";
  const start = jra ? startStrengths(histories) : new Map<number, number>();
  const profiles = new Map<number, HorseProfile>();
  for (const history of histories) {
    const confidence = history.starts === null ? "UNKNOWN" : confidenceOf(history.starts);
    profiles.set(history.no, {
      ...NEUTRAL_PROFILE(history.no),
      earlyPositionStrength: (start.get(history.no) ?? 0) * CONFIDENCE_WEIGHT[confidence],
      distanceCompatibility: distanceCompat(history),
      surfaceCompatibility: goingCompat(history, context.going),
      confidence,
    });
  }
  return profiles;
}

/** Pace multiplier contributed by one fit term, shrunk by its confidence (+-MAX_TERM_EFFECT at most). */
export const termEffect = (value: Compat): number => MAX_TERM_EFFECT * value.edge * CONFIDENCE_WEIGHT[value.confidence];
/** The start term (+-MAX_START_EFFECT at most). `earlyPositionStrength` is already shrunk by confidence. */
export const startEffect = (profile: HorseProfile): number => MAX_START_EFFECT * profile.earlyPositionStrength;

/**
 * Where in the race each term applies (each 0..1): the start term only at the start, the distance term
 * only in the second half (distance shows late), the going term all the way.
 */
export type CompatAt = { early: number; late: number };

/** Combined pace multiplier of one horse at one place in the race, kept inside COMPAT_MIN..COMPAT_MAX. */
export function compatMultiplier(profile: HorseProfile, at: CompatAt): number {
  const sum = startEffect(profile) * at.early + termEffect(profile.distanceCompatibility) * at.late + termEffect(profile.surfaceCompatibility);
  return Math.min(COMPAT_MAX, Math.max(COMPAT_MIN, 1 + sum));
}
