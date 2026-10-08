export type LabelPoint = { no: number; x: number; y: number };
/** Screen-space callouts only: never fed back into runner or camera coordinates. */
/** Minimum centre-to-centre gap (and search grid step) in SVG units of the flat drawing. */
export const LABEL_PITCH = 28;
export const LABEL_GRID = 30;
export type ScreenBox = { left: number; top: number; right: number; bottom: number };
/** Extra acceptance test for a candidate label position (e.g. "does not touch a placed label once projected on screen"). */
export type AcceptLabel = (candidate: LabelPoint, placed: LabelPoint[]) => boolean;
export function layoutRunnerLabels(points: LabelPoint[], width: number, height: number, accepts?: AcceptLabel): LabelPoint[] {
  const placed: LabelPoint[] = [];
  const clamp = (value: number, max: number) => Math.max(16, Math.min(max - 16, value));
  for (const point of [...points].sort((a, b) => a.no - b.no)) {
    let chosen: LabelPoint | undefined;
    for (let ring = 0; ring < 20 && !chosen; ring++) {
      for (let dy = -ring; dy <= ring && !chosen; dy++) {
        for (let dx = -ring; dx <= ring; dx++) {
          if (ring && Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
          const candidate = { no: point.no, x: clamp(point.x + dx * LABEL_GRID, width), y: clamp(point.y - 18 + dy * LABEL_GRID, height) };
          if (placed.every(other => Math.abs(other.x - candidate.x) >= LABEL_PITCH || Math.abs(other.y - candidate.y) >= LABEL_PITCH) && (!accepts || accepts(candidate, placed))) { chosen = candidate; break; }
        }
      }
    }
    placed.push(chosen ?? { ...point, x: clamp(point.x, width), y: clamp(point.y, height) });
  }
  return placed;
}
