import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { COURSE_SPECS, fitPath, isFlatDistance, JRA_VENUES, pointOnPath, resolveCourse, stadiumPath, straightPath } from "./courseAtlas";

const area = (path: { x: number; y: number }[]) => path.reduce((sum, p, i) => { const q = path[(i + 1) % path.length]; return sum + (p.x * q.y - q.x * p.y); }, 0);

// Most-used flat distances per venue/surface in the JRA training archive (single_pick_ai data/jra/training_snapshots).
const ARCHIVE: Record<string, number[]> = {
  "東京芝": [1600, 1800, 1400, 2000, 2400], "東京ダート": [1600, 1400, 2100, 1300],
  "中山芝": [1600, 2000, 1200, 1800, 2200, 2500], "中山ダート": [1800, 1200],
  "京都芝": [1600, 2000, 1800, 1400, 1200, 2400, 2200], "京都ダート": [1800, 1400, 1200, 1900],
  "阪神芝": [1600, 2000, 1800, 1400, 1200, 2400, 2200], "阪神ダート": [1800, 1400, 1200, 2000],
  "新潟芝": [1800, 1600, 2000, 1400, 1000, 1200, 2200, 2400], "新潟ダート": [1800, 1200],
  "中京芝": [2000, 1600, 1400, 1200, 2200], "中京ダート": [1800, 1400, 1200, 1900],
  "札幌芝": [1200, 1800, 2000, 1500, 2600], "札幌ダート": [1700, 1000],
  "函館芝": [1200, 1800, 2000, 2600, 1000], "函館ダート": [1700, 1000],
  "福島芝": [1200, 1800, 2000, 2600], "福島ダート": [1700, 1150],
  "小倉芝": [1200, 1800, 2000, 2600], "小倉ダート": [1700, 1000],
};

describe("course atlas coverage", () => {
  it("all ten JRA venues are present with a confirmed direction on turf and dirt", () => {
    for (const venue of JRA_VENUES) {
      for (const surface of ["TURF", "DIRT"] as const) {
        const spec = COURSE_SPECS.find(entry => entry.venue === venue && entry.surface === surface);
        expect(spec, `${venue} ${surface}`).toBeTruthy();
        expect(spec!.ref).toMatch(/^https:\/\/www\.jra\.go\.jp\//);
      }
    }
  });

  it("direction is applied per venue", () => {
    const left = ["東京", "中京", "新潟"], right = ["札幌", "函館", "福島", "中山", "京都", "阪神", "小倉"];
    for (const venue of left) expect(resolveCourse(venue, "芝", 1600).direction).toBe("LEFT");
    for (const venue of right) expect(resolveCourse(venue, "ダート", 1700).direction).toBe("RIGHT");
    expect(resolveCourse("新潟", "芝", 1000).direction).toBe("STRAIGHT");
  });

  it("start differs by distance within a venue (Tokyo turf 1400/1600/1800/2000/2400)", () => {
    const shares = [1400, 1600, 1800, 2000, 2400].map(d => resolveCourse("東京", "芝", d).startLapShare);
    expect(new Set(shares).size).toBe(5);
    shares.forEach(value => expect(typeof value).toBe("number"));
    const starts = [1400, 1600, 1800, 2000, 2400].map(d => JSON.stringify(resolveCourse("東京", "芝", d).startPoint));
    expect(new Set(starts).size).toBe(5);
  });

  it("start share is exactly the lap arithmetic, labelled as derived, never as official", () => {
    const course = resolveCourse("東京", "芝", 2000);
    expect(course.startLapShare).toBeCloseTo(1 - 2000 / 2083.1, 10);
    expect(course.basis.startPoint).toBe("DERIVED_FROM_LAP_AND_DISTANCE");
    expect(course.basis.finishPoint).toBe("STYLIZED");
    const nakayama = resolveCourse("中山", "芝", 2500);
    expect(nakayama.variant).toBe("INNER");
    expect(nakayama.raceLaps).toBeCloseTo(2500 / 1667.1, 10);
    expect(nakayama.startLapShare).toBeCloseTo(1 - ((2500 / 1667.1) % 1), 10);
    for (const spec of COURSE_SPECS) expect(JSON.stringify(spec)).not.toContain('"OFFICIAL"');
  });

  it("an undetermined variant stays UNKNOWN instead of guessing a loop", () => {
    const course = resolveCourse("京都", "芝", 1600);
    expect(course.variant).toBe("UNKNOWN");
    expect(course.lapMeters).toBe("UNKNOWN");
    expect(course.startLapShare).toBe("UNKNOWN");
    expect(course.direction).toBe("RIGHT");
  });

  it("jump-like distances and unknown venues fall back to a generic UNKNOWN oval", () => {
    expect(isFlatDistance(2880)).toBe(false);
    const jump = resolveCourse("中山", "芝", 2880);
    expect(jump.startLapShare).toBe("UNKNOWN");
    expect(resolveCourse("大井", "ダート", 1600).sourceRefs).toEqual([]);
    expect(resolveCourse("大井", "ダート", 1600).direction).toBe("UNKNOWN");
  });

  it("reports distance coverage for the archive's most-used distances", () => {
    let withStart = 0, total = 0;
    for (const [key, distances] of Object.entries(ARCHIVE)) {
      const venue = key.slice(0, 2), surface = key.slice(2);
      for (const d of distances) { total++; if (typeof resolveCourse(venue, surface, d).startLapShare === "number") withStart++; }
    }
    expect(total).toBe(Object.values(ARCHIVE).flat().length);
    // Every single-loop course and the sourced inner/outer distances resolve; the rest stay UNKNOWN on purpose.
    expect(withStart).toBeGreaterThanOrEqual(Math.floor(total * 0.7));
  });

  it("the four evidence courses resolve with distinct start / finish / direction", () => {
    const tokyo = resolveCourse("東京", "芝", 2000), kyoto = resolveCourse("京都", "ダート", 1800), nakayama = resolveCourse("中山", "芝", 2500), niigata = resolveCourse("新潟", "芝", 1000);
    expect([tokyo.direction, kyoto.direction, nakayama.direction, niigata.direction]).toEqual(["LEFT", "RIGHT", "RIGHT", "STRAIGHT"]);
    expect(niigata.pathClosed).toBe(false);
    expect(niigata.startPoint).toEqual(niigata.path[0]);
    expect(niigata.finishPoint).toEqual(niigata.path[niigata.path.length - 1]);
    expect(new Set([tokyo, kyoto, nakayama].map(c => JSON.stringify(c.startPoint))).size).toBe(3);
  });
});

describe("path geometry", () => {
  it("LEFT is counter-clockwise and RIGHT clockwise on screen, both stay inside the canvas", () => {
    expect(area(stadiumPath("LEFT", 0.25))).toBeLessThan(0);
    expect(area(stadiumPath("RIGHT", 0.25))).toBeGreaterThan(0);
    for (const direction of ["LEFT", "RIGHT"] as const) {
      expect(stadiumPath(direction, 0.25).every(p => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1)).toBe(true);
    }
  });

  it("the pre-goal straight follows the sourced straight/lap share", () => {
    const share = 525.9 / 2083.1;
    const path = stadiumPath("LEFT", share);
    // Walking back from the goal along the bottom straight stays on one horizontal line for `share` of the lap.
    const n = path.length, y0 = path[0].y;
    let straightSteps = 0;
    for (let i = 0; i < n; i++) { if (Math.abs(path[(n - i) % n].y - y0) < 1e-9) straightSteps++; else break; }
    expect(straightSteps / n).toBeCloseTo(share, 1);
  });

  it("the goal sits at path[0] and the lap closes back to it", () => {
    const path = stadiumPath("RIGHT", 0.25);
    expect(pointOnPath(path, 0)).toEqual(path[0]);
    expect(pointOnPath(path, 1)).toEqual(path[0]);
  });

  it("straight course clamps and keeps lanes on one side", () => {
    const path = straightPath();
    expect(pointOnPath(path, 1.5, 0, false)).toEqual(path[path.length - 1]);
    expect(pointOnPath(path, 0.5, 10, false).y).toBeGreaterThan(0.5);
  });

  it("fitPath keeps every point inside the box", () => {
    for (const [w, h] of [[640, 300], [360, 320]]) {
      for (const ratio of [0.1, 0.25, 0.32]) {
        const points = fitPath(stadiumPath("LEFT", ratio), w, h, 52);
        expect(points.every(p => p.x >= 0 && p.x <= w && p.y >= 0 && p.y <= h)).toBe(true);
      }
    }
  });
});

describe("elevation stays out of the scenario", () => {
  it("no module that moves runners imports the atlas", () => {
    for (const file of ["scenarioReplay.ts", "scenarioOrder.ts"]) {
      expect(readFileSync(resolve(import.meta.dirname, file), "utf8")).not.toContain("courseAtlas");
    }
  });
});
