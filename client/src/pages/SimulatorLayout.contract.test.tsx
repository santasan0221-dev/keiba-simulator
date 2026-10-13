import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("wouter", () => ({ Link: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => React.createElement("a", { href, className }, children) }));

import SimulatorShell from "./SimulatorShell";

const html = renderToStaticMarkup(<SimulatorShell />);
const at = (needle: string) => { const index = html.indexOf(needle); expect(index, needle).toBeGreaterThan(-1); return index; };

describe("simulator track-focus layout (default)", () => {
  it("orders the stage: track, status strip, playback, VIEW toggle, then the collapsed details", () => {
    const order = ["<svg", 'class="kt-status"', 'class="kt-playback"', 'class="kt-camera kt-view"', 'class="kt-more"'].map(at);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html).toContain('data-layout="C"');
  });
  it("keeps camera, section jump and course info in the (closed) details, not removed", () => {
    const details = html.slice(at('class="kt-more"'), at("</details>"));
    for (const part of ["CAMERA", "kt-phase-rail", "kt-course-facts", "kt-course-note", "kt-palette-note"]) expect(details, part).toContain(part);
    expect(details).not.toContain(" open");
  });
  it("moves the fixed PRE-RACE panel below the stage without removing it", () => {
    expect(at('class="kt-prerace"')).toBeGreaterThan(at('class="kt-more"'));
  });
  it("still shows five leader chips labelled as virtual order and the research notice", () => {
    expect(html.match(/data-leader-chip/g)).toHaveLength(5);
    expect(html).toContain("仮想順");
    expect(html).toContain("実測位置ではありません");
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("status strip layout stability (CLS)", () => {
  const css = readFileSync(resolve(import.meta.dirname, "../trace.css"), "utf8");
  const shell = readFileSync(resolve(import.meta.dirname, "SimulatorShell.tsx"), "utf8");
  it("gives the status strip a fixed two-row block on mobile so long section / distance text cannot wrap and move the controls", () => {
    expect(css).toMatch(/\.kt-page:not\(\.is-share-view\) \.kt-status-main \{[^}]*grid-template-rows: 22px 28px/);
    expect(css).toMatch(/\.kt-status-phase, \.kt-page:not\(\.is-share-view\) \.kt-status-remaining \{ white-space: nowrap/);
  });
  it("places the COMPLETE notice below the playback controls in layouts B/C (Share View and layout A keep the old position)", () => {
    expect(shell).toContain('{shareView || layout === "A" ? completeBlock : null}');
    expect(shell).toContain('{shareView || layout === "A" ? null : completeBlock}');
    expect(shell.indexOf('{shareView || layout === "A" ? null : completeBlock}')).toBeGreaterThan(shell.indexOf('<footer className="kt-playback">'));
  });
});
