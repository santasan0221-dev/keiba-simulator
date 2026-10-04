import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { FlaskConical, Pause, Play, RefreshCw, RotateCcw, Trophy } from "lucide-react";
import { LabServiceNavigation } from "@/components/LabServiceNavigation";
import { JourneyRail } from "@/components/trace/TraceChrome";
import { PickCardView, VerdictChip } from "@/components/trace/RaceParts";
import {
  fetchAvailablePredictionDates,
  fetchRace,
  fetchRaces,
  type LabRace,
  type LabRaceListItem,
  type LabResultListItem,
} from "@/lib/singlePickAi";
import { pickCards, verdictOf, type PickCard } from "@/lib/raceView";
import { raceKeyToPath } from "@/lib/raceShareUrl";
import { trackBetaEvent } from "@/lib/betaAnalytics";
import { fetchResultRow, officialResultView, type OfficialResultView } from "@/lib/simulatorResult";
import { createResultPoller } from "@/lib/resultPoller";
import { ElevationPanel, ScenarioOrderPanel } from "@/components/trace/ScenarioOrderPanel";
import { createThrottledEmitter } from "@/lib/scenarioOrder";
import { cornerShare, fitPath, GEOMETRY_DISCLAIMER, pointOnPath, resolveCourse, type CourseLayout } from "@/lib/courseAtlas";
import {
  demoField,
  formationAt,
  normalizeStyle,
  PHASE_KEYFRAME,
  PHASE_LABEL,
  PHASES,
  scenarioFrame,
  scenarioSeed,
  type Pace,
  type ScenarioFrame,
  type ScenarioPosition,
  type ScenarioRunner,
} from "@/lib/scenarioReplay";

// Scenario progress runs 0..1 over SCENARIO_MS at 1x. It is playback of an
// illustration, not race time: nothing on screen is labelled in seconds.
const SCENARIO_MS = 30_000;
const SPEEDS = [1, 1.5, 2] as const;
// SCENARIO ORDER redraws at ~8 Hz; the track itself still follows every animation frame.
const ORDER_TABLE_MS = 125;

// Whole-track camera: the full oval is always in view (no follow camera),
// so no runner can leave the screen. Mobile uses a rounder oval so the
// dots stay legible at 390px.
const GEOMETRY = {
  wide: { w: 640, h: 300, cx: 320, cy: 146, rx: 250, ry: 96, laneX: 11, laneY: 9, r: 12 },
  compact: { w: 360, h: 320, cx: 180, cy: 156, rx: 124, ry: 104, laneX: 9, laneY: 8, r: 12 },
};

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, [query]);
  return matches;
}

type Source = { kind: "demo" } | { kind: "loading"; key: string } | { kind: "race"; race: LabRace } | { kind: "error"; key: string };
type ResultLoad = { status: "idle" | "loading" | "ready" | "failed"; row: LabResultListItem | null };
type Mode = "SCENARIO" | "RESULT";

export default function SimulatorShell() {
  const [pace, setPace] = useState<Pace>("平均");
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [mode, setMode] = useState<Mode>("SCENARIO");
  const [source, setSource] = useState<Source>({ kind: "demo" });
  const [dates, setDates] = useState<string[]>([]);
  const [date, setDate] = useState("");
  const [choices, setChoices] = useState<LabRaceListItem[]>([]);
  const [result, setResult] = useState<ResultLoad>({ status: "idle", row: null });
  const compact = useMediaQuery("(max-width: 760px)");
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const autoSwitched = useRef(false);

  const race = source.kind === "race" ? source.race : null;

  const loadResult = useCallback((target: LabRace) => {
    const key = target.race.race_key;
    setResult(current => ({ status: "loading", row: current.row }));
    fetchResultRow(target)
      .then(row => {
        setResult({ status: "ready", row });
        // A result confirmed after the race detail was loaded: refresh the
        // detail once so names / official order come from the canonical payload.
        if (key && row && (row.result_status === "CONFIRMED" || row.result_status === "DEAD_HEAT") && !target.result) {
          fetchRace(key).then(fresh => setSource({ kind: "race", race: fresh })).catch(() => undefined);
        }
      })
      .catch(() => setResult({ status: "failed", row: null }));
  }, []);

  const loadRace = useCallback((key: string) => {
    setPlaying(false);
    setProgress(0);
    setMode("SCENARIO");
    autoSwitched.current = false;
    setResult({ status: "idle", row: null });
    if (!key) { setSource({ kind: "demo" }); return; }
    setSource({ kind: "loading", key });
    fetchRace(key).then(value => { setSource({ kind: "race", race: value }); loadResult(value); }).catch(() => setSource({ kind: "error", key }));
  }, [loadResult]);

  // Anonymous, fixed-enumeration open event: only whether the page was opened
  // from a race link, never the race itself.
  useEffect(() => {
    const fromRace = Boolean(new URLSearchParams(window.location.search).get("race"));
    trackBetaEvent({ name: "beta_simulator_open", properties: { entry: fromRace ? "race_link" : "direct" } });
  }, []);

  // Dates + optional ?race= hand-off (race page, history ledger). Only the
  // field (number, name, published run style) and fixed pre-race tops are read.
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("race");
    if (requested) { loadRace(requested); setDate(requested.split("|")[1] ?? ""); }
    fetchAvailablePredictionDates().then(value => {
      const list = (value.available_dates ?? []).filter(item => /^\d{4}-\d{2}-\d{2}$/.test(item));
      setDates(list);
      setDate(current => current || value.latest_prediction_date || list[0] || "");
    }).catch(() => undefined);
  }, [loadRace]);

  useEffect(() => {
    if (!date) return;
    let live = true;
    Promise.allSettled([fetchRaces(date, "JRA"), fetchRaces(date, "NAR")]).then(results => {
      if (live) setChoices(results.flatMap(entry => entry.status === "fulfilled" ? entry.value.races : []).sort((a, b) => (a.scheduled_start_at ?? "").localeCompare(b.scheduled_start_at ?? "")));
    });
    return () => { live = false; };
  }, [date]);

  // Playback. requestAnimationFrame drives a continuous progress value; with
  // prefers-reduced-motion the scenario steps keyframe to keyframe instead.
  useEffect(() => {
    if (!playing || reducedMotion) return;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const delta = Math.min(100, now - last);
      last = now;
      setProgress(value => Math.min(1, value + (delta / SCENARIO_MS) * speed));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, speed, reducedMotion]);

  useEffect(() => {
    if (!playing || !reducedMotion) return;
    const next = PHASES.map(phase => PHASE_KEYFRAME[phase]).find(value => value > progress + 1e-6);
    if (next === undefined) return;
    const timer = window.setTimeout(() => setProgress(next), 1800 / speed);
    return () => window.clearTimeout(timer);
  }, [playing, reducedMotion, speed, progress]);

  const complete = progress >= 1;
  useEffect(() => { if (complete) setPlaying(false); }, [complete]);

  // Throttled progress for the SCENARIO ORDER table: while playing it is pushed
  // at most every ORDER_TABLE_MS; any user action (scrub, pause, restart) shows at once.
  const [orderProgress, setOrderProgress] = useState(0);
  const emitterRef = useRef<ReturnType<typeof createThrottledEmitter<number>> | null>(null);
  useEffect(() => {
    const emitter = createThrottledEmitter<number>(ORDER_TABLE_MS, setOrderProgress, {
      now: () => performance.now(),
      setTimeout: (fn, ms) => window.setTimeout(fn, ms),
      clearTimeout: id => window.clearTimeout(id),
    });
    emitterRef.current = emitter;
    return () => emitter.stop();
  }, []);
  useEffect(() => {
    if (playing && !reducedMotion && progress < 1) emitterRef.current?.push(progress);
    else emitterRef.current?.now(progress);
  }, [progress, playing, reducedMotion]);

  const official: OfficialResultView | null = race
    ? officialResultView(result.row, race, result.status === "failed")
    : null;
  const officialReady = result.status === "ready" || result.status === "failed";
  const confirmed = official?.state === "CONFIRMED" && officialReady;

  // SCENARIO COMPLETE first; the official result replaces nothing the
  // scenario drew -- it only opens once the scenario has finished.
  useEffect(() => {
    if (!complete || !confirmed || autoSwitched.current) return;
    autoSwitched.current = true;
    const timer = window.setTimeout(() => setMode("RESULT"), 1500);
    return () => window.clearTimeout(timer);
  }, [complete, confirmed]);

  // Official-result polling for the race that is open: one poller per race
  // (lib/resultPoller). Before post time it waits on a one-shot timer to post
  // time; afterwards it polls every 5 min while PENDING / REVIEW_REQUIRED,
  // at most 12 times, never while the tab is hidden. Race change / unmount
  // stops it. Refs keep the poller reading the latest race and state.
  const raceRef = useRef<LabRace | null>(null);
  raceRef.current = race;
  const pollState = !race || !official || !officialReady ? "LOADING" : official.state;
  const pollStateRef = useRef<OfficialResultView["state"] | "LOADING">(pollState);
  pollStateRef.current = pollState;
  const pollerRef = useRef<ReturnType<typeof createResultPoller> | null>(null);
  const raceKey = race?.race.race_key ?? null;
  const startIso = race?.race.scheduled_start_at ?? null;
  useEffect(() => {
    if (!raceKey) return;
    const poller = createResultPoller({
      startIso,
      getState: () => pollStateRef.current,
      refresh: () => { if (raceRef.current) loadResult(raceRef.current); },
    });
    pollerRef.current = poller;
    return () => poller.stop();
  }, [raceKey]);
  useEffect(() => { pollerRef.current?.notify(); }, [pollState]);

  const runners: ScenarioRunner[] = useMemo(() => race
    ? race.horses.filter(horse => typeof horse.no === "number" && !horse.withdrawn).map(horse => ({ no: horse.no as number, name: horse.name, style: normalizeStyle(horse.style) }))
    : demoField(), [race]);
  const seed = scenarioSeed(race?.race.race_key ?? "demo");
  const frame = scenarioFrame(runners, progress, pace, seed);
  const finalFrame = scenarioFrame(runners, 1, pace, seed);
  const phase = frame.phase;
  const picks = race ? pickCards(race) : null;
  const honmeiNo = picks?.honmei.available ? picks.honmei.horseNo : null;
  const unknownStyles = runners.filter(runner => runner.style === "不明").length;
  const raceTitle = race ? `${race.race.venue ?? "—"} ${race.race.race_no ?? "—"}R` : "デモ隊列（10頭・番号のみ）";
  const backPath = race?.race.race_key ? raceKeyToPath(race.race.race_key) : null;
  const pct = Math.round(progress * 100);
  const course = useMemo(() => resolveCourse(race?.race.venue ?? null, race?.race.surface ?? null, race?.race.distance ?? null), [race]);

  const restart = () => { setProgress(0); autoSwitched.current = false; setMode("SCENARIO"); setPlaying(true); };
  const togglePlay = () => { if (complete) { restart(); return; } setMode("SCENARIO"); setPlaying(value => !value); };

  return (
    <main className="broadcast simulator-shell kt-page">
      <LabServiceNavigation active="simulator" />
      <div className="kt-container">
        <JourneyRail step="simulator" raceKey={race?.race.race_key} />
        <header className="kt-sim-head">
          <div>
            <span className="kt-eyebrow"><FlaskConical size={12} aria-hidden="true" /> KEIBA TRACE / SCENARIO LAB</span>
            <h1>展開を読む、研究室。</h1>
            <p>仮想シミュレーション · {race ? "出走馬の公開脚質から作る隊列シナリオ" : "サンプルデータ未読込 · デモ隊列を表示中"}</p>
          </div>
          <span className="kt-research-badge" role="note">RESEARCH_ONLY<small>SIMULATION / SCENARIO</small></span>
        </header>
        <p className="kt-sim-notice">
          隊列は<strong>脚質と仮定ペースだけ</strong>から描いたシナリオです。実際のレース映像・通過順位・計測値ではなく、着順や走行中の勝率も算出しません。実AI予測は「本日の予想」ページをご覧ください。
        </p>

        <section className="kt-sim-controls" aria-label="シナリオ条件">
          <label>
            <span>開催日</span>
            <select value={date} onChange={event => setDate(event.target.value)} disabled={!dates.length}>
              {!dates.length ? <option value="">{date || "開催日を確認中"}</option> : null}
              {dates.map(item => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label>
            <span>レース</span>
            <select value={race?.race.race_key ?? (source.kind === "loading" || source.kind === "error" ? source.key : "")} onChange={event => loadRace(event.target.value)}>
              <option value="">デモ隊列（番号のみ）</option>
              {choices.map(item => <option key={item.race_key} value={item.race_key}>{item.venue} {item.race_no}R</option>)}
              {race && !choices.some(item => item.race_key === race.race.race_key) ? <option value={race.race.race_key ?? ""}>{race.race.date} {raceTitle}</option> : null}
            </select>
          </label>
          <label>
            <span>仮定ペース</span>
            <select value={pace} onChange={event => setPace(event.target.value as Pace)}>
              <option>スロー</option>
              <option>平均</option>
              <option>ハイ</option>
            </select>
          </label>
          <span className="kt-sim-assumption">pace scenario · {pace} <b className="kt-research-chip">RESEARCH_ONLY</b></span>
          {source.kind === "loading" ? <span role="status">出走馬を読み込み中…</span> : null}
          {source.kind === "error" ? <span role="alert">出走馬を取得できません。デモ隊列を表示しています。</span> : null}
        </section>

        <PreRacePanel race={race} />

        <div className="kt-mode-tabs" role="tablist" aria-label="表示モード">
          <button type="button" role="tab" aria-selected={mode === "SCENARIO"} className={mode === "SCENARIO" ? "is-current" : ""} onClick={() => setMode("SCENARIO")}>SCENARIO · 研究用</button>
          <button type="button" role="tab" aria-selected={mode === "RESULT"} className={mode === "RESULT" ? "is-current is-official" : ""} disabled={!race} onClick={() => { setPlaying(false); setMode("RESULT"); }}>RESULT · 公式結果</button>
        </div>

        {mode === "SCENARIO" ? (
          <div className="simulator-stage kt-sim-stage">
            <section className="track-shell kt-track" aria-label="研究用コース表示（シナリオ）">
              <header className="kt-track-head">
                <strong>{raceTitle}</strong>
                <span className="kt-phase-badge" aria-live="polite">{complete ? "SCENARIO COMPLETE" : `${phase} · ${PHASE_LABEL[phase]}`}</span>
              </header>
              <p className="kt-motion-note"><b>SCENARIO MOTION</b> 実測位置ではありません</p>
              <TrackView frame={frame} course={course} compact={compact} honmeiNo={honmeiNo} label={`${PHASE_LABEL[phase]}付近の隊列シナリオ。${frame.runners.length}頭。`} />
              <p className="kt-course-note">{courseNote(course)}</p>
              <div className="kt-phase-rail" role="group" aria-label="レース区間">
                {PHASES.map(item => <button type="button" key={item} className={item === phase ? "is-current" : PHASE_KEYFRAME[item] < progress ? "is-done" : ""} aria-pressed={item === phase} onClick={() => { setPlaying(false); setProgress(PHASE_KEYFRAME[item]); }}>{item}</button>)}
              </div>
              <footer className="kt-playback">
                <button type="button" className="kt-play" onClick={togglePlay} aria-label={playing ? "一時停止" : complete ? "もう一度再生" : "再生"}>{playing ? <Pause size={18} /> : <Play size={18} />}</button>
                <button type="button" onClick={() => { setPlaying(false); setProgress(0); setMode("SCENARIO"); autoSwitched.current = false; }} aria-label="最初から"><RotateCcw size={16} /></button>
                <label className="kt-scrubber">
                  <span className="kt-visually-hidden">Scenario progress</span>
                  <input type="range" min={0} max={1000} step={1} style={{ "--kt-fill": `${progress * 100}%` } as React.CSSProperties} value={Math.round(progress * 1000)} aria-valuetext={`Scenario progress ${pct}% · ${PHASE_LABEL[phase]}`} onChange={event => { setPlaying(false); setProgress(Number(event.target.value) / 1000); }} />
                </label>
                <div className="kt-speed" role="group" aria-label="再生倍率">
                  {SPEEDS.map(value => <button type="button" key={value} aria-pressed={speed === value} className={speed === value ? "is-current" : ""} onClick={() => setSpeed(value)}>{value}x</button>)}
                </div>
                <small className="kt-num">Scenario progress {pct}%</small>
              </footer>
              {complete ? <div className="kt-complete" role="status">
                <strong>SCENARIO COMPLETE</strong>
                {race ? confirmed
                  ? <button type="button" className="kt-cta kt-cta--official" onClick={() => setMode("RESULT")}>OFFICIAL RESULT AVAILABLE · 公式結果を見る</button>
                  : <span>{official && officialReady ? official.label : "公式結果を確認中"}</span>
                  : <span>デモ隊列には公式結果はありません。</span>}
              </div> : null}
            </section>

            <section className="order-shell kt-order" aria-label="隊列パネル（シナリオ）">
              <ScenarioOrderPanel runners={runners} pace={pace} seed={seed} progress={orderProgress} compact={compact} />
              <span className="kt-eyebrow">RUNNING ORDER · SCENARIO</span>
              <h2>隊列パネル</h2>
              <p>公式通過順位ではありません。脚質グループ内の並びは馬番順です。</p>
              <PositionStrip formation={formationAt(runners, phase, pace)} honmeiNo={honmeiNo} finish={phase === "FINISH"} />
              {unknownStyles ? <small>脚質が公開されていない{unknownStyles}頭は「脚質不明」として別枠表示しています。</small> : null}
              <ElevationPanel course={course} />
            </section>
          </div>
        ) : (
          <div className="kt-result-mode">
            <OfficialResultPanel view={official} loading={!officialReady} race={race} onRefresh={race ? () => loadResult(race) : undefined} />
            <section className="kt-result-scenario" aria-label="シナリオ（研究用）">
              <header><span className="kt-research-chip">SCENARIO</span><strong>研究用シナリオ（ゴール前）</strong></header>
              <p>脚質と仮定ペースから描いた隊列です。実際の展開を再現したものではなく、公式結果とは無関係です。</p>
              <TrackView frame={finalFrame} course={course} compact={compact} honmeiNo={honmeiNo} label="シナリオ終了時の隊列（順位なし）" />
            </section>
          </div>
        )}

        <p className="shell-notice">
          Scenario progress はシナリオ再生の進み具合で、レース経過時間ではありません。走行中の計測値や勝率更新は提供しません。
        </p>
        <nav className="kt-cta-row" aria-label="次の操作">
          {backPath ? <Link href={backPath} className="kt-cta kt-cta--primary">このレースの予想に戻る</Link> : <Link href="/" className="kt-cta kt-cta--primary">本日の予想へ</Link>}
          <Link href="/ai-history#race-ledger" className="kt-cta">結果を見る</Link>
        </nav>
      </div>
    </main>
  );
}

/** Open (straight) course: extend the band a little past both ends so runners on the start / goal lines stay on the track. */
function capped(band: { x: number; y: number }[], pad: number) {
  const xs = band.map(p => p.x), lo = Math.min(...xs), hi = Math.max(...xs);
  return band.map(p => ({ x: p.x <= lo + 0.5 ? p.x - pad : p.x >= hi - 0.5 ? p.x + pad : p.x, y: p.y }));
}

function courseNote(course: CourseLayout): string {
  const turn = course.direction === "LEFT" ? "左回り" : course.direction === "RIGHT" ? "右回り" : course.direction === "STRAIGHT" ? "直線コース" : "回り方向: 未確認(UNKNOWN)";
  const variant = course.variant === "INNER" ? "内回り" : course.variant === "OUTER" ? "外回り" : course.variant === "UNKNOWN" && course.lapMeters === "UNKNOWN" && course.direction !== "UNKNOWN" ? "内外区分: 未確認" : "";
  const start = course.startLapShare === "UNKNOWN"
    ? "スタート位置: 未確認(UNKNOWN)・ゴール線起点の概略"
    : course.pathClosed ? "スタート位置: 周回距離と発走距離からの概算（公式図の読取ではありません）" : "";
  const name = course.venue === "UNKNOWN" ? "汎用コース" : `${course.venue}${course.surface === "TURF" ? "芝" : course.surface === "DIRT" ? "ダート" : ""}${course.distance === "UNKNOWN" ? "" : course.distance}`;
  return [name, turn, variant, start].filter(Boolean).join(" · ") + `。${GEOMETRY_DISCLAIMER}`;
}

function TrackView({ frame, course, compact, honmeiNo, label }: { frame: ScenarioFrame; course: CourseLayout; compact: boolean; honmeiNo: number | null; label: string }) {
  const g = compact ? GEOMETRY.compact : GEOMETRY.wide;
  const margin = 4.2 * g.laneX + 8;
  const closed = course.pathClosed;
  const pxPath = useMemo(() => fitPath(course.path, g.w, g.h, margin), [course, g.w, g.h, margin]);
  const startShare = course.startLapShare === "UNKNOWN" ? 0 : course.startLapShare;
  // The frame's lap runs 0..~1 over the race; on the course it covers `raceLaps` laps ending at the goal line.
  const at = (share: number, offset: number) => pointOnPath(pxPath, share, offset * g.laneX, closed);
  const point = (lap: number, lane: number) => at(closed ? startShare + lap * course.raceLaps : lap, lane);
  const edge = (offset: number) => Array.from({ length: 96 }, (_, i) => at(closed ? i / 96 : i / 95, offset));
  const toPoints = (list: { x: number; y: number }[]) => list.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const goalShare = closed ? 0 : 1;
  const goalIn = at(goalShare, -1.6), goalOut = at(goalShare, 4.2);
  const startIn = at(closed ? startShare : 0, -1.6), startOut = at(closed ? startShare : 0, 4.2);
  const startKnown = course.startLapShare !== "UNKNOWN";
  // Draw the ◎ last so it stays on top; otherwise horse-number order.
  const runners = [...frame.runners].sort((a, b) => Number(a.no === honmeiNo) - Number(b.no === honmeiNo) || a.no - b.no);
  // FINISH window: the level field fades out short of the line. The
  // scenario ends there; it never draws anyone crossing first.
  const fade = frame.progress <= 0.95 ? 1 : Math.max(0.25, 1 - (frame.progress - 0.95) / 0.05 * 0.75);
  return <svg className="kt-track-svg" viewBox={`0 0 ${g.w} ${g.h}`} role="img" aria-label={label} data-course={`${course.venue}-${course.surface}-${course.distance}`} data-direction={course.direction} data-start-share={String(course.startLapShare)}>
    {closed ? <>
      <polygon points={toPoints(edge(4.2))} className="kt-track-outer" />
      <polygon points={toPoints(edge(-1.6))} className="kt-track-inner" />
    </> : <polygon points={toPoints(capped([...edge(4.2), ...edge(-1.6).reverse()], g.r + 2))} className="kt-track-outer" />}
    {closed ? course.corners.map((corner, index) => {
      const pos = pointOnPath(pxPath, cornerShare(course, index), 6.2 * g.laneX);
      return <text key={corner.label} x={pos.x} y={pos.y + 4} className="kt-corner" data-corner={corner.label}>{corner.label}</text>;
    }) : null}
    {startKnown ? <line x1={startIn.x} y1={startIn.y} x2={startOut.x} y2={startOut.y} className="kt-track-start" data-start="true" /> : null}
    {startKnown ? <text x={startOut.x} y={startOut.y + (startOut.y > g.h / 2 ? 14 : -6)} className="kt-track-label kt-track-label--start">START</text> : null}
    <line x1={goalIn.x} y1={goalIn.y} x2={goalOut.x} y2={goalOut.y} className="kt-track-post" data-goal="true" />
    <text x={goalOut.x + 6} y={goalOut.y + 14} className="kt-track-label">GOAL</text>
    {runners.map(runner => {
      const p = point(runner.lap, runner.lane);
      return <g key={runner.no} data-runner={runner.no} className={`kt-dot${runner.no === honmeiNo ? " is-honmei" : ""}${runner.style === "不明" ? " is-unknown" : ""}`} opacity={fade} transform={`translate(${p.x.toFixed(2)} ${p.y.toFixed(2)})`}>
        <circle r={g.r} />
        <text dy="4">{runner.no}</text>
      </g>;
    })}
    {frame.progress > 0.95 ? <text x={g.w / 2} y={g.h / 2 + 4} className="kt-track-end">ゴール前でシナリオ終了 · 着順は描きません</text> : null}
  </svg>;
}

function PreRacePanel({ race }: { race: LabRace | null }) {
  const cards = race ? pickCards(race) : null;
  const placeholder = (kind: PickCard["kind"]): PickCard => ({ kind, available: false, mark: null, horseNo: null, horseName: null, probability: null, odds: null, reason: "レースを選ぶと表示します", caution: null });
  return <section className="kt-prerace" aria-label="発走前の固定情報">
    <header>
      <span className="kt-eyebrow">PRE-RACE · 発走前の固定情報</span>
      <small>再生中に更新しません。走行中の勝率ではありません。</small>
      {race ? <VerdictChip verdict={verdictOf(race)} /> : <span className="kt-verdict kt-verdict--unknown"><b>UNAVAILABLE</b></span>}
    </header>
    <div className="kt-prerace-cards">
      <PickCardView card={cards?.honmei ?? placeholder("HONMEI")} compact />
      <PickCardView card={cards?.aiTop ?? placeholder("AI_TOP")} compact />
      <PickCardView card={cards?.marketTop ?? placeholder("MARKET_TOP")} compact />
      <article className="kt-pick kt-pick--sim kt-pick--compact"><header><span className="kt-pick-tag">SIM</span><small>研究SIM</small></header>
        <div className="kt-pick-unavailable"><strong>RESEARCH_ONLY</strong><small>シナリオは勝率を計算しません。</small></div></article>
    </div>
  </section>;
}

export function OfficialResultPanel({ view, loading, race, onRefresh }: { view: OfficialResultView | null; loading: boolean; race: LabRace | null; onRefresh?: () => void }) {
  if (!race || !view) return <section className="kt-official is-muted" aria-label="公式結果"><p>レースを選ぶと公式結果を確認できます。</p></section>;
  const refresh = onRefresh ? <button type="button" className="kt-cta" onClick={onRefresh} disabled={loading}><RefreshCw size={14} aria-hidden="true" /> {loading ? "確認中…" : "公式結果を再取得"}</button> : null;
  if (loading) return <section className="kt-official is-muted" aria-label="公式結果" aria-busy="true"><strong>公式結果を確認中…</strong></section>;
  if (view.state !== "CONFIRMED") {
    return <section className={`kt-official kt-official--${view.state.toLowerCase()}`} aria-label="公式結果の状態">
      <span className="kt-canonical">CANONICAL RESULT API</span>
      <strong className="kt-official-state">{view.label}</strong>
      <p>{view.message}</p>
      {refresh}
    </section>;
  }
  const podium = [2, 1, 3].map(finish => view.top3.filter(entry => entry.finish === finish)).flat();
  return <section className="kt-official kt-official--confirmed" aria-label="公式結果">
    <header><span className="kt-canonical">CANONICAL · 公式確定</span><strong className="kt-official-state"><Trophy size={18} aria-hidden="true" /> {view.label}</strong>{view.deadHeat ? <em>同着あり</em> : null}</header>
    {view.top3.length ? <ol className="kt-podium" aria-label="公式1〜3着">{podium.map(entry => <li key={`${entry.finish}-${entry.horseNo}`} className={`kt-podium-${entry.finish}${entry.horseNo === view.honmei.horseNo ? " is-honmei" : ""}`}>
      <b className="kt-num">{entry.finish}着</b><span className="kt-horse-no">{entry.horseNo}</span><strong>{entry.horseName ?? "馬名取得不能"}</strong>{entry.horseNo === view.honmei.horseNo ? <em aria-label="公開本命">◎</em> : null}
    </li>)}</ol> : <p>{view.message}</p>}
    <dl className="kt-official-picks">
      <div className="is-honmei"><dt>公開◎{view.honmei.horseNo ? ` #${view.honmei.horseNo}` : ""}</dt><dd>{view.honmei.finish}</dd></div>
      <div className="is-ai"><dt>AI TOP{view.aiTop.horseNo ? ` #${view.aiTop.horseNo}` : ""}</dt><dd>{view.aiTop.finish}</dd></div>
      <div className="is-market"><dt>MARKET TOP{view.marketTop.horseNo ? ` #${view.marketTop.horseNo}` : ""}</dt><dd>{view.marketTop.finish}</dd></div>
      <div><dt>top3 coverage</dt><dd className="kt-num">{view.coverage}</dd></div>
    </dl>
    {view.specials ? <p className="kt-official-special">{view.specials}</p> : null}
    <small>AI TOP / MARKET TOP の着順は公式上位5着までで照合します（6着以下は「6着以下」）。</small>
    {refresh}
  </section>;
}

function PositionStrip({ formation, honmeiNo, finish }: { formation: ScenarioPosition[]; honmeiNo: number | null; finish: boolean }) {
  const groups = (["前団", "中団", "後方", "脚質不明", "ゴール前（順位なし）"] as const).map(group => [group, formation.filter(runner => runner.group === group)] as const).filter(([, list]) => list.length);
  return <div className="kt-strip">
    {finish ? <p className="kt-strip-note">ゴール前は隊列が収束します。シナリオは着順を描きません（馬番順に表示）。</p> : null}
    {groups.map(([group, list]) => <div key={group} className="kt-strip-group">
      <small>{group}</small>
      <ol>{list.map(runner => <li key={runner.no} className={runner.no === honmeiNo ? "is-honmei" : ""}>
        <span className="kt-horse-no">{runner.no}</span><span>{runner.name ?? `${runner.no}番`}</span><em>{runner.style}</em>
      </li>)}</ol>
    </div>)}
  </div>;
}
