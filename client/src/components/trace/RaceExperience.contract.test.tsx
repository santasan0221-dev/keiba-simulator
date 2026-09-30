import React from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import fixture from "@/__fixtures__/lab-race-v2.json";
import type { LabRace, LabResultListItem } from "@/lib/singlePickAi";

vi.mock("wouter", () => ({ Link: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => React.createElement("a", { href, className }, children) }));

import { AgreementPanel, PickTrio, RankingBoard, VerdictBanner, VerdictChip, WinnerStrip } from "./RaceParts";
import { CommandCenter } from "./CommandCenter";
import { ResultRow } from "@/components/OperationsDashboard";
import SimulatorShell from "@/pages/SimulatorShell";

/** Publication ◎ = #1, AI評価1位 = #3, market top = #5. */
function splitRace(): LabRace {
  const race = structuredClone(fixture) as unknown as LabRace;
  race.honmei = { status: "AVAILABLE", mark: "◎", horse_no: 1, horse_name: "サンダーリーフ", win_probability: 0.241 };
  race.ai_top = { status: "AVAILABLE", horse_no: 3, horse_name: "アオイノキセキ", win_probability: 0.3 };
  race.honmei_view = { sources: { market: { source: "MARKET", status: "AVAILABLE", horse_no: 5, win_probability: 0.2 } } };
  return race;
}

const between = (html: string, start: string, end: string) => html.slice(html.indexOf(start), html.indexOf(end, html.indexOf(start)));

describe("race experience display contract", () => {
  it("shows ◎ on the publication honmei card only, never on AI TOP or MARKET TOP", () => {
    const html = renderToStaticMarkup(<PickTrio race={splitRace()} />);
    expect(between(html, "HONMEI", "AI TOP")).toContain("◎");
    expect(between(html, "AI TOP", "MARKET TOP")).not.toContain("◎");
    expect(html.slice(html.indexOf("MARKET TOP"))).not.toContain("◎");
    expect(html.slice(html.indexOf("AI TOP"))).not.toContain("◎");
  });

  it("ranking marks only the publication honmei ◎, even though AI TOP is a different horse", () => {
    const html = renderToStaticMarkup(<RankingBoard race={splitRace()} />);
    expect(html.match(/kt-mark is-honmei/g)).toHaveLength(1);
    const aiTopRow = html.slice(html.lastIndexOf('<div role="row"', html.indexOf("AI TOP</span>")), html.indexOf("AI TOP</span>"));
    expect(aiTopRow).not.toContain("◎");
  });

  it("never renders [object Object] anywhere in the race experience", () => {
    const race = splitRace();
    const html = [<PickTrio race={race} />, <RankingBoard race={race} />, <AgreementPanel race={race} />, <WinnerStrip race={race} />, <VerdictBanner verdict="WATCH" reasons={["条件未達"]} />]
      .map(node => renderToStaticMarkup(node)).join("");
    expect(html).not.toContain("[object Object]");
  });

  it("renders missing probability / odds as — (データなし), never 0%", () => {
    const race = splitRace();
    const horse = race.horses.find(entry => entry.no === 7)!;
    expect(horse.model.win_probability).toBeNull();
    const html = renderToStaticMarkup(<RankingBoard race={race} />);
    const row = html.slice(html.indexOf("#7 AI勝率") - 400, html.indexOf("#7 AI勝率") + 200);
    expect(row).toContain("データなし");
    expect(row).not.toContain("0.0%");
  });

  it("shows MARKET UNAVAILABLE instead of a guessed market top", () => {
    const race = splitRace();
    race.honmei_view = { sources: { market: { source: "MARKET", status: "NOT_PUBLISHED", horse_no: null, win_probability: null } } };
    expect(renderToStaticMarkup(<AgreementPanel race={race} />)).toContain("MARKET UNAVAILABLE");
    expect(renderToStaticMarkup(<PickTrio race={race} />)).toContain("UNAVAILABLE");
  });

  it("BUY / WATCH / PASS / UNKNOWN carry label, icon and explanation, not color alone", () => {
    for (const verdict of ["BUY", "WATCH", "PASS", "UNKNOWN"] as const) {
      const chip = renderToStaticMarkup(<VerdictChip verdict={verdict} />);
      expect(chip).toContain(`<b>${verdict}</b>`);
      expect(chip).toContain("<svg");
      const banner = renderToStaticMarkup(<VerdictBanner verdict={verdict} reasons={[]} />);
      expect(banner).toContain("◎本命＝購入推奨ではありません");
    }
    expect(renderToStaticMarkup(<VerdictChip verdict="UNKNOWN" />)).not.toContain("見送り");
  });

  it("home command center shows unknown counts as —, never 0, before data arrives", () => {
    const html = renderToStaticMarkup(<CommandCenter />);
    expect(html).toContain("TODAY&#x27;S RACING COMMAND CENTER");
    expect(html).not.toMatch(/kt-tick"[^>]*>0</);
    expect(html).not.toContain("[object Object]");
  });
});

describe("race history card", () => {
  const base = { race_key: "JRA|2026-09-30|中山|11", organization: "JRA", venue: "中山", race_no: 11, result_status: "CONFIRMED", predicted_top3: [{ mark: "◎", horse_no: 4, horse_name: "本命馬" }], official_top3: [9, 4, 2], top3_coverage: 0.666667, special_statuses: [] } as unknown as LabResultListItem;

  it("emphasises a hit and keeps coverage as a percentage", () => {
    const html = renderToStaticMarkup(<ResultRow item={{ ...base, ai_pick_finish: 1 }} />);
    expect(html).toContain("kt-outcome--hit");
    expect(html).toContain("◎ 的中 · 1着");
    expect(html).toContain("66.7%");
  });

  it("does not hide a miss", () => {
    const html = renderToStaticMarkup(<ResultRow item={{ ...base, official_top3: [9, 3, 2], ai_pick_finish: 10 }} />);
    expect(html).toContain("◎ 圏外 · 10着");
    expect(html).toContain("kt-outcome--miss");
  });

  it("shows AI TOP / MARKET TOP finishes as 未確定 before confirmation, never 0", () => {
    const html = renderToStaticMarkup(<ResultRow item={{ ...base, result_status: "PENDING", ai_pick_finish: null, official_top3: [], top3_coverage: null }} />);
    expect(html).toContain("AI TOP着順");
    expect(html).toContain("MARKET TOP着順");
    expect(html).not.toContain(">0着<");
    expect(html).not.toContain(">0%<");
  });
});

describe("simulator is a research scenario, never telemetry", () => {
  it("labels RESEARCH_ONLY / SCENARIO and shows no measured speed, stamina or in-race probability", () => {
    const html = renderToStaticMarkup(<SimulatorShell />);
    expect(html).toContain("RESEARCH_ONLY");
    expect(html).toContain("SIMULATION / SCENARIO");
    for (const phase of ["START", "EARLY", "BACKSTRETCH", "TURN", "FINAL", "FINISH"]) expect(html).toContain(phase);
    for (const forbidden of ["km/h", "m/s", "残存体力", "スタミナ", "速度", "LIVE", "ライブ", "実況", "勝率更新中", "OFFICIAL RESULT"]) {
      expect(html, forbidden).not.toContain(forbidden);
    }
    expect(html).toContain("シナリオは勝率を計算しません");
  });
});

describe("motion", () => {
  const css = readFileSync(resolve(import.meta.dirname, "../../trace.css"), "utf8");
  it("disables every kt animation and transition under prefers-reduced-motion", () => {
    const block = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(block).toMatch(/\.kt-page \*[^{]*\{[^}]*animation-duration: \.001ms !important;[^}]*transition-duration: \.001ms !important;/);
  });
  it("keeps the ticker non-auto-scrolling (no marquee animation)", () => {
    expect(css).not.toMatch(/\.kt-ticker[^{]*\{[^}]*animation/);
  });
});

describe("agreement panel with an unavailable publication honmei", () => {
  it("renders INSUFFICIENT_DATA and never the ◎ mismatch sentence", () => {
    const race = splitRace();
    race.honmei = { status: "UNAVAILABLE", reason: "NO_PUBLICATION_HONMEI", mark: null, horse_no: null, horse_name: null, win_probability: null };
    const html = renderToStaticMarkup(<AgreementPanel race={race} />);
    expect(html).toContain("INSUFFICIENT DATA");
    expect(html).toContain("公開◎未取得");
    expect(html).not.toContain("DISAGREE");
    expect(html).not.toContain("すべて異なります");
  });
});
