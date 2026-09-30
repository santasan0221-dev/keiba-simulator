/**
 * Official-result polling for the one race open in the simulator.
 *
 * - Before post time: a single one-shot timer to post time. Crossing post
 *   time only arms the regular interval, so there is no burst of fetches at
 *   post time itself.
 * - After post time, while PENDING / REVIEW_REQUIRED: one fetch every
 *   RESULT_POLL_MS, at most RESULT_POLL_MAX fetches.
 * - Hidden tab: a due tick neither fetches nor uses up a poll; it runs as
 *   soon as the tab is visible again.
 * - Any other state (CONFIRMED, unavailable, still loading): no timer.
 *
 * At most one timer exists per poller; stop() clears it and the visibility
 * listener (race change / unmount).
 */
import { shouldPollResult, type OfficialState } from "@/lib/simulatorResult";

export const RESULT_POLL_MS = 5 * 60_000;
export const RESULT_POLL_MAX = 12;

export type PollerEnv = {
  now: () => number;
  setTimeout: (fn: () => void, ms: number) => number;
  clearTimeout: (id: number) => void;
  isHidden: () => boolean;
  onVisibilityChange: (listener: () => void) => () => void;
};

export function browserPollerEnv(): PollerEnv {
  return {
    now: () => Date.now(),
    setTimeout: (fn, ms) => window.setTimeout(fn, ms),
    clearTimeout: id => window.clearTimeout(id),
    isHidden: () => document.hidden === true,
    onVisibilityChange: listener => {
      document.addEventListener("visibilitychange", listener);
      return () => document.removeEventListener("visibilitychange", listener);
    },
  };
}

export type ResultPoller = {
  /** Re-evaluate after the result state changed. */
  notify: () => void;
  stop: () => void;
  pollsUsed: () => number;
};

export function createResultPoller(options: {
  startIso: string | null | undefined;
  /** Current canonical state; "LOADING" while a request is in flight. */
  getState: () => OfficialState | "LOADING";
  /** Fetch the canonical result once (the same call manual refresh uses). */
  refresh: () => void;
  env?: PollerEnv;
}): ResultPoller {
  const env = options.env ?? browserPollerEnv();
  const start = options.startIso ? Date.parse(options.startIso) : NaN;
  let timer: number | null = null;
  let polls = 0;
  let stopped = false;
  let dueWhileHidden = false;

  const clear = () => { if (timer !== null) { env.clearTimeout(timer); timer = null; } };
  const pollable = () => {
    const state = options.getState();
    return state !== "LOADING" && shouldPollResult(state, options.startIso, Math.max(env.now(), Number.isFinite(start) ? start : 0), polls, RESULT_POLL_MAX);
  };

  const tick = () => {
    timer = null;
    if (stopped || !pollable()) return;
    if (env.isHidden()) { dueWhileHidden = true; return; } // no fetch, no poll used
    polls += 1;
    options.refresh();
    schedule();
  };

  function schedule() {
    clear();
    dueWhileHidden = false;
    if (stopped || !Number.isFinite(start)) return;
    const now = env.now();
    if (now < start) {
      // One-shot to post time; eligibility is re-checked then.
      if (!pollable()) return;
      timer = env.setTimeout(() => { timer = null; schedule(); }, start - now);
      return;
    }
    if (!pollable()) return;
    timer = env.setTimeout(tick, RESULT_POLL_MS);
  }

  const unlisten = env.onVisibilityChange(() => {
    if (!stopped && dueWhileHidden && !env.isHidden()) { dueWhileHidden = false; tick(); }
  });

  schedule();
  return {
    notify: () => { if (!dueWhileHidden) schedule(); },
    stop: () => { stopped = true; clear(); unlisten(); },
    pollsUsed: () => polls,
  };
}
