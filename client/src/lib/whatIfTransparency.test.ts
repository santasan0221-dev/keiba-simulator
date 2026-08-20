import { describe, expect, it } from "vitest";
import { formatWhatIfReferenceProbability, getWhatIfDistributionSummary } from "./whatIfTransparency";

const row = (no: number, winRate: number) => ({ no, name: `Horse ${no}`, winRate });

describe("WHAT-IF probability transparency", () => {
  it("renders positive sub-0.1% values as a non-zero lower-bound", () => {
    expect(formatWhatIfReferenceProbability(0)).toBe("0.0%");
    expect(formatWhatIfReferenceProbability(0.0001)).toBe("<0.1%");
    expect(formatWhatIfReferenceProbability(0.0999)).toBe("<0.1%");
    expect(formatWhatIfReferenceProbability(0.1)).toBe("0.1%");
  });

  it("calculates concentration and entropy without changing input probabilities", () => {
    const rows = [row(1, 45), row(2, 25), row(3, 15), row(4, 10), row(5, 5)];
    const summary = getWhatIfDistributionSummary(rows);
    expect(summary.status).toBe("CONCENTRATED");
    expect(summary.probabilitySum).toBe(100);
    expect(summary.top1Probability).toBe(45);
    expect(summary.top3Probability).toBe(85);
    expect(summary.normalizedEntropy).toBeGreaterThan(0);
    expect(summary.effectiveFieldSize).toBeGreaterThan(1);
    expect(rows.map((item) => item.winRate)).toEqual([45, 25, 15, 10, 5]);
  });

  it("marks extreme concentration as LOW RELIABILITY input", () => {
    const summary = getWhatIfDistributionSummary([row(1, 70), row(2, 15), row(3, 10), row(4, 5)]);
    expect(summary.status).toBe("EXTREME_CONCENTRATION");
    expect(summary.reason).toContain("極端に集中");
  });

  it("fails closed when probabilities are invalid or do not sum to 100%", () => {
    expect(getWhatIfDistributionSummary([row(1, 55), row(2, 30)]).status).toBe("INVALID");
    expect(getWhatIfDistributionSummary([row(1, 120), row(2, -20)]).status).toBe("INVALID");
    expect(formatWhatIfReferenceProbability(Number.NaN)).toBe("表示不可");
  });
});
