import { runnerPresentation } from "./runnerPresentation";
import { acceptsProjected, type DrawnSize } from "./top3dProjection";
import { layoutRunnerLabels, type LabelPoint } from "./runnerLabels";
import React, { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { fitPath, pointOnPath, type CourseLayout } from "@/lib/courseAtlas";
import { cameraTarget, cameraTransform, converged, easeCamera, EASE_MS, HOME_VIEW_FROM, keepInView, wholeTrack, type CameraMode, type CameraState } from "@/lib/camera";
import { courseShare, remainingMarkers, sectionAt, slopeSpans, straightness, turnness } from "@/lib/courseSections";
import type { ProgressStore } from "@/lib/progressStore";
import { cosmeticLane } from "@/lib/scenarioMotion";
import { gapFieldOf, NEUTRAL_EFFECT, tempoAt, type TerrainProfile } from "@/lib/terrainTempo";
import type { ViewDepth } from "@/lib/viewMode";
import { FRONT_END, OFFSET_MAX, scenarioFrame, type GapField, type Pace, type ScenarioRunner } from "@/lib/scenarioReplay";

/** The furthest a runner can run on past the line (share of the race): the field front plus the largest offset. */
const RUN_ON = FRONT_END - 1 + OFFSET_MAX;

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
  /** Course tempo (common to every runner): lane spread, pack spacing and camera briskness. Absent = neutral. */
  terrain?: TerrainProfile;
  /** Course spacing plus per-runner offsets (profile + seeded noise). Absent = the course tempo alone. */
  field?: GapField;
  label: string;
  selectedNo?: number | null;
  /** Presentation only: FLAT (default) is the unchanged 2D drawing; LITE / FULL tilt it into a pseudo-3D overhead view. */
  viewDepth?: ViewDepth;
};

const fmt = (p: { x: number; y: number }) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
const boundedLabel = (p: { x: number; y: number }, w: number, h: number) => ({ x: Math.max(26, Math.min(w - 26, p.x)), y: Math.max(14, Math.min(h - 14, p.y)) });

/**
 * Track view with a broadcast camera. Runner positions, the camera and the parallax layer are
 * written straight to the DOM from the progress store (setAttribute only -- no layout reads), so
 * the animation costs no React render. Runner motion is the scenario frame plus cosmetic lane
 * motion; the camera only frames the drawn pack. Nothing here reads market, probability, picks or
 * the official result.
 */
export function TrackStage(props: Props) {
  const { store, fixedProgress, runners, pace, seed, course, compact, cameraMode, reducedMotion, honmeiNo, terrain, field, label } = props;
  const depth: ViewDepth = props.viewDepth ?? "FLAT";
  const g = compact ? GEOMETRY.compact : GEOMETRY.wide;
  const box = useMemo(() => ({ w: g.w, h: g.h }), [g.w, g.h]);
  const margin = 4.2 * g.laneX + 14; // room for the widest lane plus the dot, its shadow and the zoomed-in framing
  const closed = course.pathClosed;
  const startShare = course.startLapShare === "UNKNOWN" ? 0 : course.startLapShare;
  const startKnown = course.startLapShare !== "UNKNOWN";
  // A straight course ends at the line; leave room to its right for the runners that run on past it.
  const pxPath = useMemo(() => fitPath(course.path, course.pathClosed ? g.w : g.w - RUN_ON * (g.w - 2 * margin), g.h, margin), [course, g.w, g.h, margin]);
  const pathLength = useMemo(() => pxPath.reduce((sum, point, i) => (i ? sum + Math.hypot(point.x - pxPath[i - 1].x, point.y - pxPath[i - 1].y) : 0), 0), [pxPath]);
  // A closed course simply carries on round past the line. A straight course ends at the line, so
  // beyond it the runners are drawn on along the last segment: they run on, they never pile up.
  const at = (share: number, lane: number) => {
    if (closed || share <= 1) return pointOnPath(pxPath, share, lane * g.laneX, closed);
    const end = pointOnPath(pxPath, 1, lane * g.laneX, false);
    const a = pxPath[pxPath.length - 2], b = pxPath[pxPath.length - 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const run = (share - 1) * pathLength;
    return { x: end.x + ((b.x - a.x) / len) * run, y: end.y + ((b.y - a.y) / len) * run };
  };

  // ---- static geometry (re-rendered only when the course / viewport changes)
  const edge = (lane: number, from = 0, to = 1, steps = 96) => Array.from({ length: steps }, (_, i) => at(closed ? from + ((to - from) * i) / steps : i / (steps - 1), lane));
  const toPoints = (list: { x: number; y: number }[]) => list.map(fmt).join(" ");
  const band = (from: number, to: number) => { const steps = 24; const a = Array.from({ length: steps + 1 }, (_, i) => at(from + ((to - from) * i) / steps, 4.2)); const b = Array.from({ length: steps + 1 }, (_, i) => at(from + ((to - from) * i) / steps, -1.6)).reverse(); return toPoints([...a, ...b]); };
  const goalIn = at(closed ? 0 : 1, -1.6), goalOut = at(closed ? 0 : 1, 4.2);
  const startIn = at(closed ? startShare : 0, -1.6), startOut = at(closed ? startShare : 0, 4.2);
  // Gate position comes from Atlas; the connecting stroke is explicitly stylized.
  const chute = useMemo(() => {
    if (course.startOnRing !== false || course.startPoint === "UNKNOWN" || !startKnown) return null;
    const xs = course.path.map(p => p.x), ys = course.path.map(p => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const px = pxPath.map(p => p.x), py = pxPath.map(p => p.y);
    const x = Math.min(...px) + (course.startPoint.x - minX) / (maxX - minX || 1) * (Math.max(...px) - Math.min(...px));
    const y = Math.min(...py) + (course.startPoint.y - minY) / (maxY - minY || 1) * (Math.max(...py) - Math.min(...py));
    return { x, y };
  }, [course, pxPath, startKnown]);
  const markers = useMemo(() => remainingMarkers(course), [course]);
  const slopes = useMemo(() => slopeSpans(course), [course]);
  const homeFrom = course.sectionShares === "UNKNOWN" ? null : course.sectionShares[6];
  // A straight course is drawn past the goal line far enough to hold the runners that run on after it.
  const capped = (list: { x: number; y: number }[], pad: number, padEnd = pad) => {
    const xs = list.map(p => p.x), lo = Math.min(...xs), hi = Math.max(...xs);
    return list.map(p => ({ x: p.x <= lo + 0.5 ? p.x - pad : p.x >= hi - 0.5 ? p.x + padEnd : p.x, y: p.y }));
  };
  const runnersDraw = useMemo(() => [...runners].sort((a, b) => Number(a.no === props.selectedNo) - Number(b.no === props.selectedNo) || Number(a.no === honmeiNo) - Number(b.no === honmeiNo) || a.no - b.no), [runners, honmeiNo, props.selectedNo]);

  // ---- imperative state
  const svgRef = useRef<SVGSVGElement | null>(null);
  const worldRef = useRef<SVGGElement | null>(null);
  const parallaxRef = useRef<SVGGElement | null>(null);
  const runnersRef = useRef<SVGGElement | null>(null);
  const dotRefs = useRef(new Map<number, SVGGElement>());
  const labelRefs = useRef(new Map<number, SVGGElement>());
  const leaderRefs = useRef(new Map<number, SVGLineElement>());
  const runnerPoints = useRef<LabelPoint[]>([]);
  const camera = useRef<CameraState>(wholeTrack(box));
  const target = useRef<CameraState>(wholeTrack(box));
  const frameId = useRef(0);
  const lastTs = useRef(0);
  const modeChangedAt = useRef(0);
  const progressNow = useRef(fixedProgress ?? 0);
  const lastPoints = useRef<{ x: number; y: number }[]>([]);
  const goalPoints = useMemo(() => [goalIn, goalOut], [goalIn.x, goalIn.y, goalOut.x, goalOut.y]);
  const gapField = useMemo(() => field ?? (terrain ? gapFieldOf(terrain) : undefined), [field, terrain]);
  const energy = useRef(1);
  // Wide TOP_3D (normal and reduced motion): the label placement search also requires each label's projected screen box to stay
  // clear of the already placed ones (analytic projection of the CSS tilt, no layout read per frame; the drawn size is cached
  // by a ResizeObserver). Absent for 2D and for the compact layout, which keep the plain 28-unit rule.
  const drawn = useRef<DrawnSize | null>(null);
  const acceptLabel = (depth === "FULL" || depth === "LITE") && !compact ? (w: number, h: number) => (drawn.current ? acceptsProjected(drawn.current, { w, h }) : undefined) : undefined;
  const live = useRef({ runners, pace, seed, course, mode: cameraMode, reduced: reducedMotion, box, at, closed, goalPoints, terrain, gapField, acceptLabel });
  live.current = { runners, pace, seed, course, mode: fixedProgress !== undefined ? "TRACK" : cameraMode, reduced: reducedMotion, box, at, closed, goalPoints, terrain, gapField, acceptLabel };

  const apply = (cam: CameraState) => {
    const { box: b } = live.current;
    worldRef.current?.setAttribute("transform", cameraTransform(cam, b));
    const screenPoints = runnerPoints.current.map(point => ({ no: point.no, x: (point.x - cam.cx) * cam.zoom + b.w / 2, y: (point.y - cam.cy) * cam.zoom + b.h / 2 }));
    const labels = layoutRunnerLabels(screenPoints, b.w, b.h, live.current.acceptLabel?.(b.w, b.h));
    for (const label of labels) {
      labelRefs.current.get(label.no)?.setAttribute("transform", `translate(${label.x.toFixed(2)} ${label.y.toFixed(2)})`);
      const point = screenPoints.find(point => point.no === label.no)!;
      const line = leaderRefs.current.get(label.no);
      line?.setAttribute("x1", point.x.toFixed(2)); line?.setAttribute("y1", point.y.toFixed(2));
      line?.setAttribute("x2", label.x.toFixed(2)); line?.setAttribute("y2", label.y.toFixed(2));
    }
    if (parallaxRef.current && !live.current.reduced) {
      const ox = (-(cam.cx * cam.zoom * PARALLAX_FACTOR)) % PARALLAX_TILE, oy = (-(cam.cy * cam.zoom * PARALLAX_FACTOR)) % PARALLAX_TILE;
      parallaxRef.current.setAttribute("transform", `translate(${ox.toFixed(1)} ${oy.toFixed(1)})`);
    }
    svgRef.current?.setAttribute("data-zoom", cam.zoom.toFixed(2));
  };

  // From the home straight the goal line is part of what the camera must keep in view.
  const framed = (progress: number, points: { x: number; y: number }[]) => (progress >= HOME_VIEW_FROM && live.current.mode !== "TRACK" ? [...points, ...live.current.goalPoints] : points);

  const loop = (ts: number) => {
    frameId.current = 0;
    const dt = lastTs.current ? Math.min(100, ts - lastTs.current) : 16;
    lastTs.current = ts;
    const progress = progressNow.current;
    // Course tempo scales how briskly the camera follows (cosmetic, the same for every runner).
    const base = ts - modeChangedAt.current < 1200 ? EASE_MS.modeChange : progress >= HOME_VIEW_FROM ? EASE_MS.finalPhase : EASE_MS.normal;
    const tau = base / energy.current;
    camera.current = easeCamera(camera.current, target.current, dt, tau);
    if (!live.current.reduced) camera.current = keepInView(camera.current, framed(progress, lastPoints.current), live.current.box, CONTAIN_MARGIN);
    apply(camera.current);
    if (!converged(camera.current, target.current)) frameId.current = requestAnimationFrame(loop);
    else lastTs.current = 0;
  };
  const ensureLoop = () => { if (!frameId.current) { lastTs.current = 0; frameId.current = requestAnimationFrame(loop); } };

  const update = (progress: number) => {
    progressNow.current = progress;
    const s = live.current;
    const effect = s.terrain ? tempoAt(s.terrain, progress) : NEUTRAL_EFFECT;
    energy.current = effect.cameraEnergy;
    const frame = scenarioFrame(s.runners, progress, s.pace, s.seed, s.gapField);
    const points: { x: number; y: number }[] = [];
    runnerPoints.current = [];
    let lapSum = 0;
    for (const runner of frame.runners) {
      const share = courseShare(s.course, runner.lap);
      lapSum += runner.lap;
      const lane = cosmeticLane({ no: runner.no, style: runner.style, baseLane: runner.lane, progress, seed: s.seed, turn: turnness(s.course, share), straight: straightness(s.course, share), spread: effect.lateralSpreadMultiplier });
      const p = s.at(s.closed ? share : runner.lap, lane);
      points.push(p);
      runnerPoints.current.push({ no: runner.no, ...p });
      labelRefs.current.get(runner.no)?.setAttribute("data-crossed", String(runner.lap >= 1));
      dotRefs.current.get(runner.no)?.setAttribute("data-crossed", String(runner.lap >= 1));
      dotRefs.current.get(runner.no)?.setAttribute("transform", `translate(${p.x.toFixed(2)} ${p.y.toFixed(2)})`);
    }
    lastPoints.current = points;
    // Camera: the pack is static once every runner has crossed, so the camera settles and stays;
    // AUTO is a whole-track view under reduced motion.
    const section = sectionAt(s.course, courseShare(s.course, frame.runners.length ? lapSum / frame.runners.length : 0), progress);
    const mode: CameraMode = s.reduced && s.mode === "AUTO" ? "TRACK" : s.mode;
    target.current = cameraTarget({ points, mode, section, box: s.box, progress, anchors: s.goalPoints });
    if (s.reduced) { camera.current = target.current; apply(camera.current); return; }
    // The easing may lag the pack; this keeps every runner in view while it catches up.
    camera.current = keepInView(camera.current, framed(progress, points), s.box, CONTAIN_MARGIN);
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

  const cornerPos = (share: number) => boundedLabel(at(share, 6.2), g.w, g.h);

  // Wide TOP_3D: cache the drawn size and redraw the labels whenever it changes (view switch, Share View, resize).
  // Presentation only: nothing here touches runner positions or the camera.
  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (depth === "FLAT" || compact || !svg || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(entries => {
      const size = entries[0]?.contentRect;
      if (size) drawn.current = { w: size.width, h: size.height };
      apply(camera.current);
    });
    observer.observe(svg);
    return () => { observer.disconnect(); drawn.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depth, compact]);
  const parallaxLines = Array.from({ length: Math.ceil(g.w / PARALLAX_TILE) + 3 }, (_, i) => (i - 1) * PARALLAX_TILE);

  // Presentation only: keep annotation labels from printing over each other. Course geometry and anchors are untouched;
  // GOAL / corner labels stay put; START, slope and remaining-distance labels are nudged (or hidden) when they would collide.
  useLayoutEffect(() => {
    const world = worldRef.current;
    if (!world) return;
    let cancelled = false;
    const place = () => {
      if (cancelled) return;
      // Document order puts the remaining-distance labels first, so queue the fixed labels ahead of the movable ones.
      const texts = ([".kt-track-label:not(.kt-track-label--start)", "[data-corner]", ".kt-track-label--start", "[data-slope] text", "[data-remaining] text"] as const).flatMap(selector => Array.from(world.querySelectorAll<SVGTextElement>(selector)));
      texts.forEach(text => { text.removeAttribute("transform"); text.removeAttribute("visibility"); });
      const pad = 3;
      const hit = (a: DOMRect, b: DOMRect) => a.x < b.x + b.width + pad && b.x < a.x + a.width + pad && a.y < b.y + b.height + pad && b.y < a.y + a.height + pad;
      const inside = (r: DOMRect) => r.x >= 0 && r.y >= 0 && r.x + r.width <= g.w && r.y + r.height <= g.h;
      const placed: DOMRect[] = [];
      const steps: [number, number][] = [[0, 0], [0, -11], [0, 11], [-18, 0], [18, 0], [0, -22], [0, 22], [-18, -11], [18, -11], [-18, 11], [18, 11]];
      for (const text of texts) {
        const box = text.getBBox();
        const fixed = text.hasAttribute("data-corner") || (text.classList.contains("kt-track-label") && !text.classList.contains("kt-track-label--start"));
        const spot = (fixed ? [steps[0]] : steps).find(([dx, dy]) => {
          const next = new DOMRect(box.x + dx, box.y + dy, box.width, box.height);
          return (fixed || inside(next)) && !placed.some(other => hit(next, other));
        });
        if (!spot && !fixed) { text.setAttribute("visibility", "hidden"); continue; }
        const [dx, dy] = spot ?? steps[0];
        if (dx || dy) text.setAttribute("transform", `translate(${dx} ${dy})`);
        placed.push(new DOMRect(box.x + dx, box.y + dy, box.width, box.height));
      }
    };
    place();
    void document.fonts?.ready.then(place);
    return () => { cancelled = true; };
  }, [course, g.w, g.h, compact]);

  return <svg ref={svgRef} className="kt-track-svg" viewBox={`0 0 ${g.w} ${g.h}`} role="img" aria-label={label} data-course={`${course.venue}-${course.surface}-${course.distance}`} data-surface={course.surface} data-presentation="STYLIZED" data-direction={course.direction} data-start-share={String(course.startLapShare)} data-camera={cameraMode} data-view={depth === "FLAT" ? "MAP" : "TOP_3D"} data-depth={depth} data-zoom="1.00">
    <title>{`${label} 色は識別用・枠色ではありません`}</title>
    <g ref={parallaxRef} className="kt-parallax" aria-hidden="true">
      {parallaxLines.map(x => <line key={x} x1={x} x2={x} y1={-PARALLAX_TILE} y2={g.h + PARALLAX_TILE} />)}
      {parallaxLines.map(y => <line key={`h${y}`} x1={-PARALLAX_TILE} x2={g.w + PARALLAX_TILE} y1={y} y2={y} className="kt-parallax-h" />)}
    </g>
    <g ref={worldRef} className="kt-world">
      {depth === "FULL" ? <polygon aria-hidden="true" className="kt-track-side" transform="translate(0 7)" points={toPoints(closed ? edge(4.2) : capped([...edge(4.2), ...edge(-1.6).reverse()], g.r + 2, g.r + 2 + RUN_ON * pathLength))} /> : null}
      {closed ? <>
        <polygon points={toPoints(edge(4.2))} className="kt-track-outer" />
        <polygon points={toPoints(edge(-1.6))} className="kt-track-inner" />
        {homeFrom !== null && homeFrom < 1 ? <polygon points={band(homeFrom, 1)} className="kt-straight-hl" data-home-straight="true" /> : null}
      </> : <polygon points={toPoints(capped([...edge(4.2), ...edge(-1.6).reverse()], g.r + 2, g.r + 2 + RUN_ON * pathLength))} className="kt-track-outer" />}
      {chute ? <g data-chute="STYLIZED" aria-label="Atlasのゲート位置と概略接続線">
        <line x1={chute.x} y1={chute.y} x2={startOut.x} y2={startOut.y} className="kt-chute" />
        <rect x={chute.x - 5} y={chute.y - 5} width="10" height="10" className="kt-chute-gate" />
      </g> : null}
      {slopes.map(span => {
        const steps = 12;
        const line = Array.from({ length: steps + 1 }, (_, i) => at(span.fromShare + ((span.toShare - span.fromShare) * i) / steps, 5.2));
        const mid = boundedLabel(at((span.fromShare + span.toShare) / 2, 8), g.w, g.h);
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
      {closed ? course.corners.map(corner => { const pos = cornerPos(corner.share); return <text key={corner.label} x={pos.x} y={pos.y + 4} className="kt-corner" data-corner={corner.label}>{corner.label}C</text>; }) : null}
      {startKnown ? <line x1={startIn.x} y1={startIn.y} x2={startOut.x} y2={startOut.y} className="kt-track-start" data-start="true" /> : null}
      {startKnown ? <text x={startOut.x + (startOut.x > g.w * 0.75 ? -4 : 0)} y={Math.max(12, Math.min(g.h - 4, startOut.y + (startOut.y > g.h / 2 ? 14 : -6)))} textAnchor={startOut.x > g.w * 0.75 ? "end" : "start"} className="kt-track-label kt-track-label--start">START</text> : null}
      <line x1={goalIn.x} y1={goalIn.y} x2={goalOut.x} y2={goalOut.y} className="kt-track-post" data-goal="true" />
      <text x={goalOut.x + 6} y={Math.min(goalOut.y + 14, g.h - 4)} className="kt-track-label">GOAL</text>
      <g ref={runnersRef} className="kt-runners">
        {runnersDraw.map(runner => <g key={runner.no} data-runner={runner.no} ref={el => { if (el) dotRefs.current.set(runner.no, el); else dotRefs.current.delete(runner.no); }} style={runnerPresentation(runner.no).style} data-color-basis="VISUAL_ONLY" data-selected={runner.no === props.selectedNo} className={`kt-dot${runner.no === honmeiNo ? " is-honmei" : ""}${runner.style === "不明" ? " is-unknown" : ""}`}>
          <ellipse className="kt-dot-shadow" cx="1.6" cy="3.6" rx={g.r} ry={g.r * 0.72} />
          {depth !== "FLAT" ? <circle className="kt-dot-rim" r={g.r / 2 + 1.5} /> : null}
          <circle r={g.r / 2} />
          {depth === "FULL" ? <ellipse className="kt-dot-gloss" cx="-1.6" cy="-2" rx="2.2" ry="1.4" /> : null}
        </g>)}
      </g>
    </g>
    <g className="kt-runner-leaders" aria-hidden="true">{runnersDraw.map(runner => <line key={runner.no} ref={el => { if (el) leaderRefs.current.set(runner.no, el); else leaderRefs.current.delete(runner.no); }} />)}</g>
    <g className="kt-runner-labels">{runnersDraw.map(runner => <g key={runner.no} data-runner-label={runner.no} data-selected={runner.no === props.selectedNo} style={runnerPresentation(runner.no).style} ref={el => { if (el) labelRefs.current.set(runner.no, el); else labelRefs.current.delete(runner.no); }}>
      {depth === "FLAT" ? <>
        <rect x="-12" y="-12" width="24" height="24" rx="5" />
        <text dy="4">{runner.no}</text>
        {runner.no === props.selectedNo ? <path className="kt-runner-selected" d="M -4 -16 L 0 -12 L 4 -16 Z" /> : null}
      </> : <g className="kt-label-upright">
        <rect x="-12" y="-12" width="24" height="24" rx="5" />
        <text dy="4">{runner.no}</text>
        {runner.no === props.selectedNo ? <path className="kt-runner-selected" d="M -4 -16 L 0 -12 L 4 -16 Z" /> : null}
      </g>}
    </g>)}</g>
  </svg>;
}
