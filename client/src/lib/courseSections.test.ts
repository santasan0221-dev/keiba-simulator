import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { genericLayout, JRA_VENUES, resolveCourse, stylizedSections } from "./courseAtlas";
import { courseFacts, courseShare, remainingMarkers, sectionAt, SECTION_LABEL, slopeSpans, straightness, turnness, type SectionId } from "./courseSections";

describe("current section follows the course geometry", () => {
  it("walks FIRST TURN, BACKSTRETCH, THIRD TURN, FINAL TURN, HOME STRAIGHT in running order (Tokyo turf 2000)", () => {
    const course = resolveCourse("東京", "芝", 2000);
    const seen: SectionId[] = [];
    for (let i = 0; i <= 1000; i++) {
      const progress = i / 1000;
      if (progress < 0.05) { expect(sectionAt(course, courseShare(course, progress), progress)).toBe("START"); continue; }
      const section = sectionAt(course, courseShare(course, progress * 0.985), progress);
      if (seen[seen.length - 1] !== section) seen.push(section);
    }
    // Tokyo 2000 starts just past the goal on the chute side, so the first sections after START are already in the first turn.
    expect(seen).toEqual(["FIRST_TURN", "BACKSTRETCH", "THIRD_TURN", "FINAL_TURN", "HOME_STRAIGHT"]);
  });

  it("START covers the first 5% whatever the geometry; the straight course has no corners", () => {
    const niigata = resolveCourse("新潟", "芝", 1000);
    expect(sectionAt(niigata, 0.02, 0.02)).toBe("START");
    expect(sectionAt(niigata, 0.5, 0.5)).toBe("HOME_STRAIGHT");
    expect(turnness(niigata, 0.5)).toBe(0);
  });

  it("uses the official section boundaries where a plan was read, stylized ones otherwise", () => {
    expect(resolveCourse("東京", "芝", 2000).sectionBasis).toBe("OFFICIAL_DIAGRAM_APPROXIMATION");
    expect(resolveCourse("新潟", "芝", 1200).sectionBasis).toBe("STYLIZED");
    const b = stylizedSections(0.2);
    expect(b).toHaveLength(8);
    expect([...b].sort((x, y) => x - y)).toEqual(b);
    expect(b[0]).toBe(0);
    expect(b[7]).toBe(1);
  });

  it("every venue's course resolves to ordered section boundaries", () => {
    for (const venue of JRA_VENUES) {
      for (const surface of ["芝", "ダート"]) {
        const course = resolveCourse(venue, surface, 1800);
        if (course.sectionShares === "UNKNOWN") continue;
        const b = course.sectionShares;
        expect(b, `${venue}${surface}`).toHaveLength(8);
        for (let i = 1; i < b.length; i++) expect(b[i], `${venue}${surface}[${i}]`).toBeGreaterThanOrEqual(b[i - 1]);
      }
    }
  });

  it("turnness is 1 inside corners, 0 on straights, and continuous", () => {
    const course = resolveCourse("東京", "芝", 2000);
    const b = course.sectionShares as readonly number[];
    expect(turnness(course, (b[1] + b[3]) / 2)).toBeCloseTo(1, 5);
    expect(turnness(course, (b[3] + b[4]) / 2)).toBe(0);
    expect(turnness(course, (b[4] + b[6]) / 2)).toBeCloseTo(1, 5);
    let previous = turnness(course, 0);
    for (let i = 1; i <= 2000; i++) { const value = turnness(course, i / 2000); expect(Math.abs(value - previous)).toBeLessThan(0.12); previous = value; }
    expect(straightness(course, 0.9)).toBeGreaterThan(0.9);
    expect(straightness(course, (b[3] + b[4]) / 2)).toBe(0);
  });

  it("labels are the six names from the spec", () => {
    expect(Object.values(SECTION_LABEL)).toEqual(["START", "FIRST TURN", "BACKSTRETCH", "THIRD TURN", "FINAL TURN", "HOME STRAIGHT"]);
  });
});

describe("track markers come only from what the Atlas knows", () => {
  it("remaining 800 / 600 / 400 / 200 sit at exact lap shares when the loop length is known", () => {
    const course = resolveCourse("東京", "芝", 2000);
    const markers = remainingMarkers(course);
    expect(markers.map(m => m.meters)).toEqual([800, 600, 400, 200]);
    for (const marker of markers) expect(marker.share).toBeCloseTo(1 - marker.meters / 2083.1, 10);
    const shares = markers.map(m => m.share);
    expect([...shares].sort((a, b) => a - b)).toEqual(shares);
  });

  it("the straight 1000 m course uses its own length", () => {
    const markers = remainingMarkers(resolveCourse("新潟", "芝", 1000));
    markers.map(m => m.share).forEach((share, i) => expect(share).toBeCloseTo([0.2, 0.4, 0.6, 0.8][i], 10));
  });

  it("shows nothing when the length is unknown (no guessing)", () => {
    expect(remainingMarkers(genericLayout("大井", "DIRT", 1600))).toEqual([]);
    expect(remainingMarkers(resolveCourse("京都", "芝", 1600))).toEqual([]); // inner/outer undetermined
    expect(remainingMarkers(resolveCourse("中山", "芝", 2880))).toEqual([]); // not a flat distance
  });

  it("slopes are drawn only when the page gives both the start and the end by remaining distance", () => {
    const tokyo = slopeSpans(resolveCourse("東京", "芝", 2000));
    expect(tokyo).toHaveLength(1);
    expect(tokyo[0]).toMatchObject({ kind: "UP", riseMeters: 2 });
    expect(tokyo[0].fromShare).toBeCloseTo(1 - 460 / 2083.1, 10);
    expect(tokyo[0].toShare).toBeCloseTo(1 - 300 / 2083.1, 10);
    const nakayama = slopeSpans(resolveCourse("中山", "芝", 2000));
    expect(nakayama).toHaveLength(1);
    expect(nakayama[0]).toMatchObject({ riseMeters: 2.2 });
    expect(slopeSpans(resolveCourse("阪神", "ダート", 1800))).toEqual([]); // only the start (残り200m) is given
    expect(slopeSpans(resolveCourse("小倉", "ダート", 1700))).toEqual([]);
  });
});

describe("course identity", () => {
  it("every venue reads differently: direction, loop, straight and relief come from the Atlas", () => {
    const tokyo = courseFacts(resolveCourse("東京", "芝", 2000));
    expect(tokyo).toEqual(expect.arrayContaining(["左回り", "1周 2083.1m", "直線 525.9m", "高低差 2.7m"]));
    expect(courseFacts(resolveCourse("中山", "芝", 2500))).toEqual(expect.arrayContaining(["右回り", "内回り", "直線 310m", "高低差 5.3m"]));
    expect(courseFacts(resolveCourse("新潟", "芝", 1000))).toEqual(expect.arrayContaining(["直線コース"]));
    expect(courseFacts(resolveCourse("小倉", "芝", 1800))).toEqual(expect.arrayContaining(["右回り", "1周 1615.1m"]));
    const facts = new Set(JRA_VENUES.map(venue => courseFacts(resolveCourse(venue, "芝", 1800)).join("|")));
    expect(facts.size).toBe(JRA_VENUES.length);
  });

  it("the drawn shapes differ: Tokyo's long straight and Kokura's small loop are not the same oval", () => {
    const aspect = (venue: string) => { const path = resolveCourse(venue, "芝", 1800).path; const xs = path.map(p => p.x), ys = path.map(p => p.y); return (Math.max(...xs) - Math.min(...xs)) / (Math.max(...ys) - Math.min(...ys)); };
    const aspects = JRA_VENUES.map(aspect);
    expect(new Set(aspects.map(a => a.toFixed(2))).size).toBeGreaterThanOrEqual(7);
  });
});

describe("safety", () => {
  it("reads course layout and progress only", () => {
    const code = readFileSync(resolve(import.meta.dirname, "courseSections.ts"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "").toLowerCase();
    for (const forbidden of ["odds", "probab", "honmei", "popularity", "ai_rank", "win_", "math.random"]) expect(code, forbidden).not.toContain(forbidden);
    expect(code).not.toContain("singlepickai");
  });
});
