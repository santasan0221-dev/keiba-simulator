/**
 * SCENARIO ORDER: the virtual order of the scenario at one progress value.
 *
 * Inputs are the scenario frame only (course progress `lap` per runner, plus
 * the cosmetic lane and race_key seed for tie-breaking). Nothing else reaches
 * this module: no market, popularity, probability, published pick or
 * official-result data. The order is a reading of the drawn positions, never a
 * finish prediction, and it is never kept as a result.
 */
import { scenarioFrame, type FrameRunner, type Pace, type ScenarioRunner } from "@/lib/scenarioReplay";

export const ORDER_NOTE = "シナリオ上の仮想順位です。実測・着順予測ではありません。";
export const FINAL_PHASE_FROM = 0.95;

/**
 * Checkpoints that keep a rank, on the scenario progress axis. FINISH is not one: no rank is held
 * at the line. FINAL is the 85% reading; the order itself is frozen at 95% (FINAL_PHASE_FROM).
 */
export const CHECKPOINTS = [
  { id: "START", t: 0, label: "START", short: "START" },
  { id: "EARLY", t: 0.2, label: "EARLY", short: "EARLY" },
  { id: "BACKSTRETCH", t: 0.425, label: "BACKSTRETCH", short: "BACK" },
  { id: "THIRD_TURN", t: 0.6, label: "THIRD TURN", short: "3角" },
  { id: "FINAL_TURN", t: 0.72, label: "FINAL TURN", short: "4角" },
  { id: "FINAL", t: 0.85, label: "FINAL", short: "FINAL" },
] as const;
export type CheckpointId = (typeof CHECKPOINTS)[number]["id"];
export type RankRecord = Partial<Record<CheckpointId, number>>;

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

/** Virtual rank of every runner at each checkpoint (no FINISH entry). */
export function rankHistory(runners: ScenarioRunner[], pace: Pace, seed: number): Map<number, RankRecord> {
  const history = new Map<number, RankRecord>();
  for (const checkpoint of CHECKPOINTS) {
    for (const row of orderFrame(scenarioFrame(runners, checkpoint.t, pace, seed).runners, seed)) {
      history.set(row.no, { ...history.get(row.no), [checkpoint.id]: row.rank });
    }
  }
  return history;
}

/** Checkpoints already reached. The order is held at FINAL_PHASE_FROM, so nothing later counts. */
export function reachedCheckpoints(progress: number): CheckpointId[] {
  const effective = Math.min(progress, FINAL_PHASE_FROM);
  return CHECKPOINTS.filter(checkpoint => checkpoint.t <= effective + 1e-9).map(checkpoint => checkpoint.id);
}

/**
 * Change against the last checkpoint passed: positive = moved up. `previous` is the rank held at
 * that checkpoint. START does not count: the field is level at the gate, so its order carries no
 * information to compare against. Null until EARLY has been passed.
 */
export function rankDelta(history: RankRecord | undefined, reached: CheckpointId[], currentRank: number): { previous: number | null; delta: number | null } {
  const last = reached[reached.length - 1];
  const previous = last && last !== "START" && history ? history[last] ?? null : null;
  return previous === null ? { previous: null, delta: null } : { previous, delta: previous - currentRank };
}

/** Compact marker for a rank change: ↑2 / ↓1 / －. */
export function deltaLabel(delta: number | null): string {
  if (delta === null) return "";
  return delta > 0 ? `↑${delta}` : delta < 0 ? `↓${-delta}` : "－";
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
