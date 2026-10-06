/**
 * The scenario field: course tempo (common to every runner) plus a small per-runner offset built from
 * the pre-race horse profile and the seeded noise.
 *
 *   progress of a runner = base (style / pace)  x  terrain tempo (common)  x  compatibility  x  noise
 *
 * Terrain tempo acts through the gap scale and the playback speed (terrainTempo). This module adds the
 * last two factors as a position offset: the runner's factor (clamped to RUNNER_MIN..RUNNER_MAX) is
 * integrated along the front of the field, and the running sum is kept inside +-OFFSET_MAX so that every
 * runner still crosses the line before 100% and nobody runs on past the drawn track. The sum is frozen once
 * the front reaches the line (see FREEZE_FRONT).
 *
 * Reads: run style (through the runners), the horse profiles (history only), the course tempo and the
 * seed. Never the official result, odds, popularity, publication marks, AI / market probabilities or the
 * model score. Built once per (race, variant, pace-independent); a frame only does a table lookup.
 */
import { compatMultiplier, type HorseProfile } from "@/lib/horseScenarioProfile";
import { noiseAt, noiseKnots } from "@/lib/scenarioNoise";
import { frontAt, OFFSET_MAX, type GapField, type ScenarioRunner } from "@/lib/scenarioReplay";
import { tempoAt, type TerrainProfile } from "@/lib/terrainTempo";

/** The combined (compatibility x noise) factor of one runner never leaves this band. */
export const RUNNER_MIN = 0.97;
export const RUNNER_MAX = 1.03;
const SAMPLES = 400;
/**
 * The per-runner factors stop acting once the front of the field reaches the line: the offsets are then
 * frozen, so the order the runners cross in is exactly the order of the drawn laps afterwards (the common
 * course spacing cannot reorder anyone), and the crossing numbers shown never disagree with the final frame.
 */
const FREEZE_FRONT = 1;

const clamp = (value: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, value));
const smooth = (x: number) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };

export type FieldInput = {
  terrain: TerrainProfile;
  runners: ScenarioRunner[];
  /** Pre-race profiles by horse number; a runner without one is neutral (noise only). */
  profiles?: Map<number, HorseProfile>;
  /** Variant-aware seed (scenarioSeedFor). */
  seed: number;
  /** Switch the noise off (diagnostics only). */
  noise?: boolean;
};

/** Per-runner factor at race fraction `frontLap`: where in the race decides which terms apply. */
export function runnerFactor(profile: HorseProfile | undefined, knots: readonly number[] | null, frontLap: number): number {
  const compat = profile ? compatMultiplier(profile, { early: 1 - smooth(frontLap / 0.15), late: smooth((frontLap - 0.4) / 0.4) }) : 1;
  const noise = knots ? 1 + noiseAt(knots, frontLap) : 1;
  return clamp(compat * noise, RUNNER_MIN, RUNNER_MAX);
}

/** Integrated position offset of every runner on a fixed progress grid. */
export function offsetTables(input: Pick<FieldInput, "runners" | "profiles" | "seed" | "noise">): Map<number, Float32Array> {
  const tables = new Map<number, Float32Array>();
  const front = Array.from({ length: SAMPLES + 1 }, (_, k) => frontAt(k / SAMPLES));
  for (const runner of input.runners) {
    const knots = input.noise === false ? null : noiseKnots(input.seed, runner.no);
    const profile = input.profiles?.get(runner.no);
    const table = new Float32Array(SAMPLES + 1);
    let offset = 0;
    for (let k = 0; k < SAMPLES; k++) {
      const mid = (front[k] + front[k + 1]) / 2;
      if (mid < FREEZE_FRONT) offset = clamp(offset + (runnerFactor(profile, knots, mid) - 1) * (front[k + 1] - front[k]), -OFFSET_MAX, OFFSET_MAX);
      table[k + 1] = offset;
    }
    tables.set(runner.no, table);
  }
  return tables;
}

const hashOf = (text: string) => { let h = 0x811c9dc5; for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h >>> 0; };

/** The field the scenario modules accept: course spacing + per-runner offsets. Always defined for a non-empty field. */
export function buildScenarioField(input: FieldInput): GapField {
  const tables = offsetTables(input);
  const signature = hashOf(input.runners.map(r => { const p = input.profiles?.get(r.no); return `${r.no}:${r.style}:${p ? [p.earlyPositionStrength, p.distanceCompatibility.edge, p.distanceCompatibility.confidence, p.surfaceCompatibility.edge, p.surfaceCompatibility.confidence].join("/") : "-"}`; }).join("|"));
  const neutralTerrain = input.terrain.used.length === 0;
  return {
    id: `${input.terrain.key}|${input.seed}|${input.noise === false ? "quiet" : "noise"}|${signature}`,
    scale: progress => (neutralTerrain ? 1 : tempoAt(input.terrain, progress).compressionMultiplier),
    offset: (no, progress) => {
      const table = tables.get(no);
      if (!table) return 0;
      const position = clamp(progress, 0, 1) * SAMPLES;
      const k = Math.min(SAMPLES - 1, Math.floor(position));
      return table[k] + (table[k + 1] - table[k]) * (position - k);
    },
  };
}
