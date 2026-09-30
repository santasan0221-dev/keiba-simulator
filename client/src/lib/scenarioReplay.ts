/**
 * Formation SCENARIO for the research simulator.
 *
 * Built only from each runner's published run style (逃げ/先行/差し/追込)
 * and an assumed pace chosen by the viewer. It reads no speed, stamina,
 * ability score or probability, produces no finish order, and computes no
 * win probability. It is an illustration of how a field of these styles
 * typically lines up -- RESEARCH_ONLY, never telemetry.
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

/**
 * FINISH is a converged field: every runner is drawn at the same distance
 * from the line, short of it, so the scenario never shows anyone crossing
 * first. Finishing order comes only from the canonical official result.
 */
const FINISH_GAP = 1;

/** Typical lengths behind the front of the field per style and phase (average pace). */
const GAP: Record<Exclude<ScenarioStyle, "不明">, Record<Phase, number>> = {
  逃げ: { START: 0.5, EARLY: 0, BACKSTRETCH: 0, TURN: 0, FINAL: 0.8, FINISH: FINISH_GAP },
  先行: { START: 1, EARLY: 2, BACKSTRETCH: 2.5, TURN: 1.5, FINAL: 0.8, FINISH: FINISH_GAP },
  差し: { START: 1.5, EARLY: 5, BACKSTRETCH: 6, TURN: 4, FINAL: 1.6, FINISH: FINISH_GAP },
  追込: { START: 2, EARLY: 8, BACKSTRETCH: 9.5, TURN: 7, FINAL: 2.8, FINISH: FINISH_GAP },
};
const PACE_SPREAD: Record<Pace, number> = { スロー: 0.7, 平均: 1, ハイ: 1.35 };

export type ScenarioRunner = { no: number; name: string | null; style: ScenarioStyle };
export type ScenarioGroup = "前団" | "中団" | "後方" | "脚質不明" | "ゴール前（順位なし）";
export type ScenarioPosition = ScenarioRunner & { lengthsBehind: number; group: ScenarioGroup };

export function normalizeStyle(value: string | null | undefined): ScenarioStyle {
  if (value === "追込" || value === "追い込み") return "追込";
  if (value === "逃げ" || value === "先行" || value === "差し") return value;
  return "不明";
}

/**
 * Formation at one phase, front to back. Runners of the same style are
 * spaced by horse number only so the picture is deterministic -- the order
 * inside a style group carries no meaning, and FINISH is drawn as a
 * converging field, not a result.
 */
export function formationAt(runners: ScenarioRunner[], phase: Phase, pace: Pace): ScenarioPosition[] {
  if (phase === "FINISH") {
    return [...runners].sort((a, b) => a.no - b.no).map(runner => ({ ...runner, lengthsBehind: FINISH_GAP, group: "ゴール前（順位なし）" as const }));
  }
  const spread = PACE_SPREAD[pace];
  const seen: Record<string, number> = {};
  const positions = [...runners].sort((a, b) => a.no - b.no).map(runner => {
    const index = (seen[runner.style] = (seen[runner.style] ?? -1) + 1);
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
// spacing -- the seed never changes who is ahead at FINISH (nobody is).

/** Label windows on the scenario progress axis. */
export const PHASE_WINDOWS: Record<Phase, readonly [number, number]> = {
  START: [0, 0.1], EARLY: [0.1, 0.3], BACKSTRETCH: [0.3, 0.55], TURN: [0.55, 0.75], FINAL: [0.75, 0.95], FINISH: [0.95, 1],
};
/** Where each phase's formation is exact (keyframe) on the progress axis. */
export const PHASE_KEYFRAME: Record<Phase, number> = { START: 0, EARLY: 0.2, BACKSTRETCH: 0.425, TURN: 0.65, FINAL: 0.85, FINISH: 1 };
/** Share of the lap the front of the field has covered at FINISH -- stops short of the line. */
export const FINISH_LAP = 0.985;

export function phaseAt(t: number): Phase {
  const value = clamp01(t);
  return PHASES.find(phase => value < PHASE_WINDOWS[phase][1]) ?? "FINISH";
}

/** Stable 32-bit seed from a race_key (FNV-1a). Same key → same picture, every replay. */
export function scenarioSeed(key: string | null | undefined): number {
  let hash = 0x811c9dc5;
  for (const char of key ?? "demo") { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 0x01000193) >>> 0; }
  return hash >>> 0;
}

function unit(seed: number, no: number, salt: number): number {
  let x = (seed ^ Math.imul(no + 1, 0x9e3779b1) ^ Math.imul(salt, 0x85ebca6b)) >>> 0;
  x ^= x >>> 15; x = Math.imul(x, 0x2c1b3c6d) >>> 0; x ^= x >>> 12; x = Math.imul(x, 0x297a2d39) >>> 0; x ^= x >>> 15;
  return (x >>> 0) / 0xffffffff;
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
const smooth = (value: number) => value * value * (3 - 2 * value);

export type FrameRunner = ScenarioRunner & {
  /** Share of the lap covered, 0..FINISH_LAP. Illustrative, not a measured position. */
  lap: number;
  /** Lane offset from the rail (0 = rail). Cosmetic; carries no ranking. */
  lane: number;
  lengthsBehind: number;
};
export type ScenarioFrame = { progress: number; phase: Phase; runners: FrameRunner[] };

const LANE: Record<ScenarioStyle, number> = { 逃げ: 0, 先行: 1, 差し: 2, 追込: 3, 不明: 3 };
/** Lap share per length, for drawing only. */
export const LENGTH_SHARE = 0.013;

/**
 * Scenario formation at progress t, interpolated between phase keyframes.
 * Runners come back in horse-number order (a stable draw order, never a
 * ranking). At t = 1 every runner has the same lap and lengthsBehind.
 */
export function scenarioFrame(runners: ScenarioRunner[], t: number, pace: Pace, seed: number): ScenarioFrame {
  const progress = clamp01(t);
  const next = PHASES.findIndex(phase => progress <= PHASE_KEYFRAME[phase]);
  const to = PHASES[Math.max(0, next)];
  const from = PHASES[Math.max(0, next - 1)];
  const span = PHASE_KEYFRAME[to] - PHASE_KEYFRAME[from];
  const mix = span > 0 ? smooth((progress - PHASE_KEYFRAME[from]) / span) : 1;
  const a = new Map(formationAt(runners, from, pace).map(entry => [entry.no, entry.lengthsBehind]));
  const b = new Map(formationAt(runners, to, pace).map(entry => [entry.no, entry.lengthsBehind]));
  const front = progress * FINISH_LAP;
  // Cosmetic spacing fades out approaching FINISH so the converged field is exact.
  const settle = 1 - smooth(clamp01((progress - PHASE_KEYFRAME.FINAL) / (1 - PHASE_KEYFRAME.FINAL)));
  const ordered = [...runners].sort((x, y) => x.no - y.no).map(runner => {
    const base = (a.get(runner.no) ?? 0) + ((b.get(runner.no) ?? 0) - (a.get(runner.no) ?? 0)) * mix;
    const stagger = unit(seed, runner.no, 1) * 0.35 * settle;
    const lengthsBehind = Math.round((base + stagger) * 1000) / 1000;
    const lane = LANE[runner.style] + (unit(seed, runner.no, 2) - 0.5) * 0.7;
    return { ...runner, lengthsBehind, lane, lap: Math.max(0, front - lengthsBehind * LENGTH_SHARE) };
  });
  return { progress, phase: phaseAt(progress), runners: ordered };
}

/** Generic numbered field for when no race is loaded. Clearly a demo, never real runners. */
export function demoField(): ScenarioRunner[] {
  const styles: ScenarioStyle[] = ["先行", "差し", "逃げ", "差し", "追込", "先行", "差し", "先行", "追込", "差し"];
  return styles.map((style, index) => ({ no: index + 1, name: null, style }));
}
