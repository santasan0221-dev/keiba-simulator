import { Activity, AlertTriangle, CheckCircle2, Clock3, RefreshCw, TrendingDown, TrendingUp } from "lucide-react";
import { trpc } from "@/lib/trpc";

const dateTime = (iso: string | null) => {
  if (!iso) return "未同期";
  return new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
};

const metric = (value: number | null, digits = 1) => (typeof value === "number" ? value.toFixed(digits) : "—");

type TrendSeries = { label: string; value: number | null; tone: "brass" | "mint" }[];

function SparkLine({ series, label }: { series: TrendSeries; label: string }) {
  const available = series.filter((item): item is { label: string; value: number; tone: "brass" | "mint" } => typeof item.value === "number");
  if (!available.length) return <div className="sync-spark-empty">確定済みの値が届くと、ここに推移を表示します。</div>;
  const values = available.map(item => item.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = available.map((item, index) => `${12 + (index * 176) / Math.max(1, available.length - 1)},${64 - ((item.value - min) / span) * 46}`).join(" ");
  return <div className="sync-spark" aria-label={label}><svg viewBox="0 0 200 76" role="img" aria-label={label}><line x1="10" y1="64" x2="190" y2="64" /><polyline points={points} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />{available.map((item, index) => { const [x, y] = points.split(" ")[index].split(","); return <circle key={`${item.label}-${index}`} cx={x} cy={y} r="3.5" />; })}</svg><div><span>{available[0]?.label}</span><span>{available.at(-1)?.label}</span></div></div>;
}

export function RaceHistoryDashboard() {
  const dashboard = trpc.raceSync.dashboard.useQuery(undefined, { refetchInterval: 60_000, refetchOnWindowFocus: true });
  const refresh = trpc.raceSync.refreshNow.useMutation({ onSuccess: () => dashboard.refetch() });
  const state = dashboard.data?.source;
  const races = dashboard.data?.races ?? [];
  const confirmed = races.filter(race => race.resultStatus === "CONFIRMED");
  const compared = confirmed.reduce((sum, race) => sum + (race.comparedCount ?? 0), 0);
  const exact = confirmed.reduce((sum, race) => sum + (race.exactMatches ?? 0), 0);
  const meanErrorRows = confirmed.filter(race => race.meanAbsoluteRankError !== null);
  const meanError = meanErrorRows.length ? meanErrorRows.reduce((sum, race) => sum + (race.meanAbsoluteRankError ?? 0), 0) / meanErrorRows.length : null;
  const roiRows = confirmed.flatMap(race => [race.winReturnRate, race.placeReturnRate]).filter((value): value is number => typeof value === "number");
  const averageRoi = roiRows.length ? roiRows.reduce((sum, value) => sum + value, 0) / roiRows.length : null;
  const recent = races.slice(-18);
  const errorState = Boolean(state?.lastError);

  return <section className="sync-history-dashboard" aria-label="AI精度と仮想ROIの履歴">
    <header className="sync-history-heading"><div><span className="eyebrow">AI OUTCOME ARCHIVE</span><h2>精度と回収率の履歴</h2><p>single_pick_aiが提供した**確定済み**の公式着順・払戻だけを集計します。未確定のレースは推定値へ置き換えません。</p></div><button type="button" className="sync-refresh-button" onClick={() => refresh.mutate()} disabled={refresh.isPending}>{refresh.isPending ? <RefreshCw className="spin" size={15} /> : <RefreshCw size={15} />} 今すぐ同期</button></header>

    <div className="sync-status-strip" role="status"><div className={errorState ? "sync-status-icon error" : "sync-status-icon"}>{errorState ? <AlertTriangle size={17} /> : <CheckCircle2 size={17} />}</div><div><span>最終同期成功</span><strong>{dateTime(state?.lastSuccessAt ?? null)}</strong></div><div><span>次回確認</span><strong>{state?.nextRetryAt ? dateTime(state.nextRetryAt) : state ? `${state.refreshMinutes}分ごと` : "初回同期前"}</strong></div><div><span>状態</span><strong>{errorState ? `再試行 ${state?.consecutiveFailures ?? 0}回目` : state ? "正常" : "同期設定を確認中"}</strong></div>{errorState && <p>{state?.lastError}</p>}</div>

    <div className="sync-kpi-grid"><article><span>CONFIRMED RACES</span><strong>{confirmed.length}</strong><small>確定済み結果のみ</small></article><article><span>RANK EXACT</span><strong>{compared ? `${((exact / compared) * 100).toFixed(1)}%` : "—"}</strong><small>{compared ? `${exact} / ${compared} 頭が順位一致` : "照合対象なし"}</small></article><article><span>MEAN RANK ERROR</span><strong>{metric(meanError)}</strong><small>平均順位差（小さいほど良い）</small></article><article><span>VIRTUAL ROI</span><strong>{averageRoi === null ? "—" : `${averageRoi.toFixed(1)}%`}</strong><small>確認できる単勝・複勝のみ</small></article></div>

    <div className="sync-trend-grid"><article className="sync-trend-card brass"><div><span>RANK ACCURACY TREND</span><strong>{compared ? `${((exact / compared) * 100).toFixed(1)}%` : "未確定"}</strong></div><SparkLine label="AI順位と公式着順の一致率推移" series={recent.map(race => ({ label: `${race.venue ?? "—"}${race.raceNo ?? ""}R`, value: race.comparedCount ? ((race.exactMatches ?? 0) / race.comparedCount) * 100 : null, tone: "brass" }))} /></article><article className="sync-trend-card mint"><div><span>VIRTUAL ROI TREND</span><strong>{averageRoi === null ? "未確定" : `${averageRoi.toFixed(1)}%`}</strong></div><SparkLine label="確認できる仮想ROIの推移" series={recent.map(race => ({ label: `${race.venue ?? "—"}${race.raceNo ?? ""}R`, value: race.winReturnRate ?? race.placeReturnRate, tone: "mint" }))} /></article></div>

    <div className="sync-history-table-wrap"><div className="sync-history-table-heading"><div><span className="eyebrow">RACE LEDGER</span><h3>レース別の確定記録</h3></div><span>{races.length}件を保存</span></div>{dashboard.isLoading ? <div className="sync-dashboard-empty"><RefreshCw className="spin" size={18} /> 同期履歴を読み込んでいます。</div> : !races.length ? <div className="sync-dashboard-empty"><Clock3 size={18} /> 初回のバックグラウンド同期後に履歴を表示します。</div> : <div className="sync-ledger">{[...races].reverse().map(race => <article key={race.raceKey} className={race.resultStatus === "CONFIRMED" ? "confirmed" : "pending"}><div className="sync-race-title"><strong>{race.venue ?? "開催地未取得"} {race.raceNo ? `${race.raceNo}R` : ""}</strong><small>{race.raceDate ?? "日付未取得"} · {race.calibrationStatus}</small></div><div><span>公式結果</span><strong>{race.resultStatus === "CONFIRMED" ? "確定" : "未確定"}</strong></div><div><span>本命</span><strong>{race.aiPickOutcome ?? "結果待ち"}{race.aiPickFinish ? ` · ${race.aiPickFinish}着` : ""}</strong></div><div><span>順位一致</span><strong>{race.comparedCount ? `${race.exactMatches ?? 0}/${race.comparedCount}` : "—"}</strong></div><div><span>単勝ROI</span><strong>{race.winReturnRate === null ? "—" : `${race.winReturnRate.toFixed(0)}%`}</strong></div><div><span>複勝ROI</span><strong>{race.placeReturnRate === null ? "—" : `${race.placeReturnRate.toFixed(0)}%`}</strong></div><time>{dateTime(race.lastSyncedAt)}</time></article>)}</div>}</div>

    {dashboard.data?.recentRuns.length ? <details className="sync-run-history"><summary><Activity size={14} /> 同期実行履歴（直近{dashboard.data.recentRuns.length}件）</summary>{dashboard.data.recentRuns.map(run => <p key={run.id}><time>{dateTime(run.finishedAt)}</time><strong>{run.outcome}</strong><span>{run.message ?? "詳細なし"}</span></p>)}</details> : null}
  </section>;
}
