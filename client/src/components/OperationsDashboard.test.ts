import { describe, expect, it } from "vitest";
import { predictedMarkLabel, requestedResultValue, statusText } from "./OperationsDashboard";
import type { LabResultPredictionHorse } from "@/lib/singlePickAi";

describe("OperationsDashboard result-state presentation", () => {
  it("shows consumer-facing Japanese labels, never a raw enum, without converting special states to wins or losses", () => {
    expect(statusText("DEAD_HEAT")).toBe("同着");
    expect(statusText("PENDING")).toBe("未確定");
    expect(statusText("REVIEW_REQUIRED")).toBe("確認中");
    // Genuinely unmapped statuses still fall back to the raw value rather
    // than fabricating a label -- this is the one case where showing the
    // raw string is more honest than guessing a translation.
    expect(statusText("CANCELLED")).toBe("CANCELLED");
    expect(statusText("EXCLUDED")).toBe("EXCLUDED");
  });

  it("does not replace unavailable pending or confirmed values with zero", () => {
    expect(requestedResultValue("PENDING", null, "finish")).toBe("未確定");
    expect(requestedResultValue("PENDING", null, "coverage")).toBe("未確定");
    expect(requestedResultValue("CONFIRMED", null, "finish")).toBe("取得不能");
    expect(requestedResultValue("DEAD_HEAT", null, "coverage")).toBe("取得不能");
    expect(requestedResultValue("CONFIRMED", 2, "coverage")).toBe("2 / 3");
  });
});

describe("predictedMarkLabel (AI history mark display contract)", () => {
  // Regression coverage: predicted_top3 rendering must read each entry's
  // own saved mark, never a rank or an array-position lookup like
  // ["◎","○","▲"][index]. The API contract (LabResultPredictionHorse) no
  // longer even carries a rank field, so there is nothing left to fall
  // back to here -- these tests pin the label format itself.

  it("uses the entry's own mark, not its position in the list", () => {
    // Deliberately out-of-mark-priority order: if anything derived the
    // label from array index this would render the wrong mark for at
    // least one of these.
    const entries: LabResultPredictionHorse[] = [
      { mark: "▲", horse_no: 9, horse_name: "穴馬" },
      { mark: "◎", horse_no: 7, horse_name: "本命馬" },
      { mark: "○", horse_no: 2, horse_name: "対抗馬" },
    ];
    expect(entries.map(predictedMarkLabel)).toEqual(["▲#9", "◎#7", "○#2"]);
  });

  it("renders a lone honmei without inventing placeholder ○/▲ entries", () => {
    const entries: LabResultPredictionHorse[] = [{ mark: "◎", horse_no: 10, horse_name: "本命馬" }];
    expect(entries.map(predictedMarkLabel)).toEqual(["◎#10"]);
  });
});
