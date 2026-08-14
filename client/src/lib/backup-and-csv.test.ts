import { describe, expect, it } from "vitest";
import { applyBackupSelections, backupFieldGroups, captureBackupSelections, deleteBackupSelectionPreset, detailedCsvColumnOptions, normalizeTemplateTags, PAST_PERFORMANCE_HEADER, parsePastPerformanceCsv, saveBackupSelectionPreset, selectableHorseFields } from "../pages/Home";

describe("backup field categories", () => {
  it("covers every selectable horse field exactly once", () => {
    const categorized = backupFieldGroups.flatMap((group) => group.fields).sort();
    expect(categorized).toEqual([...selectableHorseFields].sort());
  });

  it("keeps the four readable restore categories", () => {
    expect(backupFieldGroups.map((group) => group.label)).toEqual(["基本情報", "能力値", "戦績", "馬場適性"]);
  });

  it("preserves different field selections for each horse in a favorite", () => {
    const saved = captureBackupSelections([1, 2], { "horse:1:speed": false, "horse:2:stamina": false });
    expect(saved["horse:1:speed"]).toBe(false);
    expect(saved["horse:2:speed"]).toBe(true);
    expect(saved["horse:2:stamina"]).toBe(false);
    expect(applyBackupSelections([1, 2], saved)).toMatchObject({ "horse:1:speed": false, "horse:2:speed": true, "horse:2:stamina": false });
  });

  it("saves, applies, and deletes a restore favorite", () => {
    const selections = captureBackupSelections([1, 2], { "horse:1:speed": false, "horse:2:form": false });
    const saved = saveBackupSelectionPreset([], { id: 10, name: "能力比較", selections, updatedAt: 1 });
    expect(saved).toHaveLength(1);
    expect(applyBackupSelections([1, 2], saved[0].selections)).toMatchObject({ "horse:1:speed": false, "horse:2:form": false });
    expect(deleteBackupSelectionPreset(saved, 10)).toEqual([]);
  });
});

describe("past performance CSV template", () => {
  it("parses the downloaded template columns", () => {
    const rows = parsePastPerformanceCsv(`${PAST_PERFORMANCE_HEADER}\nテストホース,12,3,2,1,4.5,78,70,62,55`);
    expect(rows).toEqual([expect.objectContaining({ name: "テストホース", starts: 12, wins: 3, seconds: 2, thirds: 1, avgFinish: 4.5, rates: { 良: 78, 稍重: 70, 重: 62, 不良: 55 } })]);
  });
});

describe("CSV column customization and tagged notes", () => {
  it("offers every detail needed for a branch-level CSV export", () => {
    expect(detailedCsvColumnOptions.map((option) => option.key)).toEqual(["base", "branchProbability", "name", "winRate", "uncertainty", "historyAdjustment", "manualAdjustment"]);
  });

  it("normalizes, de-duplicates, and caps template tags", () => {
    expect(normalizeTemplateTags(" 重馬場,差し  重馬場\n札幌 ")).toEqual(["重馬場", "差し", "札幌"]);
    expect(normalizeTemplateTags("a b c d e f g h i")).toHaveLength(8);
  });
});
