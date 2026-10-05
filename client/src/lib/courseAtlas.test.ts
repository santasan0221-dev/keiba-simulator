import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { NIIGATA_DIAGRAM, TOKYO_DIAGRAM } from "./courseDiagramData";
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
    const ds = [1400, 1600, 1800, 2000, 2400];
    expect(new Set(ds.map(d => resolveCourse("東京", "芝", d).startLapShare)).size).toBe(5);
    expect(new Set(ds.map(d => JSON.stringify(resolveCourse("東京", "芝", d).startPoint))).size).toBe(5);
  });

  it("Tokyo starts come from the official plan view and agree with the distance", () => {
    for (const [kind, table] of [["turf", TOKYO_DIAGRAM.turf], ["dirt", TOKYO_DIAGRAM.dirt]] as const) {
      const lap = kind === "turf" ? 2083.1 : 1899;
      for (const [dist, start] of Object.entries(table.starts)) {
        const d = Number(dist);
        // ring distance to the goal, plus the chute length when the gate is off the ring, is the race distance
        const implied = start.ringMetersToGoal + (start.offRingMeters > 8 ? start.offRingMeters : 0);
        expect(Math.abs(implied - d) / d, `${kind}${d}`).toBeLessThan(0.04);
        expect(start.share).toBeGreaterThanOrEqual(0);
        expect(start.share).toBeLessThan(1);
        void lap;
      }
    }
    const t2000 = resolveCourse("東京", "芝", 2000);
    expect(t2000.basis.startPoint).toBe("OFFICIAL_DIAGRAM_APPROXIMATION");
    expect(t2000.startOnRing).toBe(false); // chute start on the right-hand spur
    expect(t2000.startNote).toContain("シュート");
    expect(resolveCourse("東京", "芝", 2400).startOnRing).toBe(true);
  });

  it("lap arithmetic is only used for starts on the loop, and is labelled as derived", () => {
    const sapporo = resolveCourse("札幌", "芝", 1800);
    expect(sapporo.startLapShare).toBeCloseTo(1 - ((1800 / 1640.9) % 1), 10);
    expect(sapporo.basis.startPoint).toBe("DERIVED_FROM_LAP_AND_DISTANCE");
    expect(sapporo.basis.lapMeters).toBe("SECONDARY_SOURCE");
    const kyotoDirt = resolveCourse("京都", "ダート", 1800);
    expect(kyotoDirt.startLapShare).toBeCloseTo(1 - ((1800 / 1607.6) % 1), 10);
    expect(kyotoDirt.basis.startPoint).toBe("DERIVED_FROM_LAP_AND_DISTANCE");
    expect(kyotoDirt.basis.lapMeters).toBe("OFFICIAL");
  });

  it("starts the page places off the loop stay UNKNOWN (no lap arithmetic)", () => {
    const nakayama2500 = resolveCourse("中山", "芝", 2500);
    expect(nakayama2500.variant).toBe("INNER");
    expect(nakayama2500.startLapShare).toBe("UNKNOWN");
    expect(nakayama2500.startNote).toContain("外回り");
    expect(resolveCourse("京都", "芝", 1800).startLapShare).toBe("UNKNOWN"); // deep chute off the backstretch
    expect(resolveCourse("新潟", "芝", 1600).startLapShare).toBe("UNKNOWN"); // plan not read yet
  });

  it("official distance lists and inner/outer variants (Kyoto, Nakayama, Niigata)", () => {
    expect(resolveCourse("京都", "芝", 2200).variant).toBe("OUTER");
    expect(resolveCourse("京都", "芝", 2400).variant).toBe("OUTER");
    for (const d of [1400, 1600, 2000]) expect(resolveCourse("京都", "芝", d).variant, `kyoto ${d}`).toBe("UNKNOWN"); // listed for both loops
    expect(resolveCourse("新潟", "芝", 2200).variant).toBe("INNER");
    expect(resolveCourse("新潟", "芝", 2400).variant).toBe("INNER");
    for (const d of [1400, 2000]) expect(resolveCourse("新潟", "芝", d).variant, `niigata ${d}`).toBe("UNKNOWN");
    expect(resolveCourse("中山", "芝", 3200).variant).toBe("UNKNOWN");
    expect(resolveCourse("東京", "芝", 1200).distanceListed).toBe(false); // not an official Tokyo turf distance
    expect(resolveCourse("東京", "芝", 2000).distanceListed).toBe(true);
  });

  it("text values of the four supplied venues are OFFICIAL; the rest stay SECONDARY_SOURCE", () => {
    for (const venue of ["東京", "京都", "中山", "新潟"]) {
      for (const specSurface of ["芝", "ダート"]) {
        const course = resolveCourse(venue, specSurface, venue === "新潟" && specSurface === "芝" ? 1200 : specSurface === "芝" ? 1800 : 1800);
        expect(course.basis.direction, `${venue}${specSurface}`).toBe("OFFICIAL");
      }
    }
    for (const venue of ["札幌", "函館", "福島", "中京", "阪神", "小倉"]) expect(resolveCourse(venue, "芝", 1800).basis.direction).toBe("SECONDARY_SOURCE");
    expect(resolveCourse("京都", "ダート", 1800).elevationGainMeters).toBe(3.0);
    expect(resolveCourse("新潟", "ダート", 1800).elevationGainMeters).toBe(0.6);
  });

  it("an undetermined variant stays UNKNOWN instead of guessing a loop", () => {
    const course = resolveCourse("京都", "芝", 1600);
    expect(course.lapMeters).toBe("UNKNOWN");
    expect(course.startLapShare).toBe("UNKNOWN");
    expect(course.direction).toBe("RIGHT");
  });

  it("jump-like distances and unknown venues fall back to a generic UNKNOWN oval", () => {
    expect(isFlatDistance(2880)).toBe(false);
    expect(resolveCourse("中山", "芝", 2880).startLapShare).toBe("UNKNOWN");
    expect(resolveCourse("大井", "ダート", 1600).sourceRefs).toEqual([]);
    expect(resolveCourse("大井", "ダート", 1600).direction).toBe("UNKNOWN");
  });

  it("the four evidence courses resolve with distinct start / finish / direction", () => {
    const tokyo = resolveCourse("東京", "芝", 2000), kyoto = resolveCourse("京都", "ダート", 1800), nakayama = resolveCourse("中山", "芝", 2500), niigata = resolveCourse("新潟", "芝", 1000);
    expect([tokyo.direction, kyoto.direction, nakayama.direction, niigata.direction]).toEqual(["LEFT", "RIGHT", "RIGHT", "STRAIGHT"]);
    expect(niigata.pathClosed).toBe(false);
    expect(niigata.startPoint).toEqual(niigata.path[0]);
    expect(niigata.finishPoint).toEqual(niigata.path[niigata.path.length - 1]);
    expect(niigata.basis.startPoint).toBe("OFFICIAL_DIAGRAM_APPROXIMATION");
    expect(niigata.basis.finishPoint).toBe("OFFICIAL_DIAGRAM_APPROXIMATION");
    expect(niigata.basis.direction).toBe("OFFICIAL");
    expect(niigata.elevationProfile!.length).toBeGreaterThan(3);
  });
});

describe("official diagram data (Tokyo plan view and section views)", () => {
  const turning = (path: { x: number; y: number }[], from: number, to: number) => {
    let total = 0;
    const n = path.length;
    for (let i = Math.floor(from * n); i < Math.floor(to * n); i++) {
      const a = path[(i - 1 + n) % n], b = path[i % n], c = path[(i + 1) % n];
      const t = Math.atan2((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x), (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y));
      total += Math.abs(t) * 180 / Math.PI;
    }
    return total;
  };

  it("the traced path agrees with the section view: corners turn, straights do not", () => {
    for (const kind of ["turf", "dirt"] as const) {
      const d = TOKYO_DIAGRAM[kind];
      const path = d.path.map(([x, y]) => ({ x, y }));
      const [, c1, c2, back, c3, c4, home] = d.sectionShares;
      expect(turning(path, c1, back), `${kind} corners 1-2`).toBeGreaterThan(140);
      expect(turning(path, c3, home), `${kind} corners 3-4`).toBeGreaterThan(140);
      expect(turning(path, back + 0.03, c3 - 0.03), `${kind} backstretch`).toBeLessThan(60);
      expect(turning(path, home + 0.03, 0.99), `${kind} home straight`).toBeLessThan(60);
      void c2; void c4;
    }
  });

  it("section-view straight length matches the page's home-straight length within 2%", () => {
    expect((1 - TOKYO_DIAGRAM.turf.sectionShares[6]) * 2083.1).toBeGreaterThan(525.9 * 0.98);
    expect((1 - TOKYO_DIAGRAM.turf.sectionShares[6]) * 2083.1).toBeLessThan(525.9 * 1.02);
    expect((1 - NIIGATA_DIAGRAM.outer.sectionShares[6]) * 2223).toBeGreaterThan(658.7 * 0.98);
    expect((1 - NIIGATA_DIAGRAM.outer.sectionShares[6]) * 2223).toBeLessThan(658.7 * 1.02);
  });

  it("Tokyo corner markers come from the section view and sit on the traced path", () => {
    const course = resolveCourse("東京", "芝", 2000);
    expect(course.corners.map(c => c.label)).toEqual(["1", "2", "3", "4"]);
    expect(course.corners.every(c => c.basis === "OFFICIAL_DIAGRAM_APPROXIMATION")).toBe(true);
    const shares = course.corners.map(c => c.share);
    expect([...shares].sort((a, b) => a - b)).toEqual(shares);
    expect(course.basis.path).toBe("OFFICIAL_DIAGRAM_APPROXIMATION");
    expect(course.basis.finishPoint).toBe("OFFICIAL_DIAGRAM_APPROXIMATION");
  });

  it("elevation profiles reproduce the page's relief within the diagram's reading error", () => {
    const relief = (points: readonly { meters: number }[]) => Math.max(...points.map(p => p.meters)) - Math.min(...points.map(p => p.meters));
    expect(Math.abs(relief(TOKYO_DIAGRAM.turf.profile) - 2.7)).toBeLessThan(0.5);
    expect(Math.abs(relief(TOKYO_DIAGRAM.dirt.profile) - 2.5)).toBeLessThan(0.5);
    expect(Math.abs(relief(NIIGATA_DIAGRAM.dirt.profile) - 0.6)).toBeLessThan(0.3);
    expect(Math.abs(relief(NIIGATA_DIAGRAM.inner.profile) - 0.8)).toBeLessThan(0.3);
    expect(Math.abs(relief(NIIGATA_DIAGRAM.outer.profile) - 2.2)).toBeLessThan(0.4);
    for (const profile of [TOKYO_DIAGRAM.turf.profile, TOKYO_DIAGRAM.dirt.profile, NIIGATA_DIAGRAM.straight.profile]) {
      expect(profile[0].at).toBe(0);
      expect(profile[profile.length - 1].at).toBe(1);
    }
  });

  it("slopes the page places by remaining distance carry start and end positions", () => {
    const tokyo = resolveCourse("東京", "芝", 2000).slopes.find(s => s.startRemainingMeters);
    expect(tokyo).toMatchObject({ kind: "UP", riseMeters: 2, startRemainingMeters: 460, endRemainingMeters: 300 });
    const nakayama = resolveCourse("中山", "芝", 2000).slopes.find(s => s.startRemainingMeters);
    expect(nakayama).toMatchObject({ kind: "UP", riseMeters: 2.2, startRemainingMeters: 180, endRemainingMeters: 70 });
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
