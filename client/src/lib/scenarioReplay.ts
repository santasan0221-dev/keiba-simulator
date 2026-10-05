/**
 * Shared vocabulary of the research simulator's SCENARIO (types, labels, seeds).
 *
 * The scenario itself is built by lib/scenarioSim: published run style, an assumed pace, the
 * course (Course Atlas terrain), small pre-race horse/course compatibility terms and seeded noise.
 * Nothing here reads the official result, closing odds, publication marks, AI / market
 * probabilities or any post-race information. RESEARCH_ONLY, never telemetry.
 */
export const PHASES = ["START", "EARLY", "BACKSTRETCH", "TURN", "FINAL", "FINISH"] as const;
export type Phase = (typeof PHASES)[number];
export type Pace = "スロー" | "平均" | "ハイ";
export type ScenarioStyle = "逃げ" | "先行" | "差し" | "追込" | "不明";

export const PHASE_LABEL: Record<Phase, string> = {
  START: "スタート", EARLY: "序盤", BACKSTRETCH: "向正面", TURN: "3〜4コーナー", FINAL: "直線", FINISH: "ゴール",
};

export type ScenarioRunner = { no: number; name: string | null; style: ScenarioStyle };
export type ScenarioGroup = "前団" | "中団" | "後方" | "脚質不明" | "ゴール通過後";
export type ScenarioPosition = ScenarioRunner & { lengthsBehind: number; group: ScenarioGroup };

export function normalizeStyle(value: string | null | undefined): ScenarioStyle {
  if (value === "追込" || value === "追い込み") return "追込";
  if (value === "逃げ" || value === "先行" || value === "差し") return value;
  return "不明";
}

/** Scenario variants: same race + same variant replays identically; another variant is another seeded run. */
export const VARIANTS = ["STANDARD", "ALT_A", "ALT_B"] as const;
export type ScenarioVariant = (typeof VARIANTS)[number];
export const VARIANT_LABEL: Record<ScenarioVariant, string> = { STANDARD: "STANDARD", ALT_A: "ALT A", ALT_B: "ALT B" };
export const nextVariant = (variant: ScenarioVariant): ScenarioVariant => VARIANTS[(VARIANTS.indexOf(variant) + 1) % VARIANTS.length];

const fnv = (text: string, start = 0x811c9dc5) => {
  let hash = start;
  for (let i = 0; i < text.length; i++) { hash ^= text.charCodeAt(i); hash = Math.imul(hash, 0x01000193) >>> 0; }
  return hash >>> 0;
};

/**
 * Stable 32-bit seed from a race_key (FNV-1a) and the scenario variant. STANDARD keeps the plain
 * race_key hash. Same key + same variant → same picture, every replay.
 */
export function scenarioSeed(key: string | null | undefined, variant: ScenarioVariant = "STANDARD"): number {
  const base = fnv(key ?? "demo");
  return variant === "STANDARD" ? base : fnv(`|${variant}`, base);
}

/** Deterministic 0..1 value from (seed, horse number, salt). Cosmetic spacing and noise only. */
export function seededUnit(seed: number, no: number, salt: number): number {
  let x = (seed ^ Math.imul(no + 1, 0x9e3779b1) ^ Math.imul(salt, 0x85ebca6b)) >>> 0;
  x ^= x >>> 15; x = Math.imul(x, 0x2c1b3c6d) >>> 0; x ^= x >>> 12; x = Math.imul(x, 0x297a2d39) >>> 0; x ^= x >>> 15;
  return (x >>> 0) / 0xffffffff;
}

export type FrameRunner = ScenarioRunner & {
  /** Share of the race distance covered (1 = goal line, up to 1 + run-out). Illustrative, not a measured position. */
  lap: number;
  /** Lane offset from the rail (0 = rail). Cosmetic; carries no ranking. */
  lane: number;
  lengthsBehind: number;
  /** True once this runner has passed the goal line in the scenario. */
  crossed: boolean;
};
export type ScenarioFrame = { progress: number; phase: Phase; runners: FrameRunner[] };

/** Lap share per length, for drawing only. */
export const LENGTH_SHARE = 0.013;

/** Generic numbered field for when no race is loaded. Clearly a demo, never real runners. */
export function demoField(): ScenarioRunner[] {
  const styles: ScenarioStyle[] = ["先行", "差し", "逃げ", "差し", "追込", "先行", "差し", "先行", "追込", "差し"];
  return styles.map((style, index) => ({ no: index + 1, name: null, style }));
}
