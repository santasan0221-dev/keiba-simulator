/**
 * SCENARIO ORDER: the virtual order of the scenario at one progress value.
 *
 * Inputs are the scenario frame only (course progress `lap` per runner, plus
 * the cosmetic lane and race_key seed for tie-breaking). Nothing else reaches
 * this module: no market, popularity, probability, published pick or
 * official-result data. The order is a reading of the drawn positions. The
 * scenario runs through the line, so it also reports the virtual CROSSING
 * ORDER; that is the order the drawn runners passed the line, never a
 * predicted finishing order and never presented as a result.
 */
import { crossingTimes, scenarioFrame, type FrameRunner, type Pace, type ScenarioRunner } from "@/lib/scenarioReplay";

export const ORDER_NOTE = "シナリオ上の仮想順位です。実測・着順予測ではありません。";
export const CROSSING_TITLE = "SCENARIO CROSSING ORDER";
export const CROSSING_TITLE_JA = "仮想ゴール通過順";
export const CROSSING_NOTE = "この順番はシナリオ上の仮想通過順です。実際の着順予測ではありません。";
export const COMPLETE_MESSAGE = "この通過順は着順予測ではありません";

/**
 * Checkpoints that keep a rank, on the scenario progress axis. GOAL is the end of the scenario:
 * its rank is the order the runners crossed the line in the scenario.
 */
export const CHECKPOINTS = [
  { id: "START", t: 0, label: "START", short: "START" },
  { id: "EARLY", t: 0.2, label: "EARLY", short: "EARLY" },
  { id: "BACKSTRETCH", t: 0.425, label: "BACKSTRETCH", short: "BACK" },
  { id: "THIRD_TURN", t: 0.6, label: "THIRD TURN", short: "3角" },
  { id: "FINAL_TURN", t: 0.72, label: "FINAL TURN", short: "4角" },
  { id: "FINAL", t: 0.85, label: "HOME STRAIGHT", short: "直線" },
  { id: "GOAL", t: 1, label: "GOAL", short: "GOAL" },
] as const;
export type CheckpointId = (typeof CHECKPOINTS)[number]["id"];
export type RankRecord = Partial<Record<CheckpointId, number>>;

/** `crossing` is the 1-based place in the crossing sequence once the runner has crossed the line, else null. */
export type OrderRow = { rank: number; no: number; name: string | null; style: FrameRunner["style"]; crossing: number | null };
export type OrderView =
  | { kind: "LIVE"; title: string; rows: OrderRow[]; crossingNos: number[] }
  | { kind: "COMPLETE"; title: "SCENARIO COMPLETE"; message: typeof COMPLETE_MESSAGE; rows: OrderRow[]; crossingNos: number[] };

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
    .map((runner, index) => ({ rank: index + 1, no: runner.no, name: runner.name, style: runner.style, crossing: null as number | null }));
}

let crossingMemo: { key: string; times: Map<number, number> } | null = null;
/** Crossing times are a pure function of (field, pace, seed); keep the last one so the 8 Hz view does not recompute. */
function crossingFor(runners: ScenarioRunner[], pace: Pace, seed: number) {
  const key = `${seed}|${pace}|${runners.map(runner => `${runner.no}:${runner.style}`).join(",")}`;
  if (crossingMemo?.key !== key) crossingMemo = { key, times: crossingTimes(runners, pace, seed) };
  return crossingMemo.times;
}

/** Runner numbers in the order they cross the line (ties, which need exactly equal gaps, use the cosmetic key). */
export function crossingSequence(runners: ScenarioRunner[], pace: Pace, seed: number): { no: number; t: number }[] {
  const times = crossingFor(runners, pace, seed);
  const byNo = new Map(scenarioFrame(runners, 1, pace, seed).runners.map(runner => [runner.no, runner]));
  return [...runners]
    .sort((a, b) => times.get(a.no)! - times.get(b.no)! || tieKey(seed, byNo.get(a.no)!) - tieKey(seed, byNo.get(b.no)!) || a.no - b.no)
    .map(runner => ({ no: runner.no, t: times.get(runner.no)! }));
}

export function orderView(runners: ScenarioRunner[], progress: number, pace: Pace, seed: number): OrderView {
  const sequence = crossingSequence(runners, pace, seed);
  const crossed = sequence.filter(entry => entry.t <= progress + 1e-9);
  const place = new Map(crossed.map((entry, index) => [entry.no, index + 1]));
  const rows = orderFrame(scenarioFrame(runners, progress, pace, seed).runners, seed).map(row => ({ ...row, crossing: place.get(row.no) ?? null }));
  const crossingNos = crossed.map(entry => entry.no);
  return progress >= 1
    ? { kind: "COMPLETE", title: "SCENARIO COMPLETE", message: COMPLETE_MESSAGE, rows, crossingNos }
    : { kind: "LIVE", title: "SCENARIO ORDER", rows, crossingNos };
}

/** Virtual rank of every runner at each checkpoint (GOAL is the crossing order). */
export function rankHistory(runners: ScenarioRunner[], pace: Pace, seed: number): Map<number, RankRecord> {
  const history = new Map<number, RankRecord>();
  for (const checkpoint of CHECKPOINTS) {
    for (const row of orderFrame(scenarioFrame(runners, checkpoint.t, pace, seed).runners, seed)) {
      history.set(row.no, { ...history.get(row.no), [checkpoint.id]: row.rank });
    }
  }
  return history;
}

/** Checkpoints already reached on the scenario progress axis. */
export function reachedCheckpoints(progress: number): CheckpointId[] {
  return CHECKPOINTS.filter(checkpoint => checkpoint.t <= progress + 1e-9).map(checkpoint => checkpoint.id);
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
