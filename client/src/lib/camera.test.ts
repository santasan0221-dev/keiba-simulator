import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { AUTO_ZOOM, cameraTarget, cameraTransform, converged, easeCamera, EASE_MS, HOME_ZOOM_CAP, HOME_VIEW_FROM, keepInView, MAX_ZOOM, rectContains, viewRect, wholeTrack, type Box, type CameraMode } from "./camera";
import { SECTION_LABEL, type SectionId } from "./courseSections";

const BOXES: Box[] = [{ w: 640, h: 300 }, { w: 360, h: 320 }];
const SECTIONS = Object.keys(SECTION_LABEL) as SectionId[];
const unit = (i: number, salt: number) => { const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453; return x - Math.floor(x); };
const field = (box: Box, seed: number, spread: number) => Array.from({ length: 16 }, (_, i) => ({ x: 20 + unit(i, seed) * (box.w - 40) * spread + (box.w - 40) * (1 - spread) / 2, y: 20 + unit(i, seed + 5) * (box.h - 40) * spread + (box.h - 40) * (1 - spread) / 2 }));

describe("broadcast camera target", () => {
  it("TRACK shows the whole course", () => {
    for (const box of BOXES) expect(cameraTarget({ points: field(box, 1, 0.3), mode: "TRACK", section: "START", box, progress: 0.4 })).toEqual(wholeTrack(box));
  });

  it("BROADCAST and AUTO never lose a runner: every point is inside the view, for any pack and section", () => {
    for (const box of BOXES) {
      for (const mode of ["BROADCAST", "AUTO"] as CameraMode[]) {
        for (const section of SECTIONS) {
          for (let seed = 0; seed < 40; seed++) {
            const points = field(box, seed, 0.05 + (seed % 10) * 0.1);
            const camera = cameraTarget({ points, mode, section, box, progress: (seed % 20) / 20 });
            const rect = viewRect(camera, box);
            expect(camera.zoom).toBeGreaterThanOrEqual(1);
            expect(camera.zoom).toBeLessThanOrEqual(MAX_ZOOM);
            for (const p of points) expect(rectContains(rect, p), `${mode} ${section} seed ${seed}`).toBe(true);
            // the view never leaves the drawn world
            expect(rect.x).toBeGreaterThanOrEqual(-1e-6);
            expect(rect.y).toBeGreaterThanOrEqual(-1e-6);
            expect(rect.x + rect.w).toBeLessThanOrEqual(box.w + 1e-6);
            expect(rect.y + rect.h).toBeLessThanOrEqual(box.h + 1e-6);
          }
        }
      }
    }
  });

  it("AUTO respects the per-section zoom cap and zooms out as the field spreads", () => {
    const box = BOXES[0];
    const tight = [{ x: 300, y: 150 }, { x: 310, y: 152 }, { x: 305, y: 148 }];
    for (const section of SECTIONS) {
      expect(cameraTarget({ points: tight, mode: "AUTO", section, box, progress: 0.4 }).zoom).toBeCloseTo(Math.min(AUTO_ZOOM[section], MAX_ZOOM), 5);
    }
    const wide = field(box, 3, 0.9);
    expect(cameraTarget({ points: wide, mode: "AUTO", section: "HOME_STRAIGHT", box, progress: 0.4 }).zoom).toBeLessThan(1.3);
    expect(AUTO_ZOOM.BACKSTRETCH).toBeLessThan(AUTO_ZOOM.FINAL_TURN); // wider view on the long back stretch
  });

  it("through the home straight the camera pulls back: it never zooms in tighter than the cap", () => {
    const box = BOXES[1];
    const tight = [{ x: 150, y: 150 }, { x: 160, y: 155 }];
    for (const mode of ["BROADCAST", "AUTO"] as CameraMode[]) {
      expect(cameraTarget({ points: tight, mode, section: "HOME_STRAIGHT", box, progress: 0.96 }).zoom).toBeLessThanOrEqual(HOME_ZOOM_CAP + 1e-9);
      expect(cameraTarget({ points: tight, mode, section: "HOME_STRAIGHT", box, progress: HOME_VIEW_FROM }).zoom).toBeLessThanOrEqual(HOME_ZOOM_CAP + 1e-9);
      expect(cameraTarget({ points: tight, mode, section: "HOME_STRAIGHT", box, progress: 0.5 }).zoom).toBeGreaterThan(HOME_ZOOM_CAP);
    }
  });

  it("through the home straight the goal line stays in view together with every runner", () => {
    const box = BOXES[0];
    const goal = [{ x: 560, y: 80 }, { x: 560, y: 220 }];
    for (const mode of ["BROADCAST", "AUTO"] as CameraMode[]) {
      for (let seed = 0; seed < 30; seed++) {
        const points = field(box, seed, 0.1 + (seed % 8) * 0.1).map(p => ({ x: Math.min(p.x, 540), y: p.y }));
        const camera = cameraTarget({ points, mode, section: "HOME_STRAIGHT", box, progress: 0.9, anchors: goal });
        const rect = viewRect(camera, box);
        for (const p of [...points, ...goal]) expect(rectContains(rect, p), `${mode} seed ${seed}`).toBe(true);
      }
    }
    // before the home straight the goal is not forced into the frame
    const near = [{ x: 100, y: 150 }, { x: 110, y: 152 }];
    const before = cameraTarget({ points: near, mode: "BROADCAST", section: "BACKSTRETCH", box, progress: 0.4, anchors: goal });
    expect(rectContains(viewRect(before, box), goal[0])).toBe(false);
  });
});

describe("keepInView at the world edge", () => {
  it("a point closer to the edge than the margin still ends up inside the view (no snap to the centre)", () => {
    const box = BOXES[0];
    const points = [{ x: 244, y: 251 }, { x: 272, y: 269 }, { x: 251.7, y: 219.6 }, { x: 254.8, y: 283.3 }];
    const camera = keepInView({ cx: 366, cy: 150, zoom: 1.58 }, points, box, 18);
    const rect = viewRect(camera, box);
    for (const p of points) expect(rectContains(rect, p)).toBe(true);
    expect(camera.cy).toBeGreaterThan(190); // follows the bottom edge instead of resetting to box.h / 2
  });
});

describe("camera easing", () => {
  it("moves smoothly toward the target and converges (no instant cut)", () => {
    const target = { cx: 400, cy: 100, zoom: 1.8 };
    let camera = wholeTrack(BOXES[0]);
    const first = easeCamera(camera, target, 16, EASE_MS.normal);
    expect(first.zoom).toBeGreaterThan(1);
    expect(first.zoom).toBeLessThan(1.8);
    expect(Math.abs(first.cx - 320)).toBeLessThan(Math.abs(target.cx - 320) * 0.2); // one frame covers a small step
    let last = Math.hypot(camera.cx - target.cx, camera.cy - target.cy);
    for (let i = 0; i < 600 && !converged(camera, target); i++) {
      camera = easeCamera(camera, target, 16, EASE_MS.normal);
      const distance = Math.hypot(camera.cx - target.cx, camera.cy - target.cy);
      expect(distance).toBeLessThanOrEqual(last + 1e-9); // monotone
      last = distance;
    }
    expect(converged(camera, target)).toBe(true);
  });

  it("is frame-rate independent and slower after the FINAL freeze", () => {
    const target = { cx: 500, cy: 80, zoom: 1.6 }, start = wholeTrack(BOXES[0]);
    let a = start; for (let i = 0; i < 60; i++) a = easeCamera(a, target, 1000 / 60, EASE_MS.normal);
    let b = start; for (let i = 0; i < 30; i++) b = easeCamera(b, target, 1000 / 30, EASE_MS.normal);
    expect(a.zoom).toBeCloseTo(b.zoom, 6);
    expect(a.cx).toBeCloseTo(b.cx, 6);
    const slow = easeCamera(start, target, 16, EASE_MS.finalPhase), normal = easeCamera(start, target, 16, EASE_MS.normal);
    expect(Math.abs(slow.cx - start.cx)).toBeLessThan(Math.abs(normal.cx - start.cx));
    expect(EASE_MS.finalPhase).toBeGreaterThan(EASE_MS.normal);
  });

  it("the SVG transform centres the camera point in the box", () => {
    expect(cameraTransform({ cx: 100, cy: 50, zoom: 2 }, { w: 640, h: 300 })).toBe("translate(320.00 150.00) scale(2.0000) translate(-100.00 -50.00)");
  });
});

describe("the pack is never lost, even while the easing lags", () => {
  it("keepInView puts every runner (plus margin) inside the view and only changes what it must", () => {
    for (const box of BOXES) {
      for (let seed = 0; seed < 60; seed++) {
        const points = field(box, seed, 0.1 + (seed % 9) * 0.1);
        const lagging = { cx: unit(seed, 9) * box.w, cy: unit(seed, 10) * box.h, zoom: 1 + unit(seed, 11) * 1.2 };
        const fixed = keepInView(lagging, points, box, 16);
        const rect = viewRect(fixed, box);
        for (const p of points) expect(rectContains(rect, p, 0), `seed ${seed}`).toBe(true);
        expect(fixed.zoom).toBeLessThanOrEqual(lagging.zoom + 1e-9);
        expect(fixed.zoom).toBeGreaterThanOrEqual(1);
        expect(rect.x).toBeGreaterThanOrEqual(-1e-6);
        expect(rect.x + rect.w).toBeLessThanOrEqual(box.w + 1e-6);
        // a camera that already contains the pack is left alone
        const ok = keepInView({ cx: box.w / 2, cy: box.h / 2, zoom: 1 }, points, box, 0);
        expect(ok).toEqual({ cx: box.w / 2, cy: box.h / 2, zoom: 1 });
      }
    }
  });

  it("a pack hugging the world's edge together with the goal line is contained from a zoomed-in start (ported from the V3.1 line)", () => {
    const box = BOXES[0];
    const points = [{ x: 260, y: 285 }, { x: 270, y: 278 }, { x: 300, y: 281 }, { x: 330, y: 150 }, { x: 330, y: 285 }];
    const fixed = keepInView({ cx: 320, cy: 150, zoom: 1.6 }, points, box, 16);
    const rect = viewRect(fixed, box);
    for (const p of points) expect(rectContains(rect, p, 0)).toBe(true);
    expect(fixed.zoom).toBeGreaterThanOrEqual(1);
  });

  it("random packs anywhere in the world (4 px from the edge) are always contained, whatever the starting camera", () => {
    for (const box of BOXES) {
      for (let seed = 0; seed < 200; seed++) {
        const n = 3 + Math.floor(unit(seed, 21) * 14), cx = 20 + unit(seed, 22) * (box.w - 40), cy = 20 + unit(seed, 23) * (box.h - 40), spread = 10 + unit(seed, 24) * 200;
        const points = Array.from({ length: n }, (_, i) => ({ x: Math.min(box.w - 4, Math.max(4, cx + (unit(i, seed + 25) - 0.5) * spread)), y: Math.min(box.h - 4, Math.max(4, cy + (unit(i, seed + 26) - 0.5) * spread * 0.5)) }));
        const fixed = keepInView({ cx: unit(seed, 27) * box.w, cy: unit(seed, 28) * box.h, zoom: 1 + unit(seed, 29) * 1.2 }, points, box, 16);
        const rect = viewRect(fixed, box);
        for (const p of points) expect(rectContains(rect, p, 0), `box ${box.w} seed ${seed}`).toBe(true);
      }
    }
  });

  it("a fast-moving pack followed by a slow camera stays in view on every frame", () => {
    const box = BOXES[0];
    let camera = wholeTrack(box);
    for (let frame = 0; frame < 900; frame++) {
      const t = frame / 900;
      const cx = 60 + t * 520, cy = 60 + Math.sin(t * 9) * 80 + 90;
      const points = Array.from({ length: 14 }, (_, i) => ({ x: cx + (i - 7) * 6, y: cy + Math.sin(i + t * 20) * 10 }));
      const target = cameraTarget({ points, mode: "AUTO", section: "HOME_STRAIGHT", box, progress: 0.5 });
      camera = keepInView(easeCamera(camera, target, 1000 / 60, EASE_MS.finalPhase), points, box, 16);
      const rect = viewRect(camera, box);
      for (const p of points) expect(rectContains(rect, p), `frame ${frame}`).toBe(true);
    }
  });
});

describe("camera safety", () => {
  it("reads positions only: no odds, probability, pick, popularity or result data", () => {
    const code = readFileSync(resolve(import.meta.dirname, "camera.ts"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "").toLowerCase();
    for (const forbidden of ["odds", "probab", "honmei", "popularity", "result", "official", "ai_rank", "win_", "math.random"]) expect(code, forbidden).not.toContain(forbidden);
  });
});
