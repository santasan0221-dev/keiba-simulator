import type { Rect } from "./annotationLayout";
import { projectSvgPoint, TOP3D_WIDE, type DrawnSize } from "./top3dProjection";

/** Annotation safety only. Mirrors the existing narrow CSS tilt; runner admission stays unchanged. */
export function projectAnnotationRect(rect: Rect, drawn: DrawnSize, viewBox: DrawnSize, compact: boolean): Rect {
  const p = compact ? { ...TOP3D_WIDE, tiltDeg: 26, persp: 1400 } : TOP3D_WIDE;
  const points = [[rect.x, rect.y], [rect.x + rect.width, rect.y], [rect.x, rect.y + rect.height], [rect.x + rect.width, rect.y + rect.height]]
    .map(([x, y]) => projectSvgPoint(x, y, drawn, viewBox, p as typeof TOP3D_WIDE));
  const xs = points.map(point => point.x), ys = points.map(point => point.y);
  return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
}
