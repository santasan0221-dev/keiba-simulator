import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveCourse } from "./courseAtlas";
import {
  CHECKPOINTS, compactRows, CROSSING_NOTE, createThrottledEmitter, deltaLabel, orderFrame, orderView, rankDelta, rankHistory, reachedCheckpoints,
} from "./scenarioOrder";
import { type ScenarioRunner, type ScenarioStyle } from "./scenarioReplay";
import { buildSim } from "./scenarioSim";

const field: ScenarioRunner[] = Array.from({ length: 12 }, (_, i) => ({ no: i + 1, name: `馬${i + 1}`, style: (["逃げ", "先行", "差し", "追込"] as ScenarioStyle[])[i % 4] }));
const sim = buildSim({ raceKey: "JRA|2026-10-04|東京|05", variant: "STANDARD", runners: field, course: resolveCourse("東京", "芝", 2000), pace: "平均" });
const strip = (file: string) => readFileSync(resolve(import.meta.dirname, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("SCENARIO ORDER", () => {
  it("every frame has ranks 1..n exactly once, deterministically", () => {
    for (let step = 0; step <= 100; step++) {
      const rows = orderFrame(sim, step / 100);
      expect(rows.map(row => row.rank)).toEqual(Array.from({ length: field.length }, (_, i) => i + 1));
      expect(new Set(rows.map(row => row.no)).size).toBe(field.length);
      expect(orderFrame(sim, step / 100)).toEqual(rows);
    }
  });

  it("ranks change smoothly: between neighbouring frames a runner moves a few places at most", () => {
    // From just after the gate: at the very first instant the field is level and the order is only a tie-break.
    let previous = new Map(orderFrame(sim, 0.02).map(row => [row.no, row.rank]));
    for (let step = 21; step <= 1000; step++) {
      const rows = orderFrame(sim, step / 1000);
      for (const row of rows) expect(Math.abs(row.rank - (previous.get(row.no) ?? row.rank))).toBeLessThanOrEqual(3);
      previous = new Map(rows.map(row => [row.no, row.rank]));
    }
  });

  it("LIVE → CROSSING → COMPLETE: updates all the way to the line, then shows the crossing order", () => {
    expect(orderView(sim, 0.5).kind).toBe("LIVE");
    expect(orderView(sim, 0.95).kind).not.toBe("COMPLETE");
    const first = Math.min(...sim.crossT);
    const during = orderView(sim, (first + sim.allCrossedT) / 2);
    expect(during.kind).toBe("CROSSING");
    expect(during.rows.filter(row => row.crossed).length).toBeGreaterThan(0);
    const done = orderView(sim, 1);
    expect(done.kind).toBe("COMPLETE");
    if (done.kind !== "COMPLETE") throw new Error("expected COMPLETE");
    expect(done.title).toBe("SCENARIO CROSSING ORDER");
    expect(done.subtitle).toBe("仮想ゴール通過順");
    expect(done.rows.map(row => row.no)).toEqual(sim.crossOrder);
    expect(done.sequence).toBe(sim.crossOrder.map(no => `#${no}`).join(" → "));
    expect(orderView(sim, sim.allCrossedT).kind).toBe("COMPLETE");
    expect(CROSSING_NOTE).toContain("実際の着順予測ではありません");
  });

  it("runners that crossed keep their crossing place: nobody who is across the line is overtaken by a runner behind it", () => {
    for (let step = 0; step <= 1000; step++) {
      const rows = orderFrame(sim, step / 1000);
      const crossed = rows.filter(row => row.crossed);
      expect(rows.slice(0, crossed.length).every(row => row.crossed)).toBe(true);
    }
  });

  it("is a pure reading of the simulation: same input, same view", () => {
    expect(orderView(sim, 0.5)).toEqual(orderView(sim, 0.5));
  });
});

describe("checkpoints and rank history", () => {
  const history = rankHistory(sim);
  it("records START … HOME STRAIGHT and GOAL for every runner; GOAL is the crossing order", () => {
    expect(CHECKPOINTS.map(checkpoint => checkpoint.id)).toEqual(["START", "EARLY", "BACKSTRETCH", "THIRD_TURN", "FINAL_TURN", "HOME_STRAIGHT", "GOAL"]);
    for (const no of sim.nos) expect(Object.keys(history.get(no)!)).toHaveLength(CHECKPOINTS.length);
    sim.crossOrder.forEach((no, index) => expect(history.get(no)!.GOAL).toBe(index + 1));
  });

  it("checkpoints are reached in order as progress advances; GOAL only once everyone has crossed", () => {
    expect(reachedCheckpoints(sim, 0)).toEqual(["START"]);
    let count = 0;
    for (let step = 0; step <= 1000; step++) {
      const reached = reachedCheckpoints(sim, step / 1000).length;
      expect(reached).toBeGreaterThanOrEqual(count);
      count = reached;
    }
    expect(reachedCheckpoints(sim, sim.allCrossedT - 0.01)).not.toContain("GOAL");
    expect(reachedCheckpoints(sim, 1)).toHaveLength(CHECKPOINTS.length);
  });

  it("rank change is measured against the last checkpoint passed; START does not count", () => {
    const record = history.get(1);
    expect(rankDelta(record, ["START"], 5)).toEqual({ previous: null, delta: null });
    const { previous, delta } = rankDelta(record, ["START", "EARLY"], 3);
    expect(previous).toBe(record!.EARLY);
    expect(delta).toBe(record!.EARLY! - 3);
    expect(deltaLabel(2)).toBe("↑2");
    expect(deltaLabel(-1)).toBe("↓1");
    expect(deltaLabel(0)).toBe("－");
    expect(deltaLabel(null)).toBe("");
  });
});

describe("safety: the order reads nothing but the simulation", () => {
  it("source never references market, probability, honmei, popularity or result data", () => {
    const code = strip("scenarioOrder.ts");
    for (const forbidden of ["odds", "probab", "honmei", "popularity", "result", "ai_rank", "win_", "speed", "stamina", "Math.random", "official"]) expect(code.toLowerCase(), forbidden).not.toContain(forbidden.toLowerCase());
    expect(code.match(/from "[^"]+"/g)!.sort()).toEqual(['from "@/lib/scenarioReplay"', 'from "@/lib/scenarioSim"']);
  });
});

describe("compact view", () => {
  const rows = orderFrame(sim, 0.5);
  it("shows the top 5, plus the pinned runner when outside it", () => {
    expect(compactRows(rows, null)).toHaveLength(5);
    const outside = rows[8].no;
    const view = compactRows(rows, outside);
    expect(view).toHaveLength(6);
    expect(view[5].no).toBe(outside);
    expect(compactRows(rows, rows[1].no)).toHaveLength(5);
  });
});

describe("rank table update rate", () => {
  const fakeEnv = () => {
    let now = 0; const timers: { at: number; fn: () => void; id: number }[] = []; let next = 1;
    return {
      env: { now: () => now, setTimeout: (fn: () => void, ms: number) => { timers.push({ at: now + ms, fn, id: next }); return next++; }, clearTimeout: (id: number) => { const i = timers.findIndex(t => t.id === id); if (i >= 0) timers.splice(i, 1); } },
      advance(ms: number) { const end = now + ms; for (;;) { timers.sort((a, b) => a.at - b.at); const t = timers[0]; if (!t || t.at > end) break; timers.shift(); now = t.at; t.fn(); } now = end; },
    };
  };
  it("60 fps input for 30 s re-renders the table at <= 10 Hz, always with the latest value", () => {
    const { env, advance } = fakeEnv();
    const emitted: number[] = [];
    const throttle = createThrottledEmitter<number>(125, value => emitted.push(value), env);
    let pushed = 0;
    for (let frame = 0; frame < 1800; frame++) { pushed = frame; throttle.push(frame); advance(1000 / 60); }
    expect(emitted.length).toBeLessThanOrEqual(30 * 10);
    expect(emitted.length).toBeGreaterThan(30 * 4);
    expect(pushed - emitted[emitted.length - 1]).toBeLessThan(10);
  });
  it("now() emits immediately and drops the pending tick", () => {
    const { env, advance } = fakeEnv();
    const emitted: number[] = [];
    const throttle = createThrottledEmitter<number>(125, value => emitted.push(value), env);
    throttle.push(1); throttle.now(2); advance(500);
    expect(emitted).toEqual([2]);
  });
  it("ordering one frame is cheap enough for 8 Hz redraw", () => {
    const big = buildSim({ raceKey: "big", variant: "STANDARD", runners: Array.from({ length: 18 }, (_, i) => ({ no: i + 1, name: null, style: (["逃げ", "先行", "差し", "追込"] as const)[i % 4] })), course: resolveCourse("中山", "芝", 2500), pace: "平均" });
    const start = performance.now();
    for (let i = 0; i < 500; i++) orderView(big, (i % 100) / 100);
    expect((performance.now() - start) / 500).toBeLessThan(2);
  });
});
