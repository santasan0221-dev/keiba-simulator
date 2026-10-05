import { describe, expect, it } from "vitest";
import { demoField, nextVariant, normalizeStyle, scenarioSeed, seededUnit, VARIANTS } from "./scenarioReplay";

describe("scenario vocabulary", () => {
  it("normalizes published run styles and keeps unknown runners unknown", () => {
    expect(normalizeStyle("追い込み")).toBe("追込");
    expect(["逃げ", "先行", "差し", "追込"].map(normalizeStyle)).toEqual(["逃げ", "先行", "差し", "追込"]);
    expect(normalizeStyle(null)).toBe("不明");
    expect(normalizeStyle("自在")).toBe("不明");
  });

  it("the demo field is ten numbered runners with no names", () => {
    const field = demoField();
    expect(field).toHaveLength(10);
    expect(field.every(runner => runner.name === null)).toBe(true);
  });

  it("seeds are stable per race_key and variant; STANDARD keeps the plain race_key hash", () => {
    expect(scenarioSeed("JRA|2026-10-04|東京|05")).toBe(scenarioSeed("JRA|2026-10-04|東京|05", "STANDARD"));
    const seeds = VARIANTS.map(variant => scenarioSeed("JRA|2026-10-04|東京|05", variant));
    expect(new Set(seeds).size).toBe(3);
    expect(scenarioSeed("a", "ALT_A")).toBe(scenarioSeed("a", "ALT_A"));
    expect(scenarioSeed("a", "ALT_A")).not.toBe(scenarioSeed("b", "ALT_A"));
  });

  it("variants cycle STANDARD → ALT_A → ALT_B → STANDARD", () => {
    expect(nextVariant("STANDARD")).toBe("ALT_A");
    expect(nextVariant("ALT_A")).toBe("ALT_B");
    expect(nextVariant("ALT_B")).toBe("STANDARD");
  });

  it("seededUnit is deterministic and inside 0..1", () => {
    for (let no = 1; no <= 18; no++) {
      const value = seededUnit(scenarioSeed("k"), no, 3);
      expect(value).toBe(seededUnit(scenarioSeed("k"), no, 3));
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });
});
