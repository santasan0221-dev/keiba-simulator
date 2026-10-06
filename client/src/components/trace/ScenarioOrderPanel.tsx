import React, { memo, useMemo, useState } from "react";
import type { GapField, Pace, ScenarioRunner } from "@/lib/scenarioReplay";
import { CHECKPOINTS, compactRows, CROSSING_NOTE, CROSSING_TITLE, CROSSING_TITLE_JA, deltaLabel, ORDER_NOTE, orderView, rankDelta, rankHistory, reachedCheckpoints, type CheckpointId, type RankRecord } from "@/lib/scenarioOrder";
import type { CourseLayout } from "@/lib/courseAtlas";

type Props = { runners: ScenarioRunner[]; pace: Pace; seed: number; progress: number; compact: boolean; /** Course tempo spacing (common to every runner). */ gapField?: GapField };

const trail = (history: RankRecord | undefined, reached: CheckpointId[]) =>
  CHECKPOINTS.filter(checkpoint => reached.includes(checkpoint.id) && history?.[checkpoint.id] !== undefined).map(checkpoint => `${checkpoint.short}: ${history![checkpoint.id]}`).join(" → ");

const deltaClass = (delta: number | null) => delta === null ? "" : delta > 0 ? "is-up" : delta < 0 ? "is-down" : "is-flat";
const deltaSpoken = (delta: number | null) => delta === null ? "" : delta > 0 ? `前回チェックポイントより${delta}つ上` : delta < 0 ? `前回チェックポイントより${-delta}つ下` : "前回チェックポイントと同順位";

/**
 * SCENARIO ORDER V3. `progress` arrives already throttled (<= ~8 Hz) by the shell and the component
 * is memoized, so the animation frame loop never re-renders it. Each row shows the virtual rank,
 * the change against the last checkpoint passed, the horse and its published run style. The order
 * keeps updating to 100%; once a runner crosses the line it also carries its place in the virtual
 * CROSSING ORDER. That order is scenario-only: never a predicted finish and never an official result.
 */
export const ScenarioOrderPanel = memo(function ScenarioOrderPanel({ runners, pace, seed, progress, compact, gapField }: Props) {
  const [pinned, setPinned] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);
  const view = useMemo(() => orderView(runners, progress, pace, seed, gapField), [runners, progress, pace, seed, gapField]);
  const history = useMemo(() => rankHistory(runners, pace, seed, gapField), [runners, pace, seed, gapField]);
  const reached = reachedCheckpoints(progress);
  const rows = view.rows;
  const shown = compact && !expanded ? compactRows(rows, pinned) : rows;
  const pinnedHistory = pinned !== null ? trail(history.get(pinned), reached) : "";
  const lastPassed = CHECKPOINTS.find(checkpoint => checkpoint.id === reached[reached.length - 1]);

  return <section className="kt-order-live" aria-label="SCENARIO ORDER（シナリオ上の仮想順位）">
    <header>
      <span className="kt-eyebrow">{view.title}</span>
      <p className="kt-order-note" role="note">{ORDER_NOTE}</p>
      {lastPassed ? <small className="kt-order-checkpoint">直近チェックポイント · {lastPassed.label}</small> : null}
    </header>
    {view.kind === "COMPLETE" ? <div className="kt-order-complete" role="status">
      <strong>{view.title}</strong>
      <span>{view.message}</span>
    </div> : null}
    <>
      <ol className="kt-order-list">
        {shown.map(row => {
          const { delta } = rankDelta(history.get(row.no), reached, row.rank);
          const selected = row.no === pinned;
          return <li key={row.no} className={selected ? "is-pinned" : ""} data-rank={row.rank} data-no={row.no}>
            <button type="button" aria-pressed={selected} aria-label={`${row.rank}位 ${row.no}番 ${row.name ?? ""} ${row.style} ${deltaSpoken(delta)}${selected ? " 選択中" : ""}`} onClick={() => setPinned(value => value === row.no ? null : row.no)}>
              <b className="kt-num">{row.rank}</b>
              <i className={`kt-delta ${deltaClass(delta)}`} aria-hidden="true">{deltaLabel(delta)}</i>
              <span className="kt-horse-no">{row.no}</span>
              <span className="kt-order-name">{row.name ?? `${row.no}番`}</span>
              <em>{row.style}</em>
              {row.crossing !== null ? <small className="kt-order-crossed kt-num">{row.crossing}番目に通過</small> : null}
              {selected ? <span className="kt-order-selected" aria-hidden="true">●</span> : null}
            </button>
          </li>;
        })}
      </ol>
      {compact && rows.length > shown.length || compact && expanded
        ? <button type="button" className="kt-order-toggle" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? "上位のみ表示" : `全${rows.length}頭を表示`}</button>
        : null}
      {pinnedHistory ? <p className="kt-order-trail kt-num" aria-label={`馬番${pinned}の順位推移`}>#{pinned} 選択中 · {pinnedHistory}</p> : <p className="kt-order-trail">馬をタップすると選択して順位推移を表示します。</p>}
      {!compact ? <RankHistoryChart history={history} reached={reached} count={rows.length} pinned={pinned} /> : null}
      <div className="kt-crossing" aria-label={`${CROSSING_TITLE}（${CROSSING_TITLE_JA}）`}>
        <span className="kt-eyebrow">{CROSSING_TITLE}<small> {CROSSING_TITLE_JA}</small></span>
        <p className="kt-crossing-seq kt-num" aria-live="polite">{view.crossingNos.length ? view.crossingNos.map(no => `#${no}`).join(" → ") : "まだ誰もゴール線を通過していません"}</p>
        <p className="kt-order-note" role="note">{CROSSING_NOTE}</p>
      </div>
    </>
  </section>;
});

function RankHistoryChart({ history, reached, count, pinned }: { history: ReturnType<typeof rankHistory>; reached: CheckpointId[]; count: number; pinned: number | null }) {
  const w = 260, h = 112, pad = 16;
  const x = (index: number) => pad + (index / (CHECKPOINTS.length - 1)) * (w - pad * 2);
  const y = (rank: number) => pad + ((rank - 1) / Math.max(1, count - 1)) * (h - pad * 2 - 6);
  return <svg className="kt-rank-chart" viewBox={`0 0 ${w} ${h}`} role="img" aria-label="仮想順位の推移（シナリオ）">
    {CHECKPOINTS.map((checkpoint, index) => <g key={checkpoint.id}>
      <line x1={x(index)} x2={x(index)} y1={pad} y2={h - pad - 6} className="kt-rank-grid" />
      <text x={x(index)} y={h - 2} className="kt-rank-axis">{checkpoint.short}</text>
    </g>)}
    {Array.from(history.entries()).map(([no, ranks]) => {
      const points = CHECKPOINTS.map((checkpoint, index) => ({ index, rank: ranks[checkpoint.id], on: reached.includes(checkpoint.id) })).filter(point => point.on && point.rank !== undefined);
      const coords = points.map(point => `${x(point.index).toFixed(1)},${y(point.rank!).toFixed(1)}`);
      if (coords.length === 1) { const [cx, cy] = coords[0].split(","); return <circle key={no} cx={cx} cy={cy} r={no === pinned ? 3 : 1.6} className={no === pinned ? "kt-rank-dot is-pinned" : "kt-rank-dot"} />; }
      return coords.length > 1 ? <polyline key={no} points={coords.join(" ")} className={no === pinned ? "kt-rank-line is-pinned" : "kt-rank-line"} /> : null;
    })}
  </svg>;
}

/** ELEVATION: profile (it feeds only the runner-independent course tempo). Draws the section view only when one was read off an official diagram; otherwise lists slopes in words. */
export function ElevationPanel({ course }: { course: CourseLayout }) {
  const profile = course.elevationProfile;
  const gain = course.elevationGainMeters === "UNKNOWN" ? "UNKNOWN" : `${course.elevationGainMeters}m`;
  const ys = profile?.map(point => point.meters) ?? [];
  const lo = Math.min(0, ...ys), hi = Math.max(0.5, ...ys), span = hi - lo || 1;
  const y = (meters: number) => 4 + (1 - (meters - lo) / span) * 40;
  return <section className="kt-elevation" aria-label="ELEVATION（表示のみ）">
    <header><span className="kt-eyebrow">ELEVATION</span><small>高低差 {gain} · 高低差は全馬共通のテンポにだけ反映します（馬ごとの評価・順位には影響しません）</small></header>
    {profile && profile.length > 1 ? <>
      <svg viewBox="0 0 240 48" role="img" aria-label="コース断面図（公式断面図からの近似）" className="kt-elevation-svg" data-profile-points={profile.length}>
        <line x1="0" x2="240" y1={y(0)} y2={y(0)} className="kt-rank-grid" />
        <polyline className="kt-elevation-line" points={profile.map(point => `${(point.at * 240).toFixed(1)},${y(point.meters).toFixed(1)}`).join(" ")} />
      </svg>
      <small>ゴール線から走行方向へ · 公式断面図の読取（±0.1m程度の近似）</small>
    </> : null}
    {course.slopes.length ? <ul>{course.slopes.map(slope => <li key={slope.where}>{slope.kind === "UP" ? "上り" : "下り"} {slope.riseMeters === "UNKNOWN" ? "高低差 UNKNOWN" : `${slope.riseMeters}m`} · {slope.where}</li>)}</ul> : profile ? null : <p>この条件の高低差図は未取得です（UNKNOWN）。</p>}
  </section>;
}
