import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
// Canonical logic line: every simulation / analytics source must stay byte-identical to this commit.
const base = "6918420";
const original = (file: string) => execFileSync("git", ["show", `${base}:${file}`], { encoding: "utf8" }).replace(/\r\n/g, "\n");
const current = (file: string) => readFileSync(file, "utf8").replace(/\r\n/g, "\n");
describe("visual changes preserve the full-finish baseline", () => {
  it("preserves runner progress, crossing timing/order, camera targets and Atlas data exactly", () => {
    for (const name of ["scenarioReplay", "scenarioOrder", "scenarioMotion", "scenarioNoise", "scenarioRunnerField", "terrainTempo", "horseScenarioProfile", "simulatorAnalytics", "betaAnalytics", "camera", "courseAtlas", "courseDiagramData", "courseSections", "progressStore"]) {
      const file = `client/src/lib/${name}.ts`;
      expect(current(file), name).toBe(original(file));
    }
  });
  it("preserves the stage update and camera pipeline except for the crossed appearance attribute", () => {
    const file = "client/src/components/trace/TrackStage.tsx";
    const pipeline = (s: string) => s.slice(s.indexOf("  const apply ="), s.indexOf("  const cornerPos ="));
    let actual = pipeline(current(file));
    // Only strip the screen-space label projection and presentation attributes.
    const labelStart = actual.indexOf("    const screenPoints =");
    const labelEnd = actual.indexOf("    if (parallaxRef.current", labelStart);
    expect(labelStart).toBeGreaterThan(0); expect(labelEnd).toBeGreaterThan(labelStart);
    actual = actual.slice(0, labelStart) + actual.slice(labelEnd);
    for (const added of [
      '    runnerPoints.current = [];\n',
      '      runnerPoints.current.push({ no: runner.no, ...p });\n',
      '      labelRefs.current.get(runner.no)?.setAttribute("data-crossed", String(runner.lap >= 1));\n',
      '      dotRefs.current.get(runner.no)?.setAttribute("data-crossed", String(runner.lap >= 1));\n',
    ]) actual = actual.replace(added, "");
    expect(actual).toBe(pipeline(original(file)));
  });
});
