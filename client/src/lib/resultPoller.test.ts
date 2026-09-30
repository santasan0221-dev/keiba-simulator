import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createResultPoller, RESULT_POLL_MAX, RESULT_POLL_MS } from "./resultPoller";
import { fetchResultRow } from "./simulatorResult";
import type { LabRace } from "./singlePickAi";
import type { OfficialState } from "./simulatorResult";

const MIN = 60_000;
const T0 = Date.parse("2026-09-30T13:00:00+09:00");

function harness(startOffsetMin: number, initial: OfficialState | "LOADING" = "PENDING") {
  let state: OfficialState | "LOADING" = initial;
  let hidden = false;
  const listeners = new Set<() => void>();
  const refresh = vi.fn();
  const poller = createResultPoller({
    startIso: new Date(T0 + startOffsetMin * MIN).toISOString(),
    getState: () => state,
    refresh,
    env: {
      now: () => Date.now(),
      setTimeout: (fn, ms) => setTimeout(fn, ms) as unknown as number,
      clearTimeout: id => clearTimeout(id),
      isHidden: () => hidden,
      onVisibilityChange: cb => { listeners.add(cb); return () => listeners.delete(cb); },
    },
  });
  return {
    poller, refresh,
    setState(next: OfficialState | "LOADING") { state = next; poller.notify(); },
    setHidden(next: boolean) { hidden = next; listeners.forEach(cb => cb()); },
    listenerCount: () => listeners.size,
  };
}

describe("simulator result polling", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(T0); });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it("1+2: opened 10 min before post → no fetch before post, polling starts after crossing post time", () => {
    const h = harness(10);
    vi.advanceTimersByTime(10 * MIN - 1);
    expect(h.refresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    // Crossing post time only re-arms the regular interval: no burst exactly at post time.
    expect(h.refresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(RESULT_POLL_MS);
    expect(h.refresh).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(RESULT_POLL_MS);
    expect(h.refresh).toHaveBeenCalledTimes(2);
  });

  it("3: a confirmed race never polls", () => {
    const h = harness(-30, "CONFIRMED");
    vi.advanceTimersByTime(120 * MIN);
    expect(h.refresh).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["PENDING", "REVIEW_REQUIRED"] as const)("4+5: %s after post polls every 5 min, at most 12 times", status => {
    const h = harness(-2, status);
    vi.advanceTimersByTime(RESULT_POLL_MS);
    expect(h.refresh).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(200 * MIN);
    expect(h.refresh).toHaveBeenCalledTimes(RESULT_POLL_MAX);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("stops as soon as the result becomes confirmed", () => {
    const h = harness(-2);
    vi.advanceTimersByTime(RESULT_POLL_MS);
    h.setState("CONFIRMED");
    vi.advanceTimersByTime(60 * MIN);
    expect(h.refresh).toHaveBeenCalledTimes(1);
  });

  it("6+7+8: hidden tab → no fetch and no poll consumed; visible again → resumes with the full remaining budget", () => {
    const h = harness(-2);
    h.setHidden(true);
    vi.advanceTimersByTime(90 * MIN);
    expect(h.refresh).not.toHaveBeenCalled();
    expect(h.poller.pollsUsed()).toBe(0);
    h.setHidden(false);
    expect(h.refresh).toHaveBeenCalledTimes(1); // the missed tick runs on return
    vi.advanceTimersByTime(200 * MIN);
    expect(h.refresh).toHaveBeenCalledTimes(RESULT_POLL_MAX);
  });

  it("visible again before the interval elapsed does not fetch early", () => {
    const h = harness(-2);
    h.setHidden(true);
    vi.advanceTimersByTime(2 * MIN);
    h.setHidden(false);
    expect(h.refresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(RESULT_POLL_MS - 2 * MIN);
    expect(h.refresh).toHaveBeenCalledTimes(1);
  });

  it("waits while the result is loading (state unknown) and resumes when it is known", () => {
    const h = harness(-2, "LOADING");
    vi.advanceTimersByTime(30 * MIN);
    expect(h.refresh).not.toHaveBeenCalled();
    h.setState("PENDING");
    vi.advanceTimersByTime(RESULT_POLL_MS);
    expect(h.refresh).toHaveBeenCalledTimes(1);
  });

  it("9+10: stop() (race change / unmount) clears the pre-post timer, the interval and the visibility listener", () => {
    const before = harness(10);
    expect(vi.getTimerCount()).toBe(1);
    before.poller.stop();
    expect(vi.getTimerCount()).toBe(0);
    expect(before.listenerCount()).toBe(0);
    const after = harness(-2);
    after.poller.stop();
    vi.advanceTimersByTime(200 * MIN);
    expect(after.refresh).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("never keeps more than one timer per poller", () => {
    const h = harness(10);
    for (let i = 0; i < 5; i++) h.poller.notify();
    expect(vi.getTimerCount()).toBe(1);
  });
});

describe("result fetch used by manual refresh and polling", () => {
  afterEach(() => vi.unstubAllGlobals());
  const race = { race: { race_key: "JRA|2026-09-30|中山|11", date: "2026-09-30", organization: "JRA", venue: "中山" } } as unknown as LabRace;
  const response = () => new Response(JSON.stringify({ results: [] }), { status: 200, headers: { "content-type": "application/json" } });

  it("11: one manual refresh = one request", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(response()));
    vi.stubGlobal("fetch", fetchMock);
    await fetchResultRow(race);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("12: an automatic poll and a manual refresh at the same moment share one GET", async () => {
    let release: (value: Response) => void = () => undefined;
    const fetchMock = vi.fn(() => new Promise<Response>(resolve => { release = resolve; }));
    vi.stubGlobal("fetch", fetchMock);
    const automatic = fetchResultRow(race);
    const manual = fetchResultRow(race);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    release(response());
    await Promise.all([automatic, manual]);
  });

  it("the page wires one poller per open race and stops it on race change / unmount", () => {
    const source = readFileSync(resolve(import.meta.dirname, "../pages/SimulatorShell.tsx"), "utf8");
    expect(source).toMatch(/createResultPoller\(/);
    expect(source).toMatch(/return \(\) => poller\.stop\(\);\s*\}, \[raceKey\]\);/);
    expect(source).not.toMatch(/setPolls/);
  });
});
