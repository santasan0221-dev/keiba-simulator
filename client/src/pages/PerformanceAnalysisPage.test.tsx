import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import type { ModelComparisonRow } from "@/lib/publicFeatureApi";

// PublicLabHeader/MemberGate render wouter's <Link>, which reads
// window.location via a browser-only hook; these tests run in vitest's
// node environment (no DOM), so stub it with a plain <a> -- same pattern
// as LabServiceNavigation.test.tsx.
vi.mock("wouter", () => ({ Link: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => React.createElement("a", { href, className }, children) }));
// AccessTierUI's components have the same pre-existing implicit-React-in-JSX-
// scope requirement as this test file works around for wouter above, but
// fixing that is unrelated to the ROI display contract this test covers --
// stub the one export this page uses instead of touching that source file.
vi.mock("@/components/AccessTierUI", () => ({
  MemberGate: () => React.createElement("div", { "data-testid": "member-gate-stub" }),
  AccessTierBadge: () => React.createElement("div", { "data-testid": "access-tier-badge-stub" }),
}));

import PerformanceAnalysisPage, { ModelRow } from "./PerformanceAnalysisPage";

const metric = (value: number | null, state = "AVAILABLE") => ({ state, value });

const championRow: ModelComparisonRow = {
  modelId: "champion",
  modelStage: "FORMAL",
  evaluationMode: "CHAMPION_FIXED_STAKE_SIMULATION",
  sampleStatus: "AVAILABLE",
  period: null,
  predictionCount: metric(338),
  confirmedCount: metric(321),
  top1HitRate: metric(0.3),
  top3HitRate: metric(0.6),
  winnerMrr: metric(0.4),
  ndcgAt3: metric(0.4),
  simulatedWinRoi: metric(-0.2851694915254237),
  simulatedPlaceRoi: metric(-0.27033898305084747),
  rankResidual: metric(null, "NOT_APPLICABLE"),
  marginSeconds: metric(null, "NOT_APPLICABLE"),
  evaluationBasis: "FINAL_MARK_HONMEI",
  uniqueHonmeiCount: metric(237),
  evaluatedCount: metric(236),
  missingHonmeiCount: metric(84),
  duplicateHonmeiCount: metric(0),
  inactiveHonmeiCount: metric(1),
};

// Shadow rows never carry the champion-only final_mark count fields --
// normalizeMetric's UNAVAILABLE/null default applies, same as a real
// shadow API response that omits these keys entirely.
const shadowRow: ModelComparisonRow = {
  ...championRow,
  modelId: "v24",
  modelStage: "SHADOW",
  evaluationMode: "SHADOW_FIXED_STAKE_SIMULATION",
  simulatedWinRoi: metric(-0.1962962962962963),
  simulatedPlaceRoi: metric(-0.1814814814814815),
  evaluationBasis: null,
  uniqueHonmeiCount: metric(null, "UNAVAILABLE"),
  evaluatedCount: metric(null, "UNAVAILABLE"),
  missingHonmeiCount: metric(null, "UNAVAILABLE"),
  duplicateHonmeiCount: metric(null, "UNAVAILABLE"),
  inactiveHonmeiCount: metric(null, "UNAVAILABLE"),
};

// Regression coverage for the ROI display-contract audit: this ROI is a
// fixed-100-yen single-horse simulation against real official payouts --
// never real purchase data, never scoped to formal BET/gate_status -- and
// the champion card must not read or claim otherwise.
describe("ModelRow (実績・分析 ROI display contract)", () => {
  it("labels the champion row as a fixed-stake simulation, not an actual/real result", () => {
    const markup = renderToStaticMarkup(<ModelRow row={championRow} />);
    expect(markup).toContain("正式モデル");
    expect(markup).toContain("100円固定シミュレーション");
    expect(markup).toContain("単勝回収率（100円固定・仮想）");
    expect(markup).toContain("複勝回収率（100円固定・仮想）");
    expect(markup).not.toContain("ACTUAL");
    expect(markup).not.toContain("正本値");
    expect(markup).not.toContain("実績ROI");
  });

  it("labels the shadow row as the SAME simulation family as the champion row, not a different real/hypothetical split", () => {
    const markup = renderToStaticMarkup(<ModelRow row={shadowRow} />);
    expect(markup).toContain("研究用");
    expect(markup).toContain("100円固定シミュレーション");
    expect(markup).toContain("単勝回収率（100円固定・仮想）");
    expect(markup).not.toContain("ACTUAL");
  });
});

// Regression coverage for the FINAL_MARK_HONMEI evaluation-count disclosure:
// confirmed_count (321) must never be read as the ROI sample size when the
// true evaluated population is evaluated_count (236).
describe("ModelRow (champion ROI evaluation-count disclosure)", () => {
  it("CASE 1: shows confirmed_count", () => {
    const markup = renderToStaticMarkup(<ModelRow row={championRow} />);
    expect(markup).toContain("結果確定件数");
    expect(markup).toContain("321");
  });

  it("CASE 2: shows evaluated_count as the ROI evaluation target", () => {
    const markup = renderToStaticMarkup(<ModelRow row={championRow} />);
    expect(markup).toContain("ROI評価対象");
    expect(markup).toContain("236");
  });

  it("CASE 3: shows missing_honmei_count", () => {
    const markup = renderToStaticMarkup(<ModelRow row={championRow} />);
    expect(markup).toContain("AI本命◎なし");
    expect(markup).toContain("84");
  });

  it("CASE 4: shows the inactive-honmei note when inactive_honmei_count > 0", () => {
    const markup = renderToStaticMarkup(<ModelRow row={championRow} />);
    expect(markup).toContain("取消・除外等による評価対象外：1件");
  });

  it("CASE 5: hides the duplicate-honmei note when duplicate_honmei_count == 0", () => {
    const markup = renderToStaticMarkup(<ModelRow row={championRow} />);
    expect(markup).not.toContain("AI本命◎重複");
  });

  it("CASE 6: shows the duplicate-honmei note when duplicate_honmei_count > 0", () => {
    const row: ModelComparisonRow = { ...championRow, duplicateHonmeiCount: metric(2) };
    const markup = renderToStaticMarkup(<ModelRow row={row} />);
    expect(markup).toContain("AI本命◎重複による評価対象外：2件");
  });

  it("CASE 7: shows the evaluation-basis explanation", () => {
    const markup = renderToStaticMarkup(<ModelRow row={championRow} />);
    expect(markup).toContain("ROIは保存済みAI本命◎が一意に存在し、評価可能なレースのみを対象にしています。");
  });

  it("CASE 8: shadow row renders cleanly with no champion-only count fields, no crash, no fabricated 0", () => {
    const markup = renderToStaticMarkup(<ModelRow row={shadowRow} />);
    expect(markup).not.toContain("ROI評価対象");
    expect(markup).not.toContain("AI本命◎なし");
    expect(markup).not.toContain("取消・除外等");
    expect(markup).not.toContain("AI本命◎重複");
    expect(markup).not.toContain("undefined");
    expect(markup).not.toContain("NaN");
  });

  it("CASE 9: does not alter the existing win/place ROI values", () => {
    const markup = renderToStaticMarkup(<ModelRow row={championRow} />);
    expect(markup).toContain("-0.285");
    expect(markup).toContain("-0.270");
  });

  it("CASE 10: preserves the existing simulation disclaimers", () => {
    const markup = renderToStaticMarkup(<ModelRow row={championRow} />);
    expect(markup).toContain("100円固定シミュレーション");
  });
});

describe("PerformanceAnalysisPage (page-level ROI disclaimer)", () => {
  it("tells the user this is a simulation and not real purchase history, before any data has loaded", () => {
    // useEffect (the fetch) never runs under renderToStaticMarkup, so this
    // exercises the page's static intro copy -- which is exactly what
    // must carry the disclaimer regardless of load state.
    const markup = renderToStaticMarkup(<PerformanceAnalysisPage />);
    expect(markup).toContain("100円を購入したと仮定");
    expect(markup).toContain("実際の馬券購入履歴や実収支ではありません");
    expect(markup).not.toContain("実績の収益と明確に分離");
  });
});
