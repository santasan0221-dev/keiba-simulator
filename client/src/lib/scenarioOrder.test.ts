import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { compactRows, createThrottledEmitter, FINAL_PHASE_FROM, orderFrame, orderView, rankHistory, RANK_CHECKPOINTS } from "./scenarioOrder";
import { demoField, PHASE_KEYFRAME, scenarioFrame, scenarioSeed } from "./scenarioReplay";
import { pointOnPath, resolveCourse, stadiumPath } from "./courseAtlas";

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
    history.forEach(ranks => { expect(Object.keys(ranks).sort()).toEqual([...RANK_CHECKPOINTS].sort()); expect(ranks).not.toHaveProperty("FINISH"); });
  });
});

describe("FINISH handling", () => {
  it("labels FINAL PHASE above 95% and holds no rows at 100%", () => {
    expect(orderView(field, 0.5, "平均", seed).kind).toBe("LIVE");
    expect(orderView(field, FINAL_PHASE_FROM, "平均", seed).kind).toBe("LIVE");
    const final = orderView(field, 0.97, "平均", seed);
    expect(final.kind).toBe("FINAL_PHASE");
    expect(final.title).toBe("SCENARIO ORDER — FINAL PHASE");
    const done = orderView(field, 1, "平均", seed);
    expect(done).toEqual({ kind: "COMPLETE", title: "SCENARIO COMPLETE", message: "着順は予測していません", rows: [] });
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

describe("course atlas", () => {
  it("only Tokyo turf is populated from a cited source; everything else is an UNKNOWN generic oval", () => {
    const tokyo = resolveCourse("東京", "芝", 1600);
    expect(tokyo.direction).toBe("LEFT");
    expect(tokyo.lapMeters).toBe(2083.1);
    expect(tokyo.startPoint).toBe("UNKNOWN");
    expect(tokyo.sourceRefs.length).toBeGreaterThan(0);
    const other = resolveCourse("中山", "芝", 2000);
    expect(other.direction).toBe("UNKNOWN");
    expect(other.lapMeters).toBe("UNKNOWN");
    expect(other.sourceRefs).toEqual([]);
  });
  it("path direction: LEFT is counter-clockwise, RIGHT clockwise on screen", () => {
    const area = (path: { x: number; y: number }[]) => path.reduce((s, p, i) => { const q = path[(i + 1) % path.length]; return s + (p.x * q.y - q.x * p.y); }, 0);
    expect(area(stadiumPath("LEFT", 0.25))).toBeLessThan(0); // y-down screen: negative = counter-clockwise
    expect(area(stadiumPath("RIGHT", 0.25))).toBeGreaterThan(0);
    const p = stadiumPath("LEFT", 0.25);
    expect(p.every(point => point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1)).toBe(true);
    expect(pointOnPath(p, 0, 0)).toEqual(p[0]);
  });
});
