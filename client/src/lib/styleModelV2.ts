/**
 * Style Model V2: how a published run style shapes the field's formation.
 *
 * A style is a lead / lag against the field in lap units (positive = ahead). It is driven by the PHYSICAL
 * position of a reference runner (one that only feels the terrain) through physical course sections, not by
 * scenario time:
 *
 *   START, EARLY, BACKSTRETCH, THIRD TURN, FINAL TURN, HOME STRAIGHT, GOAL
 *
 * Every style converges smoothly (zero slope) to level at the goal, so terrain can reorder nothing at the line:
 * a pace tilt is the only thing left there. The section knots of the final approach come from the Course Atlas;
 * when the Atlas cannot say (straight course, unknown sections) fixed fractions are used.
 *
 * Reads only the style, the assumed pace and the Course Atlas. No horse data, odds, picks or results.
 */
import type { CourseLayout } from "@/lib/courseAtlas";
import { courseShare, sectionAt } from "@/lib/courseSections";
import type { Pace, ScenarioStyle } from "@/lib/scenarioReplay";

/** Peak lead (+) / lag (-) of each style over the field, in lap units. */
export const STYLE_PEAK: Record<ScenarioStyle, number> = { 逃げ: 0.04, 先行: 0.02, 差し: -0.03, 追込: -0.055, 不明: 0 };
/** A slow pace spreads the formation less, a fast one more. */
export const PACE_SPREAD: Record<Pace, number> = { スロー: 0.7, 平均: 1, ハイ: 1.3 };
/**
 * What is left of the style gap at the line. The average pace converges every style to level; a slow pace
 * keeps the front slightly ahead, a fast pace favours the closers.
 */
export const PACE_TILT: Record<Pace, Record<ScenarioStyle, number>> = {
  スロー: { 逃げ: 0.002, 先行: 0.0015, 差し: -0.002, 追込: -0.0035, 不明: 0 },
  平均: { 逃げ: 0, 先行: 0, 差し: 0, 追込: 0, 不明: 0 },
  ハイ: { 逃げ: -0.006, 先行: -0.0025, 差し: 0.0015, 追込: 0.0035, 不明: 0 },
};

const clamp = (value: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, value));
const smooth = (x: number) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };

/** Lap positions (0..1 of the race) where the final approach sections start. */
export type Approach = { back: number; third: number; final: number; home: number; known: boolean };
const DEFAULT_APPROACH: Approach = { back: 0.3, third: 0.55, final: 0.72, home: 0.85, known: false };

/**
 * Where the last BACKSTRETCH / THIRD TURN / FINAL TURN / HOME STRAIGHT start along the race, read from the
 * Course Atlas by walking the race backwards. Falls back to fixed fractions when the Atlas cannot say
 * (straight course, unknown sections, a home straight covering most of the race, odd layouts).
 */
export function approachOf(course: CourseLayout): Approach {
  if (!course.pathClosed || course.venue === "UNKNOWN") return { ...DEFAULT_APPROACH };
  const N = 1000;
  const id = (k: number) => (k / N < 0.05 ? "START" : sectionAt(course, courseShare(course, k / N), 1));
  const runStart = (from: number) => { let j = from; const target = id(from); while (j > 0 && id(j - 1) === target) j -= 1; return j; };
  if (id(N) !== "HOME_STRAIGHT") return { ...DEFAULT_APPROACH };
  const homeStart = runStart(N);
  if (homeStart / N < 0.5) return { ...DEFAULT_APPROACH };
  const finalFrom = homeStart - 1;
  if (finalFrom < 0 || id(finalFrom) !== "FINAL_TURN") return { ...DEFAULT_APPROACH };
  const finalStart = runStart(finalFrom);
  const thirdFrom = finalStart - 1;
  if (thirdFrom < 0 || id(thirdFrom) !== "THIRD_TURN") return { ...DEFAULT_APPROACH };
  const thirdStart = runStart(thirdFrom);
  const backFrom = thirdStart - 1;
  const backStart = backFrom >= 0 && id(backFrom) === "BACKSTRETCH" ? runStart(backFrom) : Math.max(0, thirdStart - 120);
  const out = { back: backStart / N, third: thirdStart / N, final: finalStart / N, home: homeStart / N, known: true };
  // Keep the knots ordered and apart even on odd layouts.
  const gap = 0.03;
  if (!(out.back + gap <= out.third && out.third + gap <= out.final && out.final + gap <= out.home && out.back >= 0.1)) return { ...DEFAULT_APPROACH };
  return out;
}

/** Shape of the style gap at START / EARLY / BACKSTRETCH / THIRD TURN / FINAL TURN / HOME STRAIGHT (1 = the full peak). Goal = 0. */
type Knots = readonly [start: number, early: number, back: number, third: number, final: number, home: number];
const SHAPE: Record<ScenarioStyle, Knots> = {
  逃げ: [0.55, 1.0, 1.0, 0.9, 0.6, 0.2],
  先行: [0.45, 0.9, 1.0, 0.95, 0.7, 0.25],
  差し: [0.4, 0.85, 1.0, 1.0, 0.8, 0.3],
  追込: [0.4, 0.85, 1.0, 1.0, 0.6, 0.15],
  不明: [0, 0, 0, 0, 0, 0],
};

/** Smooth interpolation through (x, y) knots (smoothstep between neighbours: no steps, zero slope at every knot). */
function through(xs: readonly number[], ys: readonly number[], x: number): number {
  if (x <= xs[0]) return ys[0];
  for (let i = 1; i < xs.length; i++) if (x <= xs[i]) return ys[i - 1] + (ys[i] - ys[i - 1]) * smooth((x - xs[i - 1]) / (xs[i] - xs[i - 1]));
  return ys[ys.length - 1];
}

export type StyleCurve = (lap: number) => number;

/** Style gap (lap units, positive = ahead) as a function of the reference runner's lap, from the physical sections. */
export function styleCurve(o: { style: ScenarioStyle; pace: Pace; approach: Approach }): StyleCurve {
  const { style, pace, approach } = o;
  const peak = STYLE_PEAK[style] * PACE_SPREAD[pace];
  const tilt = PACE_TILT[pace][style];
  const k = SHAPE[style];
  const earlyX = Math.min(0.22, approach.back - 0.02);
  const xs = [0, Math.min(0.05, earlyX / 2), earlyX, approach.back, approach.third, approach.final, approach.home, 1];
  const ys = [0, k[0], k[1], k[2], k[3], k[4], k[5], 0];
  return lap => peak * through(xs, ys, lap) + tilt * smooth((lap - approach.final) / (1 - approach.final));
}
