/**
 * Cosmetic lane motion for the drawn runners. Inputs: horse number, published run style, the
 * race_key seed, scenario progress and the course geometry. It never changes a runner's course
 * progress (so the SCENARIO ORDER is untouched) and reads no market, probability, pick or
 * result data. Same race_key -> identical motion.
 */
import { seededUnit, type ScenarioStyle } from "@/lib/scenarioReplay";

export const LANE_MIN = -0.6;
export const LANE_MAX = 3.6;

const smooth = (x: number) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };

export type MotionInput = {
  no: number;
  style: ScenarioStyle;
  /** Lane from the scenario frame (rail = 0). */
  baseLane: number;
  progress: number;
  seed: number;
  /** 0 on straights, 1 inside corners (courseSections.turnness). */
  turn: number;
  /** 1 on the home straight (courseSections.straightness). */
  straight: number;
  /** Course-tempo factor on the lane offsets, the same for every runner (terrainTempo). Default 1. */
  spread?: number;
};

/** Front runners hug the rail through a turn, closers swing a little wider. */
const TURN_SHIFT: Record<ScenarioStyle, number> = { 逃げ: -0.3, 先行: -0.15, 差し: 0.1, 追込: 0.22, 不明: 0 };

export function cosmeticLane(input: MotionInput): number {
  const { no, style, baseLane, progress, seed, turn, straight, spread = 1 } = input;
  // The drift eases (but never stops) through the home straight, while the field widens a little
  // towards the line; both are lane-only and never touch course progress or the order.
  const calm = 1 - smooth((progress - 0.8) / 0.2);
  const homeSpread = smooth((progress - 0.8) / 0.15);
  const amp = 0.14 + seededUnit(seed, no, 11) * 0.16;
  const freq = 1.1 + seededUnit(seed, no, 12) * 1.6;
  const phase = seededUnit(seed, no, 13) * Math.PI * 2;
  const drift = Math.sin(progress * freq * Math.PI * 2 + phase) * amp * (0.4 + 0.6 * calm);
  const spacing = (seededUnit(seed, no, 14) - 0.5) * 0.12;
  const squeezed = baseLane * (1 - 0.2 * turn);
  const widened = squeezed * (1 + 0.22 * straight * calm + 0.3 * straight * homeSpread);
  const lane = widened + TURN_SHIFT[style] * turn + drift + spacing;
  return Math.min(LANE_MAX, Math.max(LANE_MIN, lane * spread));
}
