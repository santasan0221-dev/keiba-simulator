/**
 * Course Atlas: display-only course geometry for the scenario view.
 *
 * - Every figure is either copied from a cited JRA source or `"UNKNOWN"`.
 *   Nothing is filled by guesswork; a value that is only drawn for looks is
 *   marked in `drawing` and never presented as an official value.
 * - `path` / `startPoint` / `finishPoint` use a normalized 0..1 canvas. They
 *   are a stylized drawing that follows the venue's published characteristics
 *   (direction, straight/lap ratio); they are NOT a survey-grade map.
 * - Elevation is for display only. It never feeds run style, pace, ordering or
 *   speed: no module that moves runners imports this file.
 */
export type Unknown = "UNKNOWN";
export type CoursePoint = { x: number; y: number };
export type Direction = "LEFT" | "RIGHT" | "STRAIGHT";
export type Surface = "TURF" | "DIRT" | "JUMP";
export type CornerMarker = { label: "1" | "2" | "3" | "4"; at: CoursePoint | Unknown };
export type ElevationPoint = { at: number; meters: number };
/** OFFICIAL = copied from a cited source; STYLIZED = drawn for looks only. */
export type ValueBasis = "OFFICIAL" | "STYLIZED" | "UNKNOWN";

export type CourseLayout = {
  venue: string;
  organization: "JRA";
  surface: Surface;
  distance: number | Unknown;
  variant?: "INNER" | "OUTER" | "DEFAULT";
  direction: Direction | Unknown;
  lapMeters: number | Unknown;
  homeStraightMeters: number | Unknown;
  elevationGainMeters: number | Unknown;
  /** Where the field starts on `path` (0..1 of the lap, from the goal line). UNKNOWN until read from the official course diagram. */
  startPoint: CoursePoint | Unknown;
  startLapShare: number | Unknown;
  firstCornerDistanceMeters: number | Unknown;
  finishPoint: CoursePoint;
  path: CoursePoint[];
  corners: CornerMarker[];
  elevationProfile?: ElevationPoint[];
  /** Slopes as published in words; positions are only drawn when the source gives them. */
  slopes: { kind: "UP" | "DOWN"; riseMeters: number; where: string }[];
  basis: { direction: ValueBasis; lapMeters: ValueBasis; homeStraightMeters: ValueBasis; elevation: ValueBasis; startPoint: ValueBasis; path: ValueBasis };
  sourceRefs: string[];
};

export const GEOMETRY_DISCLAIMER = "コース形状は実競馬場の特徴を参考にした簡易図です。測量図ほどの精度はありません。";

const JRA_TOKYO_COURSE = "https://www.jra.go.jp/facilities/race/tokyo/course/index.html";

/**
 * Stylized stadium outline, normalized to 0..1 and starting at the goal line
 * (middle of the bottom straight). The straight length follows the published
 * straight/lap ratio. LEFT runs counter-clockwise on screen, RIGHT clockwise;
 * UNKNOWN draws the LEFT shape and the UI says the direction is unconfirmed.
 */
export function stadiumPath(direction: Direction | Unknown, straightRatio: number, steps = 96): CoursePoint[] {
  const straight = Math.min(0.6, Math.max(0.2, straightRatio * 1.6));
  const ry = Math.min(0.28, (0.96 - straight) / 2);
  const half = straight / 2;
  const arc = Math.PI * ry;
  const total = 2 * straight + 2 * arc;
  const mirror = direction === "RIGHT";
  const points: CoursePoint[] = [];
  for (let i = 0; i < steps; i++) {
    let d = (i / steps) * total;
    let x: number, y: number;
    if (d < half) { x = 0.5 + d; y = 0.5 + ry; }
    else if ((d -= half) < arc) { const a = Math.PI / 2 - d / ry; x = 0.5 + half + ry * Math.cos(a); y = 0.5 + ry * Math.sin(a); }
    else if ((d -= arc) < straight) { x = 0.5 + half - d; y = 0.5 - ry; }
    else if ((d -= straight) < arc) { const a = -Math.PI / 2 - d / ry; x = 0.5 - half + ry * Math.cos(a); y = 0.5 + ry * Math.sin(a); }
    else { d -= arc; x = 0.5 - half + d; y = 0.5 + ry; }
    points.push({ x: mirror ? 1 - x : x, y });
  }
  return points;
}

const U: Unknown = "UNKNOWN";

/**
 * Only what has been read from a cited source is entered. Venues / distances
 * not listed resolve to `genericLayout` (direction UNKNOWN, drawing only).
 */
export const COURSE_ATLAS: CourseLayout[] = [
  {
    venue: "東京", organization: "JRA", surface: "TURF", distance: U, variant: "DEFAULT",
    direction: "LEFT", lapMeters: 2083.1, homeStraightMeters: 525.9, elevationGainMeters: 2.7,
    startPoint: U, startLapShare: U, firstCornerDistanceMeters: U,
    finishPoint: { x: 0.5, y: 0.8 },
    path: stadiumPath("LEFT", 525.9 / 2083.1),
    corners: [{ label: "1", at: U }, { label: "2", at: U }, { label: "3", at: U }, { label: "4", at: U }],
    slopes: [
      { kind: "DOWN", riseMeters: 1.9, where: "1コーナーから向正面半ば" },
      { kind: "UP", riseMeters: 1.5, where: "3コーナー手前" },
      { kind: "UP", riseMeters: 2, where: "ゴール前 残り460m〜300m" },
    ],
    basis: { direction: "OFFICIAL", lapMeters: "OFFICIAL", homeStraightMeters: "OFFICIAL", elevation: "OFFICIAL", startPoint: "UNKNOWN", path: "STYLIZED" },
    sourceRefs: [JRA_TOKYO_COURSE],
  },
];

/** Used whenever no cited layout exists: a plain oval, never presented as a real course. */
export function genericLayout(venue: string | null, surface: Surface = "TURF", distance: number | null = null): CourseLayout {
  return {
    venue: venue ?? "UNKNOWN", organization: "JRA", surface, distance: distance ?? U, variant: "DEFAULT",
    direction: U, lapMeters: U, homeStraightMeters: U, elevationGainMeters: U,
    startPoint: U, startLapShare: U, firstCornerDistanceMeters: U,
    finishPoint: { x: 0.5, y: 0.8 }, path: stadiumPath(U, 0.25),
    corners: [], slopes: [],
    basis: { direction: "UNKNOWN", lapMeters: "UNKNOWN", homeStraightMeters: "UNKNOWN", elevation: "UNKNOWN", startPoint: "UNKNOWN", path: "STYLIZED" },
    sourceRefs: [],
  };
}

export function normalizeSurface(value: string | null | undefined): Surface | null {
  if (!value) return null;
  if (/芝|turf/i.test(value)) return "TURF";
  if (/ダ|dirt/i.test(value)) return "DIRT";
  if (/障|jump|steeple/i.test(value)) return "JUMP";
  return null;
}

/** Atlas lookup: exact distance first, then the venue/surface default entry, else a generic oval. */
export function resolveCourse(venue: string | null, surface: string | null, distance: number | null): CourseLayout {
  const kind = normalizeSurface(surface) ?? "TURF";
  const matches = COURSE_ATLAS.filter(entry => entry.venue === venue && entry.surface === kind);
  const found = matches.find(entry => entry.distance === distance) ?? matches.find(entry => entry.distance === U);
  return found ? { ...found, distance: distance ?? found.distance } : genericLayout(venue, kind, distance);
}

/** Point on a closed normalized path at lap share `lap` (0..1), moved `offset` outward from the inside rail. */
export function pointOnPath(path: CoursePoint[], lap: number, offset = 0): CoursePoint {
  const n = path.length;
  const pos = (((lap % 1) + 1) % 1) * n;
  const i = Math.floor(pos) % n;
  const f = pos - Math.floor(pos);
  const a = path[i], b = path[(i + 1) % n];
  const x = a.x + (b.x - a.x) * f, y = a.y + (b.y - a.y) * f;
  if (!offset) return { x, y };
  const tx = b.x - a.x, ty = b.y - a.y;
  const len = Math.hypot(tx, ty) || 1;
  let nx = -ty / len, ny = tx / len;
  const cx = path.reduce((s, p) => s + p.x, 0) / n, cy = path.reduce((s, p) => s + p.y, 0) / n;
  if (nx * (cx - x) + ny * (cy - y) > 0) { nx = -nx; ny = -ny; } // make the normal point outward
  return { x: x + nx * offset, y: y + ny * offset };
}
