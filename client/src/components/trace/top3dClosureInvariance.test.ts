import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const baseline = "5e9bda1f38588397e5cfbf6a6dff08c8a87bd8ac";
const original = (file: string) => execFileSync("git", ["show", `${baseline}:${file}`], { encoding: "utf8" }).replace(/\r\n/g, "\n");
const current = (file: string) => readFileSync(file, "utf8").replace(/\r\n/g, "\n");
describe("TOP_3D closure retains the approved simulation", () => {
  it("preserves logic, Terrain Tempo, analytics, projection and runner admission byte for byte", () => {
    for (const name of ["scenarioReplay", "scenarioOrder", "scenarioMotion", "camera", "courseAtlas", "courseDiagramData", "courseSections", "progressStore", "terrainTempo", "scenarioNoise", "scenarioRunnerField", "horseScenarioProfile", "betaAnalytics", "simulatorAnalytics", "viewMode"]) {
      const file = `client/src/lib/${name}.ts`; expect(current(file), name).toBe(original(file));
    }
    for (const name of ["runnerLabels", "top3dProjection"]) {
      const file = `client/src/components/trace/${name}.ts`; expect(current(file), name).toBe(original(file));
    }
  });
  it("retains the camera/update pipeline and adds no per-frame layout reads", () => {
    const file = "client/src/components/trace/TrackStage.tsx";
    const pipeline = (source: string) => source.slice(source.indexOf("  const apply ="), source.indexOf("  const cornerPos ="));
    expect(pipeline(current(file)).replace("    placeAnnotations(cam, labels);\n", "")).toBe(pipeline(original(file)));
    const live = current(file).slice(current(file).indexOf("  const placeAnnotations ="), current(file).indexOf("  useLayoutEffect("));
    expect(live).not.toMatch(/getBoundingClientRect|getBBox|offsetWidth|offsetHeight|clientWidth|clientHeight/);
  });
});
