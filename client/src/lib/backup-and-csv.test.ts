import { describe, expect, it } from "vitest";
import { backupFieldGroups, PAST_PERFORMANCE_HEADER, parsePastPerformanceCsv, selectableHorseFields } from "../pages/Home";

describe("backup field categories", () => {
  it("covers every selectable horse field exactly once", () => {
    const categorized = backupFieldGroups.flatMap((group) => group.fields).sort();
    expect(categorized).toEqual([...selectableHorseFields].sort());
  });

  it("keeps the four readable restore categories", () => {
    expect(backupFieldGroups.map((group) => group.label)).toEqual(["基本情報", "能力値", "戦績", "馬場適性"]);
  });
});

describe("past performance CSV template", () => {
  it("parses the downloaded template columns", () => {
    const rows = parsePastPerformanceCsv(`${PAST_PERFORMANCE_HEADER}\nテストホース,12,3,2,1,4.5,78,70,62,55`);
    expect(rows).toEqual([expect.objectContaining({ name: "テストホース", starts: 12, wins: 3, seconds: 2, thirds: 1, avgFinish: 4.5, rates: { 良: 78, 稍重: 70, 重: 62, 不良: 55 } })]);
  });
});
