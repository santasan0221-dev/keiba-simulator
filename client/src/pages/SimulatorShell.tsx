import React, { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { ChevronLeft, ChevronRight, FlaskConical, Pause, Play, RotateCcw } from "lucide-react";
import { LabServiceNavigation } from "@/components/LabServiceNavigation";
import { JourneyRail } from "@/components/trace/TraceChrome";
import { fetchAvailablePredictionDates, fetchRace, fetchRaces, type LabRace, type LabRaceListItem } from "@/lib/singlePickAi";
import { pickCards } from "@/lib/raceView";
import { formatPercent } from "@/lib/displayFormat";
import { raceKeyToPath } from "@/lib/raceShareUrl";
import {
  demoField,
  formationAt,
  normalizeStyle,
  PHASE_LABEL,
  PHASE_PROGRESS,
  PHASES,
  type Pace,
  type ScenarioPosition,
  type ScenarioRunner,
} from "@/lib/scenarioReplay";

// Track geometry (SVG user units). The field runs anticlockwise from the
// home straight; a runner's point is the phase progress minus its scenario
// gap. Purely illustrative -- no distances or speeds are drawn to scale.
const CX = 320, CY = 150, RX = 262, RY = 100, LENGTH_SHARE = 0.013;
function trackPoint(progress: number, lane: number) {
  const theta = Math.PI / 2 - progress * Math.PI * 2;
  return { x: CX + (RX + lane * 11) * Math.cos(theta), y: CY + (RY + lane * 9) * Math.sin(theta) };
}

function prefersReducedMotion() {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

type Source = { kind: "demo" } | { kind: "loading"; key: string } | { kind: "race"; race: LabRace } | { kind: "error"; key: string };

export default function SimulatorShell() {
  const [pace, setPace] = useState<Pace>("平均");
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [source, setSource] = useState<Source>({ kind: "demo" });
  const [choices, setChoices] = useState<LabRaceListItem[]>([]);

  // Race choices + optional ?race= hand-off from a race page. Only the field
  // (numbers, names, published run styles) and pre-race AI/market tops are read.
  useEffect(() => {
    let live = true;
    const requested = new URLSearchParams(window.location.search).get("race");
    if (requested) loadRace(requested);
    fetchAvailablePredictionDates().then(dates => {
      const date = dates.latest_prediction_date;
      if (!date) return;
      return Promise.allSettled([fetchRaces(date, "JRA"), fetchRaces(date, "NAR")]).then(results => {
        if (live) setChoices(results.flatMap(entry => entry.status === "fulfilled" ? entry.value.races : []).sort((a, b) => (a.scheduled_start_at ?? "").localeCompare(b.scheduled_start_at ?? "")));
      });
    }).catch(() => undefined);
    return () => { live = false; };
  }, []);

  function loadRace(key: string) {
    setPlaying(false);
    setPhaseIndex(0);
    if (!key) { setSource({ kind: "demo" }); return; }
    setSource({ kind: "loading", key });
    fetchRace(key).then(race => setSource({ kind: "race", race })).catch(() => setSource({ kind: "error", key }));
  }

  useEffect(() => {
    if (!playing) return;
    if (phaseIndex >= PHASES.length - 1) { setPlaying(false); return; }
    const timer = window.setTimeout(() => setPhaseIndex(index => Math.min(PHASES.length - 1, index + 1)), prefersReducedMotion() ? 2200 : 1500);
    return () => window.clearTimeout(timer);
  }, [playing, phaseIndex]);

  const race = source.kind === "race" ? source.race : null;
  const runners: ScenarioRunner[] = useMemo(() => race
    ? race.horses.filter(horse => typeof horse.no === "number" && !horse.withdrawn).map(horse => ({ no: horse.no as number, name: horse.name, style: normalizeStyle(horse.style) }))
    : demoField(), [race]);
  const phase = PHASES[phaseIndex];
  const formation = formationAt(runners, phase, pace);
  const picks = race ? pickCards(race) : null;
  const unknownStyles = runners.filter(runner => runner.style === "不明").length;
  const raceTitle = race ? `${race.race.venue ?? "—"} ${race.race.race_no ?? "—"}R` : "デモ隊列（10頭・番号のみ）";
  const backPath = race?.race.race_key ? raceKeyToPath(race.race.race_key) : null;

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
          この画面は研究用のシナリオ表示です。隊列は<strong>脚質と仮定ペースだけ</strong>から描いたイメージで、実際のレース映像・通過順位・計測値ではありません。着順や走行中の勝率も算出しません。実AI予測は「本日の予想」ページをご覧ください。
        </p>

        <section className="kt-sim-controls" aria-label="シナリオ条件">
          <label>
            <span>レース</span>
            <select value={race?.race.race_key ?? (source.kind === "loading" || source.kind === "error" ? source.key : "")} onChange={event => loadRace(event.target.value)}>
              <option value="">デモ隊列（番号のみ）</option>
              {choices.map(item => <option key={item.race_key} value={item.race_key}>{item.venue} {item.race_no}R</option>)}
              {race && !choices.some(item => item.race_key === race.race.race_key) ? <option value={race.race.race_key ?? ""}>{raceTitle}</option> : null}
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

        <div className="simulator-stage kt-sim-stage">
          <section className="track-shell kt-track" aria-label="研究用コース表示（シナリオ）">
            <header className="kt-track-head">
              <strong>{raceTitle}</strong>
              <span className="kt-phase-badge" aria-live="polite">{phase} · {PHASE_LABEL[phase]}</span>
            </header>
            <svg viewBox="0 0 640 300" role="img" aria-label={`${PHASE_LABEL[phase]}時点の隊列シナリオ。${formation.length}頭。`}>
              <ellipse cx={CX} cy={CY} rx={RX + 48} ry={RY + 38} className="kt-track-outer" />
              <ellipse cx={CX} cy={CY} rx={RX - 16} ry={RY - 14} className="kt-track-inner" />
              <line x1={CX} y1={CY + RY - 20} x2={CX} y2={CY + RY + 32} className="kt-track-post" />
              <text x={CX + 6} y={CY + RY + 44} className="kt-track-label">GOAL</text>
              {formation.map(runner => {
                const lane = runner.style === "不明" ? 3 : { 逃げ: 0, 先行: 1, 差し: 2, 追込: 3 }[runner.style];
                const point = trackPoint(Math.max(0, PHASE_PROGRESS[phase] - runner.lengthsBehind * LENGTH_SHARE), lane);
                const isHonmei = picks?.honmei.available && picks.honmei.horseNo === runner.no;
                return <g key={runner.no} className={`kt-dot${isHonmei ? " is-honmei" : ""}${runner.style === "不明" ? " is-unknown" : ""}`} style={{ transform: `translate(${point.x}px, ${point.y}px)` }}>
                  <circle r="11" />
                  <text dy="4">{runner.no}</text>
                </g>;
              })}
            </svg>
            <div className="kt-phase-rail" role="group" aria-label="レース区間">
              {PHASES.map((item, index) => <button type="button" key={item} className={index === phaseIndex ? "is-current" : index < phaseIndex ? "is-done" : ""} aria-pressed={index === phaseIndex} onClick={() => { setPlaying(false); setPhaseIndex(index); }}>{item}</button>)}
            </div>
            <footer className="kt-playback">
              <button type="button" onClick={() => setPhaseIndex(index => Math.max(0, index - 1))} aria-label="前の区間"><ChevronLeft size={18} /></button>
              <button type="button" className="kt-play" onClick={() => { if (phaseIndex >= PHASES.length - 1) setPhaseIndex(0); setPlaying(value => !value); }} aria-label={playing ? "一時停止" : "再生"}>{playing ? <Pause size={18} /> : <Play size={18} />}</button>
              <button type="button" onClick={() => setPhaseIndex(index => Math.min(PHASES.length - 1, index + 1))} aria-label="次の区間"><ChevronRight size={18} /></button>
              <button type="button" onClick={() => { setPlaying(false); setPhaseIndex(0); }} aria-label="最初から"><RotateCcw size={16} /></button>
              <div className="kt-playback-progress" role="progressbar" aria-label="シナリオ再生進捗" aria-valuemin={0} aria-valuemax={PHASES.length - 1} aria-valuenow={phaseIndex}><span style={{ "--kt-fill": `${(phaseIndex / (PHASES.length - 1)) * 100}%` } as React.CSSProperties} /></div>
              <small>再生進捗 {phaseIndex + 1}/{PHASES.length} · SCENARIO</small>
            </footer>
          </section>

          <section className="order-shell kt-order" aria-label="隊列パネル（シナリオ）">
            <span className="kt-eyebrow">RUNNING ORDER · SCENARIO</span>
            <h2>隊列パネル</h2>
            <p>公式通過順位ではありません。脚質グループ内の並びは馬番順です。</p>
            <PositionStrip formation={formation} honmeiNo={picks?.honmei.available ? picks.honmei.horseNo : null} finish={phase === "FINISH"} />
            {unknownStyles ? <small>脚質が公開されていない{unknownStyles}頭は「脚質不明」として別枠表示しています。</small> : null}
          </section>
        </div>

        <section className="probability-panels kt-origin-panels" aria-label="確率の出典別パネル">
          <article className="probability-panel origin-ai">
            <span className="kt-eyebrow">AI</span>
            <h2>事前AI推定</h2>
            <strong className="kt-num">{picks?.aiTop.available ? formatPercent(picks.aiTop.probability) : "—"}</strong>
            <span className="broadcast-badge">{picks?.aiTop.available ? `AI評価1位 #${picks.aiTop.horseNo}` : "UNAVAILABLE"}</span>
            <p>{picks?.aiTop.available ? "発走前に確定した値。展開中に更新しません。" : picks ? picks.aiTop.reason : "レースを選ぶと発走前のAI評価1位を表示します。"}</p>
          </article>
          <article className="probability-panel origin-market">
            <span className="kt-eyebrow">MARKET</span>
            <h2>市場評価</h2>
            <strong className="kt-num">{picks?.marketTop.available ? formatPercent(picks.marketTop.probability) : "—"}</strong>
            <span className="broadcast-badge">{picks?.marketTop.available ? `市場評価1位 #${picks.marketTop.horseNo}` : "UNAVAILABLE"}</span>
            <p>{picks?.marketTop.available ? "発走前オッズ由来。展開中に更新しません。" : picks ? picks.marketTop.reason : "同一レースの市場データ未接続。"}</p>
          </article>
          <article className="probability-panel origin-sim">
            <span className="kt-eyebrow">SIM</span>
            <h2>研究SIM</h2>
            <strong>—</strong>
            <span className="broadcast-badge">RESEARCH_ONLY</span>
            <p>シナリオは勝率を計算しません。隊列イメージのみの表示枠です。</p>
          </article>
        </section>
        <p className="shell-notice">
          再生進捗・隊列は演出用です。走行中の計測値や勝率更新は提供しません。
        </p>
        <nav className="kt-cta-row" aria-label="次の操作">
          {backPath ? <Link href={backPath} className="kt-cta kt-cta--primary">このレースの予想に戻る</Link> : <Link href="/" className="kt-cta kt-cta--primary">本日の予想へ</Link>}
          <Link href="/ai-history#race-ledger" className="kt-cta">結果を見る</Link>
        </nav>
      </div>
    </main>
  );
}

function PositionStrip({ formation, honmeiNo, finish }: { formation: ScenarioPosition[]; honmeiNo: number | null; finish: boolean }) {
  const groups = (["前団", "中団", "後方", "脚質不明"] as const).map(group => [group, formation.filter(runner => runner.group === group)] as const).filter(([, list]) => list.length);
  return <div className="kt-strip">
    {finish ? <p className="kt-strip-note">ゴール前は隊列が収束します。シナリオは着順を描きません。</p> : null}
    {groups.map(([group, list]) => <div key={group} className="kt-strip-group">
      <small>{group}</small>
      <ol>{list.map(runner => <li key={runner.no} className={runner.no === honmeiNo ? "is-honmei" : ""}>
        <span className="kt-horse-no">{runner.no}</span><span>{runner.name ?? `${runner.no}番`}</span><em>{runner.style}</em>
      </li>)}</ol>
    </div>)}
  </div>;
}
