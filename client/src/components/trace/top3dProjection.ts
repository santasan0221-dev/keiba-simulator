import type { AcceptLabel, LabelPoint, ScreenBox } from "./runnerLabels";

/**
 * The CSS tilt of the wide TOP_3D view, mirrored from trace.css (a test pins the two together):
 *   .kt-track-svg[data-view="TOP_3D"] { --kt-tilt: 38deg; --kt-persp: 1100px; --kt-untilt: 1.1;
 *     transform: perspective(1100px) rotateX(38deg) scale(.94); transform-origin: 50% 88%; }
 * Presentation only. Nothing here reads the DOM or touches runner positions, the camera or the scenario.
 */
export const TOP3D_WIDE = { tiltDeg: 38, persp: 1100, scale: 0.94, originY: 0.88, untilt: 1.1 } as const;
const LABEL_HALF = 12;   // the label rect is 24 x 24 user units, centred on its translate()

export type DrawnSize = { w: number; h: number };
export type ViewBoxSize = { w: number; h: number };

/** Where a point of the (un-transformed) SVG lands on screen, relative to the SVG's own top-left corner. */
export function projectSvgPoint(x: number, y: number, drawn: DrawnSize, viewBox: ViewBoxSize, p = TOP3D_WIDE): { x: number; y: number } {
  const px = (x / viewBox.w) * drawn.w, py = (y / viewBox.h) * drawn.h;
  const ox = drawn.w / 2, oy = drawn.h * p.originY;
  const u = (px - ox) * p.scale, v = (py - oy) * p.scale;
  const t = (p.tiltDeg * Math.PI) / 180;
  const f = p.persp / (p.persp - v * Math.sin(t));      // CSS perspective(): w = 1 - z / persp, z = v sin(tilt)
  return { x: ox + u * f, y: oy + v * Math.cos(t) * f };
}

/** Axis-aligned screen box of one runner label (rect scaled upright by `untilt`), from its placement in SVG units. */
export function projectedLabelBox(label: LabelPoint, drawn: DrawnSize, viewBox: ViewBoxSize, p = TOP3D_WIDE): ScreenBox {
  const halfY = LABEL_HALF * p.untilt;
  const corners = [[-LABEL_HALF, -halfY], [LABEL_HALF, -halfY], [LABEL_HALF, halfY], [-LABEL_HALF, halfY]]
    .map(([dx, dy]) => projectSvgPoint(label.x + dx, label.y + dy, drawn, viewBox, p));
  const xs = corners.map(c => c.x), ys = corners.map(c => c.y);
  return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
}

export const projectedBoxes = (placed: LabelPoint[], drawn: DrawnSize, viewBox: ViewBoxSize): Map<number, ScreenBox> =>
  new Map(placed.map(label => [label.no, projectedLabelBox(label, drawn, viewBox)]));

/** Clear space (screen px) kept between two label boxes: covers the sub-0.1px projection error and rounding. */
export const PROJECTED_GAP = 0.75;

/**
 * Acceptance test for `layoutRunnerLabels`: a candidate is fine only if its projected screen box stays clear of the
 * projected box of every label already placed. The flat 28-unit rule still applies on top, so a label that was never
 * in conflict keeps its place; only labels that would touch on screen are moved on to the next candidate.
 */
export function acceptsProjected(drawn: DrawnSize, viewBox: ViewBoxSize): AcceptLabel {
  const cache = new WeakMap<LabelPoint, ScreenBox>();
  const boxOf = (label: LabelPoint) => { let box = cache.get(label); if (!box) { box = projectedLabelBox(label, drawn, viewBox); cache.set(label, box); } return box; };
  return (candidate, placed) => {
    const a = boxOf(candidate);
    return placed.every(other => {
      const b = boxOf(other);
      return !(Math.min(a.right, b.right) - Math.max(a.left, b.left) > -PROJECTED_GAP && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > -PROJECTED_GAP);
    });
  };
}
