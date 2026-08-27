import { describe, expect, it } from "vitest";
import { requestedResultValue, statusText } from "./OperationsDashboard";

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
