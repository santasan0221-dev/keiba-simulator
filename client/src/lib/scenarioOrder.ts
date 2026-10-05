/**
 * SCENARIO ORDER: the virtual order of the scenario at one progress value, up to and including the
 * virtual goal crossing (SCENARIO CROSSING ORDER).
 *
 * Inputs are the scenario simulation only (lib/scenarioSim). Nothing else reaches this module: no
 * market, popularity, probability, published pick or official-result data. The order is a reading of
 * the simulated positions -- a virtual outcome of the scenario, never a finish prediction and never
 * kept or shown as a result.
 */
import type { FrameRunner } from "@/lib/scenarioReplay";
import type { Sim } from "@/lib/scenarioSim";

export const ORDER_NOTE = "シナリオ上の仮想順位です。実測・着順予測ではありません。";
export const CROSSING_NOTE = "この通過順はシナリオ上の仮想結果です。実際の着順予測ではありません。";
export const CROSSING_TITLE = "SCENARIO CROSSING ORDER";
export const CROSSING_TITLE_JA = "仮想ゴール通過順";

/**
 * Checkpoints that keep a rank. `lap` is the leader's lap at which the order is read (the field is
 * read as the front of it passes that point); GOAL is the virtual goal-crossing order.
 */
export const CHECKPOINTS = [
  { id: "START", lap: 0, label: "START", short: "START" },
  { id: "EARLY", lap: 0.2, label: "EARLY", short: "EARLY" },
  { id: "BACKSTRETCH", lap: 0.425, label: "BACKSTRETCH", short: "BACK" },
  { id: "THIRD_TURN", lap: 0.6, label: "THIRD TURN", short: "3角" },
  { id: "FINAL_TURN", lap: 0.72, label: "FINAL TURN", short: "4角" },
  { id: "HOME_STRAIGHT", lap: 0.85, label: "HOME STRAIGHT", short: "直線" },
  { id: "GOAL", lap: 1, label: "GOAL", short: "GOAL" },
] as const;
export type CheckpointId = (typeof CHECKPOINTS)[number]["id"];
export type RankRecord = Partial<Record<CheckpointId, number>>;

export type OrderRow = { rank: number; no: number; name: string | null; style: FrameRunner["style"]; crossed: boolean };
export type OrderView =
  | { kind: "LIVE" | "CROSSING"; title: string; rows: OrderRow[] }
  | { kind: "COMPLETE"; title: typeof CROSSING_TITLE; subtitle: typeof CROSSING_TITLE_JA; rows: OrderRow[]; sequence: string };

/** Cosmetic, deterministic tie-break key: seed-derived, then lane, then number. */
function tieKey(seed: number, runner: FrameRunner): number {
  let x = (seed ^ Math.imul(runner.no + 1, 0x9e3779b1)) >>> 0;
  x ^= x >>> 15; x = Math.imul(x, 0x2c1b3c6d) >>> 0; x ^= x >>> 12;
  return x >>> 0;
}

/**
 * Runners front to back: those already across the line in the order they crossed, then the rest by
 * course progress; ties broken cosmetically.
 */
export function orderFrame(sim: Sim, progress: number): OrderRow[] {
  const frame = sim.frameAt(progress);
  const crossAt = new Map(sim.nos.map((no, i) => [no, sim.crossT[i]]));
  return [...frame.runners]
    .sort((a, b) => {
      if (a.crossed !== b.crossed) return a.crossed ? -1 : 1;
      if (a.crossed && b.crossed) return (crossAt.get(a.no) ?? 1) - (crossAt.get(b.no) ?? 1) || a.no - b.no;
      return b.lap - a.lap || tieKey(sim.seed, a) - tieKey(sim.seed, b) || a.lane - b.lane || a.no - b.no;
    })
    .map((runner, index) => ({ rank: index + 1, no: runner.no, name: runner.name, style: runner.style, crossed: runner.crossed }));
}

export function orderView(sim: Sim, progress: number): OrderView {
  const rows = orderFrame(sim, progress);
  if (sim.nos.length > 0 && progress >= sim.allCrossedT) {
    return { kind: "COMPLETE", title: CROSSING_TITLE, subtitle: CROSSING_TITLE_JA, rows, sequence: rows.map(row => `#${row.no}`).join(" → ") };
  }
  return rows.some(row => row.crossed)
    ? { kind: "CROSSING", title: "SCENARIO ORDER — GOAL", rows }
    : { kind: "LIVE", title: "SCENARIO ORDER", rows };
}

/** Virtual rank of every runner at each checkpoint, GOAL being the crossing order. */
export function rankHistory(sim: Sim): Map<number, RankRecord> {
  const history = new Map<number, RankRecord>();
  for (const checkpoint of CHECKPOINTS) {
    const at = checkpoint.id === "GOAL" ? sim.allCrossedT : sim.leaderReachT(checkpoint.lap);
    for (const row of orderFrame(sim, at)) history.set(row.no, { ...history.get(row.no), [checkpoint.id]: row.rank });
  }
  return history;
}

/** Checkpoints already reached at `progress` (GOAL once the last runner has crossed). */
export function reachedCheckpoints(sim: Sim, progress: number): CheckpointId[] {
  return CHECKPOINTS.filter(checkpoint => progress + 1e-9 >= (checkpoint.id === "GOAL" ? sim.allCrossedT : sim.leaderReachT(checkpoint.lap))).map(checkpoint => checkpoint.id);
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
