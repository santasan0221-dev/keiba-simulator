import React, { memo, useMemo, useState } from "react";
import type { Sim } from "@/lib/scenarioSim";
import { CHECKPOINTS, compactRows, CROSSING_NOTE, deltaLabel, ORDER_NOTE, orderView, rankDelta, rankHistory, reachedCheckpoints, type CheckpointId, type RankRecord } from "@/lib/scenarioOrder";
import type { CourseLayout } from "@/lib/courseAtlas";
import { CONFIDENCE_WEIGHT, fitMark, type Compat, type HorseProfile } from "@/lib/horseScenarioProfile";

type Props = { sim: Sim; progress: number; compact: boolean; profiles: Map<number, HorseProfile>; course: CourseLayout };

const trail = (history: RankRecord | undefined, reached: CheckpointId[]) =>
  CHECKPOINTS.filter(checkpoint => reached.includes(checkpoint.id) && history?.[checkpoint.id] !== undefined).map(checkpoint => `${checkpoint.short}: ${history![checkpoint.id]}`).join(" → ");

const deltaClass = (delta: number | null) => delta === null ? "" : delta > 0 ? "is-up" : delta < 0 ? "is-down" : "is-flat";
const deltaSpoken = (delta: number | null) => delta === null ? "" : delta > 0 ? `前回チェックポイントより${delta}つ上` : delta < 0 ? `前回チェックポイントより${-delta}つ下` : "前回チェックポイントと同順位";
const CONFIDENCE_JA: Record<Compat["confidence"], string> = { HIGH: "信頼度 高", MEDIUM: "信頼度 中", LOW: "信頼度 低", UNKNOWN: "データなし" };

/**
 * SCENARIO ORDER V3. `progress` arrives already throttled (<= ~8 Hz) by the shell and the component
 * is memoized, so the animation frame loop never re-renders it. Each row shows the virtual rank,
 * the change against the last checkpoint passed, the horse and its published run style. The order
 * keeps updating to the goal line and ends as the SCENARIO CROSSING ORDER (仮想ゴール通過順): a virtual
 * outcome of the scenario, never a forecast and never an official result.
 */
export const ScenarioOrderPanel = memo(function ScenarioOrderPanel({ sim, progress, compact, profiles, course }: Props) {
  const [pinned, setPinned] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);
  const view = useMemo(() => orderView(sim, progress), [sim, progress]);
  const history = useMemo(() => rankHistory(sim), [sim]);
  const reached = reachedCheckpoints(sim, progress);
  const rows = view.rows;
  const complete = view.kind === "COMPLETE";
  const shown = compact && !expanded ? compactRows(rows, pinned) : rows;
  const pinnedHistory = pinned !== null ? trail(history.get(pinned), reached) : "";
  const lastPassed = CHECKPOINTS.find(checkpoint => checkpoint.id === reached[reached.length - 1]);
  const pinnedProfile = pinned !== null ? profiles.get(pinned) : undefined;

  return <section className="kt-order-live" aria-label="SCENARIO ORDER（シナリオ上の仮想順位）">
    <header>
      <span className="kt-eyebrow">{view.title}</span>
      {complete ? <strong className="kt-order-subtitle">{view.subtitle}</strong> : null}
      <p className="kt-order-note" role="note">{complete ? CROSSING_NOTE : ORDER_NOTE}</p>
      {!complete && lastPassed ? <small className="kt-order-checkpoint">直近チェックポイント · {lastPassed.label}</small> : null}
    </header>
    {complete ? <p className="kt-order-sequence kt-num" aria-label="仮想ゴール通過順">{view.sequence}</p> : null}
    <ol className="kt-order-list">
      {shown.map(row => {
        const { delta } = rankDelta(history.get(row.no), reached, row.rank);
        const selected = row.no === pinned;
        const spokenRank = row.crossed ? `ゴール通過${row.rank}番目` : `${row.rank}位`;
        return <li key={row.no} className={selected ? "is-pinned" : ""} data-rank={row.rank} data-no={row.no} data-crossed={row.crossed ? "true" : "false"}>
          <button type="button" aria-pressed={selected} aria-label={`${spokenRank} ${row.no}番 ${row.name ?? ""} ${row.style} ${deltaSpoken(delta)}${selected ? " 選択中" : ""}`} onClick={() => setPinned(value => value === row.no ? null : row.no)}>
            <b className="kt-num">{row.rank}</b>
            <i className={`kt-delta ${deltaClass(delta)}`} aria-hidden="true">{deltaLabel(delta)}</i>
            <span className="kt-horse-no">{row.no}</span>
            <span className="kt-order-name">{row.name ?? `${row.no}番`}</span>
            <em>{row.style}</em>
            {row.crossed ? <span className="kt-order-goal" aria-hidden="true">GOAL</span> : null}
            {selected ? <span className="kt-order-selected" aria-hidden="true">●</span> : null}
          </button>
        </li>;
      })}
    </ol>
    {compact && rows.length > shown.length || compact && expanded
      ? <button type="button" className="kt-order-toggle" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? "上位のみ表示" : `全${rows.length}頭を表示`}</button>
      : null}
    {pinnedHistory ? <p className="kt-order-trail kt-num" aria-label={`馬番${pinned}の順位推移`}>#{pinned} 選択中 · {pinnedHistory}</p> : <p className="kt-order-trail">馬をタップすると選択して順位推移を表示します。</p>}
    {pinnedProfile ? <CourseFit profile={pinnedProfile} course={course} /> : null}
    {!compact ? <RankHistoryChart history={history} reached={reached} count={rows.length} pinned={pinned} /> : null}
  </section>;
});

/** COURSE FIT of the selected horse: reference marks from past data, never an advantage claim. */
function CourseFit({ profile, course }: { profile: HorseProfile; course: CourseLayout }) {
  const turn = course.direction === "LEFT" ? "左回り" : course.direction === "RIGHT" ? "右回り" : null;
  const items: { label: string; value: Compat }[] = [
    { label: "距離", value: profile.distanceCompatibility },
    { label: "馬場", value: profile.surfaceCompatibility },
    { label: "直線", value: profile.straightSustain },
    { label: "コーナー", value: profile.cornerStability },
    { label: "坂", value: profile.elevationCompatibility },
    ...(turn ? [{ label: turn, value: profile.turnDirectionCompatibility }] : []),
  ];
  const known = items.some(item => item.value.confidence !== "UNKNOWN");
  return <section className="kt-course-fit" aria-label="COURSE FIT（選択馬）">
    <header><span className="kt-eyebrow">COURSE FIT</span><small>#{profile.no}</small></header>
    <ul>
      {items.map(item => <li key={item.label}>
        <span>{item.label}</span>
        <b aria-label={`${item.label} ${fitMark(item.value) === "－" ? "判断材料なし" : fitMark(item.value)}`}>{fitMark(item.value)}</b>
        <small>{CONFIDENCE_JA[item.value.confidence]}{item.value.confidence !== "UNKNOWN" && CONFIDENCE_WEIGHT[item.value.confidence] < 1 ? "（補正は小さめ）" : ""}</small>
      </li>)}
    </ul>
    <p>{known ? "過去データから見たコース適性の参考表示です。" : "このレースでは適性に使える過去データがなく、中立として扱っています。"}</p>
  </section>;
}

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

/** ELEVATION: display-only profile. Draws the section view only when one was read off an official diagram; otherwise lists slopes in words. */
export function ElevationPanel({ course }: { course: CourseLayout }) {
  const profile = course.elevationProfile;
  const gain = course.elevationGainMeters === "UNKNOWN" ? "UNKNOWN" : `${course.elevationGainMeters}m`;
  const ys = profile?.map(point => point.meters) ?? [];
  const lo = Math.min(0, ...ys), hi = Math.max(0.5, ...ys), span = hi - lo || 1;
  const y = (meters: number) => 4 + (1 - (meters - lo) / span) * 40;
  return <section className="kt-elevation" aria-label="ELEVATION（表示のみ）">
    <header><span className="kt-eyebrow">ELEVATION</span><small>高低差 {gain} · コースの上り下りはシナリオのテンポに反映されます</small></header>
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
