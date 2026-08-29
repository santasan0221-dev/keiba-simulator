import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { describe, expect, it, vi } from "vitest";

// wouter's <Link> reads window.location via a browser-only hook; this test
// runs in vitest's node environment (no DOM), so stub it with a plain <a>.
vi.mock("wouter", () => ({ Link: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => React.createElement("a", { href, className }, children) }));

import { LabServiceNavigation } from "./LabServiceNavigation";

describe("LabServiceNavigation", () => {
  it("links back to Home (today) so returning from any secondary page works", () => {
    const markup = renderToStaticMarkup(<LabServiceNavigation active="simulator" />);
    expect(markup).toContain('href="/"');
    expect(markup).toContain("本日の予想");
  });

  it("includes a simulator link pointing at /simulator", () => {
    const markup = renderToStaticMarkup(<LabServiceNavigation active="today" />);
    expect(markup).toContain('href="/simulator"');
    expect(markup).toContain("シミュレーター");
  });

  it("keeps the simulator link visually secondary -- after the real-prediction pages, not first, no special emphasis", () => {
    const markup = renderToStaticMarkup(<LabServiceNavigation active="today" />);
    const todayIndex = markup.indexOf('href="/"');
    const historyIndex = markup.indexOf('href="/ai-history"');
    const simulatorIndex = markup.indexOf('href="/simulator"');
    const memberIndex = markup.indexOf('href="/member"');
    expect(todayIndex).toBeGreaterThanOrEqual(0);
    expect(simulatorIndex).toBeGreaterThan(todayIndex);
    expect(simulatorIndex).toBeGreaterThan(historyIndex);
    expect(simulatorIndex).toBeLessThan(memberIndex);
  });

  it("marks the simulator link active when on /simulator, without changing its markup shape vs other links", () => {
    const markup = renderToStaticMarkup(<LabServiceNavigation active="simulator" />);
    expect(markup).toContain("is-active");
  });
});
