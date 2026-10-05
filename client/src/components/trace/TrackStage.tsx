import React, { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { fitPath, pointOnPath, type CourseLayout } from "@/lib/courseAtlas";
import { cameraTarget, cameraTransform, converged, easeCamera, EASE_MS, FINAL_PHASE_FROM, keepInView, wholeTrack, type CameraMode, type CameraState } from "@/lib/camera";
import { courseShare, remainingMarkers, sectionAt, slopeSpans, straightness, turnness } from "@/lib/courseSections";
import type { ProgressStore } from "@/lib/progressStore";
import { cosmeticLane } from "@/lib/scenarioMotion";
import { scenarioFrame, type Pace, type ScenarioRunner } from "@/lib/scenarioReplay";

export const GEOMETRY = {
  wide: { w: 640, h: 300, laneX: 11, r: 12 },
  compact: { w: 360, h: 320, laneX: 9, r: 12 },
};
const PARALLAX_TILE = 56;
const PARALLAX_FACTOR = 0.35;
const CONTAIN_MARGIN = 18;

type Props = {
  /** Live progress. The stage reads it directly: no React render per frame. */
  store?: ProgressStore;
  /** Static picture at one progress value (the RESULT-mode scenario thumbnail). */
  fixedProgress?: number;
  runners: ScenarioRunner[];
  pace: Pace;
  seed: number;
  course: CourseLayout;
  compact: boolean;
  cameraMode: CameraMode;
  reducedMotion: boolean;
  honmeiNo: number | null;
  label: string;
};

const fmt = (p: { x: number; y: number }) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`;

/**
 * Track view with a broadcast camera. Runner positions, the camera and the parallax layer are
 * written straight to the DOM from the progress store (setAttribute only -- no layout reads), so
 * the animation costs no React render. Runner motion is the scenario frame plus cosmetic lane
 * motion; the camera only frames the drawn pack. Nothing here reads market, probability, picks or
 * the official result.
 */
export function TrackStage(props: Props) {
  const { store, fixedProgress, runners, pace, seed, course, compact, cameraMode, reducedMotion, honmeiNo, label } = props;
  const g = compact ? GEOMETRY.compact : GEOMETRY.wide;
  const box = useMemo(() => ({ w: g.w, h: g.h }), [g.w, g.h]);
  const margin = 4.2 * g.laneX + 14; // room for the widest lane plus the dot, its shadow and the zoomed-in framing
  const closed = course.pathClosed;
  const startShare = course.startLapShare === "UNKNOWN" ? 0 : course.startLapShare;
  const startKnown = course.startLapShare !== "UNKNOWN";
  const pxPath = useMemo(() => fitPath(course.path, g.w, g.h, margin), [course, g.w, g.h, margin]);
  const at = (share: number, lane: number) => pointOnPath(pxPath, share, lane * g.laneX, closed);

  // ---- static geometry (re-rendered only when the course / viewport changes)
  const edge = (lane: number, from = 0, to = 1, steps = 96) => Array.from({ length: steps }, (_, i) => at(closed ? from + ((to - from) * i) / steps : i / (steps - 1), lane));
  const toPoints = (list: { x: number; y: number }[]) => list.map(fmt).join(" ");
  const band = (from: number, to: number) => { const steps = 24; const a = Array.from({ length: steps + 1 }, (_, i) => at(from + ((to - from) * i) / steps, 4.2)); const b = Array.from({ length: steps + 1 }, (_, i) => at(from + ((to - from) * i) / steps, -1.6)).reverse(); return toPoints([...a, ...b]); };
  const goalIn = at(closed ? 0 : 1, -1.6), goalOut = at(closed ? 0 : 1, 4.2);
  const startIn = at(closed ? startShare : 0, -1.6), startOut = at(closed ? startShare : 0, 4.2);
  const markers = useMemo(() => remainingMarkers(course), [course]);
  const slopes = useMemo(() => slopeSpans(course), [course]);
  const homeFrom = course.sectionShares === "UNKNOWN" ? null : course.sectionShares[6];
  const capped = (list: { x: number; y: number }[], pad: number) => {
    const xs = list.map(p => p.x), lo = Math.min(...xs), hi = Math.max(...xs);
    return list.map(p => ({ x: p.x <= lo + 0.5 ? p.x - pad : p.x >= hi - 0.5 ? p.x + pad : p.x, y: p.y }));
  };
  const runnersDraw = useMemo(() => [...runners].sort((a, b) => Number(a.no === honmeiNo) - Number(b.no === honmeiNo) || a.no - b.no), [runners, honmeiNo]);

  // ---- imperative state
  const svgRef = useRef<SVGSVGElement | null>(null);
  const worldRef = useRef<SVGGElement | null>(null);
  const parallaxRef = useRef<SVGGElement | null>(null);
  const runnersRef = useRef<SVGGElement | null>(null);
  const endRef = useRef<SVGTextElement | null>(null);
  const dotRefs = useRef(new Map<number, SVGGElement>());
  const camera = useRef<CameraState>(wholeTrack(box));
  const target = useRef<CameraState>(wholeTrack(box));
  const frameId = useRef(0);
  const lastTs = useRef(0);
  const modeChangedAt = useRef(0);
  const progressNow = useRef(fixedProgress ?? 0);
  const lastPoints = useRef<{ x: number; y: number }[]>([]);
  const live = useRef({ runners, pace, seed, course, mode: cameraMode, reduced: reducedMotion, box, at, closed });
  live.current = { runners, pace, seed, course, mode: fixedProgress !== undefined ? "TRACK" : cameraMode, reduced: reducedMotion, box, at, closed };

  const apply = (cam: CameraState) => {
    const { box: b } = live.current;
    worldRef.current?.setAttribute("transform", cameraTransform(cam, b));
    if (parallaxRef.current && !live.current.reduced) {
      const ox = (-(cam.cx * cam.zoom * PARALLAX_FACTOR)) % PARALLAX_TILE, oy = (-(cam.cy * cam.zoom * PARALLAX_FACTOR)) % PARALLAX_TILE;
      parallaxRef.current.setAttribute("transform", `translate(${ox.toFixed(1)} ${oy.toFixed(1)})`);
    }
    svgRef.current?.setAttribute("data-zoom", cam.zoom.toFixed(2));
  };

  const loop = (ts: number) => {
    frameId.current = 0;
    const dt = lastTs.current ? Math.min(100, ts - lastTs.current) : 16;
    lastTs.current = ts;
    const progress = progressNow.current;
    const tau = ts - modeChangedAt.current < 1200 ? EASE_MS.modeChange : progress >= FINAL_PHASE_FROM ? EASE_MS.finalPhase : EASE_MS.normal;
    camera.current = easeCamera(camera.current, target.current, dt, tau);
    if (!live.current.reduced) camera.current = keepInView(camera.current, lastPoints.current, live.current.box, CONTAIN_MARGIN);
    apply(camera.current);
    if (!converged(camera.current, target.current)) frameId.current = requestAnimationFrame(loop);
    else lastTs.current = 0;
  };
  const ensureLoop = () => { if (!frameId.current) { lastTs.current = 0; frameId.current = requestAnimationFrame(loop); } };

  const update = (progress: number) => {
    progressNow.current = progress;
    const s = live.current;
    const frame = scenarioFrame(s.runners, progress, s.pace, s.seed);
    const points: { x: number; y: number }[] = [];
    let lapSum = 0;
    for (const runner of frame.runners) {
      const share = courseShare(s.course, runner.lap);
      lapSum += runner.lap;
      const lane = cosmeticLane({ no: runner.no, style: runner.style, baseLane: runner.lane, progress, seed: s.seed, turn: turnness(s.course, share), straight: straightness(s.course, share) });
      const p = s.at(s.closed ? share : runner.lap, lane);
      points.push(p);
      dotRefs.current.get(runner.no)?.setAttribute("transform", `translate(${p.x.toFixed(2)} ${p.y.toFixed(2)})`);
    }
    // FINISH window: the level field fades short of the line; nobody is drawn crossing first.
    const fade = progress <= FINAL_PHASE_FROM ? 1 : Math.max(0.25, 1 - ((progress - FINAL_PHASE_FROM) / 0.05) * 0.75);
    runnersRef.current?.setAttribute("opacity", fade.toFixed(2));
    endRef.current?.setAttribute("display", progress > FINAL_PHASE_FROM ? "inline" : "none");

    lastPoints.current = points;
    // Camera: frozen once the scenario is complete; AUTO is a whole-track view under reduced motion.
    if (progress >= 1 && fixedProgress === undefined) return;
    const section = sectionAt(s.course, courseShare(s.course, frame.runners.length ? lapSum / frame.runners.length : 0), progress);
    const mode: CameraMode = s.reduced && s.mode === "AUTO" ? "TRACK" : s.mode;
    target.current = cameraTarget({ points, mode, section, box: s.box, progress });
    if (s.reduced) { camera.current = target.current; apply(camera.current); return; }
    // The easing may lag the pack; this keeps every runner in view while it catches up.
    camera.current = keepInView(camera.current, points, s.box, CONTAIN_MARGIN);
    apply(camera.current);
    ensureLoop();
  };

  useLayoutEffect(() => {
    camera.current = wholeTrack(box); target.current = wholeTrack(box);
    apply(camera.current);
    update(fixedProgress ?? store?.get() ?? 0);
    return store?.subscribe(update);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, fixedProgress, runners, pace, seed, course, compact]);

  useEffect(() => {
    modeChangedAt.current = performance.now();
    update(progressNow.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraMode, reducedMotion]);

  useEffect(() => () => { if (frameId.current) cancelAnimationFrame(frameId.current); }, []);

  const cornerPos = (share: number) => at(share, 6.2);
  const parallaxLines = Array.from({ length: Math.ceil(g.w / PARALLAX_TILE) + 3 }, (_, i) => (i - 1) * PARALLAX_TILE);

  return <svg ref={svgRef} className="kt-track-svg" viewBox={`0 0 ${g.w} ${g.h}`} role="img" aria-label={label} data-course={`${course.venue}-${course.surface}-${course.distance}`} data-direction={course.direction} data-start-share={String(course.startLapShare)} data-camera={cameraMode} data-zoom="1.00">
    <g ref={parallaxRef} className="kt-parallax" aria-hidden="true">
      {parallaxLines.map(x => <line key={x} x1={x} x2={x} y1={-PARALLAX_TILE} y2={g.h + PARALLAX_TILE} />)}
      {parallaxLines.map(y => <line key={`h${y}`} x1={-PARALLAX_TILE} x2={g.w + PARALLAX_TILE} y1={y} y2={y} className="kt-parallax-h" />)}
    </g>
    <g ref={worldRef} className="kt-world">
      {closed ? <>
        <polygon points={toPoints(edge(4.2))} className="kt-track-outer" />
        <polygon points={toPoints(edge(-1.6))} className="kt-track-inner" />
        {homeFrom !== null && homeFrom < 1 ? <polygon points={band(homeFrom, 1)} className="kt-straight-hl" data-home-straight="true" /> : null}
      </> : <polygon points={toPoints(capped([...edge(4.2), ...edge(-1.6).reverse()], g.r + 2))} className="kt-track-outer" />}
      {slopes.map(span => {
        const steps = 12;
        const line = Array.from({ length: steps + 1 }, (_, i) => at(span.fromShare + ((span.toShare - span.fromShare) * i) / steps, 5.2));
        const mid = at((span.fromShare + span.toShare) / 2, 8);
        return <g key={span.where} data-slope="true" className={`kt-slope kt-slope--${span.kind === "UP" ? "up" : "down"}`}>
          <polyline points={toPoints(line)} />
          <text x={mid.x} y={mid.y + 3} textAnchor="middle">{span.kind === "UP" ? "▲" : "▼"}{span.riseMeters === "UNKNOWN" ? "坂" : `坂 ${span.riseMeters}m`}</text>
        </g>;
      })}
      {markers.map(marker => {
        const a = at(closed ? marker.share : marker.share, -1.6), b = at(closed ? marker.share : marker.share, 4.2), t = cornerPos(marker.share);
        return <g key={marker.meters} data-remaining={marker.meters} className="kt-marker">
          <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
          <text x={t.x} y={t.y + 3} textAnchor="middle">{compact ? marker.meters : `残${marker.meters}`}</text>
        </g>;
      })}
      {closed ? course.corners.map(corner => { const pos = cornerPos(corner.share); return <text key={corner.label} x={pos.x} y={pos.y + 4} className="kt-corner" data-corner={corner.label}>{corner.label}</text>; }) : null}
      {startKnown ? <line x1={startIn.x} y1={startIn.y} x2={startOut.x} y2={startOut.y} className="kt-track-start" data-start="true" /> : null}
      {startKnown ? <text x={startOut.x + (startOut.x > g.w * 0.75 ? -4 : 0)} y={Math.max(12, Math.min(g.h - 4, startOut.y + (startOut.y > g.h / 2 ? 14 : -6)))} textAnchor={startOut.x > g.w * 0.75 ? "end" : "start"} className="kt-track-label kt-track-label--start">START</text> : null}
      <line x1={goalIn.x} y1={goalIn.y} x2={goalOut.x} y2={goalOut.y} className="kt-track-post" data-goal="true" />
      <text x={goalOut.x + 6} y={Math.min(goalOut.y + 14, g.h - 4)} className="kt-track-label">GOAL</text>
      <g ref={runnersRef} className="kt-runners">
        {runnersDraw.map(runner => <g key={runner.no} data-runner={runner.no} ref={el => { if (el) dotRefs.current.set(runner.no, el); else dotRefs.current.delete(runner.no); }} className={`kt-dot${runner.no === honmeiNo ? " is-honmei" : ""}${runner.style === "不明" ? " is-unknown" : ""}`}>
          <ellipse className="kt-dot-shadow" cx="1.6" cy="3.6" rx={g.r} ry={g.r * 0.72} />
          <circle r={g.r} />
          <text dy="4">{runner.no}</text>
        </g>)}
      </g>
    </g>
    <text ref={endRef} x={g.w / 2} y={g.h / 2 + 4} className="kt-track-end" display="none">ゴール前でシナリオ終了 · 着順は描きません</text>
  </svg>;
}
