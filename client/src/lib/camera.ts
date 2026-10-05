/**
 * Broadcast camera math. Pure functions: the stage applies the result to one SVG group.
 * The target follows the drawn pack (positions only) -- nothing about who is ahead or
 * favoured is read, and the framing always contains every runner.
 */
import type { SectionId } from "@/lib/courseSections";

export type CameraMode = "TRACK" | "BROADCAST" | "AUTO";
export const CAMERA_MODES: readonly CameraMode[] = ["TRACK", "BROADCAST", "AUTO"];
export const CAMERA_LABEL: Record<CameraMode, string> = { TRACK: "TRACK", BROADCAST: "BROADCAST", AUTO: "AUTO" };
export const CAMERA_HINT: Record<CameraMode, string> = { TRACK: "コース全体", BROADCAST: "馬群を追従", AUTO: "区間に応じて画角変更" };

export type Box = { w: number; h: number };
export type CameraState = { cx: number; cy: number; zoom: number };
export type Point = { x: number; y: number };

/** Widest zoom per section for AUTO (a cap: the pack bounding box can only lower it). */
export const AUTO_ZOOM: Record<SectionId, number> = { START: 1.9, FIRST_TURN: 1.7, BACKSTRETCH: 1.4, THIRD_TURN: 1.7, FINAL_TURN: 1.8, HOME_STRAIGHT: 1.6 };
export const MAX_ZOOM = 2.2;
/** Through the home straight the camera pulls back: it never zooms in tighter than this. */
export const HOME_ZOOM_CAP = 1.45;
/** From here (the start of the home straight) the camera widens and keeps the goal line in view. */
export const HOME_VIEW_FROM = 0.82;
/** The goal line joins the framed box a little earlier, so the eased camera is already there when the hard guarantee applies at HOME_VIEW_FROM (no pop). */
export const GOAL_FRAME_FROM = 0.7;

export const wholeTrack = (box: Box): CameraState => ({ cx: box.w / 2, cy: box.h / 2, zoom: 1 });

export function viewRect(camera: CameraState, box: Box) {
  const w = box.w / camera.zoom, h = box.h / camera.zoom;
  return { x: camera.cx - w / 2, y: camera.cy - h / 2, w, h };
}

export function rectContains(rect: { x: number; y: number; w: number; h: number }, point: Point, margin = 0): boolean {
  return point.x >= rect.x + margin && point.x <= rect.x + rect.w - margin && point.y >= rect.y + margin && point.y <= rect.y + rect.h - margin;
}

/**
 * Where the camera wants to be. TRACK shows the whole course. BROADCAST / AUTO frame the
 * bounding box of all runners (plus padding), zoomed in as far as the cap allows, and kept
 * inside the world so the track edge never leaves a hole.
 */
export function cameraTarget(input: { points: Point[]; mode: CameraMode; section: SectionId; box: Box; progress: number; padding?: number; anchors?: Point[] }): CameraState {
  const { mode, section, box, progress } = input;
  if (mode === "TRACK" || input.points.length === 0) return wholeTrack(box);
  // Home straight: the goal line (its two ends) is part of the framed box, so it is always visible.
  const points = progress >= GOAL_FRAME_FROM && input.anchors ? [...input.points, ...input.anchors] : input.points;
  const pad = input.padding ?? 46;
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const fit = Math.min(box.w / (x1 - x0 + 2 * pad), box.h / (y1 - y0 + 2 * pad));
  let cap = mode === "AUTO" ? AUTO_ZOOM[section] : 1.9;
  if (progress >= HOME_VIEW_FROM) cap = Math.min(cap, HOME_ZOOM_CAP);
  const zoom = Math.max(1, Math.min(MAX_ZOOM, cap, fit));
  const halfW = box.w / zoom / 2, halfH = box.h / zoom / 2;
  const cx = Math.min(box.w - halfW, Math.max(halfW, (x0 + x1) / 2));
  const cy = Math.min(box.h - halfH, Math.max(halfH, (y0 + y1) / 2));
  return { cx, cy, zoom };
}

/**
 * Hard guarantee on top of the easing: whatever the camera is doing, every runner (plus `margin`)
 * stays inside the view. The zoom is lowered and the centre moved only as far as needed, so the
 * easing still looks smooth and the pack is never lost while the camera catches up.
 */
export function keepInView(camera: CameraState, points: Point[], box: Box, margin = 16): CameraState {
  if (points.length === 0) return camera;
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const zoom = Math.max(1, Math.min(camera.zoom, box.w / (x1 - x0 + 2 * margin), box.h / (y1 - y0 + 2 * margin)));
  const halfW = box.w / zoom / 2, halfH = box.h / zoom / 2;
  // When the margin cannot be honoured (a point within `margin` of the world edge), sit midway between the
  // two limits: that frames the edge point as fully as the world allows instead of snapping to the centre.
  const range = (lo: number, hi: number, value: number) => (lo <= hi ? Math.min(hi, Math.max(lo, value)) : (lo + hi) / 2);
  const cx = range(Math.max(halfW, x1 + margin - halfW), Math.min(box.w - halfW, x0 - margin + halfW), camera.cx);
  const cy = range(Math.max(halfH, y1 + margin - halfH), Math.min(box.h - halfH, y0 - margin + halfH), camera.cy);
  return { cx, cy, zoom };
}

/** Time constants (ms) of the camera easing. Slower through the home straight so the pull-back never jumps. */
export const EASE_MS = { normal: 380, modeChange: 650, finalPhase: 1100 } as const;

/** Exponential ease toward the target; the zoom eases in log space so in/out feel symmetric. */
export function easeCamera(current: CameraState, target: CameraState, dtMs: number, tauMs: number): CameraState {
  const a = 1 - Math.exp(-Math.max(0, dtMs) / Math.max(1, tauMs));
  return {
    cx: current.cx + (target.cx - current.cx) * a,
    cy: current.cy + (target.cy - current.cy) * a,
    zoom: Math.exp(Math.log(current.zoom) + (Math.log(target.zoom) - Math.log(current.zoom)) * a),
  };
}

export const converged = (a: CameraState, b: CameraState) => Math.abs(a.cx - b.cx) < 0.05 && Math.abs(a.cy - b.cy) < 0.05 && Math.abs(a.zoom - b.zoom) < 0.0015;

/** SVG transform string that shows `camera` in a `box` sized viewport. */
export const cameraTransform = (camera: CameraState, box: Box) =>
  `translate(${(box.w / 2).toFixed(2)} ${(box.h / 2).toFixed(2)}) scale(${camera.zoom.toFixed(4)}) translate(${(-camera.cx).toFixed(2)} ${(-camera.cy).toFixed(2)})`;
