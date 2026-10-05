/**
 * Horse scenario profiles: small, pre-race "how this horse tends to run" terms and how they
 * interact with the course. Built from data that exists before the race only.
 *
 * Deliberately NOT read: official result, closing odds / popularity, publication marks, AI / market
 * probabilities, the model score and `abilities.speed` (the public API carries the model score
 * there), `abilities.form`. Missing data is neutral (edge 0, confidence UNKNOWN). Every
 * compatibility is shrunk towards neutral by its confidence, and the combined effect on the pace of
 * a runner stays inside COMPAT_MIN..COMPAT_MAX.
 */
import type { CourseLayout } from "@/lib/courseAtlas";
import { slopeSpans } from "@/lib/courseSections";
import type { LabHorse } from "@/lib/singlePickAi";

export type Confidence = "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
/** edge: -1 (suits poorly) .. +1 (suits well); 0 = neutral. */
export type Compat = { edge: number; confidence: Confidence; n: number };
export const UNKNOWN_COMPAT: Compat = { edge: 0, confidence: "UNKNOWN", n: 0 };

/** One compatibility moves a runner's pace by at most this much (1.5%); typical combined effects stay within ±2%. */
export const MAX_COMPAT_EFFECT = 0.015;
/** All compatibilities together never leave this band. */
export const COMPAT_MIN = 0.97;
export const COMPAT_MAX = 1.03;
export const CONFIDENCE_WEIGHT: Record<Confidence, number> = { HIGH: 1, MEDIUM: 0.6, LOW: 0.3, UNKNOWN: 0 };

/** Effective sample size → confidence. One start never earns more than UNKNOWN. */
export function confidenceOf(n: number): Confidence {
  if (!Number.isFinite(n) || n < 2) return "UNKNOWN";
  return n >= 8 ? "HIGH" : n >= 4 ? "MEDIUM" : "LOW";
}

export const compat = (edge: number, n: number): Compat => {
  const confidence = confidenceOf(n);
  return confidence === "UNKNOWN" ? UNKNOWN_COMPAT : { edge: Math.max(-1, Math.min(1, edge)), confidence, n };
};

/** Pace multiplier contributed by one compatibility, already shrunk by confidence (±MAX_COMPAT_EFFECT). */
export const compatEffect = (value: Compat): number => 1 + MAX_COMPAT_EFFECT * value.edge * CONFIDENCE_WEIGHT[value.confidence];

/**
 * Per-condition history, when a source provides it. The public race API carries none of this today
 * (every field below is absent), so these compatibilities stay UNKNOWN / neutral; the seam exists so
 * the same shrinkage rules apply the day such data is published. `top3` is a rate 0..1.
 */
export type Slice = { n: number; top3: number };
export type HorseEvidence = {
  overall?: Slice;
  direction?: Partial<Record<"LEFT" | "RIGHT", Slice>>;
  nearDistance?: Slice;
  sameCourse?: Slice;
  slope?: Slice;
  /** Share of corner passings in which the horse kept its position (0..1) and how many passings. */
  cornerKeep?: { n: number; rate: number };
};

export type HorseProfile = {
  no: number;
  /** -1..1: how quickly the horse gets into position out of the gate (gate speed, field-relative). */
  earlyPositionStrength: number;
  cornerStability: Compat;
  straightSustain: Compat;
  /** Not available from the public API: always UNKNOWN. */
  lateAcceleration: Compat;
  distanceCompatibility: Compat;
  /** Condition (going) suitability from the horse's own top-3 rate by going. */
  surfaceCompatibility: Compat;
  turnDirectionCompatibility: Compat;
  courseShapeCompatibility: Compat;
  elevationCompatibility: Compat;
};

export type RaceContext = { distance: number | null; going: string | null; course: CourseLayout };

const num = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);

function zScores(values: Map<number, number>): Map<number, number> {
  const list = Array.from(values.values());
  if (list.length < 4) return new Map();
  const mean = list.reduce((a, b) => a + b, 0) / list.length;
  const sd = Math.sqrt(list.reduce((a, b) => a + (b - mean) ** 2, 0) / list.length);
  if (sd < 1e-9) return new Map();
  return new Map(Array.from(values).map(([no, value]) => [no, Math.max(-1.5, Math.min(1.5, (value - mean) / sd)) / 1.5]));
}

const sliceEdge = (slice: Slice | undefined, overall: Slice | undefined): Compat =>
  slice && overall ? compat((slice.top3 - overall.top3) / 0.3, slice.n) : UNKNOWN_COMPAT;

/** Own top-3 rate on today's going against the horse's average over the goings it has run on. */
function goingCompat(horse: LabHorse, going: string | null, starts: number | null): Compat {
  const rates = horse.record.going_top3_rates;
  if (!going || !rates || typeof rates !== "object" || starts === null) return UNKNOWN_COMPAT;
  const table = rates as Record<string, unknown>;
  const today = num(table[going]);
  const others = Object.entries(table).filter(([key]) => key !== going).map(([, value]) => num(value)).filter((value): value is number => value !== null);
  if (today === null || others.length === 0) return UNKNOWN_COMPAT;
  const mean = others.reduce((a, b) => a + b, 0) / others.length;
  // The per-going sample size is not published: assume half the starts at most for the going of the day.
  return compat((today - mean) / 30, Math.min(starts, 10) * (going === "良" ? 1 : 0.5));
}

export function buildHorseProfiles(horses: LabHorse[], context: RaceContext, evidence?: Map<number, HorseEvidence>): Map<number, HorseProfile> {
  const active = horses.filter(horse => typeof horse.no === "number" && !horse.withdrawn);
  const startZ = zScores(new Map(active.flatMap(horse => { const v = num(horse.abilities.start); return v === null ? [] : [[horse.no as number, v] as [number, number]]; })));
  const staminaZ = zScores(new Map(active.flatMap(horse => { const v = num(horse.abilities.stamina); return v === null ? [] : [[horse.no as number, v] as [number, number]]; })));
  const longDistance = context.distance === null ? 0 : Math.max(0, Math.min(1, (context.distance - 1400) / 1000));
  const hasSlope = !!context.course.elevationProfile || slopeSpans(context.course).length > 0;
  const direction = context.course.direction === "LEFT" || context.course.direction === "RIGHT" ? context.course.direction : null;
  const profiles = new Map<number, HorseProfile>();

  for (const horse of active) {
    const no = horse.no as number;
    const starts = num(horse.record.starts);
    const ev = evidence?.get(no);
    // Stamina-derived terms share one underlying signal, so they also share its confidence.
    const stamina = staminaZ.get(no);
    const sustain = stamina === undefined || starts === null ? UNKNOWN_COMPAT : compat(stamina, starts);
    profiles.set(no, {
      no,
      earlyPositionStrength: startZ.get(no) !== undefined && starts !== null && confidenceOf(starts) !== "UNKNOWN" ? (startZ.get(no) as number) * CONFIDENCE_WEIGHT[confidenceOf(starts)] : 0,
      cornerStability: ev?.cornerKeep ? compat((ev.cornerKeep.rate - 0.5) / 0.3, ev.cornerKeep.n) : UNKNOWN_COMPAT,
      straightSustain: sustain,
      lateAcceleration: UNKNOWN_COMPAT,
      distanceCompatibility: ev ? sliceEdge(ev.nearDistance, ev.overall) : sustain.confidence === "UNKNOWN" ? UNKNOWN_COMPAT : { ...sustain, edge: sustain.edge * longDistance },
      surfaceCompatibility: goingCompat(horse, context.going, starts),
      turnDirectionCompatibility: direction && ev ? sliceEdge(ev.direction?.[direction], ev.overall) : UNKNOWN_COMPAT,
      courseShapeCompatibility: ev ? sliceEdge(ev.sameCourse, ev.overall) : UNKNOWN_COMPAT,
      elevationCompatibility: hasSlope && ev ? sliceEdge(ev.slope, ev.overall) : UNKNOWN_COMPAT,
    });
  }
  return profiles;
}

export const NEUTRAL_PROFILE = (no: number): HorseProfile => ({
  no, earlyPositionStrength: 0, cornerStability: UNKNOWN_COMPAT, straightSustain: UNKNOWN_COMPAT, lateAcceleration: UNKNOWN_COMPAT,
  distanceCompatibility: UNKNOWN_COMPAT, surfaceCompatibility: UNKNOWN_COMPAT, turnDirectionCompatibility: UNKNOWN_COMPAT,
  courseShapeCompatibility: UNKNOWN_COMPAT, elevationCompatibility: UNKNOWN_COMPAT,
});

/**
 * Where on the course each compatibility applies (all 0..1), from the terrain at the runner's
 * position. Combined pace multiplier = product of the shrunk effects weighted by these, clamped.
 */
/** `late` ramps 0 → 1 over the second half of the race: distance (stamina) only shows late. */
export type CompatContext = { turn: number; straight: number; slope: number; longStraight: number; severity: number; late: number };

export function compatMultiplier(profile: HorseProfile, at: CompatContext): number {
  const sum =
    (compatEffect(profile.distanceCompatibility) - 1) * at.late +
    (compatEffect(profile.surfaceCompatibility) - 1) +
    (compatEffect(profile.straightSustain) - 1) * at.straight * at.longStraight +
    (compatEffect(profile.cornerStability) - 1) * at.turn * at.severity +
    (compatEffect(profile.turnDirectionCompatibility) - 1) * at.turn +
    (compatEffect(profile.courseShapeCompatibility) - 1) +
    (compatEffect(profile.elevationCompatibility) - 1) * at.slope;
  return Math.min(COMPAT_MAX, Math.max(COMPAT_MIN, 1 + sum));
}

export type FitMark = "◎" | "○" | "△" | "－";
/** COURSE FIT label for the UI: a reference mark only, never a win / advantage claim. */
export function fitMark(value: Compat): FitMark {
  if (value.confidence === "UNKNOWN") return "－";
  const score = value.edge * CONFIDENCE_WEIGHT[value.confidence];
  return score >= 0.35 ? "◎" : score >= 0.05 ? "○" : score > -0.2 ? "－" : "△";
}
