import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Home.tsx is the real-prediction product page. These are structural
// ("source contract") regression tests for the Home / SimulatorPage product
// split: rather than asserting on a single render's output, they assert
// entire classes of coupling and sample-data leakage are structurally
// impossible from Home's source -- e.g. "no code path in Home.tsx can call
// runSimulation" is a stronger guarantee than "this one render didn't call
// it".
const homeSource = readFileSync(resolve(import.meta.dirname, "Home.tsx"), "utf8");

function extractFunctionBody(source: string, signature: string): string {
  const start = source.indexOf(signature);
  if (start < 0) throw new Error(`could not find "${signature}" in source`);
  // Skip past the arrow itself so a destructured parameter's own `{ ... }`
  // (e.g. `({ race }: RealRaceLoad) =>`) isn't mistaken for the body brace.
  const arrowIndex = source.indexOf("=>", start);
  if (arrowIndex < 0) throw new Error(`could not find "=>" after "${signature}"`);
  const braceStart = source.indexOf("{", arrowIndex);
  let depth = 0;
  for (let i = braceStart; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) return source.slice(braceStart, i + 1);
    }
  }
  throw new Error(`unterminated function body for "${signature}"`);
}

describe("Home / simulator coupling severance (regression)", () => {
  it("handleRealRaceLoad writes only real-prediction state, never simulator state", () => {
    const body = extractFunctionBody(homeSource, "const handleRealRaceLoad = ");
    // Exactly the real-prediction write this product split intentionally
    // keeps -- selecting a real race sets realRace, which TruthPanel and the
    // freshness/sync effects consume, and nothing else.
    expect(body).toContain("setRealRace(race)");
    for (const simulatorSetter of [
      "setHorses(", "setDistance(", "setGoing(", "setWeather(", "setPace(",
      "setRaceLabel(", "setManualAdjustments(", "setLiveRanks(", "setSeed(",
      "setRuns(", "setComparisonBase(",
    ]) {
      expect(body, `handleRealRaceLoad must not call ${simulatorSetter}`).not.toContain(simulatorSetter);
    }
  });

  it("never imports SimulatorPage or any of its simulator-only components/libs", () => {
    expect(homeSource).not.toMatch(/from ["']\.\/SimulatorPage["']/);
    expect(homeSource).not.toContain("OfficialRaceCatalog");
    expect(homeSource).not.toContain("WhatIfTransparencyPanel");
  });

  it("has no simulator state, imports, or pure functions reachable from Home's code path", () => {
    for (const simulatorOnly of [
      "sampleHorses", "sapporoKinen2026Horses", "runSimulation", "getBranches",
      "RaceReplay", "whatIfOpen", "manualAdjustments", "liveRanks",
      "control-rail", "insight-rail", "dashboard-grid",
    ]) {
      expect(homeSource, `Home.tsx must not reference "${simulatorOnly}"`).not.toContain(simulatorOnly);
    }
  });

  it("renders no virtual/sample horse names", () => {
    for (const sampleHorseName of ["ノーブル・アーチ", "サウス・レガシー", "ヴェルヴェット・R", "ミッドナイト・ベル"]) {
      expect(homeSource).not.toContain(sampleHorseName);
    }
  });

  it("triggers no auto-run virtual simulation (no reachable runSimulation call, no useMemo-computed results)", () => {
    expect(homeSource).not.toContain("runSimulation");
    expect(homeSource).not.toContain("useMemo");
  });

  it("passes only real prediction data into TruthPanel (race, loadStatus) -- no simulator props", () => {
    const truthPanelCall = homeSource.match(/<TruthPanel[^/]*\/>/)?.[0];
    expect(truthPanelCall, "expected a self-closing <TruthPanel ... /> usage").toBeTruthy();
    expect(truthPanelCall).toContain("race={realRace}");
    expect(truthPanelCall).toContain("loadStatus={realRaceLoadStatus}");
    expect(truthPanelCall).not.toMatch(/horses=|results=|distance=|going=|pace=/);
  });

  it("no simulator-page reset can touch realRace -- there is exactly one setRealRace call site (the severed handleRealRaceLoad) plus the sync-effect", () => {
    const matches = homeSource.match(/setRealRace\(/g) ?? [];
    // handleRealRaceLoad's setRealRace(race) + the background sync effect's
    // setRealRace(current => ...). No reset/clear button exists on Home.
    expect(matches.length).toBe(2);
    expect(homeSource).not.toContain("setRealRace(null)");
  });
});
