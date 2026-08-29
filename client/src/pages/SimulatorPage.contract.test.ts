import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const simulatorSource = readFileSync(resolve(import.meta.dirname, "SimulatorPage.tsx"), "utf8");

describe("SimulatorPage / Home coupling severance (regression)", () => {
  it("has no realRace state at all -- reset cannot clear something that does not exist", () => {
    expect(simulatorSource).not.toContain("setRealRace");
    expect(simulatorSource).not.toContain("useState<LabRace");
    expect(simulatorSource).not.toContain("[realRace,");
  });

  it("never imports the real-prediction integration (RealRaceLoader, TruthPanel, single_pick_ai fetch, MemberGate)", () => {
    for (const realOnlyImport of [
      "RealRaceLoader", "TruthPanel", "fetchDailyOperations", "MemberGate",
      "FreeScopeStrip", "LabValueStrip", "trpc", "shouldApplySyncedRace",
    ]) {
      expect(simulatorSource, `SimulatorPage.tsx must not import/reference "${realOnlyImport}"`).not.toContain(realOnlyImport);
    }
  });

  it("carries no hidden hand-off bridge from Home (no query-param/navigation-state read, no shared localStorage key with real-race semantics)", () => {
    expect(simulatorSource).not.toContain("URLSearchParams");
    expect(simulatorSource).not.toContain("history.state");
    expect(simulatorSource).not.toContain("keiba-lab-real-race");
  });

  it("is clearly labeled as a what-if / sample-data sandbox, never claiming to BE the real prediction", () => {
    expect(simulatorSource).toContain("仮想シミュレーション");
    expect(simulatorSource).toContain("サンプルデータ");
    // These terms describe the real-prediction product's own concepts
    // (AI本命/BET terminology, the "今日のAI予想" catalog heading) and must
    // never appear as if the simulator itself produces them. A single
    // contrastive pointer back to Home ("実AI予測は「本日の予想」ページを
    // ご覧ください") is fine and intentional -- checked separately below --
    // it clarifies rather than claims.
    for (const realPredictionWord of ["AI本命", "今日のAI予想", "BET</span>", "見送り</span>", "判定待ち</span>"]) {
      expect(simulatorSource, `SimulatorPage.tsx must not use real-prediction term "${realPredictionWord}"`).not.toContain(realPredictionWord);
    }
    // Every mention of "実AI予測" must be a contrastive pointer away from the
    // simulator (either "…とは無関係" or a redirect to Home), never a claim
    // that the simulator's own output is the real prediction.
    const realPredictionMentions = simulatorSource.match(/.{0,4}実AI予測.{0,24}/g) ?? [];
    expect(realPredictionMentions.length).toBeGreaterThan(0);
    for (const mention of realPredictionMentions) {
      expect(mention, `non-contrastive "実AI予測" mention: "${mention}"`).toMatch(/とは無関係|ページをご覧ください/);
    }
  });

  it("still owns the simulator's local-storage-backed state and backup/export format tag", () => {
    expect(simulatorSource).toContain('"keiba-lab-backup"');
    expect(simulatorSource).toContain('localStorage.setItem("keiba-lab-distance"');
  });
});
