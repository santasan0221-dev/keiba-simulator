export type LabelPoint = { no: number; x: number; y: number };
/** Screen-space callouts only: never fed back into runner or camera coordinates. */
export function layoutRunnerLabels(points: LabelPoint[], width: number, height: number): LabelPoint[] {
  const placed: LabelPoint[] = [];
  const clamp = (value: number, max: number) => Math.max(16, Math.min(max - 16, value));
  for (const point of [...points].sort((a, b) => a.no - b.no)) {
    let chosen: LabelPoint | undefined;
    for (let ring = 0; ring < 20 && !chosen; ring++) {
      for (let dy = -ring; dy <= ring && !chosen; dy++) {
        for (let dx = -ring; dx <= ring; dx++) {
          if (ring && Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
          const candidate = { no: point.no, x: clamp(point.x + dx * 30, width), y: clamp(point.y - 18 + dy * 30, height) };
          if (placed.every(other => Math.abs(other.x - candidate.x) >= 28 || Math.abs(other.y - candidate.y) >= 28)) { chosen = candidate; break; }
        }
      }
    }
    placed.push(chosen ?? { ...point, x: clamp(point.x, width), y: clamp(point.y, height) });
  }
  return placed;
}
