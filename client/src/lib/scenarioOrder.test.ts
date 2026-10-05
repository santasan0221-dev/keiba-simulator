import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CHECKPOINTS, COMPLETE_MESSAGE, compactRows, createThrottledEmitter, CROSSING_NOTE, crossingSequence, deltaLabel, orderFrame, orderView, rankDelta, rankHistory, reachedCheckpoints } from "./scenarioOrder";
import { demoField, PHASE_KEYFRAME, scenarioFrame, scenarioSeed } from "./scenarioReplay";

const field = demoField();
const seed = scenarioSeed("JRA|2026-09-30|中山|11");
const strip = (file: string) => readFileSync(resolve(import.meta.dirname, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

describe("SCENARIO ORDER follows continuous course progress", () => {
  it("ranks are exactly the descending lap order of the frame", () => {
    for (let step = 0; step < 100; step++) {
      const frame = scenarioFrame(field, step / 100, "平均", seed);
      const rows = orderFrame(frame.runners, seed);
      const laps = rows.map(row => frame.runners.find(runner => runner.no === row.no)!.lap);
      expect([...laps].sort((a, b) => b - a)).toEqual(laps);
      expect(rows.map(row => row.rank)).toEqual(rows.map((_, i) => i + 1));
    }
  });

  it("a runner's rank changes only by passing runners whose course progress it actually crossed", () => {
    let previous = scenarioFrame(field, 0, "平均", seed);
    let changes = 0;
    for (let step = 1; step <= 1000; step++) {
      const frame = scenarioFrame(field, step / 1000, "平均", seed);
      const before = new Map(orderFrame(previous.runners, seed).map(r => [r.no, r.rank]));
      for (const row of orderFrame(frame.runners, seed)) {
        const delta = Math.abs(row.rank - before.get(row.no)!);
        if (!delta) continue;
        changes++;
        const a = previous.runners.find(r => r.no === row.no)!, b = frame.runners.find(r => r.no === row.no)!;
        const [lo, hi] = [Math.min(a.lap, b.lap), Math.max(a.lap, b.lap)];
        const swept = previous.runners.filter(r => r.no !== row.no).filter(r => { const c = frame.runners.find(x => x.no === r.no)!; return Math.min(r.lap, c.lap) <= hi && Math.max(r.lap, c.lap) >= lo; }).length;
        expect(delta, `runner ${row.no} at ${step / 1000}`).toBeLessThanOrEqual(swept);
      }
      previous = frame;
    }
    expect(changes).toBeGreaterThan(0);
  });

  it("front-runners lead early; no style is hard-coded to win ground late", () => {
    const early = orderFrame(scenarioFrame(field, PHASE_KEYFRAME.EARLY, "平均", seed).runners, seed);
    expect(early[0].style).toBe("逃げ");
  });

  it("is deterministic per race_key and replay", () => {
    expect(rankHistory(field, "平均", seed)).toEqual(rankHistory(field, "平均", seed));
    expect(orderView(field, 0.5, "ハイ", seed)).toEqual(orderView(field, 0.5, "ハイ", seed));
    expect(scenarioSeed("a")).not.toBe(scenarioSeed("b"));
  });

  it("keeps a rank history for every runner at every checkpoint (no FINISH rank)", () => {
    const history = rankHistory(field, "平均", seed);
    expect(history.size).toBe(field.length);
    history.forEach(ranks => { expect(Object.keys(ranks).sort()).toEqual(CHECKPOINTS.map(c => c.id).sort()); expect(ranks).not.toHaveProperty("FINISH"); });
  });
});

describe("full finish: the order updates to 100% and the crossing order is scenario-only", () => {
  it("stays LIVE until 100%, then COMPLETE with every runner placed in the crossing sequence", () => {
    for (const p of [0.5, 0.9, 0.95, 0.99]) expect(orderView(field, p, "平均", seed).kind).toBe("LIVE");
    const done = orderView(field, 1, "平均", seed);
    expect(done.kind).toBe("COMPLETE");
    expect(done.title).toBe("SCENARIO COMPLETE");
    expect(done.message).toBe(COMPLETE_MESSAGE);
    expect(done.rows).toHaveLength(field.length);
    expect(done.rows.map(row => row.crossing)).toEqual(done.rows.map((_, i) => i + 1));
    expect(done.crossingNos).toEqual(done.rows.map(row => row.no));
  });

  it("the crossing sequence only grows, and never reorders", () => {
    let seen: number[] = [];
    for (let step = 0; step <= 1000; step++) {
      const view = orderView(field, step / 1000, "ハイ", seed);
      expect(view.crossingNos.slice(0, seen.length)).toEqual(seen);
      expect(view.crossingNos.length).toBeGreaterThanOrEqual(seen.length);
      seen = view.crossingNos;
      view.rows.forEach(row => expect(row.crossing === null).toBe(!view.crossingNos.includes(row.no)));
    }
    expect(seen).toHaveLength(field.length);
    expect(seen).toEqual(crossingSequence(field, "ハイ", seed).map(entry => entry.no));
  });

  it("is the same crossing order for the same race_key on every replay, and equals the order of the final frame", () => {
    for (const pace of ["スロー", "平均", "ハイ"] as const) {
      const a = crossingSequence(field, pace, seed).map(entry => entry.no);
      expect(crossingSequence(field, pace, seed).map(entry => entry.no)).toEqual(a);
      expect(orderFrame(scenarioFrame(field, 1, pace, seed).runners, seed).map(row => row.no)).toEqual(a);
    }
  });

  it("the order keeps changing through the home straight and settles only just before the line", () => {
    const rows = (p: number, pace: "スロー" | "平均" | "ハイ") => orderView(field, p, pace, seed).rows.map(row => row.no);
    expect(["スロー", "ハイ"].some(pace => rows(0.85, pace as "スロー") .join() !== rows(0.93, pace as "スロー").join())).toBe(true);
    for (const pace of ["スロー", "平均", "ハイ"] as const) for (let step = 0; step <= 20; step++) expect(rows(0.93 + (step / 20) * 0.07, pace)).toEqual(rows(1, pace));
  });

  it("no scenario text names a winner or numbers a finishing place", () => {
    for (const file of ["scenarioOrder.ts", "../components/trace/ScenarioOrderPanel.tsx", "../components/trace/TrackStage.tsx"]) {
      const code = strip(file); // user-visible strings and code; comments are not shown
      for (const banned of [/[123１２３]着/, /winner/i, /predicted/i, /forecast/i]) expect(code, `${file} ${banned}`).not.toMatch(banned);
    }
    expect(CROSSING_NOTE).toBe("この順番はシナリオ上の仮想通過順です。実際の着順予測ではありません。");
  });
});

describe("SCENARIO ORDER V3: checkpoints and rank delta", () => {
  it("has the seven checkpoints in order: START, EARLY, BACKSTRETCH, THIRD TURN, FINAL TURN, HOME STRAIGHT, GOAL", () => {
    expect(CHECKPOINTS.map(c => c.label)).toEqual(["START", "EARLY", "BACKSTRETCH", "THIRD TURN", "FINAL TURN", "HOME STRAIGHT", "GOAL"]);
    const ts = CHECKPOINTS.map(c => c.t);
    expect([...ts].sort((a, b) => a - b)).toEqual(ts);
    expect(ts[ts.length - 1]).toBe(1);
  });

  it("reached checkpoints grow with progress up to GOAL at 100%", () => {
    expect(reachedCheckpoints(0)).toEqual(["START"]);
    expect(reachedCheckpoints(0.3)).toEqual(["START", "EARLY"]);
    expect(reachedCheckpoints(0.73)).toHaveLength(5);
    expect(reachedCheckpoints(0.85)).toHaveLength(6);
    expect(reachedCheckpoints(0.99)).toHaveLength(6);
    expect(reachedCheckpoints(1)).toHaveLength(7);
  });

  it("the GOAL rank of every runner is its place in the crossing order", () => {
    const history = rankHistory(field, "平均", seed);
    crossingSequence(field, "平均", seed).forEach((entry, index) => expect(history.get(entry.no)!.GOAL).toBe(index + 1));
  });

  it("rank delta is measured against the last checkpoint passed (positive = moved up); START is not a reference", () => {
    const history = { START: 9, EARLY: 5, BACKSTRETCH: 4 } as const;
    expect(rankDelta(history, ["START"], 3)).toEqual({ previous: null, delta: null });
    expect(rankDelta(history, ["START", "EARLY"], 3)).toEqual({ previous: 5, delta: 2 });
    expect(rankDelta(history, ["START", "EARLY", "BACKSTRETCH"], 6)).toEqual({ previous: 4, delta: -2 });
    expect(rankDelta(history, ["START", "EARLY", "BACKSTRETCH"], 4)).toEqual({ previous: 4, delta: 0 });
    expect(rankDelta(undefined, ["START", "EARLY"], 2)).toEqual({ previous: null, delta: null });
    expect([deltaLabel(2), deltaLabel(-1), deltaLabel(0), deltaLabel(null)]).toEqual(["↑2", "↓1", "－", ""]);
  });

  it("a runner's delta at any progress equals the checkpoint rank minus the current rank, deterministically", () => {
    const history = rankHistory(field, "平均", seed);
    for (const progress of [0.25, 0.5, 0.7, 0.9, 0.97]) {
      const view = orderView(field, progress, "平均", seed);
      const reached = reachedCheckpoints(progress);
      const last = reached[reached.length - 1];
      for (const row of view.rows) {
        const { previous, delta } = rankDelta(history.get(row.no), reached, row.rank);
        expect(previous).toBe(history.get(row.no)![last]);
        expect(delta).toBe(previous! - row.rank);
      }
    }
  });
});

describe("safety: the order reads nothing but the scenario frame", () => {
  it("source never references market, probability, honmei, popularity or result data", () => {
    for (const file of ["scenarioOrder.ts", "courseAtlas.ts"]) {
      const code = strip(file);
      for (const forbidden of ["odds", "probab", "honmei", "popularity", "result", "ai_rank", "win_", "speed", "stamina", "Math.random", ...(file === "scenarioOrder.ts" ? ["official"] : [])]) {
        expect(code.toLowerCase(), `${file} must not mention ${forbidden}`).not.toContain(forbidden.toLowerCase());
      }
    }
    const imports = strip("scenarioOrder.ts").match(/from "[^"]+"/g)!;
    expect(imports.sort()).toEqual(['from "@/lib/scenarioReplay"']);
  });

  it("the moving-runner module does not import the atlas (elevation cannot affect motion)", () => {
    expect(strip("scenarioReplay.ts")).not.toContain("courseAtlas");
    expect(strip("scenarioOrder.ts")).not.toContain("courseAtlas");
  });
});

describe("compact view", () => {
  const rows = orderFrame(scenarioFrame(field, 0.5, "平均", seed).runners, seed);
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
    const big = Array.from({ length: 18 }, (_, i) => ({ no: i + 1, name: null, style: (["逃げ", "先行", "差し", "追込"] as const)[i % 4] }));
    const start = performance.now();
    for (let i = 0; i < 500; i++) orderView(big, (i % 100) / 100, "平均", seed);
    expect((performance.now() - start) / 500).toBeLessThan(2);
  });
});
