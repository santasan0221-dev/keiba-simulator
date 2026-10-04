/**
 * Course Atlas: display-only course geometry for the scenario view.
 *
 * Provenance rules
 * - Numbers come from JRA course-introduction pages as quoted in search
 *   excerpts. The pages themselves could not be fetched from the build
 *   environment, and the excerpts are summaries, so every sourced value is
 *   `SECONDARY_SOURCE` (with the JRA page in `sourceRefs`), never `OFFICIAL`.
 * - Anything not read from a source is `"UNKNOWN"`. Nothing is guessed.
 * - `startLapShare` is arithmetic on two sourced numbers (race distance and the
 *   lap length of the course in use), labelled `DERIVED_FROM_LAP_AND_DISTANCE`.
 *   It is not read from the official course diagram, so chute starts are only
 *   approximate. `OFFICIAL_DIAGRAM_APPROXIMATION` is reserved for values read
 *   off an official diagram; none have been.
 * - `path`, goal position, corner markers and the post-goal stretch are a
 *   stylized drawing (`STYLIZED`). Only the straight/lap proportion and the
 *   turn direction follow the sourced values. It is not a survey map.
 * - Elevation is display-only. No module that moves runners imports this file.
 */
export type Unknown = "UNKNOWN";
export type CoursePoint = { x: number; y: number };
export type Direction = "LEFT" | "RIGHT" | "STRAIGHT";
export type Surface = "TURF" | "DIRT" | "JUMP";
export type Variant = "INNER" | "OUTER" | "DEFAULT";
export type ValueBasis = "OFFICIAL" | "SECONDARY_SOURCE" | "OFFICIAL_DIAGRAM_APPROXIMATION" | "DERIVED_FROM_LAP_AND_DISTANCE" | "STYLIZED" | "UNKNOWN";
export type CornerMarker = { label: "1" | "2" | "3" | "4"; at: CoursePoint; basis: ValueBasis };
export type ElevationPoint = { at: number; meters: number };
export type Slope = { kind: "UP" | "DOWN"; riseMeters: number | Unknown; where: string };

export type CourseLayout = {
  venue: string;
  organization: "JRA";
  surface: Surface;
  distance: number | Unknown;
  variant: Variant | Unknown;
  direction: Direction | Unknown;
  lapMeters: number | Unknown;
  homeStraightMeters: number | Unknown;
  elevationGainMeters: number | Unknown;
  /** Closed loop (true) or the straight 1000m course (false). */
  pathClosed: boolean;
  /** Start position as a share of the lap, travelled forward from the goal line. UNKNOWN when lap or distance is unknown. */
  startLapShare: number | Unknown;
  /** Race distance as a number of laps (can exceed 1). 1 when unknown, so the generic view still runs one lap. */
  raceLaps: number;
  startPoint: CoursePoint | Unknown;
  firstCornerDistanceMeters: number | Unknown;
  finishPoint: CoursePoint;
  path: CoursePoint[];
  corners: CornerMarker[];
  elevationProfile?: ElevationPoint[];
  slopes: Slope[];
  basis: { direction: ValueBasis; lapMeters: ValueBasis; homeStraightMeters: ValueBasis; elevation: ValueBasis; startPoint: ValueBasis; finishPoint: ValueBasis; corners: ValueBasis; path: ValueBasis };
  sourceRefs: string[];
};

export const GEOMETRY_DISCLAIMER = "コース形状は実競馬場の特徴を参考にした簡易図です。測量図ほどの精度はありません。";

const U: Unknown = "UNKNOWN";
const UNKNOWN_BASIS: CourseLayout["basis"] = { direction: "UNKNOWN", lapMeters: "UNKNOWN", homeStraightMeters: "UNKNOWN", elevation: "UNKNOWN", startPoint: "UNKNOWN", finishPoint: "STYLIZED", corners: "STYLIZED", path: "STYLIZED" };

// ------------------------------------------------------------ geometry

/** Post-goal stretch before corner 1, as a share of the lap. Drawn only; the real value is not sourced. */
const POST_GOAL_SHARE = 0.06;
const EDGE = 0.04;

const clampStraight = (share: number) => Math.min(0.4, Math.max(0.08, share));

/**
 * Stylized stadium outline, x in 0..1 and y in the same unit, so the shape is
 * not stretched. It starts at the goal line on the home straight. The pre-goal
 * straight is `straightShare` of the lap (the sourced home-straight length over
 * the lap); the rest follows from the proportions. LEFT runs counter-clockwise
 * on screen, RIGHT clockwise; UNKNOWN draws LEFT and the UI says it is unconfirmed.
 */
export function stadiumPath(direction: Direction | Unknown, straightShare: number, steps = 120): CoursePoint[] {
  const s = clampStraight(straightShare);
  const g = POST_GOAL_SHARE;
  const arc = 0.5 - (s + g);
  const u = (1 - 2 * EDGE) / (s + g + (2 * arc) / Math.PI); // canvas length per lap share
  const ry = (arc * u) / Math.PI;
  const half = ((s + g) * u) / 2;
  const goalX = 0.5 - half + s * u;
  const mirror = direction === "RIGHT";
  const points: CoursePoint[] = [];
  for (let i = 0; i < steps; i++) {
    let d = i / steps; // lap share travelled from the goal
    let x: number, y: number;
    if (d < g) { x = goalX + d * u; y = 0.5 + ry; }
    else if ((d -= g) < arc) { const a = Math.PI / 2 - (d * u) / ry; x = 0.5 + half + ry * Math.cos(a); y = 0.5 + ry * Math.sin(a); }
    else if ((d -= arc) < s + g) { x = 0.5 + half - d * u; y = 0.5 - ry; }
    else if ((d -= s + g) < arc) { const a = -Math.PI / 2 - (d * u) / ry; x = 0.5 - half + ry * Math.cos(a); y = 0.5 + ry * Math.sin(a); }
    else { d -= arc; x = 0.5 - half + d * u; y = 0.5 + ry; }
    points.push({ x: mirror ? 1 - x : x, y });
  }
  return points;
}

/** The straight 1000m course: left to right, goal at the right end. */
export function straightPath(steps = 60): CoursePoint[] {
  return Array.from({ length: steps }, (_, i) => ({ x: EDGE + (i / (steps - 1)) * (1 - 2 * EDGE), y: 0.5 }));
}

/** Point on a path at lap share `lap`, moved `offset` outward from the inside rail. Closed paths wrap; open paths clamp. */
export function pointOnPath(path: CoursePoint[], lap: number, offset = 0, closed = true): CoursePoint {
  const n = path.length;
  const share = closed ? ((lap % 1) + 1) % 1 : Math.min(1, Math.max(0, lap));
  const pos = closed ? share * n : share * (n - 1);
  const i = Math.min(n - 1, Math.floor(pos));
  const f = pos - i;
  const a = path[i], b = closed ? path[(i + 1) % n] : path[Math.min(n - 1, i + 1)];
  const x = a.x + (b.x - a.x) * f, y = a.y + (b.y - a.y) * f;
  if (!offset) return { x, y };
  let tx = b.x - a.x, ty = b.y - a.y;
  if (!tx && !ty) { const p = path[Math.max(0, i - 1)]; tx = a.x - p.x; ty = a.y - p.y; }
  const len = Math.hypot(tx, ty) || 1;
  let nx = -ty / len, ny = tx / len;
  if (closed) {
    const cx = path.reduce((acc, p) => acc + p.x, 0) / n, cy = path.reduce((acc, p) => acc + p.y, 0) / n;
    if (nx * (cx - x) + ny * (cy - y) > 0) { nx = -nx; ny = -ny; } // outward
  } else if (ny < 0) { nx = -nx; ny = -ny; } // straight course: rail on the top, lanes downward
  return { x: x + nx * offset, y: y + ny * offset };
}

/** Fit a normalized path into a w x h box with uniform x scale and a capped vertical stretch for very flat ovals. */
export function fitPath(path: CoursePoint[], w: number, h: number, margin: number): CoursePoint[] {
  const ys = path.map(p => p.y);
  const lo = Math.min(...ys), hi = Math.max(...ys);
  const scale = w - 2 * margin;
  const natural = Math.max(0.0001, (hi - lo) * scale);
  const stretch = Math.max(1, Math.min(1.8, (h - 2 * margin) / natural));
  return path.map(p => ({ x: margin + p.x * scale, y: h / 2 + (p.y - (hi + lo) / 2) * scale * stretch }));
}

// ----------------------------------------------------------------- data

type LoopSpec = { lap: number; straight: number; elevation: number | Unknown };
type CourseSpec = {
  venue: string;
  surface: Exclude<Surface, "JUMP">;
  direction: Direction;
  loops: { DEFAULT?: LoopSpec; INNER?: LoopSpec; OUTER?: LoopSpec };
  /** For two-loop venues: which loop a distance uses. A distance not listed has an UNKNOWN variant. */
  variantOf?: Record<number, "INNER" | "OUTER">;
  /** Distances run on the straight course (not a loop). */
  straightCourse?: number[];
  slopes: Slope[];
  ref: string;
};

const ref = (venue: string) => `https://www.jra.go.jp/facilities/race/${venue}/course/index.html`;

/**
 * Every figure below is a JRA course-introduction value quoted in a search
 * excerpt (SECONDARY_SOURCE). Turf lap lengths are the A course.
 */
export const COURSE_SPECS: CourseSpec[] = [
  { venue: "東京", surface: "TURF", direction: "LEFT", loops: { DEFAULT: { lap: 2083.1, straight: 525.9, elevation: 2.7 } }, ref: ref("tokyo"),
    slopes: [{ kind: "DOWN", riseMeters: 1.9, where: "1コーナーから向正面半ば" }, { kind: "UP", riseMeters: 1.5, where: "3コーナー手前" }, { kind: "UP", riseMeters: 2, where: "ゴール前 残り460m〜300m" }] },
  { venue: "東京", surface: "DIRT", direction: "LEFT", loops: { DEFAULT: { lap: 1899, straight: 501.6, elevation: 2.5 } }, ref: ref("tokyo"),
    slopes: [{ kind: "UP", riseMeters: 2.4, where: "ゴール前の直線" }] },
  { venue: "中山", surface: "TURF", direction: "RIGHT", loops: { INNER: { lap: 1667.1, straight: 310, elevation: 5.3 }, OUTER: { lap: 1839.7, straight: 310, elevation: 5.3 } },
    variantOf: { 1200: "OUTER", 1600: "OUTER", 1800: "INNER", 2000: "INNER", 2200: "OUTER", 2500: "INNER", 2600: "OUTER" }, ref: ref("nakayama"),
    slopes: [{ kind: "UP", riseMeters: U, where: "ゴール前の急坂" }] },
  { venue: "中山", surface: "DIRT", direction: "RIGHT", loops: { DEFAULT: { lap: 1493, straight: 308, elevation: 4.5 } }, ref: ref("nakayama"),
    slopes: [{ kind: "UP", riseMeters: U, where: "ゴール前の急坂" }] },
  { venue: "京都", surface: "TURF", direction: "RIGHT", loops: { INNER: { lap: 1782.8, straight: 328.4, elevation: 3.1 }, OUTER: { lap: 1894.3, straight: 403.7, elevation: 4.3 } },
    variantOf: { 1100: "INNER", 1200: "INNER", 1800: "OUTER" }, ref: ref("kyoto"),
    slopes: [{ kind: "UP", riseMeters: U, where: "向正面の半ばから3コーナー" }, { kind: "DOWN", riseMeters: U, where: "3コーナーから4コーナー" }] },
  { venue: "京都", surface: "DIRT", direction: "RIGHT", loops: { DEFAULT: { lap: 1607.6, straight: 329.1, elevation: U } }, ref: ref("kyoto"),
    slopes: [{ kind: "DOWN", riseMeters: U, where: "3コーナーの丘から4コーナー" }] },
  { venue: "阪神", surface: "TURF", direction: "RIGHT", loops: { INNER: { lap: 1689, straight: 356.5, elevation: 1.9 }, OUTER: { lap: 2089, straight: 473.6, elevation: 2.4 } },
    variantOf: { 1200: "INNER", 1600: "OUTER", 1800: "OUTER", 2000: "INNER", 2200: "INNER", 2400: "OUTER" }, ref: ref("hanshin"),
    slopes: [{ kind: "UP", riseMeters: 1.8, where: "ゴール前（勾配1.5%）" }] },
  { venue: "阪神", surface: "DIRT", direction: "RIGHT", loops: { DEFAULT: { lap: 1517.6, straight: 352.7, elevation: 1.6 } }, ref: ref("hanshin"),
    slopes: [{ kind: "UP", riseMeters: 1.6, where: "残り200m" }] },
  { venue: "新潟", surface: "TURF", direction: "LEFT", loops: { INNER: { lap: 1623, straight: 358.7, elevation: 0.8 }, OUTER: { lap: 2223, straight: 658.7, elevation: 2.2 } },
    variantOf: { 1200: "INNER", 1400: "INNER", 1600: "OUTER", 1800: "OUTER" }, straightCourse: [1000], ref: ref("niigata"), slopes: [] },
  { venue: "新潟", surface: "DIRT", direction: "LEFT", loops: { DEFAULT: { lap: 1472.5, straight: 353.9, elevation: U } }, ref: ref("niigata"), slopes: [] },
  { venue: "中京", surface: "TURF", direction: "LEFT", loops: { DEFAULT: { lap: 1705.9, straight: 412.5, elevation: 3.5 } }, ref: ref("chukyo"),
    slopes: [{ kind: "UP", riseMeters: 2, where: "直線入口すぐ（勾配約2%）" }] },
  { venue: "中京", surface: "DIRT", direction: "LEFT", loops: { DEFAULT: { lap: 1530, straight: 410.7, elevation: 3.4 } }, ref: ref("chukyo"), slopes: [] },
  { venue: "札幌", surface: "TURF", direction: "RIGHT", loops: { DEFAULT: { lap: 1640.9, straight: 266.1, elevation: 0.7 } }, ref: ref("sapporo"), slopes: [] },
  { venue: "札幌", surface: "DIRT", direction: "RIGHT", loops: { DEFAULT: { lap: 1487, straight: 264.3, elevation: 0.9 } }, ref: ref("sapporo"), slopes: [] },
  { venue: "函館", surface: "TURF", direction: "RIGHT", loops: { DEFAULT: { lap: 1626.6, straight: 262.1, elevation: 3.5 } }, ref: ref("hakodate"), slopes: [] },
  { venue: "函館", surface: "DIRT", direction: "RIGHT", loops: { DEFAULT: { lap: 1475.8, straight: 260.3, elevation: 3.5 } }, ref: ref("hakodate"), slopes: [] },
  { venue: "福島", surface: "TURF", direction: "RIGHT", loops: { DEFAULT: { lap: 1600, straight: 292.0, elevation: 1.9 } }, ref: ref("fukushima"), slopes: [] },
  { venue: "福島", surface: "DIRT", direction: "RIGHT", loops: { DEFAULT: { lap: 1444.6, straight: 295.7, elevation: 2.1 } }, ref: ref("fukushima"), slopes: [] },
  { venue: "小倉", surface: "TURF", direction: "RIGHT", loops: { DEFAULT: { lap: 1615.1, straight: 293.0, elevation: U } }, ref: ref("kokura"), slopes: [] },
  { venue: "小倉", surface: "DIRT", direction: "RIGHT", loops: { DEFAULT: { lap: 1445.4, straight: 291.3, elevation: 2.9 } }, ref: ref("kokura"),
    slopes: [{ kind: "DOWN", riseMeters: U, where: "2コーナーの丘から4コーナー" }, { kind: "UP", riseMeters: 0.6, where: "残り400mから直線" }] },
];

export const JRA_VENUES = ["札幌", "函館", "福島", "新潟", "東京", "中山", "中京", "京都", "阪神", "小倉"] as const;

export function normalizeSurface(value: string | null | undefined): Surface | null {
  if (!value) return null;
  if (/芝|turf/i.test(value)) return "TURF";
  if (/ダ|dirt/i.test(value)) return "DIRT";
  if (/障|jump|steeple/i.test(value)) return "JUMP";
  return null;
}

/** Flat-race distances are whole hundreds (Fukushima dirt 1150 is the listed exception). Anything else is likely a jump course. */
export function isFlatDistance(distance: number | null | undefined): boolean {
  return typeof distance === "number" && distance >= 1000 && distance <= 3600 && (distance % 100 === 0 || distance === 1150);
}

/** Stylized corner markers: 1-2 on the first turn, 3-4 on the second, at the quarter points of each arc. */
function cornerMarkers(path: CoursePoint[], straightShare: number): CornerMarker[] {
  const s = clampStraight(straightShare);
  const g = POST_GOAL_SHARE, arc = 0.5 - (s + g);
  const at = (share: number) => pointOnPath(path, share);
  return [
    { label: "1", at: at(g + arc * 0.25), basis: "STYLIZED" }, { label: "2", at: at(g + arc * 0.75), basis: "STYLIZED" },
    { label: "3", at: at(g + arc + s + g + arc * 0.25), basis: "STYLIZED" }, { label: "4", at: at(g + arc + s + g + arc * 0.75), basis: "STYLIZED" },
  ];
}

/** Used whenever no sourced layout applies: a plain oval, never presented as a real course. */
export function genericLayout(venue: string | null, surface: Surface = "TURF", distance: number | null = null, direction: Direction | Unknown = U): CourseLayout {
  const path = stadiumPath(direction, 0.2);
  return {
    venue: venue ?? "UNKNOWN", organization: "JRA", surface, distance: distance ?? U, variant: U,
    direction, lapMeters: U, homeStraightMeters: U, elevationGainMeters: U,
    pathClosed: true, startLapShare: U, raceLaps: 1, startPoint: U, firstCornerDistanceMeters: U,
    finishPoint: path[0], path, corners: cornerMarkers(path, 0.2), slopes: [],
    basis: { ...UNKNOWN_BASIS, direction: direction === U ? "UNKNOWN" : "SECONDARY_SOURCE" },
    sourceRefs: [],
  };
}

function buildLayout(spec: CourseSpec, variant: Variant, loop: LoopSpec, distance: number | null): CourseLayout {
  const straightShare = loop.straight / loop.lap;
  const path = stadiumPath(spec.direction, straightShare);
  const flat = isFlatDistance(distance);
  const raceLaps = flat && distance ? distance / loop.lap : 1;
  const startLapShare = flat && distance ? (1 - (raceLaps % 1)) % 1 : U;
  return {
    venue: spec.venue, organization: "JRA", surface: spec.surface, distance: distance ?? U, variant,
    direction: spec.direction, lapMeters: loop.lap, homeStraightMeters: loop.straight, elevationGainMeters: loop.elevation,
    pathClosed: true, startLapShare, raceLaps,
    startPoint: startLapShare === U ? U : pointOnPath(path, startLapShare),
    firstCornerDistanceMeters: U,
    finishPoint: path[0], path, corners: cornerMarkers(path, straightShare), slopes: spec.slopes,
    basis: {
      direction: "SECONDARY_SOURCE", lapMeters: "SECONDARY_SOURCE", homeStraightMeters: "SECONDARY_SOURCE",
      elevation: loop.elevation === U ? "UNKNOWN" : "SECONDARY_SOURCE",
      startPoint: startLapShare === U ? "UNKNOWN" : "DERIVED_FROM_LAP_AND_DISTANCE", finishPoint: "STYLIZED", corners: "STYLIZED", path: "STYLIZED",
    },
    sourceRefs: [spec.ref],
  };
}

function buildStraight(spec: CourseSpec, distance: number): CourseLayout {
  const path = straightPath();
  return {
    venue: spec.venue, organization: "JRA", surface: spec.surface, distance, variant: "DEFAULT",
    direction: "STRAIGHT", lapMeters: U, homeStraightMeters: distance, elevationGainMeters: U,
    pathClosed: false, startLapShare: 0, raceLaps: 1, startPoint: path[0], firstCornerDistanceMeters: U,
    finishPoint: path[path.length - 1], path, corners: [], slopes: [],
    basis: { direction: "SECONDARY_SOURCE", lapMeters: "UNKNOWN", homeStraightMeters: "SECONDARY_SOURCE", elevation: "UNKNOWN", startPoint: "DERIVED_FROM_LAP_AND_DISTANCE", finishPoint: "STYLIZED", corners: "UNKNOWN", path: "STYLIZED" },
    sourceRefs: [spec.ref],
  };
}

/** Atlas lookup. Anything not covered by a sourced spec resolves to a generic oval with UNKNOWN fields. */
export function resolveCourse(venue: string | null, surface: string | null, distance: number | null): CourseLayout {
  const kind = normalizeSurface(surface) ?? "TURF";
  const spec = COURSE_SPECS.find(entry => entry.venue === venue && entry.surface === kind);
  if (!spec) return genericLayout(venue, kind, distance);
  if (distance !== null && spec.straightCourse?.includes(distance)) return buildStraight(spec, distance);
  if (spec.loops.DEFAULT) return buildLayout(spec, "DEFAULT", spec.loops.DEFAULT, distance);
  const variant = distance !== null ? spec.variantOf?.[distance] : undefined;
  const loop = variant ? spec.loops[variant] : undefined;
  if (variant && loop) return buildLayout(spec, variant, loop, distance);
  return genericLayout(venue, kind, distance, spec.direction); // direction is sourced; the loop in use is not
}

/** Lap share (from the goal) of corner marker `index` (0..3), matching `cornerMarkers`. */
export function cornerShare(course: Pick<CourseLayout, "homeStraightMeters" | "lapMeters">, index: number): number {
  const straightShare = course.homeStraightMeters === U || course.lapMeters === U ? 0.2 : course.homeStraightMeters / course.lapMeters;
  const s = clampStraight(straightShare), g = POST_GOAL_SHARE, arc = 0.5 - (s + g);
  const base = index < 2 ? g : g + arc + s + g;
  return base + arc * (index % 2 === 0 ? 0.25 : 0.75);
}
