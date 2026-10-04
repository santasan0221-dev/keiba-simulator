import React, { memo, useMemo, useState } from "react";
import { PHASE_LABEL, type Pace, type Phase, type ScenarioRunner } from "@/lib/scenarioReplay";
import { compactRows, ORDER_NOTE, orderView, rankHistory, reachedCheckpoints, RANK_CHECKPOINTS } from "@/lib/scenarioOrder";
import type { CourseLayout } from "@/lib/courseAtlas";

type Props = { runners: ScenarioRunner[]; pace: Pace; seed: number; progress: number; compact: boolean };

const trail = (history: Partial<Record<Phase, number>> | undefined, reached: Phase[]) =>
  reached.filter(phase => history?.[phase] !== undefined).map(phase => `${phase}: ${history![phase]}`).join(" → ");

/**
 * SCENARIO ORDER. `progress` arrives already throttled (<= ~8 Hz) by the shell,
 * and the component is memoized, so the animation frame loop never re-renders
 * it. The order is a reading of drawn course progress and is never kept as a
 * result: at 100% only SCENARIO COMPLETE is shown.
 */
export const ScenarioOrderPanel = memo(function ScenarioOrderPanel({ runners, pace, seed, progress, compact }: Props) {
  const [pinned, setPinned] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);
  const view = useMemo(() => orderView(runners, progress, pace, seed), [runners, progress, pace, seed]);
  const history = useMemo(() => rankHistory(runners, pace, seed), [runners, pace, seed]);
  const reached = reachedCheckpoints(progress);
  const rows = view.rows;
  const shown = compact && !expanded ? compactRows(rows, pinned) : rows;
  const pinnedHistory = pinned !== null ? trail(history.get(pinned), reached) : "";

  return <section className="kt-order-live" aria-label="SCENARIO ORDER（シナリオ上の仮想順位）">
    <header>
      <span className="kt-eyebrow">{view.title}</span>
      <p className="kt-order-note" role="note">{ORDER_NOTE}</p>
    </header>
    {view.kind === "COMPLETE" ? <div className="kt-order-complete" role="status">
      <strong>{view.title}</strong>
      <span>{view.message}</span>
    </div> : <>
      <ol className="kt-order-list">
        {shown.map(row => <li key={row.no} className={row.no === pinned ? "is-pinned" : ""}>
          <button type="button" aria-pressed={row.no === pinned} onClick={() => setPinned(value => value === row.no ? null : row.no)}>
            <b className="kt-num">{row.rank}</b>
            <span className="kt-horse-no">{row.no}</span>
            <span className="kt-order-name">{row.name ?? `${row.no}番`}</span>
            <em>{row.style}</em>
          </button>
        </li>)}
      </ol>
      {compact && rows.length > shown.length || compact && expanded
        ? <button type="button" className="kt-order-toggle" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? "上位のみ表示" : `全${rows.length}頭を表示`}</button>
        : null}
      {pinnedHistory ? <p className="kt-order-trail kt-num" aria-label={`馬番${pinned}の順位推移`}>#{pinned} {pinnedHistory}</p> : <p className="kt-order-trail">馬をタップすると順位推移を表示します。</p>}
      {!compact ? <RankHistoryChart history={history} reached={reached} count={rows.length} pinned={pinned} /> : null}
    </>}
  </section>;
});

function RankHistoryChart({ history, reached, count, pinned }: { history: ReturnType<typeof rankHistory>; reached: Phase[]; count: number; pinned: number | null }) {
  const w = 240, h = 110, pad = 14;
  const x = (phase: Phase) => pad + (RANK_CHECKPOINTS.indexOf(phase as never) / (RANK_CHECKPOINTS.length - 1)) * (w - pad * 2);
  const y = (rank: number) => pad + ((rank - 1) / Math.max(1, count - 1)) * (h - pad * 2);
  return <svg className="kt-rank-chart" viewBox={`0 0 ${w} ${h}`} role="img" aria-label="仮想順位の推移（シナリオ）">
    {RANK_CHECKPOINTS.map(phase => <g key={phase}>
      <line x1={x(phase)} x2={x(phase)} y1={pad} y2={h - pad} className="kt-rank-grid" />
      <text x={x(phase)} y={h - 2} className="kt-rank-axis">{PHASE_LABEL[phase].slice(0, 3)}</text>
    </g>)}
    {Array.from(history.entries()).map(([no, ranks]) => {
      const points = reached.filter(phase => ranks[phase] !== undefined).map(phase => `${x(phase).toFixed(1)},${y(ranks[phase]!).toFixed(1)}`);
      if (points.length === 1) { const [cx, cy] = points[0].split(","); return <circle key={no} cx={cx} cy={cy} r={no === pinned ? 3 : 1.6} className={no === pinned ? "kt-rank-dot is-pinned" : "kt-rank-dot"} />; }
      return points.length > 1 ? <polyline key={no} points={points.join(" ")} className={no === pinned ? "kt-rank-line is-pinned" : "kt-rank-line"} /> : null;
    })}
  </svg>;
}

/** ELEVATION: display-only profile. Draws only positions a source gives; otherwise lists slopes in words. */
export function ElevationPanel({ course }: { course: CourseLayout }) {
  const profile = course.elevationProfile;
  const gain = course.elevationGainMeters === "UNKNOWN" ? "UNKNOWN" : `${course.elevationGainMeters}m`;
  return <section className="kt-elevation" aria-label="ELEVATION（表示のみ）">
    <header><span className="kt-eyebrow">ELEVATION</span><small>高低差 {gain} · 表示専用（展開・順位には影響しません）</small></header>
    {profile && profile.length > 1 ? <svg viewBox="0 0 240 48" role="img" aria-label="コース断面図（簡易）" className="kt-elevation-svg">
      <polyline className="kt-elevation-line" points={profile.map(point => `${(point.at * 240).toFixed(1)},${(44 - point.meters * 8).toFixed(1)}`).join(" ")} />
    </svg> : null}
    {course.slopes.length ? <ul>{course.slopes.map(slope => <li key={slope.where}>{slope.kind === "UP" ? "上り" : "下り"} {slope.riseMeters === "UNKNOWN" ? "高低差 UNKNOWN" : `${slope.riseMeters}m`} · {slope.where}</li>)}</ul> : <p>この条件の高低差図は未取得です（UNKNOWN）。</p>}
  </section>;
}
