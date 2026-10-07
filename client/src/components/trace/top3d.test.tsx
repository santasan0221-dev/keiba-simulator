import React from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TrackStage, GEOMETRY } from "./TrackStage";
import { ViewSelector } from "./ViewSelector";
import { viewDepth, VIEW_MODES } from "@/lib/viewMode";
import { resolveCourse } from "@/lib/courseAtlas";

const read = (p: string) => readFileSync(resolve(import.meta.dirname, p), "utf8").replace(/\r\n/g, "\n");
const stage = read("TrackStage.tsx");
const runners = [1, 2, 3, 4, 5, 6, 7, 8].map(no => ({ no, name: `馬${no}`, style: "先行", lane: no % 4 })) as never[];

describe("viewMode (presentation only)", () => {
  it("maps TOP_3D to FULL, degrades to LITE under reduced motion, and keeps MAP flat", () => {
    expect(VIEW_MODES).toEqual(["MAP", "TOP_3D"]);
    expect(viewDepth("MAP", false)).toBe("FLAT");
    expect(viewDepth("MAP", true)).toBe("FLAT");
    expect(viewDepth("TOP_3D", false)).toBe("FULL");
    expect(viewDepth("TOP_3D", true)).toBe("LITE");
  });
});

describe("TOP_3D leaves the simulation untouched", () => {
  it("the per-frame pipeline never reads the view depth", () => {
    const pipeline = stage.slice(stage.indexOf("  const apply ="), stage.indexOf("  const cornerPos ="));
    // The screen-space label projection is presentation-only and may read the depth (label gap); nothing else may.
    const start = pipeline.indexOf("    const screenPoints ="), end = pipeline.indexOf("    if (parallaxRef.current", start);
    expect(start).toBeGreaterThan(0); expect(end).toBeGreaterThan(start);
    expect(pipeline.slice(0, start) + pipeline.slice(end)).not.toMatch(/depth|viewMode|TOP_3D/);
  });
  it("no logic / analytics module knows about the view mode; the shell does not track it", () => {
    for (const f of ["scenarioReplay", "scenarioOrder", "scenarioMotion", "scenarioNoise", "scenarioRunnerField", "terrainTempo", "camera", "simulatorAnalytics", "betaAnalytics", "progressStore"]) {
      expect(read(`../../lib/${f}.ts`), f).not.toMatch(/viewMode|TOP_3D|viewDepth/);
    }
    const shell = read("../../pages/SimulatorShell.tsx");
    expect(shell).not.toMatch(/tracker\.[a-zA-Z]+\([^)]*viewMode/);
    expect(shell).toContain("onChange={setViewMode}");
  });
  it("the result thumbnail stays 2D", () => {
    expect(read("../../pages/SimulatorShell.tsx")).toMatch(/<TrackStage fixedProgress=\{1\}(?:(?!viewDepth).)*\/>/);
  });
});

describe("label pitch is LITE-only", () => {
  it("only the reduced-motion wide TOP_3D path widens the label gap", () => {
    expect(stage).toMatch(/const lite = live\.current\.depth === "LITE" && !live\.current\.compact;/);
    expect(stage).toMatch(/lite \? LITE_LABEL_PITCH : LABEL_PITCH, lite \? LITE_LABEL_PITCH : LABEL_GRID/);
  });
});

describe("TrackStage markup per depth", () => {
  const course = resolveCourse("東京", "芝", 2000);
  const render = (viewDepth?: "FLAT" | "LITE" | "FULL", compact = false) => renderToStaticMarkup(<TrackStage fixedProgress={0.6} runners={runners} pace="平均" seed={1} course={course} compact={compact} cameraMode="TRACK" reducedMotion={false} honmeiNo={1} label="t" viewDepth={viewDepth} />);
  it("FLAT is byte-identical to the default (no prop)", () => { expect(render("FLAT")).toBe(render()); });
  it("FLAT carries no 3D-only elements", () => {
    const html = render();
    for (const marker of ["kt-track-side", "kt-dot-rim", "kt-dot-gloss", "kt-label-upright"]) expect(html).not.toContain(marker);
    expect(html).toContain('data-view="MAP"');
  });
  it("FULL adds depth cues; LITE only rims and upright labels", () => {
    const full = render("FULL"), lite = render("LITE");
    expect(full).toContain('data-view="TOP_3D"'); expect(full).toContain("kt-track-side"); expect(full).toContain("kt-dot-gloss");
    expect(lite).toContain('data-view="TOP_3D"'); expect(lite).not.toContain("kt-track-side"); expect(lite).not.toContain("kt-dot-gloss");
    for (const html of [full, lite]) { expect(html).toContain("kt-label-upright"); expect((html.match(/kt-dot-rim/g) ?? []).length).toBe(8); }
  });
  it("keeps every runner number, GOAL and START in the markup", () => {
    const html = render("FULL");
    for (let no = 1; no <= 8; no++) expect(html).toContain(`data-runner-label="${no}"`);
    expect(html).toContain("GOAL"); expect(html).toContain('data-goal="true"');
    expect(GEOMETRY.wide.w).toBe(640);
  });
});

describe("ViewSelector accessibility", () => {
  const html = (mode: "MAP" | "TOP_3D") => renderToStaticMarkup(<ViewSelector mode={mode} onChange={() => {}} depth="FULL" />);
  it("is a labelled radiogroup with text labels, one tab stop and checked state", () => {
    const h = html("TOP_3D");
    expect(h).toContain('role="radiogroup"'); expect(h).toContain(">2D<"); expect(h).toContain(">3D俯瞰<");
    expect(h).toContain('aria-checked="true"'); expect((h.match(/tabindex="0"/g) ?? []).length).toBe(1);
  });
  it("states that the scenario result does not change", () => { expect(html("TOP_3D")).toContain("位置・順位・カメラの動きは同じ"); });
});
