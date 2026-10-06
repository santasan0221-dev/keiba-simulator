/**
 * Seeded scenario noise. No Math.random: every value is a hash of race_key + scenario variant (through
 * the seed) + runner + section, so the same race and variant replay identically and another variant is
 * another, slightly different run. One value per section, smoothly interpolated along the race: nothing
 * changes per frame. Every value is symmetric around zero, so no runner and no horse number gets a
 * lasting plus or minus.
 */
import { seededUnit } from "@/lib/scenarioReplay";

/** The noise sections along the race distance and their size (a share of the runner's pace). Max +-3%. */
export const NOISE_SECTIONS = [
  { id: "START_REACTION", at: 0.02, amplitude: 0.03 },
  { id: "EARLY_POSITIONING", at: 0.13, amplitude: 0.025 },
  { id: "CORNER_TRAFFIC_1", at: 0.3, amplitude: 0.02 },
  { id: "PACK_COMPRESSION", at: 0.5, amplitude: 0.02 },
  { id: "CORNER_TRAFFIC_2", at: 0.7, amplitude: 0.02 },
  { id: "STRAIGHT_RESPONSE", at: 0.88, amplitude: 0.03 },
  { id: "FINISH_DASH", at: 1, amplitude: 0.02 },
] as const;
export const MAX_NOISE = 0.03;
/** How much of the previous section's value carries into the next: a good rhythm lasts a while. */
const NOISE_CARRY = 0.6;

const smooth = (x: number) => x * x * (3 - 2 * x);

/** The per-section noise values of one runner (each already scaled to its amplitude, within +-amplitude). */
export function noiseKnots(seed: number, no: number): number[] {
  let carry = 0;
  return NOISE_SECTIONS.map((section, index) => {
    const unit = Math.max(-1, Math.min(1, NOISE_CARRY * carry + Math.sqrt(1 - NOISE_CARRY ** 2) * (seededUnit(seed, no, 100 + index) * 2 - 1)));
    carry = unit;
    return unit * section.amplitude;
  });
}

/** Pace multiplier offset (within +-MAX_NOISE) of a runner at race fraction `lap`, interpolated between section values. */
export function noiseAt(knots: readonly number[], lap: number): number {
  if (lap <= NOISE_SECTIONS[0].at) return knots[0];
  for (let i = 1; i < NOISE_SECTIONS.length; i++) {
    const b = NOISE_SECTIONS[i];
    if (lap <= b.at) {
      const a = NOISE_SECTIONS[i - 1];
      return knots[i - 1] + (knots[i] - knots[i - 1]) * smooth((lap - a.at) / (b.at - a.at));
    }
  }
  return knots[knots.length - 1];
}
