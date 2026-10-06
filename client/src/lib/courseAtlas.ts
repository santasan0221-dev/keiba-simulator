/**
 * Course Atlas: display-only course geometry for the scenario view.
 *
 * Provenance (ValueBasis)
 * - OFFICIAL: copied from a JRA course-introduction page (text and tables) that the
 *   maintainer supplied. All ten JRA venues.
 * - OFFICIAL_DIAGRAM_APPROXIMATION: read off an official diagram image (plan view /
 *   section view): about 5 m in the plan, about 0.1 m vertically in the profiles.
 * - DERIVED_FROM_LAP_AND_DISTANCE: arithmetic on an official lap length and a race
 *   distance. Only valid for starts on the loop itself, so chute / extension starts
 *   are never derived this way (they stay UNKNOWN until a diagram is read).
 * - SECONDARY_SOURCE: a JRA page as quoted in a search excerpt, not checked against
 *   the page itself. No venue uses it any more; it is kept for future additions.
 * - STYLIZED: drawn for looks only. Not a survey map.
 * - UNKNOWN: not established. Nothing is guessed.
 *
 * The moving-runner modules (scenarioReplay, scenarioOrder) never import this file. The course
 * tempo (terrainTempo) is the single reader that turns it into factors that are the same for every
 * runner: pace, pack spacing, lane spread, camera briskness. Nothing here is per runner.
 */
import { CHUKYO_DIAGRAM, FUKUSHIMA_DIAGRAM, HAKODATE_DIAGRAM, HANSHIN_DIAGRAM, KOKURA_DIAGRAM, KYOTO_DIAGRAM, NAKAYAMA_DIAGRAM, NIIGATA_DIAGRAM, SAPPORO_DIAGRAM, TOKYO_DIAGRAM } from "@/lib/courseDiagramData";

export type Unknown = "UNKNOWN";
export type CoursePoint = { x: number; y: number };
export type Direction = "LEFT" | "RIGHT" | "STRAIGHT";
export type Surface = "TURF" | "DIRT" | "JUMP";
export type Variant = "INNER" | "OUTER" | "DEFAULT";
export type ValueBasis = "OFFICIAL" | "OFFICIAL_DIAGRAM_APPROXIMATION" | "DERIVED_FROM_LAP_AND_DISTANCE" | "SECONDARY_SOURCE" | "STYLIZED" | "UNKNOWN";
/** Lap share from the goal line, travelled in the running direction. */
export type CornerMarker = { label: "1" | "2" | "3" | "4"; share: number; at: CoursePoint; basis: ValueBasis };
export type ElevationPoint = { at: number; meters: number };
export type Slope = { kind: "UP" | "DOWN"; riseMeters: number | Unknown; where: string; startRemainingMeters?: number; endRemainingMeters?: number };

export type CourseLayout = {
  venue: string;
  organization: "JRA";
  surface: Surface;
  distance: number | Unknown;
  /** Whether the distance is in the official starting-distance list (UNKNOWN when no list was read). */
  distanceListed: boolean | Unknown;
  variant: Variant | Unknown;
  direction: Direction | Unknown;
  lapMeters: number | Unknown;
  homeStraightMeters: number | Unknown;
  elevationGainMeters: number | Unknown;
  /** Closed loop (true) or the straight 1000m course (false). */
  pathClosed: boolean;
  /** Start position as a share of the lap, travelled forward from the goal line (on the ring). UNKNOWN when not established. */
  startLapShare: number | Unknown;
  /** Full laps run before the final partial lap. With `startLapShare`, the race covers `raceLaps` laps. */
  raceLaps: number;
  /** The start gate in path coordinates (a chute gate lies off the ring). */
  startPoint: CoursePoint | Unknown;
  startOnRing: boolean | Unknown;
  startNote?: string;
  firstCornerDistanceMeters: number | Unknown;
  finishPoint: CoursePoint;
  path: CoursePoint[];
  corners: CornerMarker[];
  /** Section boundaries from the goal line: [0, 1C start, 2C start, backstretch start, 3C start, 4C start, home straight start, 1]. UNKNOWN for the straight course. */
  sectionShares: readonly number[] | Unknown;
  sectionBasis: ValueBasis;
  elevationProfile?: ElevationPoint[];
  slopes: Slope[];
  basis: { direction: ValueBasis; lapMeters: ValueBasis; homeStraightMeters: ValueBasis; elevation: ValueBasis; elevationProfile: ValueBasis; startPoint: ValueBasis; finishPoint: ValueBasis; corners: ValueBasis; path: ValueBasis };
  sourceRefs: string[];
  sourceNote?: string;
};

export const GEOMETRY_DISCLAIMER = "コース形状は実競馬場の特徴を参考にした簡易図です。測量図ほどの精度はありません。";

const U: Unknown = "UNKNOWN";
const UNKNOWN_BASIS: CourseLayout["basis"] = { direction: "UNKNOWN", lapMeters: "UNKNOWN", homeStraightMeters: "UNKNOWN", elevation: "UNKNOWN", elevationProfile: "UNKNOWN", startPoint: "UNKNOWN", finishPoint: "STYLIZED", corners: "STYLIZED", path: "STYLIZED" };

// ------------------------------------------------------------ geometry

/** Post-goal stretch before corner 1, as a share of the lap. Drawn only; the real value is not sourced. */
const POST_GOAL_SHARE = 0.06;
const EDGE = 0.04;

const clampStraight = (share: number) => Math.min(0.4, Math.max(0.08, share));

/**
 * Stylized stadium outline, x in 0..1 and y in the same unit, so the shape is
 * not stretched. It starts at the goal line on the home straight. The pre-goal
 * straight is `straightShare` of the lap (the official home-straight length over
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

/** Fit a normalized path into a w x h box: uniform scale that fits both axes, plus a capped vertical stretch for very flat ovals. */
export function fitPath(path: CoursePoint[], w: number, h: number, margin: number): CoursePoint[] {
  const xs = path.map(p => p.x), ys = path.map(p => p.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const bw = Math.max(0.0001, x1 - x0), bh = Math.max(0.0001, y1 - y0);
  const scale = Math.min((w - 2 * margin) / bw, (h - 2 * margin) / bh);
  const stretch = Math.max(1, Math.min(1.8, (h - 2 * margin) / (bh * scale)));
  return path.map(p => ({ x: w / 2 + (p.x - (x0 + x1) / 2) * scale, y: h / 2 + (p.y - (y0 + y1) / 2) * scale * stretch }));
}

// ----------------------------------------------------------------- data

type LoopSpec = { lap: number; straight: number; elevation: number | Unknown };
type DiagramStart = { gate: readonly [number, number]; share: number; offRingMeters: number; fullLaps: number; ringMetersToGoal: number };
/** Data read off the official diagrams for one loop (see scripts/course_diagrams). */
type LoopDiagram = {
  path?: readonly (readonly [number, number])[];
  /** Section boundaries from the goal line: [0, 1コーナー start, 2コーナー start, 向正面 start, 3コーナー start, 4コーナー start, 直線 start, 1]. */
  sectionShares?: readonly number[];
  starts?: Record<number, DiagramStart>;
  profile?: readonly { at: number; meters: number }[];
};
type CourseSpec = {
  venue: string;
  surface: Exclude<Surface, "JUMP">;
  direction: Direction;
  loops: { DEFAULT?: LoopSpec; INNER?: LoopSpec; OUTER?: LoopSpec };
  /** True when the table values were read from the JRA page itself (OFFICIAL); otherwise SECONDARY_SOURCE. */
  official: boolean;
  /** Official starting-distance list. A distance outside it does not resolve to this course. */
  distances?: number[];
  /** For two-loop venues: which loop a distance uses. A distance not listed has an UNKNOWN variant (e.g. the page lists it for both). */
  variantOf?: Record<number, "INNER" | "OUTER">;
  /** Distances run on the straight course (not a loop). */
  straightCourse?: number[];
  /** Distances whose gate is not on the loop (chute / extension / other course): no lap arithmetic, start stays UNKNOWN. */
  offLoopStarts?: Record<number, string>;
  diagrams?: { DEFAULT?: LoopDiagram; INNER?: LoopDiagram; OUTER?: LoopDiagram };
  slopes: Slope[];
  ref: string;
  sourceNote?: string;
};

const ref = (venue: string) => `https://www.jra.go.jp/facilities/race/${venue}/course/index.html`;
const SUPPLIED = "JRA公式コース紹介ページの本文・表（保守者から受領した写し、2026-10-04/05）";

type RingData = { path: readonly (readonly [number, number])[]; sectionShares: readonly number[]; starts: unknown; profile: readonly { at: number; meters: number }[] };
const ring = (d: RingData): LoopDiagram => ({ path: d.path, sectionShares: d.sectionShares, starts: d.starts as Record<number, DiagramStart>, profile: d.profile });

export const COURSE_SPECS: CourseSpec[] = [
  // ---- OFFICIAL (page text) + OFFICIAL_DIAGRAM_APPROXIMATION (plan / section views)
  { venue: "東京", surface: "TURF", direction: "LEFT", official: true, loops: { DEFAULT: { lap: 2083.1, straight: 525.9, elevation: 2.7 } },
    distances: [1400, 1600, 1800, 2000, 2300, 2400, 2500, 2600, 3400], diagrams: { DEFAULT: ring(TOKYO_DIAGRAM.turf) }, ref: ref("tokyo"), sourceNote: SUPPLIED,
    slopes: [{ kind: "DOWN", riseMeters: 1.9, where: "1コーナーから向正面半ば" }, { kind: "UP", riseMeters: 1.5, where: "3コーナー手前" },
      { kind: "UP", riseMeters: 2, where: "直線 残り460m〜300m", startRemainingMeters: 460, endRemainingMeters: 300 }] },
  { venue: "東京", surface: "DIRT", direction: "LEFT", official: true, loops: { DEFAULT: { lap: 1899, straight: 501.6, elevation: 2.5 } },
    distances: [1200, 1300, 1400, 1600, 2100, 2400], diagrams: { DEFAULT: ring(TOKYO_DIAGRAM.dirt) }, ref: ref("tokyo"), sourceNote: SUPPLIED,
    slopes: [{ kind: "UP", riseMeters: 2.4, where: "直線の上り坂（バックストレッチにももう1つ坂）" }] },
  { venue: "京都", surface: "TURF", direction: "RIGHT", official: true, loops: { INNER: { lap: 1782.8, straight: 328.4, elevation: 3.1 }, OUTER: { lap: 1894.3, straight: 403.7, elevation: 4.3 } },
    distances: [1100, 1200, 1400, 1600, 1800, 2000, 2200, 2400, 3000, 3200],
    // 1400 / 1600 / 2000 are listed for both loops: the page does not say which one a race uses.
    variantOf: { 1100: "INNER", 1200: "INNER", 1800: "OUTER", 2200: "OUTER", 2400: "OUTER", 3000: "OUTER", 3200: "OUTER" },
    // 外回り1800 starts in the deep chute off the backstretch (向正面左手の奥深い地点).
    offLoopStarts: { 1800: "向正面左手の引き込み線（シュート）発走。ゲート位置の読取が必要" },
    diagrams: { INNER: { profile: KYOTO_DIAGRAM.turfInner.profile }, OUTER: { profile: KYOTO_DIAGRAM.turfOuter.profile } },
    ref: ref("kyoto"), sourceNote: SUPPLIED,
    slopes: [{ kind: "UP", riseMeters: U, where: "向正面の半ばから3コーナー" }, { kind: "DOWN", riseMeters: U, where: "3コーナーから4コーナー（それ以外はほぼ平坦）" }] },
  { venue: "京都", surface: "DIRT", direction: "RIGHT", official: true, loops: { DEFAULT: { lap: 1607.6, straight: 329.1, elevation: 3.0 } },
    distances: [1000, 1100, 1200, 1400, 1800, 1900, 2600], diagrams: { DEFAULT: ring(KYOTO_DIAGRAM.dirt) },
    offLoopStarts: { 1000: "plan未読取", 1100: "plan未読取", 2600: "plan未読取" },
    ref: ref("kyoto"), sourceNote: SUPPLIED,
    slopes: [{ kind: "DOWN", riseMeters: U, where: "3コーナーの丘から4コーナー" }] },
  { venue: "中山", surface: "TURF", direction: "RIGHT", official: true, loops: { INNER: { lap: 1667.1, straight: 310, elevation: 5.3 }, OUTER: { lap: 1839.7, straight: 310, elevation: 5.3 } },
    distances: [1200, 1600, 1800, 2000, 2200, 2500, 2600, 3200, 3600, 4000],
    variantOf: { 1200: "OUTER", 1600: "OUTER", 1800: "INNER", 2000: "INNER", 2200: "OUTER", 2500: "INNER", 2600: "OUTER", 3600: "INNER", 4000: "OUTER" },
    // 3200 is listed for both loops. 内回り2500 starts on the OUTER course track so it can enter the corner straight:
    // its gate lies off the inner ring and is projected onto it (see startOnRing / startNote).
    // The outer loop's plan is not traced yet.
    offLoopStarts: { 1200: "外回りの平面図は未トレース", 1600: "外回りの平面図は未トレース", 2200: "外回りの平面図は未トレース", 2600: "外回りの平面図は未トレース", 4000: "外回りの平面図は未トレース" },
    diagrams: { INNER: ring(NAKAYAMA_DIAGRAM.turfInner), OUTER: { profile: NAKAYAMA_DIAGRAM.turfOuter.profile } },
    ref: ref("nakayama"), sourceNote: SUPPLIED,
    slopes: [{ kind: "UP", riseMeters: 2.2, where: "ゴール前の急坂 残り180m〜70m（最大勾配2.24%）", startRemainingMeters: 180, endRemainingMeters: 70 },
      { kind: "UP", riseMeters: U, where: "ゴールから1コーナー（2コーナー手前が最高点）" }, { kind: "DOWN", riseMeters: U, where: "2コーナー手前からホームストレッチ半ば（最深部）" }] },
  { venue: "中山", surface: "DIRT", direction: "RIGHT", official: true, loops: { DEFAULT: { lap: 1493, straight: 308, elevation: 4.5 } },
    distances: [1000, 1200, 1700, 1800, 2400, 2500], diagrams: { DEFAULT: ring(NAKAYAMA_DIAGRAM.dirt) },
    offLoopStarts: { 1000: "plan未読取", 1200: "芝スタート（シュート）。plan未読取" },
    ref: ref("nakayama"), sourceNote: SUPPLIED,
    slopes: [{ kind: "UP", riseMeters: 2.2, where: "ゴール前の急坂（芝コースと同様の高低差）" }] },
  { venue: "新潟", surface: "TURF", direction: "LEFT", official: true, loops: { INNER: { lap: 1623, straight: 358.7, elevation: 0.8 }, OUTER: { lap: 2223, straight: 658.7, elevation: 2.2 } },
    distances: [1000, 1200, 1400, 1600, 1800, 2000, 2200, 2400, 3000, 3200],
    // 1400 and 2000 are listed for both loops.
    variantOf: { 1200: "INNER", 2200: "INNER", 2400: "INNER", 1600: "OUTER", 1800: "OUTER", 3000: "OUTER", 3200: "OUTER" },
    straightCourse: [1000],
    // The official plan shows the loop starts on chutes / extensions; they are not read yet.
    offLoopStarts: { 1200: "plan未読取", 2200: "plan未読取", 2400: "plan未読取", 1600: "plan未読取", 1800: "plan未読取", 3000: "plan未読取", 3200: "plan未読取" },
    diagrams: { INNER: { profile: NIIGATA_DIAGRAM.inner.profile }, OUTER: { profile: NIIGATA_DIAGRAM.outer.profile } },
    ref: ref("niigata"), sourceNote: SUPPLIED,
    slopes: [{ kind: "DOWN", riseMeters: 1.6, where: "外回り 3〜4コーナー（スパイラルカーブ区間）の緩い下り" }] },
  { venue: "新潟", surface: "DIRT", direction: "LEFT", official: true, loops: { DEFAULT: { lap: 1472.5, straight: 353.9, elevation: 0.6 } },
    distances: [1000, 1200, 1700, 1800, 2500], diagrams: { DEFAULT: { profile: NIIGATA_DIAGRAM.dirt.profile } },
    offLoopStarts: { 1000: "plan未読取", 1200: "plan未読取", 1700: "plan未読取", 1800: "plan未読取", 2500: "plan未読取" },
    ref: ref("niigata"), sourceNote: SUPPLIED, slopes: [] },
  { venue: "札幌", surface: "TURF", direction: "RIGHT", official: true, loops: { DEFAULT: { lap: 1640.9, straight: 266.1, elevation: 0.7 } },
    distances: [1000, 1200, 1500, 1800, 2000, 2600], diagrams: { DEFAULT: ring(SAPPORO_DIAGRAM.turf) }, ref: ref("sapporo"), sourceNote: SUPPLIED,
    // The goal is on the 1コーナー side of the straight: 266.1 m is the 4コーナー-to-goal distance, not the whole home stretch.
    slopes: [] },
  { venue: "札幌", surface: "DIRT", direction: "RIGHT", official: true, loops: { DEFAULT: { lap: 1487, straight: 264.3, elevation: 0.9 } },
    distances: [1000, 1700, 2400], diagrams: { DEFAULT: ring(SAPPORO_DIAGRAM.dirt) }, ref: ref("sapporo"), sourceNote: SUPPLIED, slopes: [] },
  // Hakodate: page text, plan view and section views.
  { venue: "函館", surface: "TURF", direction: "RIGHT", official: true, loops: { DEFAULT: { lap: 1626.6, straight: 262.1, elevation: 3.5 } },
    distances: [1000, 1200, 1700, 1800, 2000, 2600], diagrams: { DEFAULT: ring(HAKODATE_DIAGRAM.turf) },
    ref: ref("hakodate"), sourceNote: SUPPLIED,
    slopes: [{ kind: "DOWN", riseMeters: U, where: "ゴール板から2コーナー（ゆるやかな下り）" }, { kind: "UP", riseMeters: U, where: "2コーナー以降4コーナーまで（だらだらとした上り。3〜4コーナーに小高い丘）" },
      { kind: "DOWN", riseMeters: U, where: "4コーナーから直線（なだらかな下り）" }] },
  { venue: "函館", surface: "DIRT", direction: "RIGHT", official: true, loops: { DEFAULT: { lap: 1475.8, straight: 260.3, elevation: 3.5 } },
    distances: [1000, 1700, 2400], diagrams: { DEFAULT: ring(HAKODATE_DIAGRAM.dirt) }, ref: ref("hakodate"), sourceNote: SUPPLIED,
    slopes: [{ kind: "UP", riseMeters: U, where: "2コーナー以降4コーナーまで（芝コースと同じ起伏）" }] },
  // Fukushima: page text, plan view and section views.
  { venue: "福島", surface: "TURF", direction: "RIGHT", official: true, loops: { DEFAULT: { lap: 1600, straight: 292.0, elevation: 1.9 } },
    distances: [1000, 1200, 1700, 1800, 2000, 2600], diagrams: { DEFAULT: ring(FUKUSHIMA_DIAGRAM.turf) }, ref: ref("fukushima"), sourceNote: SUPPLIED,
    slopes: [{ kind: "DOWN", riseMeters: 1.7, where: "ゴール板を過ぎてから2コーナー" }, { kind: "UP", riseMeters: 1.3, where: "向正面" },
      { kind: "DOWN", riseMeters: U, where: "4コーナーから直線の残り170m付近（緩やかな下り）" },
      { kind: "UP", riseMeters: 1.2, where: "直線 残り170m〜50m", startRemainingMeters: 170, endRemainingMeters: 50 }] },
  { venue: "福島", surface: "DIRT", direction: "RIGHT", official: true, loops: { DEFAULT: { lap: 1444.6, straight: 295.7, elevation: 2.1 } },
    distances: [1000, 1150, 1700, 2400], diagrams: { DEFAULT: ring(FUKUSHIMA_DIAGRAM.dirt) },
    ref: ref("fukushima"), sourceNote: SUPPLIED,
    slopes: [{ kind: "DOWN", riseMeters: U, where: "芝コースとほぼ同じ起伏（コース1周で上り下りを2回）" }] },
  // Chukyo: page text, plan view and section views.
  { venue: "中京", surface: "TURF", direction: "LEFT", official: true, loops: { DEFAULT: { lap: 1705.9, straight: 412.5, elevation: 3.5 } },
    distances: [1200, 1300, 1400, 1600, 2000, 2200, 3000], diagrams: { DEFAULT: ring(CHUKYO_DIAGRAM.turf) },
    ref: ref("chukyo"), sourceNote: SUPPLIED,
    slopes: [{ kind: "UP", riseMeters: U, where: "ゴールから向正面半ば（最高点）までなだらかな上り" }, { kind: "DOWN", riseMeters: U, where: "向正面半ばから直線入口（3〜4コーナーはスパイラルカーブ）" },
      { kind: "UP", riseMeters: 2, where: "直線に向いてすぐの急坂（勾配約2%、ゴールまで200m余り）" }] },
  { venue: "中京", surface: "DIRT", direction: "LEFT", official: true, loops: { DEFAULT: { lap: 1530, straight: 410.7, elevation: 3.4 } },
    distances: [1200, 1400, 1800, 1900, 2500], diagrams: { DEFAULT: ring(CHUKYO_DIAGRAM.dirt) },
    ref: ref("chukyo"), sourceNote: SUPPLIED,
    slopes: [{ kind: "UP", riseMeters: 2, where: "直線入口の坂（芝コースとほぼ同じ起伏）" }] },
  { venue: "阪神", surface: "TURF", direction: "RIGHT", official: true, loops: { INNER: { lap: 1689, straight: 356.5, elevation: 1.9 }, OUTER: { lap: 2089, straight: 473.6, elevation: 2.4 } },
    distances: [1200, 1400, 1600, 1800, 2000, 2200, 2400, 2600, 3000, 3200],
    // 1400 and 3200 are listed for both loops (1400: 内 and 外; 3200: 外・内).
    variantOf: { 1200: "INNER", 2000: "INNER", 2200: "INNER", 3000: "INNER", 1600: "OUTER", 1800: "OUTER", 2400: "OUTER", 2600: "OUTER" },
    // The outer loop's plan is not traced yet.
    offLoopStarts: { 1600: "外回りの平面図は未トレース", 1800: "外回りの平面図は未トレース", 2400: "外回りの平面図は未トレース", 2600: "外回りの平面図は未トレース" },
    diagrams: { INNER: ring(HANSHIN_DIAGRAM.turfInner), OUTER: { profile: HANSHIN_DIAGRAM.turfOuter.profile } },
    ref: ref("hanshin"), sourceNote: SUPPLIED,
    slopes: [{ kind: "DOWN", riseMeters: U, where: "直線半ばまで緩やかな下り（内回りは残り800m、外回りは残り600mから）" },
      { kind: "UP", riseMeters: 1.8, where: "ゴール前の急坂（勾配1.5%）" }] },
  { venue: "阪神", surface: "DIRT", direction: "RIGHT", official: true, loops: { DEFAULT: { lap: 1517.6, straight: 352.7, elevation: 1.6 } },
    distances: [1200, 1400, 1800, 2000, 2600], diagrams: { DEFAULT: ring(HANSHIN_DIAGRAM.dirt) }, ref: ref("hanshin"), sourceNote: SUPPLIED,
    slopes: [{ kind: "DOWN", riseMeters: U, where: "残り900mから直線にかけて緩やかな下り" },
      { kind: "UP", riseMeters: 1.6, where: "残り200m地点の上り坂", startRemainingMeters: 200 }] },
  { venue: "小倉", surface: "TURF", direction: "RIGHT", official: true, loops: { DEFAULT: { lap: 1615.1, straight: 293, elevation: 3 } },
    distances: [1000, 1200, 1700, 1800, 2000, 2600], diagrams: { DEFAULT: ring(KOKURA_DIAGRAM.turf) }, ref: ref("kokura"), sourceNote: SUPPLIED,
    slopes: [{ kind: "UP", riseMeters: U, where: "ゴールラインから2コーナー（2コーナーに小高い丘）" },
      { kind: "DOWN", riseMeters: U, where: "2コーナーから向正面、3コーナーから4コーナー（3コーナー手前にわずかな上り）。直線は平たん" }] },
  { venue: "小倉", surface: "DIRT", direction: "RIGHT", official: true, loops: { DEFAULT: { lap: 1445.4, straight: 291.3, elevation: 2.9 } },
    distances: [1000, 1700, 2400], diagrams: { DEFAULT: ring(KOKURA_DIAGRAM.dirt) }, ref: ref("kokura"), sourceNote: SUPPLIED,
    slopes: [{ kind: "DOWN", riseMeters: U, where: "2コーナーの丘から4コーナー" },
      { kind: "UP", riseMeters: 0.6, where: "残り400mから直線にかけて緩やかな上り", startRemainingMeters: 400 }] },
];

export const JRA_VENUES = ["札幌", "函館", "福島", "新潟", "東京", "中山", "中京", "京都", "阪神", "小倉"] as const;

export function normalizeSurface(value: string | null | undefined): Surface | null {
  if (!value) return null;
  if (/芝|turf/i.test(value)) return "TURF";
  if (/ダ|dirt/i.test(value)) return "DIRT";
  if (/障|jump|steeple/i.test(value)) return "JUMP";
  return null;
}

/** Without an official list: flat-race distances are whole hundreds (Fukushima dirt 1150 is the listed exception). Anything else is likely a jump course. */
export function isFlatDistance(distance: number | null | undefined): boolean {
  return typeof distance === "number" && distance >= 1000 && distance <= 3600 && (distance % 100 === 0 || distance === 1150);
}

/** Stylized corner markers: 1-2 on the first turn, 3-4 on the second, at the quarter points of each arc. */
function stylizedCorners(path: CoursePoint[], straightShare: number): CornerMarker[] {
  const s = clampStraight(straightShare);
  const g = POST_GOAL_SHARE, arc = 0.5 - (s + g);
  const mark = (label: CornerMarker["label"], share: number): CornerMarker => ({ label, share, at: pointOnPath(path, share), basis: "STYLIZED" });
  return [mark("1", g + arc * 0.25), mark("2", g + arc * 0.75), mark("3", g + arc + s + g + arc * 0.25), mark("4", g + arc + s + g + arc * 0.75)];
}

/** Section boundaries of the stylized stadium path (same proportions as `stadiumPath`). */
export function stylizedSections(straightShare: number): number[] {
  const s = clampStraight(straightShare);
  const g = POST_GOAL_SHARE, arc = 0.5 - (s + g);
  const b4 = g + arc + s + g;
  return [0, g, g + arc / 2, g + arc, b4, b4 + arc / 2, 1 - s, 1];
}

/** Corner markers at the middle of each corner section read from the official section view. */
function diagramCorners(path: CoursePoint[], sections: readonly number[]): CornerMarker[] {
  const mid = (k: number) => (sections[k] + sections[k + 1]) / 2;
  const mark = (label: CornerMarker["label"], share: number): CornerMarker => ({ label, share, at: pointOnPath(path, share), basis: "OFFICIAL_DIAGRAM_APPROXIMATION" });
  return [mark("1", mid(1)), mark("2", mid(2)), mark("3", mid(4)), mark("4", mid(5))];
}

const toPoints = (list: readonly (readonly [number, number])[]): CoursePoint[] => list.map(([x, y]) => ({ x, y }));

/** Used whenever no sourced layout applies: a plain oval, never presented as a real course. */
export function genericLayout(venue: string | null, surface: Surface = "TURF", distance: number | null = null, direction: Direction | Unknown = U, official = false, listed: boolean | Unknown = U): CourseLayout {
  const path = stadiumPath(direction, 0.2);
  return {
    venue: venue ?? "UNKNOWN", organization: "JRA", surface, distance: distance ?? U, distanceListed: listed, variant: U,
    direction, lapMeters: U, homeStraightMeters: U, elevationGainMeters: U,
    pathClosed: true, startLapShare: U, raceLaps: 1, startPoint: U, startOnRing: U, firstCornerDistanceMeters: U,
    finishPoint: path[0], path, corners: stylizedCorners(path, 0.2), sectionShares: stylizedSections(0.2), sectionBasis: "STYLIZED", slopes: [],
    basis: { ...UNKNOWN_BASIS, direction: direction === U ? "UNKNOWN" : official ? "OFFICIAL" : "SECONDARY_SOURCE" },
    sourceRefs: [],
  };
}

function buildLayout(spec: CourseSpec, variant: Variant, loop: LoopSpec, distance: number | null): CourseLayout {
  const text: ValueBasis = spec.official ? "OFFICIAL" : "SECONDARY_SOURCE";
  const straightShare = loop.straight / loop.lap;
  const diagram = spec.diagrams?.[variant];
  const diagramPath = diagram?.path ? toPoints(diagram.path) : null;
  const path = diagramPath ?? stadiumPath(spec.direction, straightShare);
  const listed = spec.distances ? (distance !== null && spec.distances.includes(distance)) : U;
  const flat = spec.distances ? listed === true : isFlatDistance(distance);

  let startLapShare: number | Unknown = U;
  let raceLaps = 1;
  let startPoint: CoursePoint | Unknown = U;
  let startOnRing: boolean | Unknown = U;
  let startNote: string | undefined;
  let startBasis: ValueBasis = "UNKNOWN";
  const gate = distance !== null ? diagram?.starts?.[distance] : undefined;
  const off = distance !== null ? spec.offLoopStarts?.[distance] : undefined;
  if (gate) {
    startLapShare = gate.share;
    raceLaps = gate.fullLaps + (1 - gate.share);
    startPoint = { x: gate.gate[0], y: gate.gate[1] };
    startOnRing = gate.offRingMeters <= 8;
    startBasis = "OFFICIAL_DIAGRAM_APPROXIMATION";
    if (startOnRing === false) startNote = "シュート発走: ゲートはコース外にあり、リング上の合流位置を起点に表示";
  } else if (off) {
    startNote = off;
  } else if (flat && distance !== null) {
    const laps = distance / loop.lap;
    startLapShare = (1 - (laps % 1)) % 1;
    raceLaps = laps;
    startPoint = pointOnPath(path, startLapShare);
    startOnRing = true;
    startBasis = "DERIVED_FROM_LAP_AND_DISTANCE";
  }

  const sections = diagram?.sectionShares;
  const profile = diagram?.profile?.map(p => ({ at: p.at, meters: p.meters }));
  return {
    venue: spec.venue, organization: "JRA", surface: spec.surface, distance: distance ?? U, distanceListed: listed, variant,
    direction: spec.direction, lapMeters: loop.lap, homeStraightMeters: loop.straight, elevationGainMeters: loop.elevation,
    pathClosed: true, startLapShare, raceLaps, startPoint, startOnRing, startNote, firstCornerDistanceMeters: U,
    finishPoint: path[0], path,
    corners: diagramPath && sections ? diagramCorners(path, sections) : stylizedCorners(path, straightShare),
    sectionShares: diagramPath && sections ? sections : stylizedSections(straightShare),
    sectionBasis: diagramPath && sections ? "OFFICIAL_DIAGRAM_APPROXIMATION" : "STYLIZED",
    elevationProfile: profile, slopes: spec.slopes,
    basis: {
      direction: text, lapMeters: text, homeStraightMeters: text,
      elevation: loop.elevation === U ? "UNKNOWN" : text,
      elevationProfile: profile ? "OFFICIAL_DIAGRAM_APPROXIMATION" : "UNKNOWN",
      startPoint: startBasis, finishPoint: diagramPath ? "OFFICIAL_DIAGRAM_APPROXIMATION" : "STYLIZED",
      corners: diagramPath && sections ? "OFFICIAL_DIAGRAM_APPROXIMATION" : "STYLIZED", path: diagramPath ? "OFFICIAL_DIAGRAM_APPROXIMATION" : "STYLIZED",
    },
    sourceRefs: [spec.ref], sourceNote: spec.sourceNote,
  };
}

/** The straight course (Niigata turf 1000m): the diagrams label the two ends ●スタート / ゴール●. */
function buildStraight(spec: CourseSpec, distance: number): CourseLayout {
  const path = straightPath();
  const text: ValueBasis = spec.official ? "OFFICIAL" : "SECONDARY_SOURCE";
  return {
    venue: spec.venue, organization: "JRA", surface: spec.surface, distance, distanceListed: true, variant: "DEFAULT",
    direction: "STRAIGHT", lapMeters: U, homeStraightMeters: distance, elevationGainMeters: U,
    pathClosed: false, startLapShare: 0, raceLaps: 1, startPoint: path[0], startOnRing: true, firstCornerDistanceMeters: U,
    finishPoint: path[path.length - 1], path, corners: [], sectionShares: U, sectionBasis: "UNKNOWN",
    elevationProfile: NIIGATA_DIAGRAM.straight.profile.map(p => ({ at: p.at, meters: p.meters })), slopes: [],
    basis: {
      direction: text, lapMeters: "UNKNOWN", homeStraightMeters: text, elevation: "UNKNOWN", elevationProfile: "OFFICIAL_DIAGRAM_APPROXIMATION",
      startPoint: "OFFICIAL_DIAGRAM_APPROXIMATION", finishPoint: "OFFICIAL_DIAGRAM_APPROXIMATION", corners: "UNKNOWN", path: "STYLIZED",
    },
    sourceRefs: [spec.ref], sourceNote: spec.sourceNote,
  };
}

/** Atlas lookup. Anything not covered by a sourced spec resolves to a generic oval with UNKNOWN fields. */
export function resolveCourse(venue: string | null, surface: string | null, distance: number | null): CourseLayout {
  const kind = normalizeSurface(surface) ?? "TURF";
  const spec = COURSE_SPECS.find(entry => entry.venue === venue && entry.surface === kind);
  if (!spec) return genericLayout(venue, kind, distance);
  if (distance !== null && spec.straightCourse?.includes(distance)) return buildStraight(spec, distance);
  if (spec.distances && (distance === null || !spec.distances.includes(distance))) return genericLayout(venue, kind, distance, spec.direction, spec.official, false);
  if (spec.loops.DEFAULT) return buildLayout(spec, "DEFAULT", spec.loops.DEFAULT, distance);
  const variant = distance !== null ? spec.variantOf?.[distance] : undefined;
  const loop = variant ? spec.loops[variant] : undefined;
  if (variant && loop) return buildLayout(spec, variant, loop, distance);
  return genericLayout(venue, kind, distance, spec.direction, spec.official); // direction is sourced; the loop in use is not
}
