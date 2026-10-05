/**
 * SCENARIO simulation: a precomputed run of the whole field, goal line included.
 *
 *   pace of runner = style/pace base × terrain tempo × horse–course compatibility × seeded noise
 *
 * Built once when a race is loaded (or the variant / pace changes); the animation only looks the
 * result up. Inputs: published run style, assumed pace, the Course Atlas, small pre-race horse
 * profiles (lib/horseScenarioProfile) and race_key + variant seeded noise (lib/scenarioNoise).
 * It reads no official result, closing odds, popularity, publication mark, AI / market probability
 * or post-race data, and its crossing order is a virtual outcome of the scenario, never a forecast.
 */
import type { CourseLayout } from "@/lib/courseAtlas";
import { courseShare } from "@/lib/courseSections";
import { compatMultiplier, NEUTRAL_PROFILE, type HorseProfile } from "@/lib/horseScenarioProfile";
import { noiseAt, noiseKnots } from "@/lib/scenarioNoise";
import {
  scenarioSeed, seededUnit, PHASES,
  type FrameRunner, type Pace, type Phase, type ScenarioFrame, type ScenarioRunner, type ScenarioStyle, type ScenarioVariant,
} from "@/lib/scenarioReplay";
import { terrainProfile, type TerrainProfile } from "@/lib/terrainTempo";

/** Scenario seconds the front of the field needs for the race (not race time; never shown). */
const BASE_SECONDS = 100;
const STEP_SECONDS = 0.25;
/** Lap share a runner may run on past the goal line, and the scenario seconds shown after the last crossing. */
export const RUNOUT_LAP = 0.06;
const RUNOUT_SECONDS = 3;
const SAMPLES = 1000;
const MAX_STEPS = 4000;
/** How strongly corners pull the pack together / a long straight stretches it (lap share closed per lap run). */
const COMPRESS_PULL = 0.3;
const SPREAD_PUSH = 0.3;

export const PHASE_LAP_WINDOWS: Record<Phase, readonly [number, number]> = {
  START: [0, 0.1], EARLY: [0.1, 0.3], BACKSTRETCH: [0.3, 0.55], TURN: [0.55, 0.75], FINAL: [0.75, 0.95], FINISH: [0.95, Infinity],
};
/** Leader lap at which each phase's keyframe (rail button / reduced-motion step) sits. FINISH = the leader's goal crossing. */
export const PHASE_KEY_LAP: Record<Phase, number> = { START: 0, EARLY: 0.2, BACKSTRETCH: 0.425, TURN: 0.65, FINAL: 0.85, FINISH: 1 };

const clamp = (value: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, value));
const smooth = (x: number) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };

/** Where the style puts the runner against the field, in lap units (positive = ahead), at scenario time share u. */
const STYLE_PEAK: Record<ScenarioStyle, number> = { 逃げ: 0.04, 先行: 0.02, 差し: -0.03, 追込: -0.055, 不明: 0 };
const PACE_SPREAD: Record<Pace, number> = { スロー: 0.7, 平均: 1, ハイ: 1.3 };
/** What is left of the style gap at the line: a slow pace keeps the front ahead, a fast one favours the closers. */
const PACE_RESIDUAL: Record<Pace, Record<ScenarioStyle, number>> = {
  スロー: { 逃げ: 0.004, 先行: 0.0025, 差し: -0.002, 追込: -0.004, 不明: 0 },
  平均: { 逃げ: 0.002, 先行: 0.001, 差し: 0, 追込: -0.0005, 不明: 0 },
  ハイ: { 逃げ: -0.004, 先行: -0.0015, 差し: 0.0015, 追込: 0.003, 不明: 0 },
};
const LANE: Record<ScenarioStyle, number> = { 逃げ: 0, 先行: 1, 差し: 2, 追込: 3, 不明: 3 };

function styleOffset(style: ScenarioStyle, pace: Pace, u: number): number {
  const bump = smooth(u / 0.3) * (1 - smooth((u - 0.6) / 0.4));
  return STYLE_PEAK[style] * PACE_SPREAD[pace] * bump + PACE_RESIDUAL[pace][style] * smooth((u - 0.7) / 0.3);
}

export type SimInput = {
  raceKey: string | null | undefined;
  variant: ScenarioVariant;
  runners: ScenarioRunner[];
  /** Pre-race horse profiles by horse number; a runner without one is neutral. */
  profiles?: Map<number, HorseProfile>;
  course: CourseLayout;
  pace: Pace;
};

export type Sim = {
  variant: ScenarioVariant;
  seed: number;
  terrain: TerrainProfile;
  /** Horse numbers in ascending order (the index of every per-runner array below). */
  nos: number[];
  /** Progress (0..1) at which each runner passes the goal line. */
  crossT: number[];
  /** Horse numbers in the order they cross the line. */
  crossOrder: number[];
  /** Progress at which the last runner has crossed: the camera holds from here. */
  allCrossedT: number;
  /** Progress at which the front of the field first reaches `lap`; 1 if it never does. */
  leaderReachT: (lap: number) => number;
  leaderLapAt: (t: number) => number;
  phaseAt: (t: number) => Phase;
  phaseKey: Record<Phase, number>;
  frameAt: (t: number) => ScenarioFrame;
  /** Raw lap of runner index `i` at progress t (diagnostics / ordering). */
  lapOf: (i: number, t: number) => number;
};

export function buildSim(input: SimInput): Sim {
  const { raceKey, variant, pace, course } = input;
  const runners = [...input.runners].sort((a, b) => a.no - b.no);
  const n = runners.length;
  const seed = scenarioSeed(raceKey, variant);
  const terrain = terrainProfile(course);
  const knots = runners.map(runner => noiseKnots(seed, runner.no));
  const profiles = runners.map(runner => input.profiles?.get(runner.no) ?? NEUTRAL_PROFILE(runner.no));
  const laneBase = runners.map(runner => LANE[runner.style] + (seededUnit(seed, runner.no, 2) - 0.5) * 0.7);

  const laps: number[][] = runners.map(() => [0]);
  const lap = new Array<number>(n).fill(0);
  const du = STEP_SECONDS / BASE_SECONDS;
  const crossStep = new Array<number>(n).fill(-1);
  let step = 0;
  let lastCross = -1;
  while (step < MAX_STEPS && n > 0) {
    const u = step * du;
    const mean = lap.reduce((a, b) => a + b, 0) / n;
    for (let i = 0; i < n; i++) {
      const share = courseShare(course, lap[i]);
      const turn = terrain.compressAt(share);
      const compress = Math.min(1, turn + terrain.earlyCompressAt(lap[i]));
      const spread = terrain.spreadAt(share);
      const compatMul = compatMultiplier(profiles[i], { turn: terrain.cornerSeverity ? terrain.compressAt(share) / terrain.cornerSeverity : 0, straight: spread, slope: terrain.slopeAt(share), longStraight: 1, severity: terrain.cornerSeverity, late: smooth((lap[i] - 0.4) / 0.4) });
      const start = profiles[i].earlyPositionStrength * 0.01 * (1 - smooth(lap[i] / 0.15));
      const mods = terrain.tempoAt(share) * compatMul * (1 + noiseAt(knots[i], lap[i])) * (1 + start);
      const styleDelta = styleOffset(runners[i].style, pace, u + du) - styleOffset(runners[i].style, pace, u);
      let delta = (du + styleDelta) * mods + (COMPRESS_PULL * compress - SPREAD_PUSH * spread) * (mean - lap[i]) * du;
      // Run-out: ease down towards the end of the run-out zone (zero slope there), so nobody stops dead.
      if (lap[i] >= 1) delta *= Math.max(0.04, 1 - 0.96 * smooth((lap[i] - 1) / RUNOUT_LAP));
      lap[i] = Math.min(1 + RUNOUT_LAP, lap[i] + Math.max(0, delta));
    }
    step += 1;
    for (let i = 0; i < n; i++) {
      laps[i].push(lap[i]);
      if (crossStep[i] < 0 && lap[i] >= 1) {
        const before = laps[i][step - 1];
        crossStep[i] = step - 1 + (1 - before) / Math.max(1e-9, lap[i] - before);
        lastCross = Math.max(lastCross, crossStep[i]);
      }
    }
    if (crossStep.every(value => value >= 0) && step >= lastCross + RUNOUT_SECONDS / STEP_SECONDS) break;
  }

  const totalSteps = Math.max(1, step);
  const crossT = crossStep.map(value => (value < 0 ? 1 : Math.min(1, value / totalSteps)));
  const allCrossedT = n ? Math.max(...crossT) : 1;

  // Resample every runner onto a fixed progress grid so the animation is a plain lookup.
  const grid = laps.map(series => {
    const out = new Float32Array(SAMPLES + 1);
    for (let k = 0; k <= SAMPLES; k++) {
      const position = (k / SAMPLES) * (series.length - 1);
      const i = Math.min(series.length - 2, Math.floor(position));
      out[k] = series.length < 2 ? series[0] : series[i] + (series[i + 1] - series[i]) * (position - i);
    }
    return out;
  });
  const leader = new Float32Array(SAMPLES + 1);
  for (let k = 0; k <= SAMPLES; k++) leader[k] = grid.reduce((best, series) => Math.max(best, series[k]), 0);

  const lapOf = (i: number, t: number) => {
    const position = clamp(t, 0, 1) * SAMPLES;
    const k = Math.min(SAMPLES - 1, Math.floor(position));
    return grid[i][k] + (grid[i][k + 1] - grid[i][k]) * (position - k);
  };
  const leaderLapAt = (t: number) => {
    const position = clamp(t, 0, 1) * SAMPLES;
    const k = Math.min(SAMPLES - 1, Math.floor(position));
    return leader[k] + (leader[k + 1] - leader[k]) * (position - k);
  };
  const leaderReachT = (target: number) => {
    if (target <= 0) return 0;
    const k = leader.findIndex(value => value >= target);
    if (k < 0) return 1;
    if (k === 0) return 0;
    return (k - 1 + (target - leader[k - 1]) / Math.max(1e-9, leader[k] - leader[k - 1])) / SAMPLES;
  };
  const phaseAt = (t: number): Phase => {
    const value = leaderLapAt(t);
    return PHASES.find(phase => value < PHASE_LAP_WINDOWS[phase][1]) ?? "FINISH";
  };
  const phaseKey = Object.fromEntries(PHASES.map(phase => [phase, leaderReachT(PHASE_KEY_LAP[phase])])) as Record<Phase, number>;

  const order = runners.map((runner, i) => ({ no: runner.no, t: crossT[i] })).sort((a, b) => a.t - b.t || a.no - b.no);

  const frameAt = (t: number): ScenarioFrame => {
    const progress = clamp(Number.isFinite(t) ? t : 0, 0, 1);
    const front = leaderLapAt(progress);
    const frameRunners: FrameRunner[] = runners.map((runner, i) => {
      const value = lapOf(i, progress);
      return { ...runner, lap: value, lane: laneBase[i], lengthsBehind: Math.round(((front - value) / 0.013) * 1000) / 1000, crossed: progress >= crossT[i] };
    });
    return { progress, phase: phaseAt(progress), runners: frameRunners };
  };

  return { variant, seed, terrain, nos: runners.map(runner => runner.no), crossT, crossOrder: order.map(entry => entry.no), allCrossedT, leaderReachT, leaderLapAt, phaseAt, phaseKey, frameAt, lapOf };
}
