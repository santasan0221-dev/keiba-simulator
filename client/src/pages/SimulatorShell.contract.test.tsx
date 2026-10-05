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
  it("feeds the order panel only the simulation, the throttled progress and the horse profiles -- no race, picks, result or odds", () => {
    expect(source).toMatch(/<ScenarioOrderPanel sim=\{sim\} progress=\{progress\} compact=\{compact\} profiles=\{profiles\} course=\{course\} \/>/);
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

  it("the camera holds once the last runner has crossed, and the goal line stays framed through the finish", () => {
    expect(stage).toMatch(/if \(progress >= s\.sim\.allCrossedT && fixedProgress === undefined\) \{/);
    expect(stage).toContain("GOAL_IN_VIEW_FROM");
    expect(stage).toMatch(/\.\.\.points, \.\.\.s\.goal/);
    expect(stage).toMatch(/cameraTarget\(\{ points: framed,/);
  });
});

describe("simulator v3.1: terrain, compatibility, variants and full finish wiring", () => {
  const html = renderToStaticMarkup(<SimulatorShell />);
  const stage = readFileSync(resolve(import.meta.dirname, "../components/trace/TrackStage.tsx"), "utf8");

  it("shows COURSE EFFECT with its note, and the variant switch with 'another run'", () => {
    expect(html).toContain("COURSE EFFECT");
    expect(html).toContain("コース形状によるシナリオテンポです。馬券評価ではありません。");
    for (const label of ["STANDARD", "ALT A", "ALT B", "別の展開を見る"]) expect(html, label).toContain(label);
    expect(html).toContain('aria-label="シナリオの展開"');
  });

  it("builds the simulation once per race / variant / pace from runners, horse profiles and the course -- nothing else", () => {
    expect(source).toMatch(/buildSim\(\{ raceKey: race\?\.race\.race_key \?\? "demo", variant, runners, profiles, course, pace \}\)/);
    expect(source).toMatch(/buildHorseProfiles\(race\.horses, \{ distance: race\.race\.distance \?\? null, going: race\.race\.going \?\? null, course \}\)/);
    expect(source).toMatch(/<TrackStage store=\{store\} sim=\{sim\}/);
    expect(source).not.toMatch(/buildSim\([^)]*(honmei|official|picks|odds)/);
    expect(stage).not.toContain("Math.random");
  });

  it("the scenario never shows finish-position wording", () => {
    expect(html).not.toMatch(/[123]着|winner|予想着順/);
  });

  it("the stage draws the run-out past the goal on the straight course and frames the goal line", () => {
    expect(stage).toContain("OPEN_RUNOUT");
    expect(stage).toContain("goal: [goalIn, goalOut]");
  });

  it("the order panel shows COURSE FIT only for the selected horse, with the reference note", () => {
    const panel = readFileSync(resolve(import.meta.dirname, "../components/trace/ScenarioOrderPanel.tsx"), "utf8");
    expect(panel).toMatch(/pinnedProfile \? <CourseFit/);
    expect(panel).toContain("過去データから見たコース適性の参考表示です。");
    expect(readFileSync(resolve(import.meta.dirname, "../lib/scenarioOrder.ts"), "utf8")).toContain("SCENARIO CROSSING ORDER");
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
