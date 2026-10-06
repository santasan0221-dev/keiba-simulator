import React from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import fixture from "@/__fixtures__/lab-race-v2.json";
import type { LabRace, LabResultListItem } from "@/lib/singlePickAi";
import { officialResultView } from "@/lib/simulatorResult";

vi.mock("wouter", () => ({ Link: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => React.createElement("a", { href, className }, children) }));

import SimulatorShell, { OfficialResultPanel } from "./SimulatorShell";

const source = readFileSync(resolve(import.meta.dirname, "SimulatorShell.tsx"), "utf8");
const race = (): LabRace => {
  const value = structuredClone(fixture) as unknown as LabRace;
  value.result = { status: "CONFIRMED", official_order: [3, 2, 5, 1, 4].map((no, i) => ({ finish: i + 1, horse_no: no, horse_name: `馬${no}`, popularity: null })), ai_pick: null, payouts: null };
  return value;
};
const row = (over: Partial<LabResultListItem>): LabResultListItem => ({ race_key: "k", race_date: null, organization: "JRA", venue: "東京", race_no: 11, scheduled_start_at: null, prediction_id: null, prediction_created_at: null, predicted_top3: [{ mark: "◎", horse_no: 1, horse_name: "サンダーリーフ" }], official_top3: [3, 2, 5], ai_pick_finish: 4, top3_coverage: 1 / 3, result_status: "CONFIRMED", special_statuses: [], result_fetched_at: null, ...over });

describe("simulator v2 page contract", () => {
  const html = renderToStaticMarkup(<SimulatorShell />);

  it("labels the motion as a scenario, not measured positions or race time", () => {
    for (const label of ["SCENARIO MOTION", "実測位置ではありません", "Scenario progress", "RESEARCH_ONLY", "レース経過時間ではありません"]) expect(html).toContain(label);
    for (const speed of ["1x", "1.5x", "2x"]) expect(html).toContain(`>${speed}<`);
    for (const forbidden of ["速度", "スタミナ", "km/h", "LIVE", "実況", "OFFICIAL RESULT", "勝者"]) expect(html, forbidden).not.toContain(forbidden);
  });

  it("shows the pre-race panel as fixed information, fed only by the race (never by playback progress)", () => {
    expect(html).toContain("PRE-RACE");
    expect(html).toContain("再生中に更新しません");
    expect(source).toMatch(/<PreRacePanel race=\{race\} \/>/);
    expect(source).toMatch(/function PreRacePanel\(\{ race \}: \{ race: LabRace \| null \}\)/);
  });

  it("never builds a winner from the scenario: the result panel only takes the canonical view", () => {
    expect(source).toMatch(/<OfficialResultPanel view=\{official\}/);
    expect(source).toMatch(/officialResultView\(result\.row, race,/);
    expect(source).not.toMatch(/winner|勝ち馬|1着.*frame/);
  });

  it("uses requestAnimationFrame for motion and keyframe steps under reduced motion", () => {
    expect(source).toContain("requestAnimationFrame");
    expect(source).toContain('useMediaQuery("(prefers-reduced-motion: reduce)")');
    expect(source).toMatch(/if \(!playing \|\| reducedMotion\) return;/);
    expect(source).toMatch(/if \(!playing \|\| !reducedMotion\) return;/);
  });
});

describe("simulator v3: SCENARIO ORDER wiring", () => {
  const html = renderToStaticMarkup(<SimulatorShell />);
  it("always shows the SCENARIO ORDER note", () => {
    expect(html).toContain("SCENARIO ORDER");
    expect(html).toContain("シナリオ上の仮想順位です。実測・着順予測ではありません。");
  });
  it("feeds the order panel only runners / pace / seed and the throttled progress -- no race, picks, result or odds", () => {
    expect(source).toMatch(/<ScenarioOrderPanel selectedNo=\{selectedNo\} onSelect=\{setSelectedNo\} runners=\{runners\} pace=\{pace\} seed=\{seed\} progress=\{progress\} compact=\{compact\} gapField=\{field\} \/>/);
    expect(source).toContain("createThrottledEmitter");
    expect(source).not.toMatch(/ScenarioOrderPanel[^>]*(race=|honmei|official|result)/);
  });
  it("the order panel never reads picks, odds, probability or the official result", () => {
    const panel = readFileSync(resolve(import.meta.dirname, "../components/trace/ScenarioOrderPanel.tsx"), "utf8");
    for (const forbidden of ["honmei", "odds", "probability", "popularity", "officialResult", "LabResult", "pickCards"]) expect(panel, forbidden).not.toContain(forbidden);
  });
  it("the official result only opens in RESULT mode, never from the scenario order", () => {
    expect(source).toMatch(/if \(!complete \|\| !confirmed \|\| autoSwitched\.current\) return;/);
  });
  it("mobile CSS keeps the order list inside the viewport", () => {
    const css = readFileSync(resolve(import.meta.dirname, "../trace.css"), "utf8");
    expect(css).toMatch(/\.kt-order-name \{[^}]*min-width: 0[^}]*text-overflow: ellipsis/);
    expect(css).toMatch(/\.kt-order \{[^}]*min-width: 0/);
  });
});

describe("simulator v3: broadcast experience wiring", () => {
  const html = renderToStaticMarkup(<SimulatorShell />);
  const read = (file: string) => readFileSync(resolve(import.meta.dirname, file), "utf8");
  const stage = read("../components/trace/TrackStage.tsx").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const selector = read("../components/trace/CameraSelector.tsx");
  const css = read("../trace.css");

  it("shows the camera selector, the current section and the always-on position note", () => {
    for (const label of ["CAMERA", "TRACK", "BROADCAST", "AUTO", "SECTION · START", "SCENARIO POSITION", "実測位置ではありません"]) expect(html, label).toContain(label);
    expect(html).toContain('role="radiogroup"');
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain("コースの特徴");
  });

  it("the animation writes straight to the DOM: progress store, no per-frame React state, no layout reads", () => {
    expect(source).toContain("createProgressStore");
    expect(source).toContain("store.set(next)");
    expect(source).not.toMatch(/tick = [^\n]*\n[^\n]*setProgress/);
    expect(stage).toContain("requestAnimationFrame");
    expect(stage).toContain("setAttribute");
    for (const forbidden of ["getBoundingClientRect", "offsetWidth", "offsetHeight", "clientWidth", "getComputedStyle", "useState", "setState"]) expect(stage, forbidden).not.toContain(forbidden);
  });

  it("the stage and camera read no market, probability, pick or result data", () => {
    for (const forbidden of ["singlePickAi", "raceView", "pickCards", "odds", "probability", "popularity", "officialResult", "LabResult"]) expect(stage, forbidden).not.toContain(forbidden);
    expect(stage).toContain("honmeiNo"); // the ◎ is only a static class on its dot, never an input to motion or camera
    expect(stage).not.toMatch(/cosmeticLane\([^)]*honmei/);
    expect(stage).not.toMatch(/cameraTarget\([^)]*honmei/);
  });

  it("reduced motion: AUTO falls back to the whole track, no easing loop, no parallax", () => {
    expect(stage).toContain('s.reduced && s.mode === "AUTO" ? "TRACK"');
    expect(stage).toMatch(/if \(s\.reduced\) \{ camera\.current = target\.current; apply\(camera\.current\); return; \}/);
    expect(stage).toMatch(/parallaxRef\.current && !live\.current\.reduced/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.kt-parallax \{ display: none; \}/);
  });

  it("camera selector is a keyboard-operable radio group with focus rings and 44px targets", () => {
    expect(selector).toContain('role="radio"');
    expect(selector).toContain("aria-checked");
    expect(selector).toContain("tabIndex={mode === value ? 0 : -1}");
    for (const key of ["ArrowRight", "ArrowLeft"]) expect(selector).toContain(key);
    expect(css).toMatch(/\.kt-camera-options button \{[^}]*min-height: 44px/);
    expect(css).toMatch(/\.kt-camera-options button:focus-visible/);
    expect(css).toMatch(/\.kt-order-list li button \{ min-height: 44px; \}/);
  });

  it("full finish: no freeze, no fade, no end caption; the goal line is framed and a straight course runs on past the line", () => {
    expect(stage).not.toMatch(/if \(progress >= 1 && fixedProgress === undefined\) return;/);
    expect(stage).not.toContain("kt-track-end");
    expect(stage).not.toContain("setAttribute(\"opacity\"");
    expect(stage).toContain("anchors: s.goalPoints");
    expect(stage).toContain("(share - 1) * pathLength");
  });
});

describe("official result panel", () => {
  it("confirmed → podium top 3 with ◎ / AI TOP / MARKET TOP finishes and coverage", () => {
    const html = renderToStaticMarkup(<OfficialResultPanel view={officialResultView(row({}), race())} loading={false} race={race()} />);
    expect(html).toContain("OFFICIAL RESULT");
    expect(html).toContain("CANONICAL");
    for (const place of ["1着", "2着", "3着"]) expect(html).toContain(place);
    expect(html).toContain("公開◎ #1");
    expect(html).toContain("4着");
    expect(html).toContain("33.3%");
  });

  it("pending → RESULT PENDING, never a finish position", () => {
    const html = renderToStaticMarkup(<OfficialResultPanel view={officialResultView(row({ result_status: "PENDING", official_top3: [], ai_pick_finish: null, top3_coverage: null }), race())} loading={false} race={race()} onRefresh={() => undefined} />);
    expect(html).toContain("RESULT PENDING");
    expect(html).toContain("公式結果を確認中");
    expect(html).toContain("公式結果を再取得");
    expect(html).not.toMatch(/\d着/);
  });

  it("REVIEW_REQUIRED → REVIEW REQUIRED, not a result", () => {
    const html = renderToStaticMarkup(<OfficialResultPanel view={officialResultView(row({ result_status: "REVIEW_REQUIRED" }), race())} loading={false} race={race()} />);
    expect(html).toContain("REVIEW REQUIRED");
    expect(html).not.toContain("OFFICIAL RESULT");
    expect(html).not.toMatch(/\d着/);
  });
});

describe("simulator analytics wiring (anonymous playback events)", () => {
  it("uses the existing contract's trackBetaEvent through the tracker and sends nothing identifying directly", () => {
    expect(source).toContain("createSimulatorTracker(trackBetaEvent)");
    // the page's only direct trackBetaEvent call is the existing view event, which carries just how it was opened
    expect((source.match(/trackBetaEvent\(/g) ?? []).length).toBe(1);
    expect(source).toMatch(/name: "beta_simulator_open", properties: \{ entry: fromRace \? "race_link" : "direct" \}/);
    for (const forbidden of ["tracker.onProgress(progress, lastCrossT)"]) expect(source).toContain(forbidden);
  });

  it("completion is the last runner's crossing, taken from the scenario's own crossing sequence", () => {
    expect(source).toContain("crossingSequence(runners, pace, seed, field)");
    expect(source).toContain("sequence[sequence.length - 1].t");
  });

  it("playback start and resume come from the playing state; scrubs, rail jumps and restarts are told apart", () => {
    expect(source).toMatch(/if \(playing\) tracker\.onPlay\(store\.get\(\)\)/);
    expect(source).toContain("tracker.onSeek(PHASE_KEYFRAME[item])");
    expect(source).toContain("tracker.onSeek(Number(event.target.value) / 1000)");
    expect((source.match(/tracker\.onRestart\(\)/g) ?? []).length).toBe(2); // REPLAY / play at the end, and the "from the start" button
    expect(source).toContain("tracker.onScenarioChange()");
    // the reduced-motion stepping is playback: it must not be reported as a scrub
    expect(source).toMatch(/window\.setTimeout\(\(\) => seek\(next\), 1800 \/ speed\)/);
  });

  it("camera changes to the same mode are not reported; the official-result view says how it was reached", () => {
    expect(source).toContain("if (next !== cameraMode) tracker.onCameraChange(next)");
    expect(source).toContain("onChange={changeCamera}");
    expect(source).toContain('resultSource.current = "auto"');
    expect(source).toContain("tracker.onOfficialResultView(resultSource.current)");
  });

  it("the simulation modules were not touched by the analytics change", () => {
    for (const file of ["scenarioReplay.ts", "scenarioOrder.ts", "scenarioNoise.ts", "scenarioRunnerField.ts", "terrainTempo.ts", "horseScenarioProfile.ts", "camera.ts"]) {
      const text = readFileSync(resolve(import.meta.dirname, "../lib", file), "utf8");
      expect(text, `${file} must not know about analytics`).not.toMatch(/betaAnalytics|simulatorAnalytics|trackBetaEvent|umami/);
    }
  });
});
