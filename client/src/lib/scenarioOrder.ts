/**
 * SCENARIO ORDER: the virtual order of the scenario at one progress value.
 *
 * Inputs are the scenario frame only (course progress `lap` per runner, plus
 * the cosmetic lane and race_key seed for tie-breaking). Nothing else reaches
 * this module: no market, popularity, probability, published pick or
 * official-result data. The order is a reading of the drawn positions, never a
 * finish prediction, and it is never kept as a result.
 */
import { PHASES, PHASE_KEYFRAME, scenarioFrame, type FrameRunner, type Pace, type Phase, type ScenarioRunner } from "@/lib/scenarioReplay";

export const ORDER_NOTE = "シナリオ上の仮想順位です。実測・着順予測ではありません。";
export const FINAL_PHASE_FROM = 0.95;

/** Checkpoints that keep a rank. FINISH is excluded: no rank is held at the line. */
export const RANK_CHECKPOINTS = PHASES.filter(phase => phase !== "FINISH") as Exclude<Phase, "FINISH">[];

export type OrderRow = { rank: number; no: number; name: string | null; style: FrameRunner["style"] };
export type OrderView =
  | { kind: "LIVE" | "FINAL_PHASE"; title: string; rows: OrderRow[] }
  | { kind: "COMPLETE"; title: "SCENARIO COMPLETE"; message: "着順は予測していません"; rows: [] };

/** Cosmetic, deterministic tie-break key: seed-derived, then lane, then number. */
function tieKey(seed: number, runner: FrameRunner): number {
  let x = (seed ^ Math.imul(runner.no + 1, 0x9e3779b1)) >>> 0;
  x ^= x >>> 15; x = Math.imul(x, 0x2c1b3c6d) >>> 0; x ^= x >>> 12;
  return x >>> 0;
}

/** Runners front to back by course progress; ties broken cosmetically. */
export function orderFrame(runners: FrameRunner[], seed: number): OrderRow[] {
  return [...runners]
    .sort((a, b) => b.lap - a.lap || tieKey(seed, a) - tieKey(seed, b) || a.lane - b.lane || a.no - b.no)
    .map((runner, index) => ({ rank: index + 1, no: runner.no, name: runner.name, style: runner.style }));
}

export function orderView(runners: ScenarioRunner[], progress: number, pace: Pace, seed: number): OrderView {
  if (progress >= 1) return { kind: "COMPLETE", title: "SCENARIO COMPLETE", message: "着順は予測していません", rows: [] };
  // FINAL PHASE: the order is held at the 95% reading. The field converges after
  // that, and swaps among near-level runners would read as a finish.
  const frozen = progress > FINAL_PHASE_FROM;
  const rows = orderFrame(scenarioFrame(runners, frozen ? FINAL_PHASE_FROM : progress, pace, seed).runners, seed);
  return frozen
    ? { kind: "FINAL_PHASE", title: "SCENARIO ORDER — FINAL PHASE", rows }
    : { kind: "LIVE", title: "SCENARIO ORDER", rows };
}

/** Virtual rank of every runner at each phase checkpoint (no FINISH entry). */
export function rankHistory(runners: ScenarioRunner[], pace: Pace, seed: number): Map<number, Partial<Record<Phase, number>>> {
  const history = new Map<number, Partial<Record<Phase, number>>>();
  for (const phase of RANK_CHECKPOINTS) {
    for (const row of orderFrame(scenarioFrame(runners, PHASE_KEYFRAME[phase], pace, seed).runners, seed)) {
      history.set(row.no, { ...history.get(row.no), [phase]: row.rank });
    }
  }
  return history;
}

/** Checkpoints already reached at this progress. */
export function reachedCheckpoints(progress: number): Phase[] {
  return RANK_CHECKPOINTS.filter(phase => PHASE_KEYFRAME[phase] <= progress + 1e-9);
}

/** Rows for the compact (mobile) view: top N plus the pinned runner. */
export function compactRows(rows: OrderRow[], pinnedNo: number | null, top = 5): OrderRow[] {
  const head = rows.slice(0, top);
  const pinned = rows.find(row => row.no === pinnedNo);
  return pinned && !head.includes(pinned) ? [...head, pinned] : head;
}

/**
 * Trailing throttle: `push` may be called every animation frame; `emit` runs at
 * most once per `intervalMs`, always with the latest value.
 */
export type ThrottleEnv = { now: () => number; setTimeout: (fn: () => void, ms: number) => number; clearTimeout: (id: number) => void };
export function createThrottledEmitter<T>(intervalMs: number, emit: (value: T) => void, env: ThrottleEnv) {
  let last = -Infinity;
  let pending: { value: T } | null = null;
  let timer: number | null = null;
  const flush = () => {
    timer = null;
    if (!pending) return;
    const { value } = pending;
    pending = null;
    last = env.now();
    emit(value);
  };
  return {
    push(value: T) {
      pending = { value };
      if (timer !== null) return;
      const wait = Math.max(0, intervalMs - (env.now() - last));
      timer = env.setTimeout(flush, wait);
    },
    /** Emit immediately (scrub, pause, restart) so the table never lags a user action. */
    now(value: T) {
      if (timer !== null) { env.clearTimeout(timer); timer = null; }
      pending = null;
      last = env.now();
      emit(value);
    },
    stop() { if (timer !== null) env.clearTimeout(timer); timer = null; pending = null; },
  };
}
