/**
 * Where the pack is on the course, and what the Atlas can honestly draw.
 * Everything here reads only the course layout (Course Atlas) and scenario progress /
 * lap share: no market, probability, published-pick or result data.
 */
import { pointOnPath, stylizedSections, type CourseLayout, type CoursePoint, type Slope } from "@/lib/courseAtlas";

export type SectionId = "START" | "FIRST_TURN" | "BACKSTRETCH" | "THIRD_TURN" | "FINAL_TURN" | "HOME_STRAIGHT";
export const SECTION_LABEL: Record<SectionId, string> = {
  START: "START", FIRST_TURN: "FIRST TURN", BACKSTRETCH: "BACKSTRETCH", THIRD_TURN: "THIRD TURN", FINAL_TURN: "FINAL TURN", HOME_STRAIGHT: "HOME STRAIGHT",
};
export const SECTION_LABEL_JA: Record<SectionId, string> = {
  START: "スタート", FIRST_TURN: "1〜2コーナー", BACKSTRETCH: "向正面", THIRD_TURN: "3コーナー", FINAL_TURN: "4コーナー", HOME_STRAIGHT: "直線",
};
/** The first stretch of the scenario is labelled START whatever the course geometry. */
export const START_SECTION_UNTIL = 0.05;

const sectionsOf = (course: CourseLayout): readonly number[] =>
  course.sectionShares === "UNKNOWN" ? stylizedSections(0.2) : course.sectionShares;

/** Course share (from the goal line, running direction) of a scenario lap value. */
export function courseShare(course: Pick<CourseLayout, "pathClosed" | "startLapShare" | "raceLaps">, lap: number): number {
  if (!course.pathClosed) return Math.min(1, Math.max(0, lap));
  const start = course.startLapShare === "UNKNOWN" ? 0 : course.startLapShare;
  const raw = start + lap * course.raceLaps;
  return ((raw % 1) + 1) % 1;
}

export function sectionAt(course: CourseLayout, share: number, progress: number): SectionId {
  if (progress < START_SECTION_UNTIL) return "START";
  if (!course.pathClosed) return "HOME_STRAIGHT";
  const b = sectionsOf(course);
  if (share >= b[6] || share < b[1]) return "HOME_STRAIGHT";
  if (share < b[3]) return "FIRST_TURN";
  if (share < b[4]) return "BACKSTRETCH";
  if (share < b[5]) return "THIRD_TURN";
  return "FINAL_TURN";
}

const smooth = (x: number) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };

/** 0 on straights, 1 inside corners, with a short ramp so cosmetic motion never jumps. */
export function turnness(course: CourseLayout, share: number, ramp = 0.02): number {
  if (!course.pathClosed) return 0;
  const b = sectionsOf(course);
  const inside = (from: number, to: number) => smooth((share - from) / ramp) * smooth((to - share) / ramp);
  return Math.max(inside(b[1], b[3]), inside(b[4], b[6]));
}

/** 0 on the backstretch and corners, ramping to 1 over the home straight. */
export function straightness(course: CourseLayout, share: number, ramp = 0.03): number {
  if (!course.pathClosed) return 1;
  const b = sectionsOf(course);
  const onHome = Math.max(smooth((share - b[6]) / ramp) * (share >= b[6] ? 1 : 0), share < b[1] ? 1 : 0);
  return Math.min(1, onHome);
}

export const REMAINING_MARKERS = [800, 600, 400, 200] as const;
export type RemainingMarker = { meters: (typeof REMAINING_MARKERS)[number]; share: number };

/**
 * 残り800/600/400/200m. Shown only when the Atlas knows the loop length (or, on the straight
 * course, the straight length): the distance is then exact, and the marker sits at that lap
 * share of the drawn path. Otherwise nothing is returned -- no guessing.
 */
export function remainingMarkers(course: CourseLayout): RemainingMarker[] {
  const length = course.pathClosed ? course.lapMeters : course.homeStraightMeters;
  if (typeof length !== "number") return [];
  return REMAINING_MARKERS.filter(meters => meters < length).map(meters => ({ meters, share: 1 - meters / length }));
}

export type SlopeSpan = { kind: Slope["kind"]; riseMeters: number | "UNKNOWN"; fromShare: number; toShare: number; where: string };

/** Slopes the page places by remaining distance at both ends (Tokyo, Nakayama, Fukushima). */
export function slopeSpans(course: CourseLayout): SlopeSpan[] {
  if (typeof course.lapMeters !== "number") return [];
  const lap = course.lapMeters;
  return course.slopes
    .filter(slope => typeof slope.startRemainingMeters === "number" && typeof slope.endRemainingMeters === "number")
    .map(slope => ({ kind: slope.kind, riseMeters: slope.riseMeters, fromShare: 1 - (slope.startRemainingMeters as number) / lap, toShare: 1 - (slope.endRemainingMeters as number) / lap, where: slope.where }));
}

/** The facts that make this course look like itself, all from the Atlas. */
export function courseFacts(course: CourseLayout): string[] {
  const facts: string[] = [];
  facts.push(course.direction === "LEFT" ? "左回り" : course.direction === "RIGHT" ? "右回り" : course.direction === "STRAIGHT" ? "直線コース" : "回り方向 UNKNOWN");
  if (course.variant === "INNER") facts.push("内回り");
  if (course.variant === "OUTER") facts.push("外回り");
  if (typeof course.lapMeters === "number") facts.push(`1周 ${course.lapMeters}m`);
  if (typeof course.homeStraightMeters === "number") facts.push(course.pathClosed ? `直線 ${course.homeStraightMeters}m` : `直線 ${course.homeStraightMeters}m全区間`);
  if (typeof course.elevationGainMeters === "number") facts.push(`高低差 ${course.elevationGainMeters}m`);
  return facts;
}

/** Path point (normalized) at `share`, for tests and markers. */
export function pointAtShare(course: CourseLayout, share: number, offset = 0): CoursePoint {
  return pointOnPath(course.path, share, offset, course.pathClosed);
}
