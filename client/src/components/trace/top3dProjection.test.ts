import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { acceptsProjected, projectedBoxes, projectedLabelBox, projectSvgPoint, TOP3D_WIDE } from "./top3dProjection";
import { layoutRunnerLabels, type LabelPoint } from "./runnerLabels";

const drawn = { w: 746, h: 350 }, viewBox = { w: 640, h: 300 };
const css = readFileSync(resolve(import.meta.dirname, "../../trace.css"), "utf8").replace(/\r\n/g, "\n");

describe("TOP_3D projection mirrors the CSS tilt", () => {
  it("uses the same constants as trace.css", () => {
    const block = css.slice(css.indexOf('.kt-track-svg[data-view="TOP_3D"] {'));
    expect(block).toContain(`--kt-tilt: ${TOP3D_WIDE.tiltDeg}deg`);
    expect(block).toContain(`--kt-persp: ${TOP3D_WIDE.persp}px`);
    expect(block).toContain(`--kt-untilt: ${TOP3D_WIDE.untilt}`);
    expect(block).toContain(`scale(${String(TOP3D_WIDE.scale).replace(/^0/, "")})`);
    expect(block).toContain(`transform-origin: 50% ${TOP3D_WIDE.originY * 100}%`);
  });
  it("is deterministic and pure", () => {
    const a = projectSvgPoint(123, 77, drawn, viewBox), b = projectSvgPoint(123, 77, drawn, viewBox);
    expect(a).toEqual(b);
  });
  it("shrinks the far (top) edge and keeps the transform origin row unmagnified in y", () => {
    const far = projectedLabelBox({ no: 1, x: 100, y: 20 }, drawn, viewBox), near = projectedLabelBox({ no: 2, x: 100, y: 280 }, drawn, viewBox);
    expect(far.right - far.left).toBeLessThan(near.right - near.left);
    expect(far.bottom - far.top).toBeLessThan(near.bottom - near.top);
  });
  it("squeezes horizontal gaps between labels at different depths (why the flat 28-unit rule is not enough)", () => {
    const a = projectedLabelBox({ no: 1, x: 100, y: 40 }, drawn, viewBox), b = projectedLabelBox({ no: 2, x: 128.2, y: 62 }, drawn, viewBox);
    const flatPx = (28.2 * drawn.w) / viewBox.w;
    expect((b.left + b.right) / 2 - (a.left + a.right) / 2).toBeLessThan(flatPx);
  });
});

describe("projection-aware placement for normal TOP_3D", () => {
  const dense = Array.from({ length: 18 }, (_, i) => ({ no: i + 1, x: 120 + (i % 6) * 28.1, y: 78 + Math.floor(i / 6) * 22 }));
  const touching = (list: LabelPoint[]) => { const m = projectedBoxes(list, drawn, viewBox); let n = 0; for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) { const a = m.get(list[i].no)!, b = m.get(list[j].no)!; if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0) n++; } return n; };
  const place = () => layoutRunnerLabels(dense, viewBox.w, viewBox.h, acceptsProjected(drawn, viewBox));
  it("leaves no projected AABB contact, deterministically, inside the drawing, one label per runner", () => {
    const out = place();
    expect(touching(out)).toBe(0); expect(place()).toEqual(out);
    for (const l of out) { expect(l.x).toBeGreaterThanOrEqual(16); expect(l.x).toBeLessThanOrEqual(viewBox.w - 16); expect(l.y).toBeGreaterThanOrEqual(16); expect(l.y).toBeLessThanOrEqual(viewBox.h - 16); }
    expect(out.map(l => l.no)).toEqual(dense.map(l => l.no));
  });
  it("is the unchanged flat layout whenever nothing touches on screen", () => {
    const apart = [{ no: 1, x: 100, y: 100 }, { no: 2, x: 400, y: 200 }];
    expect(layoutRunnerLabels(apart, viewBox.w, viewBox.h, acceptsProjected(drawn, viewBox))).toEqual(layoutRunnerLabels(apart, viewBox.w, viewBox.h));
  });
  it("without an accept test the layout is exactly the old one", () => {
    expect(layoutRunnerLabels(dense, viewBox.w, viewBox.h)).toEqual(layoutRunnerLabels(dense, viewBox.w, viewBox.h, undefined));
  });
});

describe("only the wide TOP_3D paths use the analytic projection", () => {
  const stage = readFileSync(resolve(import.meta.dirname, "TrackStage.tsx"), "utf8").replace(/\r\n/g, "\n");
  it("is gated on TOP_3D depth and not compact, and never reads layout per frame", () => {
    expect(stage).toMatch(/\(depth === "FULL" \|\| depth === "LITE"\) && !compact \? /);
    expect(stage).not.toContain("getBoundingClientRect");
    expect(stage).toContain("entries[0]?.contentRect");
  });
});

describe("projection-aware placement across runner counts and pack positions", () => {
  const clear = (list: LabelPoint[]) => {
    const boxes = projectedBoxes(list, drawn, viewBox);
    return list.every((a, i) => list.slice(i + 1).every(b => {
      const p = boxes.get(a.no)!, q = boxes.get(b.no)!;
      return Math.min(p.right, q.right) - Math.max(p.left, q.left) <= 0 || Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top) <= 0;
    }));
  };
  it("leaves no projected AABB contact for 8 / 12 / 14 / 16 / 18 runners, tight or spread, anywhere on the track", () => {
    for (const count of [8, 12, 14, 16, 18]) {
      for (const [cx, cy] of [[100, 40], [320, 150], [560, 260], [250, 90]]) {
        for (const spread of [0, 6, 14]) {
          const points = Array.from({ length: count }, (_, i) => ({ no: i + 1, x: cx + ((i * 7) % 5) * spread, y: cy + ((i * 3) % 4) * spread }));
          const out = layoutRunnerLabels(points, viewBox.w, viewBox.h, acceptsProjected(drawn, viewBox));
          expect(clear(out), `${count} runners around ${cx},${cy} spread ${spread}`).toBe(true);
          expect(out.map(l => l.no).sort((a, b) => a - b)).toEqual(points.map(l => l.no));
        }
      }
    }
  });
});
