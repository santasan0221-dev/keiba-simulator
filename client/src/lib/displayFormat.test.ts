import { describe, expect, it } from "vitest";
import { formatCount, formatExpectedReturn, formatOdds, formatPercent, formatPointDiff, formatPopularity } from "@/lib/displayFormat";

describe("display number formatting", () => {
  it("shows a 0-1 probability as a percent with one decimal", () => {
    expect(formatPercent(0.241)).toBe("24.1%");
    expect(formatPercent(0.62)).toBe("62.0%");
    expect(formatPercent(0)).toBe("0.0%");
    expect(formatPercent(1)).toBe("100.0%");
  });

  it("never turns a missing or out-of-range probability into a number", () => {
    for (const value of [null, undefined, Number.NaN, -0.1, 1.2]) expect(formatPercent(value)).toBe("—");
  });

  it("shows probability-point differences with an explicit sign", () => {
    expect(formatPointDiff(0.1234)).toBe("+12.3pt");
    expect(formatPointDiff(-0.031)).toBe("−3.1pt");
    expect(formatPointDiff(0)).toBe("±0.0pt");
    expect(formatPointDiff(null)).toBe("—");
  });

  it("formats odds, popularity and counts", () => {
    expect(formatOdds(6.8)).toBe("6.8倍");
    expect(formatOdds(45.25)).toBe("45.3倍");
    expect(formatOdds(null)).toBe("—");
    expect(formatOdds(0)).toBe("—");
    expect(formatPopularity(3)).toBe("3番人気");
    expect(formatPopularity(null)).toBe("—");
    expect(formatCount(1612)).toBe("1,612");
    expect(formatCount(1612.0004)).toBe("1,612");
    expect(formatCount(null)).toBe("—");
  });

  it("gives EV a beginner-readable 100-yen reading next to the ratio", () => {
    expect(formatExpectedReturn(1.6388)).toEqual({ ratio: "1.64", per100Yen: "100円→平均164円", tone: "positive" });
    expect(formatExpectedReturn(0.2352)).toEqual({ ratio: "0.24", per100Yen: "100円→平均24円", tone: "negative" });
    expect(formatExpectedReturn(1)).toEqual({ ratio: "1.00", per100Yen: "100円→平均100円", tone: "neutral" });
    expect(formatExpectedReturn(null)).toBeNull();
    expect(formatExpectedReturn(-1)).toBeNull();
  });
});
