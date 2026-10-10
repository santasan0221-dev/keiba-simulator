import { describe, expect, it } from "vitest";
import { ANNOTATION_INSET, intersects, layoutAnnotations, touchesRail, type AnnotationBox } from "./annotationLayout";
describe("annotation safe area contract", () => {
  const goal: AnnotationBox = { id: "goal", x: 359, y: 320, offsetX: 0, offsetY: -10, width: 44, height: 15 };
  it("clamps the complete bbox, including GOAL width and baseline, inside a painted safe inset", () => {
    const result = layoutAnnotations([goal], 360, 320, [], [])[0];
    expect(result.fits).toBe(true);
    expect(result.rect.x).toBeGreaterThanOrEqual(4);
    expect(result.rect.y).toBeGreaterThanOrEqual(4);
    expect(result.rect.x + result.rect.width).toBeLessThanOrEqual(356);
    expect(result.rect.y + result.rect.height).toBeLessThanOrEqual(316);
    expect(ANNOTATION_INSET).toBe(4);
  });
  it("is deterministic, clears other annotations/runner labels/rails, and never mutates inputs", () => {
    for (const [width, height] of [[360, 320], [640, 300]]) {
      const input = Array.from({ length: 12 }, (_, i) => ({ ...goal, id: String(i), x: width - 2, y: height / 2, width: 28 + i % 3 * 8 }));
      const copy = JSON.stringify(input);
      const runners = Array.from({ length: 18 }, (_, i) => ({ x: 80 + i % 6 * 30, y: 90 + Math.floor(i / 6) * 32, width: 24, height: 24 }));
      const rails = [{ a: { x: 10, y: 20 }, b: { x: width - 10, y: 20 } }];
      const result = layoutAnnotations(input, width, height, runners, rails);
      expect(result).toEqual(layoutAnnotations(input, width, height, runners, rails));
      expect(JSON.stringify(input)).toBe(copy);
      result.forEach((entry, i) => {
        expect(entry.fits).toBe(true);
        expect(entry.rect.x).toBeGreaterThanOrEqual(4); expect(entry.rect.y).toBeGreaterThanOrEqual(4);
        expect(entry.rect.x + entry.rect.width).toBeLessThanOrEqual(width - 4);
        expect(entry.rect.y + entry.rect.height).toBeLessThanOrEqual(height - 4);
        expect(result.slice(0, i).some(other => intersects(entry.rect, other.rect))).toBe(false);
        expect(runners.some(other => intersects(entry.rect, other))).toBe(false);
        expect(rails.some(rail => touchesRail(entry.rect, rail))).toBe(false);
      });
    }
  });
});
