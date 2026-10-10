import { describe, expect, it } from "vitest";
import { projectAnnotationRect } from "./annotationProjection";
import { layoutAnnotations, intersects } from "./annotationLayout";

describe("annotation projection safety", () => {
  it.each([false, true])("moves only annotation text, including narrow=%s", compact => {
    const box = compact ? { w: 360, h: 320 } : { w: 640, h: 300 };
    const drawn = compact ? { w: 360, h: 320 } : { w: 900, h: 422 };
    const project = (rect: { x: number; y: number; width: number; height: number }) => projectAnnotationRect(rect, drawn, box, compact);
    const edge = project({ x: 0, y: 0, width: box.w, height: box.h });
    const input = [{ id: "goal", x: box.w + 50, y: -30, offsetX: -15, offsetY: -12, width: 35, height: 16 }];
    const original = JSON.stringify(input);
    const result = layoutAnnotations(input, box.w, box.h, [], [], undefined, (r, placed) => {
      const a = project(r);
      return a.x >= edge.x + 2 && a.y >= edge.y + 2 && a.x + a.width <= edge.x + edge.width - 2 && a.y + a.height <= edge.y + edge.height - 2 && !placed.some(b => intersects(a, project(b)));
    });
    expect(result[0].fits).toBe(true);
    expect(result[0].rect.x).toBeGreaterThanOrEqual(4);
    expect(result[0].rect.y).toBeGreaterThanOrEqual(4);
    const screen = project(result[0].rect);
    expect(screen.y).toBeGreaterThan(edge.y);
    expect(JSON.stringify(input)).toBe(original);
  });
  it("honours projected admission rather than accepting the first flat candidate", () => {
    const input = [{ id: "goal", x: 100, y: 100, offsetX: 0, offsetY: 0, width: 35, height: 16 }];
    const result = layoutAnnotations(input, 640, 300, [], [], undefined, rect => rect.x >= 120);
    expect(result[0].fits).toBe(true);
    expect(result[0].rect.x).toBeGreaterThanOrEqual(120);
  });
  it("retains the existing perspective rather than treating a tilted annotation as flat", () => {
    const rect = { x: 10, y: 10, width: 40, height: 12 };
    const screen = projectAnnotationRect(rect, { w: 640, h: 300 }, { w: 640, h: 300 }, false);
    expect(screen.x).toBeGreaterThan(rect.x);
    expect(screen.y).toBeGreaterThan(rect.y);
    expect(screen.height).toBeLessThan(rect.height);
    expect(screen.width).toBeLessThan(rect.width);
  });
});
