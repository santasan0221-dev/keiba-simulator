/**
 * Terrain tempo: the course's own effect on the pace of the WHOLE field, built only from the
 * Course Atlas (elevation, slopes, corners, straight length, first-corner distance, chute start).
 * Every runner gets the same profile; nothing here reads horses, odds, picks or results.
 * Unknown course data is neutral (tempo 1, no effect) -- nothing is guessed.
 */
import type { CourseLayout } from "@/lib/courseAtlas";
import { slopeSpans, straightness, turnness } from "@/lib/courseSections";

/** Hard limits of the terrain multiplier (uphill slows, downhill speeds up, never extreme). */
export const TEMPO_MIN = 0.94;
export const TEMPO_MAX = 1.06;
const TABLE = 256;
/** Tempo change per unit gradient (metres of rise per metre run). */
const GRADE_GAIN = 4;

export type TerrainEffectId = "UPHILL" | "DOWNHILL" | "CORNER_3_4" | "TIGHT_TURN" | "LONG_STRAIGHT" | "CHUTE_MERGE" | "SHORT_RUN_TO_FIRST_CORNER";
export type TerrainEffect = { id: TerrainEffectId; label: string };
export const TERRAIN_NOTE = "コース形状によるシナリオテンポです。馬券評価ではありません。";

export type TerrainProfile = {
  /** True when the Atlas knows nothing usable: every function returns its neutral value. */
  neutral: boolean;
  /** Speed multiplier for the whole field at a course share (TEMPO_MIN..TEMPO_MAX). */
  tempoAt: (share: number) => number;
  /** 1 where the terrain is a noticeable up / down slope, else 0 (corner slowdown is not a slope). */
  slopeAt: (share: number) => number;
  /** 0..1: how hard the pack is squeezed together here (corners). */
  compressAt: (share: number) => number;
  /** 0..1: how much the pack stretches out here (long home straight). */
  spreadAt: (share: number) => number;
  /** 0..1 at the gate, fading to 0 once the field has sorted itself out (short run to the first corner / chute start). */
  earlyCompressAt: (lap: number) => number;
  /** 0..1: how tight the corners of this course are (small loop = high). */
  cornerSeverity: number;
  effects: TerrainEffect[];
};

const clamp = (value: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, value));

const NEUTRAL: TerrainProfile = {
  neutral: true, tempoAt: () => 1, slopeAt: () => 0, compressAt: () => 0, spreadAt: () => 0, earlyCompressAt: () => 0, cornerSeverity: 0, effects: [],
};

/** Tight (small) loops squeeze harder than the wide Tokyo / Niigata ovals. Unknown loop length → middle. */
function severityOf(course: CourseLayout): number {
  return typeof course.lapMeters === "number" ? clamp((2100 - course.lapMeters) / 700, 0.15, 1) : 0.5;
}

/** Gradient (rise per metre) at `share`, from the section-view profile when the Atlas has one. */
function gradeTable(course: CourseLayout): Float32Array | null {
  const profile = course.elevationProfile;
  const length = course.pathClosed ? course.lapMeters : course.homeStraightMeters;
  if (!profile || profile.length < 2 || typeof length !== "number") return null;
  const heightAt = (share: number) => {
    if (share <= profile[0].at) return profile[0].meters;
    for (let i = 1; i < profile.length; i++) {
      if (share <= profile[i].at) {
        const a = profile[i - 1], b = profile[i];
        return b.at === a.at ? b.meters : a.meters + ((b.meters - a.meters) * (share - a.at)) / (b.at - a.at);
      }
    }
    return profile[profile.length - 1].meters;
  };
  const table = new Float32Array(TABLE + 1);
  const window = 0.02;
  for (let i = 0; i <= TABLE; i++) {
    const share = i / TABLE;
    const lo = Math.max(0, share - window), hi = Math.min(1, share + window);
    table[i] = hi > lo ? (heightAt(hi) - heightAt(lo)) / ((hi - lo) * length) : 0;
  }
  return table;
}

/** Tempo multiplier table from the Atlas: a section profile, else the slopes the page names. */
function tempoTable(course: CourseLayout): { table: Float32Array; uphill: boolean; downhill: boolean } {
  const table = new Float32Array(TABLE + 1).fill(1);
  let uphill = false, downhill = false;
  const grades = gradeTable(course);
  if (grades) {
    for (let i = 0; i <= TABLE; i++) {
      const tempo = clamp(1 - grades[i] * GRADE_GAIN, TEMPO_MIN, TEMPO_MAX);
      table[i] = tempo;
      if (tempo < 0.992) uphill = true;
      if (tempo > 1.008) downhill = true;
    }
    return { table, uphill, downhill };
  }
  for (const span of slopeSpans(course)) {
    const rise = typeof span.riseMeters === "number" ? span.riseMeters : 1;
    const delta = Math.min(TEMPO_MAX - 1, rise * 0.012) * (span.kind === "UP" ? -1 : 1);
    if (span.kind === "UP") uphill = true; else downhill = true;
    for (let i = 0; i <= TABLE; i++) {
      const share = i / TABLE;
      const edge = Math.min(1, Math.max(0, Math.min(share - span.fromShare, span.toShare - share) / 0.01));
      if (edge > 0) table[i] *= 1 + delta * edge;
    }
  }
  for (let i = 0; i <= TABLE; i++) table[i] = clamp(table[i], TEMPO_MIN, TEMPO_MAX);
  return { table, uphill, downhill };
}

export function terrainProfile(course: CourseLayout): TerrainProfile {
  if (course.venue === "UNKNOWN") return NEUTRAL;
  const { table, uphill, downhill } = tempoTable(course);
  const severity = severityOf(course);
  const closed = course.pathClosed;
  const straight = typeof course.homeStraightMeters === "number" ? course.homeStraightMeters : 0;
  const longStraight = closed && straight >= 400 ? clamp((straight - 300) / 300, 0, 1) : 0;
  const firstCorner = typeof course.firstCornerDistanceMeters === "number" ? course.firstCornerDistanceMeters : null;
  const distance = typeof course.distance === "number" ? course.distance : null;
  const chute = course.startOnRing === false;
  // How much of the race the gate-end squeeze lasts, as a share of the distance.
  const earlySpan = distance && (firstCorner !== null || chute) ? clamp(((firstCorner ?? 300) + 100) / distance, 0.05, 0.3) : 0;
  const earlyStrength = chute ? 0.5 : firstCorner !== null && firstCorner < 400 ? 0.4 : 0;

  const tempoAt = (share: number) => table[Math.round(clamp(share, 0, 1) * TABLE)] * (1 - 0.012 * severity * turnness(course, share));
  const effects: TerrainEffect[] = [];
  if (uphill) effects.push({ id: "UPHILL", label: "上り" });
  if (downhill) effects.push({ id: "DOWNHILL", label: "下り" });
  if (closed && course.direction !== "UNKNOWN") effects.push({ id: "CORNER_3_4", label: "3〜4角" });
  if (closed && severity >= 0.55) effects.push({ id: "TIGHT_TURN", label: "小回り" });
  if (longStraight > 0) effects.push({ id: "LONG_STRAIGHT", label: "長い直線" });
  if (chute) effects.push({ id: "CHUTE_MERGE", label: "シュート合流" });
  if (!chute && firstCorner !== null && firstCorner < 400) effects.push({ id: "SHORT_RUN_TO_FIRST_CORNER", label: "初角まで短い" });

  return {
    neutral: false,
    tempoAt,
    slopeAt: share => Math.abs(table[Math.round(clamp(share, 0, 1) * TABLE)] - 1) > 0.008 ? 1 : 0,
    compressAt: share => closed ? turnness(course, share) * severity : 0,
    spreadAt: share => longStraight * straightness(course, share) * (closed ? 1 : 0),
    earlyCompressAt: lap => earlySpan > 0 ? earlyStrength * (1 - clamp(lap / earlySpan, 0, 1)) : 0,
    cornerSeverity: closed ? severity : 0,
    effects,
  };
}
