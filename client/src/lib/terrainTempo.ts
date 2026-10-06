/**
 * Terrain Tempo: the course shape as a tempo that is COMMON TO EVERY RUNNER.
 *
 * Inputs are Course Atlas fields that really exist (elevation profile, corner / section shares,
 * home-straight length, run direction, inner / outer, chute start, first-corner distance) plus the
 * scenario progress. Whatever the Atlas does not hold stays UNKNOWN and produces a neutral effect:
 * nothing is guessed. No runner, horse number, run style, market, probability, published pick or
 * result is an input, so terrain cannot favour or hurt anyone:
 *
 *   paceMultiplier           how fast the whole scenario advances (changes playback time only)
 *   compressionMultiplier    one factor on every runner's gap to the front (the order cannot change)
 *   lateralSpreadMultiplier  one factor on the drawn lane offsets (cosmetic)
 *   cameraEnergy             how briskly the camera follows (cosmetic)
 *
 * The profile is built once per course; a frame only does an interpolated lookup. Pure and
 * deterministic: no Math.random, no Date.now.
 */
import type { CourseLayout } from "@/lib/courseAtlas";
import { courseShare, sectionAt, START_SECTION_UNTIL, straightness, turnness, type SectionId } from "@/lib/courseSections";
import { frontAt, type GapField } from "@/lib/scenarioReplay";

/** Hard bounds on every multiplier. Combined effects are clamped here, so nothing can run away. */
export const TEMPO_BOUNDS = {
  pace: [0.94, 1.06],
  compression: [0.88, 1.12],
  spread: [0.85, 1.15],
  camera: [0.85, 1.15],
} as const;

export type TerrainTempoEffect = {
  paceMultiplier: number;
  compressionMultiplier: number;
  lateralSpreadMultiplier: number;
  cameraEnergy: number;
  /** What the course is doing at the front of the pack right now, or null when nothing notable / unknown. */
  label: TerrainLabel | null;
};
export type TerrainLabel = "CHUTE" | "UPHILL" | "DOWNHILL" | "CORNER" | "BACKSTRETCH" | "LONG_STRAIGHT" | "STRAIGHT";
export const TERRAIN_LABEL_JA: Record<TerrainLabel, string> = {
  CHUTE: "シュート合流", UPHILL: "上り", DOWNHILL: "下り", CORNER: "コーナー", BACKSTRETCH: "向正面", LONG_STRAIGHT: "長い直線", STRAIGHT: "直線",
};
export const TERRAIN_NOTE = "コース形状によるシナリオテンポです。馬ごとの能力評価ではありません。";

export const NEUTRAL_EFFECT: TerrainTempoEffect = { paceMultiplier: 1, compressionMultiplier: 1, lateralSpreadMultiplier: 1, cameraEnergy: 1, label: null };

// ---- strengths (small on purpose). Each is applied to every runner alike.
/** Pace change per 1% of gradient (uphill slows, downhill speeds up the whole scenario). */
const GRADE_PACE = 0.02;
/** Gap change per 1% of gradient (uphill packs the field, downhill lets it stretch). */
const GRADE_GAP = 0.025;
const GRADE_CAMERA = 0.03;
const CORNER_PACE = 0.03;
const CORNER_GAP = 0.08;
const CORNER_SPREAD = 0.1;
const CORNER_CAMERA = 0.06;
const STRAIGHT_SPREAD = 0.12;
const STRAIGHT_GAP = 0.08;
const STRAIGHT_CAMERA = 0.08;
const FIRST_CORNER_PACE = 0.03;
const CHUTE_PACE = 0.03;
/** Home-straight length that counts as neutral, and the span to the full effect. */
const STRAIGHT_REFERENCE_M = 400;
const STRAIGHT_SPAN_M = 200;
/** Gradient (%) from which the label says UPHILL / DOWNHILL. The profile is read to about 0.1 m. */
const GRADE_LABEL_PCT = 0.6;
/** Gradient is measured over this share of the lap (about 100 m on a 1,700 m loop). */
const GRADE_WINDOW = 0.06;
const SAMPLES = 240;
const VARIANT_SEVERITY = { INNER: 1.25, OUTER: 0.85, DEFAULT: 1 } as const;

const clamp = (value: number, [lo, hi]: readonly [number, number] | readonly number[]) => Math.min(hi, Math.max(lo, value));
const clampUnit = (value: number) => Math.min(1, Math.max(-1, value));
const smooth = (x: number) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };

export type TerrainProfile = {
  /** Stable identity of the course for caches and comparisons. */
  key: string;
  course: CourseLayout | null;
  /** Atlas fields the profile actually used (a field not listed was UNKNOWN and is neutral). */
  used: string[];
  closed: boolean;
  chute: boolean;
  firstCornerMeters: number | null;
  straightMeters: number | null;
  /** Per share-of-lap lookup tables, SAMPLES long. */
  grade: Float32Array | null;
  turn: Float32Array;
  straight: Float32Array;
};

const hasRealSections = (course: CourseLayout) =>
  course.pathClosed && course.sectionShares !== "UNKNOWN" && course.sectionBasis !== "STYLIZED" && course.sectionBasis !== "UNKNOWN";

/** Linear elevation (m) at lap share s; a closed loop wraps back to its first point. */
function elevationAt(points: { at: number; meters: number }[], s: number, closed: boolean): number {
  const list = closed ? [...points, { at: points[0].at + 1, meters: points[0].meters }] : points;
  let x = s;
  if (closed) x = ((s - points[0].at) % 1 + 1) % 1 + points[0].at;
  else x = Math.min(list[list.length - 1].at, Math.max(list[0].at, s));
  for (let i = 1; i < list.length; i++) {
    if (x <= list[i].at) {
      const a = list[i - 1], b = list[i];
      const span = b.at - a.at;
      return span > 0 ? a.meters + ((b.meters - a.meters) * (x - a.at)) / span : b.meters;
    }
  }
  return list[list.length - 1].meters;
}

/** Everything the Atlas can honestly say about this course, as lookup tables. A null course is neutral. */
export function buildTerrainProfile(course: CourseLayout | null): TerrainProfile {
  const neutral = (key: string): TerrainProfile => ({ key, course, used: [], closed: true, chute: false, firstCornerMeters: null, straightMeters: null, grade: null, turn: new Float32Array(SAMPLES), straight: new Float32Array(SAMPLES) });
  if (!course) return neutral("none");
  const key = `${course.venue}|${course.surface}|${course.distance}|${course.variant}`;
  const used: string[] = [];
  const closed = course.pathClosed;

  const lengthMeters = closed ? course.lapMeters : course.homeStraightMeters;
  let grade: Float32Array | null = null;
  const profile = course.elevationProfile;
  if (profile && profile.length >= 2 && typeof lengthMeters === "number") {
    grade = new Float32Array(SAMPLES);
    for (let i = 0; i < SAMPLES; i++) {
      const s = i / SAMPLES;
      const a = closed ? s - GRADE_WINDOW / 2 : Math.max(0, s - GRADE_WINDOW / 2);
      const b = closed ? s + GRADE_WINDOW / 2 : Math.min(1, s + GRADE_WINDOW / 2);
      grade[i] = b > a ? ((elevationAt(profile, b, closed) - elevationAt(profile, a, closed)) / ((b - a) * lengthMeters)) * 100 : 0;
    }
    used.push("elevationProfile");
  }

  const turn = new Float32Array(SAMPLES), straight = new Float32Array(SAMPLES);
  if (!closed) {
    straight.fill(1);
    used.push("pathClosed=false (straight course)");
  } else if (hasRealSections(course)) {
    for (let i = 0; i < SAMPLES; i++) { const s = i / SAMPLES; turn[i] = turnness(course, s); straight[i] = straightness(course, s); }
    used.push("sectionShares");
  }

  const straightMeters = typeof course.homeStraightMeters === "number" ? course.homeStraightMeters : null;
  if (straightMeters !== null) used.push("homeStraightMeters");
  const chute = course.startOnRing === false;
  if (chute) used.push("startOnRing=false (chute)");
  const firstCornerMeters = typeof course.firstCornerDistanceMeters === "number" ? course.firstCornerDistanceMeters : null;
  if (firstCornerMeters !== null) used.push("firstCornerDistanceMeters");
  if (course.variant === "INNER" || course.variant === "OUTER") used.push(`variant=${course.variant}`);
  return { key, course, used, closed, chute, firstCornerMeters, straightMeters, grade, turn, straight };
}

/** Table lookup with linear interpolation; a closed course wraps, an open one clamps. */
function lookup(table: Float32Array, share: number, closed: boolean): number {
  const n = table.length;
  const pos = closed ? (((share % 1) + 1) % 1) * n : Math.min(1, Math.max(0, share)) * (n - 1);
  const i = Math.floor(pos);
  const f = pos - i;
  const a = table[Math.min(n - 1, i)], b = table[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
  return a + (b - a) * f;
}

/**
 * The tempo at scenario progress `progress`: where the front of the pack is on the course decides
 * the effect (a runner never does). One lookup per call, no allocation besides the result.
 */
export function tempoAt(profile: TerrainProfile, progress: number): TerrainTempoEffect {
  const course = profile.course;
  if (!course || profile.used.length === 0) return NEUTRAL_EFFECT;
  const share = courseShare(course, frontAt(progress));
  const grade = profile.grade ? lookup(profile.grade, share, profile.closed) : 0;
  const turn = lookup(profile.turn, share, profile.closed);
  const straight = lookup(profile.straight, share, profile.closed);
  const severity = course.variant === "INNER" || course.variant === "OUTER" ? VARIANT_SEVERITY[course.variant] : 1;
  const longStraight = profile.straightMeters === null ? 0 : clampUnit((profile.straightMeters - STRAIGHT_REFERENCE_M) / STRAIGHT_SPAN_M);

  let pace = 1 - GRADE_PACE * grade - CORNER_PACE * severity * turn;
  let gap = (1 - GRADE_GAP * grade) * (1 - CORNER_GAP * severity * turn) * (1 + STRAIGHT_GAP * longStraight * straight);
  let spread = (1 - CORNER_SPREAD * severity * turn) * (1 + STRAIGHT_SPREAD * longStraight * straight);
  let camera = (1 - GRADE_CAMERA * grade) * (1 + CORNER_CAMERA * turn) * (1 - STRAIGHT_CAMERA * longStraight * straight);

  // The start: a chute start runs a touch slower while the field settles; a known first-corner
  // distance sets the early pace (long run to the first corner = slower early, short = brisker).
  const early = 1 - smooth(progress / START_SECTION_UNTIL);
  if (profile.chute) pace -= CHUTE_PACE * early;
  if (profile.firstCornerMeters !== null) pace -= FIRST_CORNER_PACE * clampUnit((profile.firstCornerMeters - 350) / 250) * (1 - smooth((progress - 0.05) / 0.2));

  let label: TerrainLabel | null = null;
  if (profile.chute && progress < START_SECTION_UNTIL) label = "CHUTE";
  else if (grade >= GRADE_LABEL_PCT) label = "UPHILL";
  else if (grade <= -GRADE_LABEL_PCT) label = "DOWNHILL";
  else if (turn >= 0.5) label = "CORNER";
  else if (profile.closed && profile.used.includes("sectionShares")) {
    const section: SectionId = sectionAt(course, share, progress);
    label = section === "BACKSTRETCH" ? "BACKSTRETCH" : section === "HOME_STRAIGHT" ? (longStraight >= 0.5 ? "LONG_STRAIGHT" : "STRAIGHT") : null;
  } else if (!profile.closed) label = "STRAIGHT";

  return {
    paceMultiplier: clamp(pace, TEMPO_BOUNDS.pace),
    compressionMultiplier: clamp(gap, TEMPO_BOUNDS.compression),
    lateralSpreadMultiplier: clamp(spread, TEMPO_BOUNDS.spread),
    cameraEnergy: clamp(camera, TEMPO_BOUNDS.camera),
    label,
  };
}

/** The gap scale as an opaque field for the scenario modules (they never see the Atlas). Same for every runner. */
export function gapFieldOf(profile: TerrainProfile): GapField | undefined {
  return profile.used.length === 0 ? undefined : { id: profile.key, scale: progress => tempoAt(profile, progress).compressionMultiplier };
}

export type TerrainSegment = { from: number; to: number; type: TerrainLabel };

/** Where on the scenario progress axis each terrain effect applies, by sampling the same lookups. Nothing the Atlas lacks appears. */
export function terrainTimeline(profile: TerrainProfile, steps = 400): TerrainSegment[] {
  const out: TerrainSegment[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const label = tempoAt(profile, t).label;
    const last = out[out.length - 1];
    if (!label) continue;
    if (last && last.type === label && Math.abs(last.to - (i - 1) / steps) < 1e-9) last.to = t;
    else out.push({ from: t, to: t, type: label });
  }
  return out;
}

/**
 * Playback length at 1x as a multiple of the base length: the time to cover progress 0..1 when the
 * scenario advances at paceMultiplier. 1 = the base length; a hilly course reads a little above 1.
 */
export function durationScale(profile: TerrainProfile, steps = 400): number {
  let total = 0;
  for (let i = 0; i < steps; i++) total += 1 / tempoAt(profile, (i + 0.5) / steps).paceMultiplier / steps;
  return total;
}

/** Share of the playback time spent in each section (sums to 1), from the same pace lookups. */
export function sectionDurations(profile: TerrainProfile, steps = 400): Record<SectionId, number> {
  const out: Record<SectionId, number> = { START: 0, FIRST_TURN: 0, BACKSTRETCH: 0, THIRD_TURN: 0, FINAL_TURN: 0, HOME_STRAIGHT: 0 };
  const course = profile.course;
  let total = 0;
  for (let i = 0; i < steps; i++) {
    const t = (i + 0.5) / steps;
    const dt = 1 / tempoAt(profile, t).paceMultiplier / steps;
    const section: SectionId = course ? sectionAt(course, courseShare(course, frontAt(t)), t) : "HOME_STRAIGHT";
    out[section] += dt;
    total += dt;
  }
  (Object.keys(out) as SectionId[]).forEach(id => { out[id] = total ? out[id] / total : 0; });
  return out;
}

/** A compact tempo fingerprint of a course, for comparing courses and for the evidence report. */
export function tempoSummary(profile: TerrainProfile, steps = 400) {
  const effects = Array.from({ length: steps + 1 }, (_, i) => tempoAt(profile, i / steps));
  const range = (pick: (e: TerrainTempoEffect) => number) => { const v = effects.map(pick); return { min: Math.min(...v), max: Math.max(...v), mean: v.reduce((a, b) => a + b, 0) / v.length }; };
  return { key: profile.key, used: profile.used, durationScale: durationScale(profile, steps), pace: range(e => e.paceMultiplier), compression: range(e => e.compressionMultiplier), spread: range(e => e.lateralSpreadMultiplier), camera: range(e => e.cameraEnergy) };
}
