import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { demoField, formationAt, normalizeStyle, PHASES } from "./scenarioReplay";

describe("formation scenario (RESEARCH_ONLY)", () => {
  it("is built from run style and pace only -- no ability, speed, stamina or probability inputs", () => {
    const source = readFileSync(resolve(import.meta.dirname, "scenarioReplay.ts"), "utf8");
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    for (const forbidden of ["speed", "stamina", "probability", "odds", "abilities", "win_", "Math.random"]) {
      expect(code, `scenarioReplay must not read ${forbidden}`).not.toContain(forbidden);
    }
  });

  it("is deterministic and keeps every runner in every phase", () => {
    const field = demoField();
    for (const phase of PHASES) {
      const a = formationAt(field, phase, "平均");
      expect(a).toEqual(formationAt(field, phase, "平均"));
      expect(a.map(p => p.no).sort((x, y) => x - y)).toEqual(field.map(r => r.no));
    }
  });

  it("puts front-runners ahead early and never assigns a style to an unknown runner", () => {
    const early = formationAt([{ no: 1, name: null, style: "追込" }, { no: 2, name: null, style: "逃げ" }, { no: 3, name: null, style: normalizeStyle("不明") }], "EARLY", "平均");
    expect(early[0].no).toBe(2);
    expect(early.find(p => p.no === 3)!.group).toBe("脚質不明");
  });
});
