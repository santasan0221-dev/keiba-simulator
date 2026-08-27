import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/singlePickAi", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/singlePickAi")>();
  return { ...actual, fetchAvailablePredictionDates: vi.fn().mockResolvedValue({ available_dates: [], latest_prediction_date: null }), fetchRaces: vi.fn().mockResolvedValue({ races: [] }) };
});

// wouter's <Link> reads window.location via a browser-only hook; this test
// runs in vitest's node environment (no DOM), so stub it with a plain <a>.
vi.mock("wouter", () => ({ Link: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => React.createElement("a", { href, className }, children) }));

import { RealRaceLoader } from "./RealRaceLoader";

describe("RealRaceLoader", () => {
  it("never renders internal ops/dev-facing text on the public page", () => {
    const markup = renderToStaticMarkup(<RealRaceLoader onLoad={() => undefined} />);
    for (const forbidden of [
      "接続先 single_pick_ai",
      "認証エラー",
      "ローカル運用API",
      "結果健全性",
      "API HEALTH",
      "schema-version",
      "公式結果を取得",
    ]) {
      expect(markup).not.toContain(forbidden);
    }
  });

  it("still renders the race list container and org toggle", () => {
    const markup = renderToStaticMarkup(<RealRaceLoader onLoad={() => undefined} />);
    expect(markup).toContain('id="real-race-list"');
    expect(markup).toContain("主催");
    expect(markup).toContain("NAR");
    expect(markup).toContain("JRA");
  });
});
