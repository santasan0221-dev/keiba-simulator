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

/** Typical lengths behind the front of the field per style and phase (average pace). */
const GAP: Record<Exclude<ScenarioStyle, "不明">, Record<Phase, number>> = {
  逃げ: { START: 0.5, EARLY: 0, BACKSTRETCH: 0, TURN: 0, FINAL: 0.8, FINISH: 1.4 },
  先行: { START: 1, EARLY: 2, BACKSTRETCH: 2.5, TURN: 1.5, FINAL: 0.8, FINISH: 1 },
  差し: { START: 1.5, EARLY: 5, BACKSTRETCH: 6, TURN: 4, FINAL: 1.6, FINISH: 1 },
  追込: { START: 2, EARLY: 8, BACKSTRETCH: 9.5, TURN: 7, FINAL: 2.8, FINISH: 1.2 },
};
const PACE_SPREAD: Record<Pace, number> = { スロー: 0.7, 平均: 1, ハイ: 1.35 };

export type ScenarioRunner = { no: number; name: string | null; style: ScenarioStyle };
export type ScenarioPosition = ScenarioRunner & { lengthsBehind: number; group: "前団" | "中団" | "後方" | "脚質不明" };

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
  const spread = PACE_SPREAD[pace];
  const seen: Record<string, number> = {};
  const positions = [...runners].sort((a, b) => a.no - b.no).map(runner => {
    const index = (seen[runner.style] = (seen[runner.style] ?? -1) + 1);
    const base = runner.style === "不明" ? GAP.先行[phase] + 2 : GAP[runner.style][phase];
    const fade = pace === "ハイ" && runner.style === "逃げ" && (phase === "FINAL" || phase === "FINISH") ? 1.5 : 0;
    const lengthsBehind = Math.round((base * spread + fade + index * 0.45) * 10) / 10;
    const group: ScenarioPosition["group"] = runner.style === "不明" ? "脚質不明" : lengthsBehind < 2.5 ? "前団" : lengthsBehind < 6 ? "中団" : "後方";
    return { ...runner, lengthsBehind, group };
  });
  return positions.sort((a, b) => a.lengthsBehind - b.lengthsBehind || a.no - b.no);
}

/** Generic numbered field for when no race is loaded. Clearly a demo, never real runners. */
export function demoField(): ScenarioRunner[] {
  const styles: ScenarioStyle[] = ["先行", "差し", "逃げ", "差し", "追込", "先行", "差し", "先行", "追込", "差し"];
  return styles.map((style, index) => ({ no: index + 1, name: null, style }));
}
