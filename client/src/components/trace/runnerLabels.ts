export type LabelPoint = { no: number; x: number; y: number };
/** Screen-space callouts only: never fed back into runner or camera coordinates. */
/** Minimum centre-to-centre gap (and search grid step) in screen units. */
export const LABEL_PITCH = 28;
export const LABEL_GRID = 30;
export function layoutRunnerLabels(points: LabelPoint[], width: number, height: number, pitch = LABEL_PITCH, grid = LABEL_GRID): LabelPoint[] {
  const placed: LabelPoint[] = [];
  const clamp = (value: number, max: number) => Math.max(16, Math.min(max - 16, value));
  for (const point of [...points].sort((a, b) => a.no - b.no)) {
    let chosen: LabelPoint | undefined;
    for (let ring = 0; ring < 20 && !chosen; ring++) {
      for (let dy = -ring; dy <= ring && !chosen; dy++) {
        for (let dx = -ring; dx <= ring; dx++) {
          if (ring && Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
          const candidate = { no: point.no, x: clamp(point.x + dx * grid, width), y: clamp(point.y - 18 + dy * grid, height) };
          if (placed.every(other => Math.abs(other.x - candidate.x) >= pitch || Math.abs(other.y - candidate.y) >= pitch)) { chosen = candidate; break; }
        }
      }
    }
    placed.push(chosen ?? { ...point, x: clamp(point.x, width), y: clamp(point.y, height) });
  }
  return placed;
}
