import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("wouter", () => ({ Link: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => React.createElement("a", { href, className }, children) }));

import { CommandCenter } from "./CommandCenter";
import { TraceHero, HERO_TITLE } from "./TraceHero";
import { TodayRecord } from "./TodayRecord";
import { LabValueStrip } from "@/components/LabValueStrip";
import { FreeScopeStrip, MemberGate } from "@/components/AccessTierUI";
import RulesPage from "@/pages/RulesPage";
import FreeRacesPage from "@/pages/FreeRacesPage";
import MemberPage from "@/pages/MemberPage";
import { emptyTodayRecord, type TodayRecord as Counts } from "@/lib/todayRecord";

// vitest compiles JSX with the classic runtime; some page modules rely on the build-time automatic runtime.
(globalThis as { React?: typeof React }).React = React;

const verdicts = { BUY: 1, WATCH: 2, PASS: 3, UNKNOWN: 0 };
const render = (record: Counts | null, state: "loading" | "ready" | "unavailable" = "ready") =>
  renderToStaticMarkup(<TodayRecord record={record} state={state} daily={null} healthOk={true} verdicts={verdicts} verdictsReady={true} />);

describe("Hero and first view", () => {
  it("renders exactly one <h1> across everything Home composes", () => {
    const html = [<TraceHero />, <CommandCenter />, <LabValueStrip />, <FreeScopeStrip />, <MemberGate />].map(node => renderToStaticMarkup(node)).join("");
    expect(html.match(/<h1[\s>]/g) ?? []).toHaveLength(1);
    expect(html).toContain(HERO_TITLE);
  });

  it("states what the site is and keeps the not-a-recommendation notice", () => {
    const html = renderToStaticMarkup(<TraceHero />);
    expect(html).toContain("AIは競馬をどこまで予測できるのか。");
    expect(html).toContain("発走前に記録したAIの◎");
    expect(html).toContain("◎は購入推奨ではありません");
    expect(html).toContain('href="/rules"');
  });

  it("orders the CTAs: primary 今日の予想を見る, secondary 最新結果を見る, simulator as a third text link", () => {
    const html = renderToStaticMarkup(<TraceHero />);
    const primary = html.indexOf("今日の予想を見る");
    const secondary = html.indexOf("最新結果を見る");
    const tertiary = html.indexOf("シミュレーターを見る");
    expect(primary).toBeGreaterThan(-1);
    expect(secondary).toBeGreaterThan(primary);
    expect(tertiary).toBeGreaterThan(secondary);
    expect(html).toMatch(/kt-cta kt-cta--primary[^>]*>今日の予想を見る/);
    expect(html).toMatch(/href="\/ai-history#race-ledger" class="kt-cta">最新結果を見る/);
    expect(html).toMatch(/class="kt-hero-tertiary">シミュレーターを見る/);
    expect(html).toContain('href="#today-race-board"');
  });

  it("has no hit-rate / return claims or hype words in the hero", () => {
    const html = renderToStaticMarkup(<TraceHero />);
    for (const word of ["絶対", "鉄板", "高確率", "自信度", "回収率", "的中率", "必勝", "稼ぐ"]) expect(html, word).not.toContain(word);
  });
});

describe("Today's Record", () => {
  const base = (over: Partial<Counts>): Counts => ({ ...emptyTodayRecord(), ...over });

  it("shows counts and NO rate while anything is undecided", () => {
    const html = render(base({ total: 12, confirmed: 7, pending: 4, review: 1, base: 12, win: 2, top3: 4, outside: 3, undetermined: 5, rateReady: false }));
    expect(html).toContain("対象R");
    expect(html).toContain("確定待ち");
    expect(html).toContain("要確認");
    expect(html).toContain("確定待ち・要確認のレースが残っているため、率は表示していません");
    expect(html).not.toMatch(/\d+(\.\d+)?%/);
    expect(html).not.toContain("2/12");
  });

  it("shows a rate only as numerator/denominator once everything is decided", () => {
    const html = render(base({ total: 4, confirmed: 4, base: 4, win: 1, top3: 3, outside: 1, rateReady: true }));
    expect(html).toContain("1/4");
    expect(html).toContain("3/4");
    expect(html).toContain("25.0%");
  });

  it("lists exclusions separately and keeps 競走中止 inside the base", () => {
    const html = render(base({ total: 5, confirmed: 5, base: 3, win: 1, top3: 1, dnf: 1, outside: 1, nonStarter: 1, raceStopped: 1, rateReady: true }));
    expect(html).toContain("非出走（取消・除外）1件");
    expect(html).toContain("レース不成立 1件");
    expect(html).toContain("競走中止");
    expect(html).toContain("母数に含む");
    expect(html).toContain("率の母数 3R");
  });

  it("keeps BUY/WATCH/PASS separate from ◎ and says ◎ is not a recommendation", () => {
    const html = render(base({ total: 1, base: 1, pending: 1, undetermined: 1 }));
    expect(html).toContain("買い判定");
    expect(html).toContain("◎とは別の判定です");
    expect(html).toContain("◎は購入推奨ではありません");
  });

  it("renders unknown values as … / 取得不能 and never as a bare 0 or [object Object]", () => {
    for (const state of ["loading", "unavailable"] as const) {
      const html = render(null, state);
      expect(html).not.toContain("[object Object]");
      expect(html).not.toMatch(/<dd class="kt-num">0</);
      expect(html).toContain(state === "loading" ? "…" : "取得不能");
    }
    const home = renderToStaticMarkup(<CommandCenter />);
    expect(home).toContain("今日の記録");
    expect(home).not.toContain("[object Object]");
    expect(home).not.toMatch(/kt-tick"[^>]*>0</);
  });
});

describe("/rules page", () => {
  const html = renderToStaticMarkup(<RulesPage />);

  it("explains ◎ / AI TOP / MARKET TOP, losses, pending and REVIEW_REQUIRED", () => {
    for (const text of ["◎（公開本命）", "AI TOP", "MARKET TOP", "外れも同じ形式で残します", "確定待ち", "要確認（REVIEW_REQUIRED）", "◎は購入推奨ではありません"]) expect(html, text).toContain(text);
  });

  it("states the D6 counting rules", () => {
    for (const text of ["出走取消・競走除外", "競走中止", "取止（不成立）", "同着", "公式の着順のとおり", "含めない", "含める"]) expect(html, text).toContain(text);
    expect(html).toContain("確定待ちが残っているあいだは、率を表示しません");
  });

  it("positions virtual ROI as a reference / research value, not a verified result", () => {
    expect(html).toContain("仮想ROI");
    expect(html).toContain("収益性や優位性の検証結果でもありません");
    expect(html).toContain("研究用の仮想シナリオ");
  });

  it("marks unbuilt promises as 準備中 and avoids hype", () => {
    expect(html).toContain("準備中");
    for (const word of ["絶対", "鉄板", "高確率", "自信度MAX"]) expect(html, word).not.toContain(word);
    expect(html).not.toContain("[object Object]");
  });
});

describe("D1 copy: free scope is every race", () => {
  const surfaces = [
    renderToStaticMarkup(<FreeScopeStrip />),
    renderToStaticMarkup(<MemberGate />),
    renderToStaticMarkup(<MemberPage />),
    renderToStaticMarkup(<FreeRacesPage />),
  ].join("\n");

  it("no longer claims a one-race / fixed-rule FREE scope or a locked pre-race detail", () => {
    for (const phrase of ["事前固定", "FREE公開対象", "一部発走前", "MEMBER_LOCKED", "free_prerace_v1", "SELECTION_LOCK", "発走前公開は利用できません", "9R〜12R"]) {
      expect(surfaces, phrase).not.toContain(phrase);
    }
  });

  it("says ◎ / AI TOP / MARKET TOP / basic results are free for every race", () => {
    expect(surfaces).toContain("全レース無料");
    expect(surfaces).toContain("FREE: ◎・AI TOP・MARKET TOP・基本結果（全レース）");
  });

  it("shows no KEIBA LAB brand text", () => {
    expect(surfaces.replace(/<[^>]*>/g, "")).not.toMatch(/\bKEIBA\s+LAB\b/i);
  });
});
