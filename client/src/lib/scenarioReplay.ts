/**
 * Formation SCENARIO for the research simulator.
 *
 * Built only from each runner's published run style (逃げ/先行/差し/追込)
 * and an assumed pace chosen by the viewer. It reads no speed, stamina,
 * ability score or probability and computes no win probability. The scenario
 * runs through the finish line, so it has a virtual CROSSING ORDER; that order
 * is an artefact of the drawn style formation, never a predicted finishing
 * order. It is an illustration -- RESEARCH_ONLY, never telemetry.
 */
export const PHASES = ["START", "EARLY", "BACKSTRETCH", "TURN", "FINAL", "FINISH"] as const;
export type Phase = (typeof PHASES)[number];
export type Pace = "スロー" | "平均" | "ハイ";
export type ScenarioStyle = "逃げ" | "先行" | "差し" | "追込" | "不明";

export const PHASE_LABEL: Record<Phase, string> = {
  START: "スタート", EARLY: "序盤", BACKSTRETCH: "向正面", TURN: "3〜4コーナー", FINAL: "直線", FINISH: "ゴール",
};

/** Share of the lap completed by the leading group at each phase (0 = start, 1 = finish line). */
export const PHASE_PROGRESS: Record<Phase, number> = { START: 0.02, EARLY: 0.2, BACKSTRETCH: 0.45, TURN: 0.68, FINAL: 0.88, FINISH: 1 };

/** Typical lengths behind the front of the field per style and phase (average pace). */
const GAP: Record<Exclude<ScenarioStyle, "不明">, Record<Exclude<Phase, "FINISH">, number>> = {
  逃げ: { START: 0.5, EARLY: 0, BACKSTRETCH: 0, TURN: 0, FINAL: 0.8 },
  先行: { START: 1, EARLY: 2, BACKSTRETCH: 2.5, TURN: 1.5, FINAL: 0.8 },
  差し: { START: 1.5, EARLY: 5, BACKSTRETCH: 6, TURN: 4, FINAL: 1.6 },
  追込: { START: 2, EARLY: 8, BACKSTRETCH: 9.5, TURN: 7, FINAL: 2.8 },
};
const PACE_SPREAD: Record<Pace, number> = { スロー: 0.7, 平均: 1, ハイ: 1.35 };

/**
 * How much of its FINAL gap each style keeps at the line, by assumed pace. Style and pace only: a slow
 * pace keeps the front group together, a high pace lets the closers gain and the front runners fade.
 * No ability, odds or result enters; this is the whole of the home-straight "kick".
 *
 * Calibrated against the 100-race audit (scripts/scenario_calibration_audit.ts): at the average pace
 * every style group ends within 0.40..0.60 of the field on average, so run style alone no longer decides
 * the order at the line. The earlier table (average: 0.75 / 0.70 / 0.62 / 0.62) left the closers last and
 * the front-runners first in the average pace, which also leaned the scenario towards well-known horses
 * (they more often have a known front style). The pace still tilts the order by design: front-runners
 * gain in a slow pace, closers in a fast one.
 */
const FINISH_KEEP: Record<Pace, Record<ScenarioStyle, number>> = {
  スロー: { 逃げ: 0.9, 先行: 1, 差し: 0.8, 追込: 0.5, 不明: 0.5 },
  平均: { 逃げ: 1.25, 先行: 1, 差し: 0.5, 追込: 0.3, 不明: 0.29 },
  ハイ: { 逃げ: 0.5, 先行: 0.9, 差し: 0.37, 追込: 0.19, 不明: 0.26 },
};
/** Soft cap (lengths) on the gap at the line. With OFFSET_MAX and the terrain spacing it keeps the last runner crossing before 100%. */
const GAP_CAP = 3;

/** Seed used when a caller supplies none: fixed, so a missing seed never changes the picture between runs. */
const FALLBACK_SEED = 0x5eed5eed;
const ORDER_SALT = 31;

/**
 * Place of each runner inside its own run-style group (0 = front of the group). The place comes from a
 * deterministic hash of (seed, runner number), so it carries no information about the horse number: the
 * seed is built from race_key (+ scenario variant), the same inputs always give the same places, and a
 * different race or variant reshuffles them. Nothing about the runner itself (ability, market, pick,
 * result) is read.
 */
function styleSlots(runners: ScenarioRunner[], seed: number): Map<number, number> {
  const slots = new Map<number, number>();
  for (const style of Array.from(new Set(runners.map(runner => runner.style)))) {
    const group = runners.filter(runner => runner.style === style).sort((a, b) => seededUnit(seed, a.no, ORDER_SALT) - seededUnit(seed, b.no, ORDER_SALT) || a.no - b.no);
    group.forEach((runner, index) => slots.set(runner.no, index));
  }
  return slots;
}

export type ScenarioRunner = { no: number; name: string | null; style: ScenarioStyle };
export type ScenarioGroup = "前団" | "中団" | "後方" | "脚質不明";
export type ScenarioPosition = ScenarioRunner & { lengthsBehind: number; group: ScenarioGroup };

export function normalizeStyle(value: string | null | undefined): ScenarioStyle {
  if (value === "追込" || value === "追い込み") return "追込";
  if (value === "逃げ" || value === "先行" || value === "差し") return value;
  return "不明";
}

/**
 * Formation at one phase, front to back. Runners of the same style are
 * spaced by a seeded order (race_key + variant + runner), never by horse
 * number, so the picture is deterministic and the order inside a style
 * group carries no information about the horse.
 */
export function formationAt(runners: ScenarioRunner[], phase: Phase, pace: Pace, seed: number = FALLBACK_SEED): ScenarioPosition[] {
  if (phase === "FINISH") {
    // The gaps at the line: the FINAL gaps scaled by style and pace, then softly capped (tanh is
    // strictly increasing, so the order of the gaps is never changed by the cap).
    return formationAt(runners, "FINAL", pace, seed).map(entry => {
      const lengthsBehind = Math.round(GAP_CAP * Math.tanh((entry.lengthsBehind * FINISH_KEEP[pace][entry.style]) / GAP_CAP) * 1000) / 1000;
      const group: ScenarioGroup = entry.style === "不明" ? "脚質不明" : lengthsBehind < 2.5 ? "前団" : lengthsBehind < 6 ? "中団" : "後方";
      return { ...entry, lengthsBehind, group };
    }).sort((a, b) => a.lengthsBehind - b.lengthsBehind || a.no - b.no);
  }
  const spread = PACE_SPREAD[pace];
  const slot = styleSlots(runners, seed);
  const positions = [...runners].sort((a, b) => a.no - b.no).map(runner => {
    const index = slot.get(runner.no) ?? 0;
    const base = runner.style === "不明" ? GAP.先行[phase] + 2 : GAP[runner.style][phase];
    const fade = pace === "ハイ" && runner.style === "逃げ" && phase === "FINAL" ? 1.5 : 0;
    const lengthsBehind = Math.round((base * spread + fade + index * 0.45) * 10) / 10;
    const group: ScenarioGroup = runner.style === "不明" ? "脚質不明" : lengthsBehind < 2.5 ? "前団" : lengthsBehind < 6 ? "中団" : "後方";
    return { ...runner, lengthsBehind, group };
  });
  return positions.sort((a, b) => a.lengthsBehind - b.lengthsBehind || a.no - b.no);
}

// ------------------------------------------------------------ timeline
//
// Continuous SCENARIO MOTION. Scenario progress t runs 0..1 (it is not race
// time). Phase labels cover fixed windows; each phase's formation is a
// keyframe and runners glide between neighbouring keyframes. The only inputs
// are run style, the assumed pace and a race_key seed used for cosmetic
// spacing -- the seed never changes the order in which runners cross the line.

/** Label windows on the scenario progress axis. */
export const PHASE_WINDOWS: Record<Phase, readonly [number, number]> = {
  START: [0, 0.1], EARLY: [0.1, 0.3], BACKSTRETCH: [0.3, 0.55], TURN: [0.55, 0.75], FINAL: [0.75, 0.95], FINISH: [0.95, 1],
};
/** Where each phase's formation is exact (keyframe) on the progress axis. */
export const PHASE_KEYFRAME: Record<Phase, number> = { START: 0, EARLY: 0.2, BACKSTRETCH: 0.425, TURN: 0.65, FINAL: 0.85, FINISH: 1 };
/** Where the formation of the line (FINISH) is exact. It is settled just before the first runner crosses. */
export const FORMATION_KEYFRAME: Record<Phase, number> = { ...PHASE_KEYFRAME, FINISH: 0.93 };
/** Progress rate of the pack front over the early part of the scenario (share of the race per unit progress). */
export const FRONT_RATE = 0.985;
/** From here the front accelerates through the home straight and runs on past the line. */
const RUN_IN_FROM = 0.75;
/** Share of the race the front has covered at 100%: past the line, so every runner crosses. */
export const FRONT_END = 1.08;
/** Speed of the front at 100% as a share of its early speed: the field runs on, it does not stop dead. */
const END_SPEED = 0.5;

/** Course progress of the pack front at scenario progress t. Smooth (Hermite) and strictly increasing. */
export function frontAt(t: number): number {
  const value = clamp01(t);
  if (value <= RUN_IN_FROM) return value * FRONT_RATE;
  const span = 1 - RUN_IN_FROM;
  const u = (value - RUN_IN_FROM) / span;
  const p0 = RUN_IN_FROM * FRONT_RATE, m0 = FRONT_RATE * span, m1 = END_SPEED * FRONT_RATE * span;
  return (2 * u ** 3 - 3 * u ** 2 + 1) * p0 + (u ** 3 - 2 * u ** 2 + u) * m0 + (-2 * u ** 3 + 3 * u ** 2) * FRONT_END + (u ** 3 - u ** 2) * m1;
}

export function phaseAt(t: number): Phase {
  const value = clamp01(t);
  return PHASES.find(phase => value < PHASE_WINDOWS[phase][1]) ?? "FINISH";
}

/** The default scenario variant. Its seed is exactly scenarioSeed(race_key), so existing pictures are unchanged. */
export const STANDARD_VARIANT = "STANDARD";
/** The scenario variants of one race: the same race_key with another variant is another (slightly different) run. */
export const VARIANTS = ["STANDARD", "ALT_A", "ALT_B"] as const;
export type ScenarioVariant = (typeof VARIANTS)[number];

/**
 * Seed for one scenario variant of one race. STANDARD is scenarioSeed(race_key); any other variant mixes
 * its name into the key, so a different variant can reorder runners inside a style group while the same
 * (race_key, variant) always reproduces the same scenario.
 */
export function scenarioSeedFor(key: string | null | undefined, variant: string = STANDARD_VARIANT): number {
  return variant === STANDARD_VARIANT ? scenarioSeed(key) : scenarioSeed(`${key ?? "demo"}|${variant}`);
}

/** Stable 32-bit seed from a race_key (FNV-1a). Same key → same picture, every replay. */
export function scenarioSeed(key: string | null | undefined): number {
  let hash = 0x811c9dc5;
  for (const char of key ?? "demo") { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 0x01000193) >>> 0; }
  return hash >>> 0;
}

/** Deterministic 0..1 value from (seed, horse number, salt). Cosmetic spacing only. */
export function seededUnit(seed: number, no: number, salt: number): number {
  let x = (seed ^ Math.imul(no + 1, 0x9e3779b1) ^ Math.imul(salt, 0x85ebca6b)) >>> 0;
  x ^= x >>> 15; x = Math.imul(x, 0x2c1b3c6d) >>> 0; x ^= x >>> 12; x = Math.imul(x, 0x297a2d39) >>> 0; x ^= x >>> 15;
  return (x >>> 0) / 0xffffffff;
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
const smooth = (value: number) => value * value * (3 - 2 * value);

/**
 * Largest shift (share of the race) the per-runner offsets may add to or take from a runner's position.
 * FRONT_END - 1 - (capped gap * terrain spacing) - OFFSET_MAX stays above 0, so every runner still crosses
 * before 100%, and the leader never runs on past FRONT_END + OFFSET_MAX.
 */
export const OFFSET_MAX = 0.025;

/**
 * Optional fields the scenario modules accept without knowing where they come from (`id` only keys caches):
 *  - `scale`  one factor on every runner's gap to the front (the course tempo). One number per progress
 *             value, the same for all runners, so it changes the spacing but never who is ahead.
 *  - `offset` a shift of one runner's position at a progress value (pre-race horse profile + seeded noise),
 *             already clamped to +-OFFSET_MAX by its builder. This is the only per-runner input.
 */
export type GapField = { id: string; scale: (progress: number) => number; offset?: (no: number, progress: number) => number };

export type FrameRunner = ScenarioRunner & {
  /** Share of the race covered; past 1 the runner is beyond the line. Illustrative, not a measured position. */
  lap: number;
  /** Lane offset from the rail (0 = rail). Cosmetic; carries no ranking. */
  lane: number;
  lengthsBehind: number;
};
export type ScenarioFrame = { progress: number; phase: Phase; runners: FrameRunner[] };

const LANE: Record<ScenarioStyle, number> = { 逃げ: 0, 先行: 1, 差し: 2, 追込: 3, 不明: 3 };
/** Lap share per length, for drawing only. */
export const LENGTH_SHARE = 0.013;

type Prepared = {
  nos: number[];
  /** Lap of runner index i at progress t (not rounded), and the same for a whole frame. */
  lapAt: (i: number, t: number) => number;
  frame: (t: number) => ScenarioFrame;
};

const preparedCache = new WeakMap<ScenarioRunner[], Map<string, Prepared>>();

/**
 * Everything about a field that does not depend on the progress value, computed once: the six phase
 * formations, the cosmetic spacing and the lanes. A frame is then a handful of lookups. Cached per
 * (runners array, pace, seed, field); runner arrays are treated as immutable.
 */
function prepare(runners: ScenarioRunner[], pace: Pace, seed: number, gapField?: GapField): Prepared {
  const key = `${pace}|${seed}|${gapField?.id ?? "-"}`;
  let perRunners = preparedCache.get(runners);
  if (!perRunners) { perRunners = new Map(); preparedCache.set(runners, perRunners); }
  const hit = perRunners.get(key);
  if (hit) return hit;

  const sorted = [...runners].sort((x, y) => x.no - y.no);
  const index = new Map(sorted.map((runner, i) => [runner.no, i]));
  const formation = new Map(PHASES.map(phase => {
    const values = new Float64Array(sorted.length);
    for (const entry of formationAt(runners, phase, pace, seed)) values[index.get(entry.no)!] = entry.lengthsBehind;
    return [phase, values] as const;
  }));
  const stagger = sorted.map(runner => seededUnit(seed, runner.no, 1) * 0.35);
  const lanes = sorted.map(runner => LANE[runner.style] + (seededUnit(seed, runner.no, 2) - 0.5) * 0.7);
  const offset = gapField?.offset;

  const segment = (progress: number) => {
    const next = PHASES.findIndex(phase => progress <= FORMATION_KEYFRAME[phase]);
    const last = PHASES.length - 1;
    const to = PHASES[next < 0 ? last : next];
    const from = PHASES[next < 0 ? last : Math.max(0, next - 1)];
    const span = FORMATION_KEYFRAME[to] - FORMATION_KEYFRAME[from];
    const mix = span > 0 && next >= 0 ? smooth((progress - FORMATION_KEYFRAME[from]) / span) : 1;
    return { a: formation.get(from)!, b: formation.get(to)!, mix };
  };
  const gapOf = (i: number, seg: { a: Float64Array; b: Float64Array; mix: number }, settle: number) =>
    Math.round((seg.a[i] + (seg.b[i] - seg.a[i]) * seg.mix + stagger[i] * settle) * 1000) / 1000;
  const settleAt = (progress: number) => 1 - smooth(clamp01((progress - 0.65) / (PHASE_KEYFRAME.FINAL - 0.65)));
  const scaleAt = (progress: number) => (gapField ? Math.max(0.5, Math.min(1.5, gapField.scale(progress))) : 1);

  const lapAt = (i: number, t: number) => {
    const progress = clamp01(t);
    const shift = offset ? offset(sorted[i].no, progress) : 0;
    return Math.max(0, frontAt(progress) - gapOf(i, segment(progress), settleAt(progress)) * scaleAt(progress) * LENGTH_SHARE + shift);
  };
  const frame = (t: number): ScenarioFrame => {
    const progress = clamp01(t);
    const seg = segment(progress), settle = settleAt(progress), scale = scaleAt(progress), front = frontAt(progress);
    const out = sorted.map((runner, i) => {
      const lengthsBehind = gapOf(i, seg, settle);
      const shift = offset ? offset(runner.no, progress) : 0;
      return { ...runner, lengthsBehind, lane: lanes[i], lap: Math.max(0, front - lengthsBehind * scale * LENGTH_SHARE + shift) };
    });
    return { progress, phase: phaseAt(progress), runners: out };
  };
  const prepared = { nos: sorted.map(runner => runner.no), lapAt, frame };
  perRunners.set(key, prepared);
  return prepared;
}

/**
 * Scenario formation at progress t, interpolated between phase keyframes.
 * Runners come back in horse-number order (a stable draw order, never a
 * ranking). The optional field adds the course spacing (common to all) and the
 * per-runner offsets (profile + seeded noise); without it the order into the
 * line is style and pace only.
 */
export function scenarioFrame(runners: ScenarioRunner[], t: number, pace: Pace, seed: number, gapField?: GapField): ScenarioFrame {
  return prepare(runners, pace, seed, gapField).frame(t);
}

/**
 * Scenario progress at which each runner's drawn position reaches the line (lap = 1), by bisection.
 * Every runner crosses before 100%. The times come from the drawn lap only.
 */
export function crossingTimes(runners: ScenarioRunner[], pace: Pace, seed: number, gapField?: GapField): Map<number, number> {
  const prepared = prepare(runners, pace, seed, gapField);
  const times = new Map<number, number>();
  prepared.nos.forEach((no, i) => {
    let lo = 0, hi = 1;
    for (let k = 0; k < 28; k++) { const mid = (lo + hi) / 2; if (prepared.lapAt(i, mid) >= 1) hi = mid; else lo = mid; }
    times.set(no, hi);
  });
  return times;
}

/** Generic numbered field for when no race is loaded. Clearly a demo, never real runners. */
export function demoField(): ScenarioRunner[] {
  const styles: ScenarioStyle[] = ["先行", "差し", "逃げ", "差し", "追込", "先行", "差し", "先行", "追込", "差し"];
  return styles.map((style, index) => ({ no: index + 1, name: null, style }));
}
