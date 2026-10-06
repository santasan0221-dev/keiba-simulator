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
import { TrackStage } from "@/components/trace/TrackStage";
import { CameraSelector } from "@/components/trace/CameraSelector";
import { createThrottledEmitter, crossingSequence } from "@/lib/scenarioOrder";
import { createSimulatorTracker } from "@/lib/simulatorAnalytics";
import { buildTerrainProfile, tempoAt, TERRAIN_LABEL_JA, TERRAIN_NOTE, type TerrainProfile } from "@/lib/terrainTempo";
import { buildHorseProfiles, horseHistoryOf, type HorseHistory } from "@/lib/horseScenarioProfile";
import { buildScenarioField } from "@/lib/scenarioRunnerField";
import { GEOMETRY_DISCLAIMER, resolveCourse, type CourseLayout } from "@/lib/courseAtlas";
import { createProgressStore } from "@/lib/progressStore";
import { type CameraMode } from "@/lib/camera";
import { courseFacts, courseShare, SECTION_LABEL, SECTION_LABEL_JA, sectionAt } from "@/lib/courseSections";
import {
  demoField,
  formationAt,
  normalizeStyle,
  PHASE_KEYFRAME,
  PHASE_LABEL,
  PHASES,
  scenarioFrame,
  scenarioSeedFor,
  STANDARD_VARIANT,
  type Pace,
  type ScenarioPosition,
  type ScenarioRunner,
} from "@/lib/scenarioReplay";

// Scenario progress runs 0..1 over SCENARIO_MS at 1x. It is playback of an
// illustration, not race time: nothing on screen is labelled in seconds.
const SCENARIO_MS = 30_000;
const SPEEDS = [1, 1.5, 2] as const;
// React state (progress label, SCENARIO ORDER, section) follows at ~8 Hz; the track itself is
// written straight to the DOM every animation frame by TrackStage, so nothing re-renders per frame.
const ORDER_TABLE_MS = 125;

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
  const store = useMemo(() => createProgressStore(0), []);
  const [progress, setProgressState] = useState(0);
  const [cameraMode, setCameraMode] = useState<CameraMode>("AUTO");
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
  // Anonymous playback analytics (lib/simulatorAnalytics): fixed enumerations only, through the beta contract.
  const tracker = useMemo(() => createSimulatorTracker(trackBetaEvent), []);
  const playingRef = useRef(false);
  const resultSource = useRef<"auto" | "tab">("tab");
  const previousMode = useRef<Mode>("SCENARIO");
  // Course tempo (common to every runner); the playback loop reads it through a ref.
  const terrainRef = useRef<TerrainProfile | null>(null);

  // Throttled React view of the progress: pushed at most every ORDER_TABLE_MS while playing; any
  // user action (scrub, pause, restart) shows at once.
  const emitterRef = useRef<ReturnType<typeof createThrottledEmitter<number>> | null>(null);
  useEffect(() => {
    const emitter = createThrottledEmitter<number>(ORDER_TABLE_MS, setProgressState, {
      now: () => performance.now(),
      setTimeout: (fn, ms) => window.setTimeout(fn, ms),
      clearTimeout: id => window.clearTimeout(id),
    });
    emitterRef.current = emitter;
    return () => { emitter.stop(); emitterRef.current = null; };
  }, []);
  const seek = useCallback((value: number) => {
    store.set(value);
    if (emitterRef.current) emitterRef.current.now(store.get()); else setProgressState(store.get());
  }, [store]);

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
    seek(0);
    tracker.onScenarioChange();
    setMode("SCENARIO");
    autoSwitched.current = false;
    setResult({ status: "idle", row: null });
    if (!key) { setSource({ kind: "demo" }); return; }
    setSource({ kind: "loading", key });
    fetchRace(key).then(value => { setSource({ kind: "race", race: value }); loadResult(value); }).catch(() => setSource({ kind: "error", key }));
  }, [loadResult, seek]);

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

  // Playback. requestAnimationFrame advances the progress store (read by TrackStage for the DOM
  // updates); React state follows through the throttled emitter. With prefers-reduced-motion the
  // scenario steps keyframe to keyframe instead.
  useEffect(() => {
    if (!playing || reducedMotion) return;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const delta = Math.min(100, now - last);
      last = now;
      // The course tempo scales how fast the whole scenario advances (0.94..1.06), never one runner.
      const rate = terrainRef.current ? tempoAt(terrainRef.current, store.get()).paceMultiplier : 1;
      const next = Math.min(1, store.get() + (delta / SCENARIO_MS) * speed * rate);
      store.set(next);
      if (next >= 1) emitterRef.current?.now(1); else emitterRef.current?.push(next);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, speed, reducedMotion, store]);

  useEffect(() => {
    if (!playing || !reducedMotion) return;
    const next = PHASES.map(phase => PHASE_KEYFRAME[phase]).find(value => value > progress + 1e-6);
    if (next === undefined) return;
    const timer = window.setTimeout(() => seek(next), 1800 / speed);
    return () => window.clearTimeout(timer);
  }, [playing, reducedMotion, speed, progress, seek]);

  const complete = progress >= 1;
  useEffect(() => { if (complete) setPlaying(false); }, [complete]);

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
    const timer = window.setTimeout(() => { resultSource.current = "auto"; setMode("RESULT"); }, 2000);
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
  const seed = scenarioSeedFor(race?.race.race_key ?? "demo", STANDARD_VARIANT);
  const course = useMemo(() => resolveCourse(race?.race.venue ?? null, race?.race.surface ?? null, race?.race.distance ?? null), [race]);
  const terrain = useMemo(() => buildTerrainProfile(course), [course]);
  terrainRef.current = terrain;
  // Pre-race horse profiles (history only) and the whole scenario field (course tempo + per-runner offsets),
  // built once per race; jump races have no course model, so their profiles stay neutral.
  const profiles = useMemo(() => race && course.surface !== "JUMP"
    ? buildHorseProfiles(race.horses.map(horseHistoryOf).filter((history): history is HorseHistory => history !== null), { organization: race.race.organization, going: race.race.going })
    : undefined, [race, course]);
  const field = useMemo(() => buildScenarioField({ terrain, runners, profiles, seed }), [terrain, runners, profiles, seed]);
  // Progress at which the LAST runner crosses the goal line: the canonical "complete" for analytics.
  const lastCrossT = useMemo(() => { const sequence = crossingSequence(runners, pace, seed, field); return sequence.length ? sequence[sequence.length - 1].t : null; }, [runners, pace, seed, field]);
  playingRef.current = playing;
  useEffect(() => { if (playing) tracker.onPlay(store.get()); }, [playing, tracker, store]);
  useEffect(() => { tracker.onProgress(progress, lastCrossT); }, [progress, lastCrossT, tracker]);
  // A different race or pace is a different scenario; playback that continues across a pace change counts as a new playback.
  useEffect(() => { tracker.onScenarioChange(); if (playingRef.current) tracker.onPlay(store.get()); }, [raceKey, pace, tracker, store]);
  useEffect(() => {
    if (mode === "RESULT" && previousMode.current !== "RESULT") { tracker.onOfficialResultView(resultSource.current); resultSource.current = "tab"; }
    previousMode.current = mode;
  }, [mode, tracker]);
  const changeCamera = useCallback((next: CameraMode) => { if (next !== cameraMode) tracker.onCameraChange(next); setCameraMode(next); }, [cameraMode, tracker]);
  const frame = scenarioFrame(runners, progress, pace, seed, field);
  const phase = frame.phase;
  const packLap = frame.runners.length ? frame.runners.reduce((sum, runner) => sum + runner.lap, 0) / frame.runners.length : 0;
  const picks = race ? pickCards(race) : null;
  const honmeiNo = picks?.honmei.available ? picks.honmei.horseNo : null;
  const unknownStyles = runners.filter(runner => runner.style === "不明").length;
  const raceTitle = race ? `${race.race.venue ?? "—"} ${race.race.race_no ?? "—"}R` : "デモ隊列（10頭・番号のみ）";
  const backPath = race?.race.race_key ? raceKeyToPath(race.race.race_key) : null;
  const pct = Math.round(progress * 100);
  const terrainLabel = tempoAt(terrain, progress).label;
  const section = sectionAt(course, courseShare(course, packLap), progress);
  const facts = useMemo(() => courseFacts(course), [course]);

  const restart = () => { tracker.onRestart(); seek(0); autoSwitched.current = false; setMode("SCENARIO"); setPlaying(true); };
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
          隊列は<strong>脚質と仮定ペースだけ</strong>から描いたシナリオです。実際のレース映像・通過順位・計測値ではなく、着順の予測や走行中の勝率は算出しません（ゴール通過順はシナリオ上の仮想順です）。実AI予測は「本日の予想」ページをご覧ください。
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
                <span className="kt-section-chip" aria-live="polite" data-section={complete ? "COMPLETE" : section}>{complete ? "SCENARIO COMPLETE" : <>SECTION · {SECTION_LABEL[section]}<small> {SECTION_LABEL_JA[section]}</small></>}</span>
                <span className="kt-phase-badge" aria-live="polite">{complete ? "SCENARIO COMPLETE" : `${phase} · ${PHASE_LABEL[phase]}`}</span>
              </header>
              <p className="kt-motion-note"><b>SCENARIO MOTION</b> <b>SCENARIO POSITION</b> 実測位置ではありません</p>
              <p className="kt-terrain-note" data-terrain={terrainLabel ?? "NONE"}><b>COURSE EFFECT</b> {terrainLabel ? TERRAIN_LABEL_JA[terrainLabel] : "—"} · {TERRAIN_NOTE}</p>
              <TrackStage store={store} runners={runners} pace={pace} seed={seed} course={course} compact={compact} cameraMode={cameraMode} reducedMotion={reducedMotion} honmeiNo={honmeiNo} terrain={terrain} field={field} label={`${PHASE_LABEL[phase]}付近の隊列シナリオ。${runners.length}頭。`} />
              <CameraSelector mode={cameraMode} onChange={changeCamera} reducedMotion={reducedMotion} />
              <ul className="kt-course-facts" aria-label="コースの特徴（Course Atlas）">{facts.map(fact => <li key={fact}>{fact}</li>)}</ul>
              <p className="kt-course-note">{courseNote(course)}</p>
              <div className="kt-phase-rail" role="group" aria-label="レース区間">
                {PHASES.map(item => <button type="button" key={item} className={item === phase ? "is-current" : PHASE_KEYFRAME[item] < progress ? "is-done" : ""} aria-pressed={item === phase} onClick={() => { setPlaying(false); tracker.onSeek(PHASE_KEYFRAME[item]); seek(PHASE_KEYFRAME[item]); }}>{item}</button>)}
              </div>
              <footer className="kt-playback">
                <button type="button" className="kt-play" onClick={togglePlay} aria-label={playing ? "一時停止" : complete ? "もう一度再生" : "再生"}>{playing ? <Pause size={18} /> : <Play size={18} />}</button>
                <button type="button" onClick={() => { setPlaying(false); tracker.onRestart(); seek(0); setMode("SCENARIO"); autoSwitched.current = false; }} aria-label="最初から"><RotateCcw size={16} /></button>
                <label className="kt-scrubber">
                  <span className="kt-visually-hidden">Scenario progress</span>
                  <input type="range" min={0} max={1000} step={1} style={{ "--kt-fill": `${progress * 100}%` } as React.CSSProperties} value={Math.round(progress * 1000)} aria-valuetext={`Scenario progress ${pct}% · ${PHASE_LABEL[phase]}`} onChange={event => { setPlaying(false); tracker.onSeek(Number(event.target.value) / 1000); seek(Number(event.target.value) / 1000); }} />
                </label>
                <div className="kt-speed" role="group" aria-label="再生倍率">
                  {SPEEDS.map(value => <button type="button" key={value} aria-pressed={speed === value} className={speed === value ? "is-current" : ""} onClick={() => setSpeed(value)}>{value}x</button>)}
                </div>
                <small className="kt-num">Scenario progress {pct}%</small>
              </footer>
              {complete ? <div className="kt-complete" role="status">
                <strong>SCENARIO COMPLETE</strong>
                <span>この通過順は着順予測ではありません</span>
                <div className="kt-complete-actions">
                  <button type="button" className="kt-cta" onClick={restart}><RotateCcw size={14} aria-hidden="true" /> REPLAY · もう一度見る</button>
                  {race ? confirmed
                    ? <button type="button" className="kt-cta kt-cta--official" onClick={() => setMode("RESULT")}>RESULT · 公式結果を見る</button>
                    : <span>{official && officialReady ? official.label : "公式結果を確認中"}</span>
                    : <span>デモ隊列には公式結果はありません。</span>}
                </div>
              </div> : null}
            </section>

            <section className="order-shell kt-order" aria-label="隊列パネル（シナリオ）">
              <ScenarioOrderPanel runners={runners} pace={pace} seed={seed} progress={progress} compact={compact} gapField={field} />
              <span className="kt-eyebrow">RUNNING ORDER · SCENARIO</span>
              <h2>隊列パネル</h2>
              <p>公式通過順位ではありません。脚質グループ内の並びは馬番順です。</p>
              <PositionStrip formation={formationAt(runners, phase, pace, seed)} honmeiNo={honmeiNo} />
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
              <TrackStage fixedProgress={1} runners={runners} pace={pace} seed={seed} course={course} compact={compact} cameraMode="TRACK" reducedMotion={reducedMotion} honmeiNo={honmeiNo} terrain={terrain} field={field} label="シナリオ終了時の隊列（順位なし）" />
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

function courseNote(course: CourseLayout): string {
  const turn = course.direction === "LEFT" ? "左回り" : course.direction === "RIGHT" ? "右回り" : course.direction === "STRAIGHT" ? "直線コース" : "回り方向: 未確認(UNKNOWN)";
  const variant = course.variant === "INNER" ? "内回り" : course.variant === "OUTER" ? "外回り" : course.variant === "UNKNOWN" && course.lapMeters === "UNKNOWN" && course.direction !== "UNKNOWN" ? "内外区分: 未確認" : "";
  const start = course.startLapShare === "UNKNOWN"
    ? `スタート位置: 未確認(UNKNOWN)${course.startNote ? `（${course.startNote}）` : ""}・ゴール線起点の概略`
    : course.basis.startPoint === "OFFICIAL_DIAGRAM_APPROXIMATION" ? `スタート位置: 公式コース図からの近似${course.startNote ? `（${course.startNote}）` : ""}`
    : course.pathClosed ? "スタート位置: 周回距離と発走距離からの概算（公式図の読取ではありません）" : "";
  const name = course.venue === "UNKNOWN" ? "汎用コース" : `${course.venue}${course.surface === "TURF" ? "芝" : course.surface === "DIRT" ? "ダート" : ""}${course.distance === "UNKNOWN" ? "" : course.distance}`;
  return [name, turn, variant, start].filter(Boolean).join(" · ") + `。${GEOMETRY_DISCLAIMER}`;
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

function PositionStrip({ formation, honmeiNo }: { formation: ScenarioPosition[]; honmeiNo: number | null }) {
  const groups = (["前団", "中団", "後方", "脚質不明"] as const).map(group => [group, formation.filter(runner => runner.group === group)] as const).filter(([, list]) => list.length);
  return <div className="kt-strip">
    {groups.map(([group, list]) => <div key={group} className="kt-strip-group">
      <small>{group}</small>
      <ol>{list.map(runner => <li key={runner.no} className={runner.no === honmeiNo ? "is-honmei" : ""}>
        <span className="kt-horse-no">{runner.no}</span><span>{runner.name ?? `${runner.no}番`}</span><em>{runner.style}</em>
      </li>)}</ol>
    </div>)}
  </div>;
}
