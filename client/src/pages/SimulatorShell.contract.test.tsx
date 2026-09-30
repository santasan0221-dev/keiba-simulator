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
