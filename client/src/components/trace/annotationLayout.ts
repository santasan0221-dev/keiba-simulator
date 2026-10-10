export const ANNOTATION_INSET = 4;
export type AnnotationBox = { id: string; x: number; y: number; offsetX: number; offsetY: number; width: number; height: number };
export type Rect = { x: number; y: number; width: number; height: number };
export type Segment = { a: { x: number; y: number }; b: { x: number; y: number } };
export const intersects = (a: Rect, b: Rect, padding = 2) => a.x < b.x + b.width + padding && b.x < a.x + a.width + padding && a.y < b.y + b.height + padding && b.y < a.y + a.height + padding;
/** Segment/rectangle clipping, including the painted rail's clearance. Pure numeric geometry. */
export function touchesRail(rect: Rect, segment: Segment): boolean {
  const minX = rect.x - 3, minY = rect.y - 3, maxX = rect.x + rect.width + 3, maxY = rect.y + rect.height + 3;
  const { a, b } = segment;
  if (Math.max(a.x, b.x) < minX || Math.min(a.x, b.x) > maxX || Math.max(a.y, b.y) < minY || Math.min(a.y, b.y) > maxY) return false;
  let lo = 0, hi = 1;
  for (const [origin, delta, min, max] of [[a.x, b.x - a.x, minX, maxX], [a.y, b.y - a.y, minY, maxY]]) {
    if (Math.abs(delta) < 1e-9) { if (origin < min || origin > max) return false; continue; }
    const t1 = (min - origin) / delta, t2 = (max - origin) / delta;
    lo = Math.max(lo, Math.min(t1, t2)); hi = Math.min(hi, Math.max(t1, t2));
    if (lo > hi) return false;
  }
  return true;
}
/** Only annotation text moves. Runner positions, runner-label layout and camera targets are never inputs to simulation. */
export function layoutAnnotations(annotations: AnnotationBox[], width: number, height: number, blockers: Rect[], rails: Segment[], inset = ANNOTATION_INSET, accepts?: (rect: Rect, placed: Rect[]) => boolean) {
  const placed: Rect[] = [];
  return annotations.map(annotation => {
    const clamp = (x: number, y: number) => ({ x: Math.max(inset, Math.min(width - inset - annotation.width, x + annotation.offsetX)), y: Math.max(inset, Math.min(height - inset - annotation.height, y + annotation.offsetY)), width: annotation.width, height: annotation.height });
    const valid = (rect: Rect) => !placed.some(other => intersects(rect, other)) && !blockers.some(other => intersects(rect, other)) && !rails.some(segment => touchesRail(rect, segment)) && (!accepts || accepts(rect, placed));
    const rejected = new Set<string>();
    let chosen: Rect | undefined;
    for (let ring = 0; ring < 40 && !chosen; ring++) {
      for (let dy = -ring; dy <= ring && !chosen; dy++) {
        for (let dx = -ring; dx <= ring; dx++) {
          if (ring && Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
          const rect = clamp(annotation.x + dx * 14, annotation.y + dy * 14);
          // Clamping often maps many off-screen search points to the same rectangle.
          // All admission tests are pure; repeating a rejected rectangle cannot change the first fit.
          const key = `${rect.x},${rect.y}`;
          if (rejected.has(key)) continue;
          if (valid(rect)) { chosen = rect; break; }
          rejected.add(key);
        }
      }
    }
    const rect = chosen ?? clamp(annotation.x, annotation.y);
    placed.push(rect);
    return { id: annotation.id, x: rect.x - annotation.offsetX, y: rect.y - annotation.offsetY, rect, fits: Boolean(chosen) };
  });
}
