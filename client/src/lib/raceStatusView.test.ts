import { describe, expect, it } from "vitest";
import { leaderChips, raceStatus, remainingLabel, sectionCallout } from "./raceStatusView";
import { orderView } from "./scenarioOrder";
import { demoField, STANDARD_VARIANT, scenarioSeedFor } from "./scenarioReplay";

describe("race status helpers", () => {
  it("states READY / PLAYING / PAUSED / COMPLETE", () => {
    expect(raceStatus(0, false)).toBe("READY");
    expect(raceStatus(0.3, true)).toBe("PLAYING");
    expect(raceStatus(0.3, false)).toBe("PAUSED");
    expect(raceStatus(1, true)).toBe("COMPLETE");
  });
  it("rounds the remaining distance to 100 m and never claims precision", () => {
    expect(remainingLabel(2000, 0.4)).toBe("残り 約1200m");
    expect(remainingLabel(2000, 0.72)).toBe("残り 約600m");
    expect(remainingLabel(2500, 0.5)).toBe("残り 約1300m");
    expect(remainingLabel(2000, 0.97)).toBe("ゴール前");
    expect(remainingLabel(2000, 1.2)).toBe("ゴール前");
    expect(remainingLabel(1000, 0)).toBe("残り 約1000m");
  });
  it("shows nothing when the distance is unknown", () => {
    expect(remainingLabel("UNKNOWN", 0.5)).toBeNull();
  });
  it("hides the section name when the Atlas has no section shares for a closed course, and when complete", () => {
    expect(sectionCallout({ pathClosed: true, sectionShares: "UNKNOWN" }, "THIRD_TURN", false)).toBeNull();
    expect(sectionCallout({ pathClosed: false, sectionShares: "UNKNOWN" }, "HOME_STRAIGHT", false)).toBe("直線");
    expect(sectionCallout({ pathClosed: true, sectionShares: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6] as never }, "THIRD_TURN", false)).toBe("3コーナー");
    expect(sectionCallout({ pathClosed: true, sectionShares: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6] as never }, "THIRD_TURN", true)).toBeNull();
  });
  it("leader chips are exactly the first five rows of the existing scenario order (no new ranking)", () => {
    const runners = demoField();
    const seed = scenarioSeedFor("demo", STANDARD_VARIANT);
    for (const progress of [0, 0.3, 0.6, 0.95]) {
      const rows = orderView(runners, progress, "平均", seed).rows;
      const chips = leaderChips(rows);
      expect(chips).toHaveLength(5);
      expect(chips.map(chip => [chip.rank, chip.no])).toEqual(rows.slice(0, 5).map(row => [row.rank, row.no]));
    }
    expect(leaderChips([], 5)).toEqual([]);
  });
});
