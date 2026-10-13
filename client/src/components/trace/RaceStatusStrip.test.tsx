import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RaceStatusStrip } from "./RaceStatusStrip";

const leaders = [1, 2, 3, 4, 5].map(rank => ({ rank, no: rank * 3, name: `馬${rank * 3}` }));
const render = (variant: "A" | "B" | "C", selectedNo: number | null = null) => renderToStaticMarkup(<RaceStatusStrip variant={variant} status="PLAYING" section="3コーナー" remaining="残り 約900m" leaders={leaders} selectedNo={selectedNo} selectedRank={selectedNo === null ? null : 2} onSelect={() => undefined} />);

describe("RaceStatusStrip", () => {
  it("variant B shows state, section, rounded remaining distance and exactly five leader chips with rank digits", () => {
    const html = render("B");
    expect(html).toContain("PLAYING");
    expect(html).toContain("3コーナー");
    expect(html).toContain("残り 約900m");
    expect(html.match(/data-leader-chip/g)).toHaveLength(5);
    expect(html).toContain("仮想順");
    expect(html).toContain("先頭5頭（シナリオ上の仮想順）");
    expect(html).not.toContain("data-selected-status");
  });
  it("variant A has no leader chips; variant C adds the selected-horse status", () => {
    expect(render("A")).not.toContain("data-leader-chip");
    expect(render("C", 6)).toContain("選択中 #6 · 現在 2位（仮想順）");
  });
  it("marks the selected chip with aria-pressed and a spoken label (not colour only)", () => {
    const html = render("B", 9);
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("3位 9番");
    expect(html).toContain("選択中");
  });
  it("omits section / remaining when the course cannot support them", () => {
    const html = renderToStaticMarkup(<RaceStatusStrip variant="B" status="READY" section={null} remaining={null} leaders={leaders} selectedNo={null} selectedRank={null} onSelect={() => undefined} />);
    expect(html).not.toContain("data-phase-callout");
    expect(html).not.toContain("data-remaining-callout");
  });
});
