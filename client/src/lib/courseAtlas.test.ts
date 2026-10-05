import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CHUKYO_DIAGRAM, FUKUSHIMA_DIAGRAM, HAKODATE_DIAGRAM, HANSHIN_DIAGRAM, KYOTO_DIAGRAM, NAKAYAMA_DIAGRAM, NIIGATA_DIAGRAM, SAPPORO_DIAGRAM, TOKYO_DIAGRAM } from "./courseDiagramData";
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

  it("gates read off the official plan views reproduce the race distance (Tokyo, Kyoto dirt, Nakayama)", () => {
    const rings = { "東京芝": TOKYO_DIAGRAM.turf, "東京ダート": TOKYO_DIAGRAM.dirt, "京都ダート": KYOTO_DIAGRAM.dirt, "中山芝内": NAKAYAMA_DIAGRAM.turfInner, "中山ダート": NAKAYAMA_DIAGRAM.dirt, "札幌芝": SAPPORO_DIAGRAM.turf, "札幌ダート": SAPPORO_DIAGRAM.dirt, "福島芝": FUKUSHIMA_DIAGRAM.turf, "福島ダート": FUKUSHIMA_DIAGRAM.dirt, "中京芝": CHUKYO_DIAGRAM.turf, "中京ダート": CHUKYO_DIAGRAM.dirt, "函館芝": HAKODATE_DIAGRAM.turf, "函館ダート": HAKODATE_DIAGRAM.dirt, "阪神芝内": HANSHIN_DIAGRAM.turfInner, "阪神ダート": HANSHIN_DIAGRAM.dirt };
    let checked = 0;
    for (const [name, table] of Object.entries(rings)) {
      for (const [dist, start] of Object.entries(table.starts)) {
        const d = Number(dist);
        // ring distance to the goal, plus the chute length when the gate is off the ring, is the race distance
        const implied = start.ringMetersToGoal + (start.offRingMeters > 8 ? start.offRingMeters : 0);
        expect(Math.abs(implied - d) / d, `${name}${d}`).toBeLessThan(0.04);
        expect(start.share).toBeGreaterThanOrEqual(0);
        expect(start.share).toBeLessThan(1);
        checked++;
      }
    }
    expect(checked).toBe(9 + 6 + 4 + 4 + 4 + 6 + 3 + 6 + 4 + 7 + 5 + 6 + 3 + 4 + 5);
    const t2000 = resolveCourse("東京", "芝", 2000);
    expect(t2000.basis.startPoint).toBe("OFFICIAL_DIAGRAM_APPROXIMATION");
    expect(t2000.startOnRing).toBe(false); // chute start on the right-hand spur
    expect(t2000.startNote).toContain("シュート");
    expect(resolveCourse("東京", "芝", 2400).startOnRing).toBe(true);
  });

  it("Kyoto dirt 1800: the diagram start agrees with the lap arithmetic (cross-check of both methods)", () => {
    const course = resolveCourse("京都", "ダート", 1800);
    expect(course.basis.startPoint).toBe("OFFICIAL_DIAGRAM_APPROXIMATION");
    expect(course.startOnRing).toBe(true);
    expect(course.startLapShare as number).toBeCloseTo(1 - ((1800 / 1607.6) % 1), 1);
    expect(Math.abs((course.startLapShare as number) - (1 - ((1800 / 1607.6) % 1)))).toBeLessThan(0.02);
    expect(course.raceLaps).toBeCloseTo(1 + (1 - (course.startLapShare as number)), 6);
    expect(course.direction).toBe("RIGHT");
    expect(course.basis.corners).toBe("OFFICIAL_DIAGRAM_APPROXIMATION");
    expect(course.elevationProfile!.length).toBeGreaterThan(5);
    expect(resolveCourse("京都", "ダート", 1400).startOnRing).toBe(false); // turf chute start (the page: 芝スタート)
  });

  it("Nakayama turf 2500 (inner): gate on the outer-course track, projected onto the inner ring near corner 3", () => {
    const course = resolveCourse("中山", "芝", 2500);
    expect(course.variant).toBe("INNER");
    expect(course.basis.startPoint).toBe("OFFICIAL_DIAGRAM_APPROXIMATION");
    expect(course.startOnRing).toBe(false);
    expect(course.startNote).toContain("シュート");
    const share = course.startLapShare as number;
    const sections = NAKAYAMA_DIAGRAM.turfInner.sectionShares; // [0, 1C, 2C, 向正面, 3C, 4C, 直線, 1]
    expect(share).toBeGreaterThan(sections[4]); // after the 3rd-corner entry
    expect(share).toBeLessThan(sections[6]);    // before the home straight
    expect(course.raceLaps).toBeCloseTo(1 + (1 - share), 6);
    expect(resolveCourse("中山", "芝", 1800).startOnRing).toBe(true);
  });

  it("lap arithmetic is only used for starts on the loop, and is labelled as derived", () => {
    const kokura = resolveCourse("小倉", "芝", 2000);
    expect(kokura.startLapShare).toBeCloseTo(1 - ((2000 / 1615.1) % 1), 10);
    expect(kokura.basis.startPoint).toBe("DERIVED_FROM_LAP_AND_DISTANCE");
    expect(kokura.basis.lapMeters).toBe("SECONDARY_SOURCE");
    const chukyo = resolveCourse("中京", "芝", 2000);
    expect(chukyo.basis.lapMeters).toBe("OFFICIAL");
    expect(chukyo.basis.startPoint).toBe("OFFICIAL_DIAGRAM_APPROXIMATION");
    const kyotoInner = resolveCourse("京都", "芝", 1200);
    expect(kyotoInner.startLapShare).toBeCloseTo(1 - ((1200 / 1782.8) % 1), 10);
    expect(kyotoInner.basis.startPoint).toBe("DERIVED_FROM_LAP_AND_DISTANCE"); // no plan trace for the turf loops yet
    expect(kyotoInner.basis.lapMeters).toBe("OFFICIAL");
  });

  it("Sapporo: right-handed, goal on the 1コーナー side, starts from the plan view", () => {
    const course = resolveCourse("札幌", "芝", 1800);
    expect(course.direction).toBe("RIGHT");
    expect(course.basis.startPoint).toBe("OFFICIAL_DIAGRAM_APPROXIMATION");
    expect(course.startOnRing).toBe(true);
    expect(course.startLapShare as number).toBeCloseTo(1 - ((1800 / 1640.9) % 1), 1); // on-loop gate agrees with the arithmetic
    expect(resolveCourse("札幌", "芝", 1500).startOnRing).toBe(false); // the left-hand chute
    expect(resolveCourse("札幌", "芝", 1200).startOnRing).toBe(false); // the top-left lead-in
    expect(resolveCourse("札幌", "ダート", 1700).basis.startPoint).toBe("OFFICIAL_DIAGRAM_APPROXIMATION");
    expect(resolveCourse("札幌", "芝", 1700).distanceListed).toBe(false);
  });

  it("Hakodate: official page values and plan-view starts; the 2コーナーポケット (1200) and right-hand pocket (2000) are off the ring", () => {
    const turf = resolveCourse("函館", "芝", 1200);
    expect(turf.direction).toBe("RIGHT");
    expect(turf.lapMeters).toBe(1626.6);
    expect(turf.elevationGainMeters).toBe(3.5);
    expect(turf.basis.startPoint).toBe("OFFICIAL_DIAGRAM_APPROXIMATION");
    expect(turf.startOnRing).toBe(false);
    expect(resolveCourse("函館", "芝", 2000).startOnRing).toBe(false);
    expect(resolveCourse("函館", "芝", 1800).startOnRing).toBe(true);
    // 2600 = one lap + 973 m: its gate is close to, but not the same as, the 1000 m gate (two separate arrows on the plan)
    expect(Math.abs((resolveCourse("函館", "芝", 2600).startLapShare as number) - (resolveCourse("函館", "芝", 1000).startLapShare as number))).toBeLessThan(0.06);
    expect(resolveCourse("函館", "ダート", 1700).homeStraightMeters).toBe(260.3);
    expect(resolveCourse("函館", "芝", 1500).distanceListed).toBe(false);
  });

  it("Hanshin: official page values; inner-loop and dirt starts from the plan view, ambiguous 1400 / 3200 stay UNKNOWN", () => {
    const inner = resolveCourse("阪神", "芝", 2000);
    expect(inner.variant).toBe("INNER");
    expect(inner.basis.startPoint).toBe("OFFICIAL_DIAGRAM_APPROXIMATION");
    expect(inner.startOnRing).toBe(true);
    expect(resolveCourse("阪神", "芝", 2200).startOnRing).toBe(false); // right-hand pocket
    expect(resolveCourse("阪神", "芝", 1600).variant).toBe("OUTER");
    expect(resolveCourse("阪神", "芝", 1600).startLapShare).toBe("UNKNOWN"); // outer loop not traced
    for (const d of [1400, 3200]) expect(resolveCourse("阪神", "芝", d).variant, `hanshin ${d}`).toBe("UNKNOWN");
    expect(resolveCourse("阪神", "芝", 1200).startLapShare).not.toBe("UNKNOWN");
    expect(resolveCourse("阪神", "ダート", 1400).startOnRing).toBe(false); // turf start (the page)
    expect(resolveCourse("阪神", "ダート", 2000).startOnRing).toBe(false); // turf start (the page)
    expect(resolveCourse("阪神", "ダート", 1800).startOnRing).toBe(true);
    expect(resolveCourse("阪神", "ダート", 1800).slopes.find(sl => sl.startRemainingMeters)).toMatchObject({ kind: "UP", riseMeters: 1.6, startRemainingMeters: 200 });
  });

  it("Fukushima: official page values; plan-view starts, with the 1150m dirt race starting off the ring (turf pocket)", () => {
    const turf = resolveCourse("福島", "芝", 1800);
    expect(turf.lapMeters).toBe(1600);
    expect(turf.homeStraightMeters).toBe(292.0);
    expect(turf.elevationGainMeters).toBe(1.9);
    const slope = turf.slopes.find(sl => sl.startRemainingMeters);
    expect(slope).toMatchObject({ kind: "UP", riseMeters: 1.2, startRemainingMeters: 170, endRemainingMeters: 50 });
    const dirt1150 = resolveCourse("福島", "ダート", 1150);
    expect(dirt1150.distanceListed).toBe(true);
    expect(dirt1150.basis.startPoint).toBe("OFFICIAL_DIAGRAM_APPROXIMATION");
    expect(dirt1150.startOnRing).toBe(false);
    expect(resolveCourse("福島", "芝", 2600).startLapShare).toBe(resolveCourse("福島", "芝", 1000).startLapShare); // 2600 = one lap + 1000: same gate
    expect(resolveCourse("福島", "ダート", 1700).elevationGainMeters).toBe(2.1);
  });

  it("Chukyo: left-handed, official page values, starts from the plan view (dirt 1400 = turf start on the chute)", () => {
    const turf = resolveCourse("中京", "芝", 2000);
    expect(turf.direction).toBe("LEFT");
    expect([turf.lapMeters, turf.homeStraightMeters, turf.elevationGainMeters]).toEqual([1705.9, 412.5, 3.5]);
    expect(resolveCourse("中京", "ダート", 1800).lapMeters).toBe(1530);
    expect(resolveCourse("中京", "ダート", 1400).startOnRing).toBe(false);
    expect(resolveCourse("中京", "芝", 1600).startOnRing).toBe(false); // right-hand chute
    expect(resolveCourse("中京", "芝", 3000).startLapShare).toBe(resolveCourse("中京", "芝", 1300).startLapShare); // 3000 = one lap + 1300: same gate
    expect(resolveCourse("中京", "芝", 1500).distanceListed).toBe(false);
  });

  it("starts whose gate has not been read stay UNKNOWN (no lap arithmetic)", () => {
    expect(resolveCourse("京都", "芝", 1800).startLapShare).toBe("UNKNOWN"); // deep chute off the backstretch
    expect(resolveCourse("新潟", "芝", 1600).startLapShare).toBe("UNKNOWN"); // plan not read yet
    expect(resolveCourse("中山", "芝", 2200).startLapShare).toBe("UNKNOWN"); // outer loop not traced
    expect(resolveCourse("京都", "ダート", 1100).startLapShare).toBe("UNKNOWN");
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
    expect(resolveCourse("小倉", "芝", 2000).basis.direction).toBe("SECONDARY_SOURCE");
    expect(resolveCourse("阪神", "芝", 2000).basis.direction).toBe("OFFICIAL");
    for (const venue of ["札幌", "函館", "福島"]) expect(resolveCourse(venue, "芝", 1800).basis.direction).toBe("OFFICIAL");
    expect(resolveCourse("中京", "芝", 2000).basis.direction).toBe("OFFICIAL");
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

  it("every traced path agrees with its section view: corners turn, straights do not", () => {
    const rings = { "東京芝": TOKYO_DIAGRAM.turf, "東京ダート": TOKYO_DIAGRAM.dirt, "京都ダート": KYOTO_DIAGRAM.dirt, "中山芝内": NAKAYAMA_DIAGRAM.turfInner, "中山ダート": NAKAYAMA_DIAGRAM.dirt, "札幌芝": SAPPORO_DIAGRAM.turf, "札幌ダート": SAPPORO_DIAGRAM.dirt, "福島芝": FUKUSHIMA_DIAGRAM.turf, "福島ダート": FUKUSHIMA_DIAGRAM.dirt, "中京芝": CHUKYO_DIAGRAM.turf, "中京ダート": CHUKYO_DIAGRAM.dirt, "函館芝": HAKODATE_DIAGRAM.turf, "函館ダート": HAKODATE_DIAGRAM.dirt, "阪神芝内": HANSHIN_DIAGRAM.turfInner, "阪神ダート": HANSHIN_DIAGRAM.dirt };
    for (const [name, d] of Object.entries(rings)) {
      const path = d.path.map(([x, y]) => ({ x, y }));
      const [, c1, , back, c3, , home] = d.sectionShares;
      expect(turning(path, c1, back), `${name} corners 1-2`).toBeGreaterThan(130);
      expect(turning(path, c3, home), `${name} corners 3-4`).toBeGreaterThan(130);
      expect(turning(path, back + 0.03, c3 - 0.03), `${name} backstretch`).toBeLessThan(80);
      expect(turning(path, home + 0.03, 0.99), `${name} home straight`).toBeLessThan(80);
    }
  });

  it("section-view straight length matches the page's home-straight length (within 5%; reading error of a tick is ~3-4 px)", () => {
    const check = (shares: readonly number[], lap: number, straight: number) => expect(Math.abs((1 - shares[6]) * lap - straight) / straight).toBeLessThan(0.05);
    check(KYOTO_DIAGRAM.dirt.sectionShares, 1607.6, 329.1);
    check(KYOTO_DIAGRAM.turfOuter.sectionShares, 1894.3, 403.7);
    check(KYOTO_DIAGRAM.turfInner.sectionShares, 1782.8, 328.4);
    check(NAKAYAMA_DIAGRAM.dirt.sectionShares, 1493, 308);
    check(NAKAYAMA_DIAGRAM.turfOuter.sectionShares, 1839.7, 310);
    check(NAKAYAMA_DIAGRAM.turfInner.sectionShares, 1667.1, 310);
    check(SAPPORO_DIAGRAM.turf.sectionShares, 1640.9, 266.1);
    check(SAPPORO_DIAGRAM.dirt.sectionShares, 1487, 264.3);
    check(FUKUSHIMA_DIAGRAM.turf.sectionShares, 1600, 292.0);
    check(FUKUSHIMA_DIAGRAM.dirt.sectionShares, 1444.6, 295.7);
    check(CHUKYO_DIAGRAM.turf.sectionShares, 1705.9, 412.5);
    check(CHUKYO_DIAGRAM.dirt.sectionShares, 1530, 410.7);
    check(HAKODATE_DIAGRAM.turf.sectionShares, 1626.6, 262.1);
    check(HAKODATE_DIAGRAM.dirt.sectionShares, 1475.8, 260.3);
    check(HANSHIN_DIAGRAM.turfInner.sectionShares, 1689, 356.5);
    check(HANSHIN_DIAGRAM.turfOuter.sectionShares, 2089, 473.6);
    check(HANSHIN_DIAGRAM.dirt.sectionShares, 1517.6, 352.7);
    check(TOKYO_DIAGRAM.turf.sectionShares, 2083.1, 525.9);
    check(NIIGATA_DIAGRAM.outer.sectionShares, 2223, 658.7);
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
    expect(Math.abs(relief(KYOTO_DIAGRAM.turfOuter.profile) - 4.3)).toBeLessThan(0.4);
    expect(Math.abs(relief(KYOTO_DIAGRAM.turfInner.profile) - 3.1)).toBeLessThan(0.4);
    expect(Math.abs(relief(KYOTO_DIAGRAM.dirt.profile) - 3.0)).toBeLessThan(0.4);
    expect(Math.abs(relief(NAKAYAMA_DIAGRAM.turfInner.profile) - 5.3)).toBeLessThan(0.5);
    expect(Math.abs(relief(NAKAYAMA_DIAGRAM.turfOuter.profile) - 5.3)).toBeLessThan(0.5);
    expect(Math.abs(relief(NAKAYAMA_DIAGRAM.dirt.profile) - 4.5)).toBeLessThan(0.5);
    expect(Math.abs(relief(SAPPORO_DIAGRAM.turf.profile) - 0.7)).toBeLessThan(0.3);
    expect(Math.abs(relief(SAPPORO_DIAGRAM.dirt.profile) - 0.9)).toBeLessThan(0.3);
    expect(Math.abs(relief(FUKUSHIMA_DIAGRAM.turf.profile) - 1.9)).toBeLessThan(0.4);
    expect(Math.abs(relief(FUKUSHIMA_DIAGRAM.dirt.profile) - 2.1)).toBeLessThan(0.4);
    expect(Math.abs(relief(CHUKYO_DIAGRAM.turf.profile) - 3.5)).toBeLessThan(0.4);
    expect(Math.abs(relief(CHUKYO_DIAGRAM.dirt.profile) - 3.4)).toBeLessThan(0.4);
    expect(Math.abs(relief(HAKODATE_DIAGRAM.turf.profile) - 3.5)).toBeLessThan(0.4);
    expect(Math.abs(relief(HAKODATE_DIAGRAM.dirt.profile) - 3.5)).toBeLessThan(0.4);
    expect(Math.abs(relief(HANSHIN_DIAGRAM.turfInner.profile) - 1.9)).toBeLessThan(0.4);
    expect(Math.abs(relief(HANSHIN_DIAGRAM.turfOuter.profile) - 2.4)).toBeLessThan(0.4);
    expect(Math.abs(relief(HANSHIN_DIAGRAM.dirt.profile) - 1.6)).toBeLessThan(0.4);
    for (const profile of [TOKYO_DIAGRAM.turf.profile, TOKYO_DIAGRAM.dirt.profile, NIIGATA_DIAGRAM.straight.profile]) {
      expect(profile[0].at).toBe(0);
      expect(profile[profile.length - 1].at).toBe(1);
    }
  });

  it("slopes the page places by remaining distance carry start and end positions", () => {
    const tokyo = resolveCourse("東京", "芝", 2000).slopes.find(s => s.startRemainingMeters);
    expect(tokyo).toMatchObject({ kind: "UP", riseMeters: 2, startRemainingMeters: 460, endRemainingMeters: 300 });
    const nakayama = resolveCourse("中山", "芝", 2000).slopes.find(sl => sl.startRemainingMeters);
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
