import { describe, expect, it } from "vitest";
import { calibrationStatusLabel, decisionLabel, featureStateLabel } from "@/lib/labels";

describe("featureStateLabel", () => {
  it("maps known PublicFeatureState values to Japanese labels, never leaking the raw enum", () => {
    for (const state of ["AVAILABLE", "READY", "EMPTY", "PENDING_DATA", "INSUFFICIENT_SAMPLE", "NOT_APPLICABLE", "UNAVAILABLE", "MEMBER_LOCKED", "NOT_YET_GENERATED"]) {
      const label = featureStateLabel(state);
      expect(label).not.toBe(state);
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it("falls back to a safe, honest default for an unmapped state rather than leaking it raw", () => {
    expect(featureStateLabel("SOME_NEW_BACKEND_ENUM")).toBe("データ未取得");
  });
});

describe("decisionLabel", () => {
  it("maps BET/NO_BET/UNAVAILABLE without changing meaning", () => {
    expect(decisionLabel("BET")).toBe("BET");
    expect(decisionLabel("NO_BET")).toBe("見送り");
    expect(decisionLabel("UNAVAILABLE")).toBe("判定データなし");
  });

  it("treats any unmapped decision (e.g. UNKNOWN) as 判定データなし, never as 見送り", () => {
    expect(decisionLabel("UNKNOWN")).toBe("判定データなし");
    expect(decisionLabel("UNKNOWN")).not.toBe("見送り");
  });
});

describe("calibrationStatusLabel", () => {
  it("maps the observed raw enum values (including COLLECTING) to Japanese", () => {
    expect(calibrationStatusLabel("COLLECTING")).toBe("データ収集中");
    expect(calibrationStatusLabel("UNCALIBRATED_SHADOW_SCORE")).toBe("検証中の参考スコア");
    expect(calibrationStatusLabel("READY")).not.toBe("READY");
  });

  it("never leaks an unmapped raw status string as-is", () => {
    expect(calibrationStatusLabel("SOME_FUTURE_STATUS")).not.toBe("SOME_FUTURE_STATUS");
  });
});
