import React, { useEffect, useMemo, useRef, useState } from "react";
import { Activity, AlertTriangle, BellRing, CheckCircle2, Clock3, Download, Filter, LoaderCircle, RefreshCw, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { fetchAvailablePredictionDates, fetchLabResults, type LabResultListItem } from "@/lib/singlePickAi";
import { DEFAULT_RACE_HISTORY_FILTERS, buildWeeklyRaceHistoryReport, downloadRaceHistoryCsv, filterRaceHistory, findNewlyConfirmedRaces, persistConfirmedRaceKeys, persistRaceHistoryFilters, readConfirmedRaceKeys, readRaceHistoryFilters, type RaceHistoryFilters } from "@/lib/raceHistoryTools";
import { DailyOperationsStrip } from "./DailyOperationsStrip";

export type RaceHistorySource = { enabled: boolean; refreshMinutes: number; syncStartedAt: string | null; lastAttemptAt: string | null; lastSuccessAt: string | null; nextRetryAt: string | null; consecutiveFailures: number; lastError: string | null };
export type RaceHistoryRace = { raceKey: string; raceDate: string | null; organization: string | null; venue: string | null; raceNo: number | null; raceStatus: string | null; calibrationStatus: string | null; asOf: string | null; resultStatus: string | null; specialStatuses?: string[] | null; aiPickFinish: number | null; aiPickOutcome: string | null; comparedCount: number | null; exactMatches: number | null; meanAbsoluteRankError: number | null; winReturnRate: number | null; placeReturnRate: number | null; lastSyncedAt: string | null; confirmedAt: string | null; predictionId?: string | null; predictedTop3?: Array<{ rank: number; horseNo: number; horseName: string }>; officialTop3?: Array<{ finish: number; horseNo: number; horseName: string }>; top3Coverage?: number | null };
export type RaceHistoryRun = { id: number; outcome: string; message: string | null; racesChecked: number; racesUpdated: number; finishedAt: string | null };
export type RaceHistoryData = { source: RaceHistorySource | null; races: RaceHistoryRace[]; recentRuns: RaceHistoryRun[] };

const dateTime = (iso: string | null) => !iso ? "未同期" : new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const metric = (value: number | null, digits = 1) => typeof value === "number" ? value.toFixed(digits) : "—";
type TrendSeries = { label: string; value: number | null }[];

function SparkLine({ series, label }: { series: TrendSeries; label: string }) {
  const available = series.filter((item): item is { label: string; value: number } => typeof item.value === "number");
  if (!available.length) return <div className="sync-spark-empty">確定済みの値が届くと、ここに推移を表示します。</div>;
  const values = available.map(item => item.value); const min = Math.min(...values); const max = Math.max(...values); const span = max - min || 1;
  const points = available.map((item, index) => `${12 + (index * 176) / Math.max(1, available.length - 1)},${64 - ((item.value - min) / span) * 46}`).join(" ");
  return <div className="sync-spark" aria-label={label}><svg viewBox="0 0 200 76" role="img" aria-label={label}><line x1="10" y1="64" x2="190" y2="64" /><polyline points={points} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />{available.map((item, index) => { const [x, y] = points.split(" ")[index].split(","); return <circle key={`${item.label}-${index}`} cx={x} cy={y} r="3.5" />; })}</svg><div><span>{available[0]?.label}</span><span>{available.at(-1)?.label}</span></div></div>;
}

export function RaceHistoryDashboardView({ data, loading = false, refreshing = false, error, onRefresh, filters: controlledFilters, onFiltersChange, newlyConfirmedRaces = [], onDismissNotifications }: { data: RaceHistoryData | null; loading?: boolean; refreshing?: boolean; error?: unknown; onRefresh?: () => void; filters?: RaceHistoryFilters; onFiltersChange?: React.Dispatch<React.SetStateAction<RaceHistoryFilters>>; newlyConfirmedRaces?: RaceHistoryRace[]; onDismissNotifications?: () => void }) {
  const [localFilters, setLocalFilters] = useState<RaceHistoryFilters>(() => readRaceHistoryFilters());
  const filters = controlledFilters ?? localFilters;
  const setFilters = onFiltersChange ?? setLocalFilters;
  const state = data?.source; const races = data?.races ?? [];
  const venues = useMemo(() => Array.from(new Set(races.map(race => race.venue).filter((venue): venue is string => Boolean(venue)))).sort((left, right) => left.localeCompare(right, "ja")), [races]);
  const availableDates = useMemo(() => Array.from(new Set(races.map(race => race.raceDate).filter((date): date is string => Boolean(date)))).sort(), [races]);
  const filteredRaces = useMemo(() => filterRaceHistory(races, filters), [races, filters]);
  const weeklyReport = useMemo(() => buildWeeklyRaceHistoryReport(filteredRaces), [filteredRaces]);
  const confirmed = filteredRaces.filter(race => race.resultStatus === "CONFIRMED");
  const compared = confirmed.reduce((sum, race) => sum + (race.comparedCount ?? 0), 0); const exact = confirmed.reduce((sum, race) => sum + (race.exactMatches ?? 0), 0);
  const meanErrorRows = confirmed.filter(race => race.meanAbsoluteRankError !== null); const meanError = meanErrorRows.length ? meanErrorRows.reduce((sum, race) => sum + (race.meanAbsoluteRankError ?? 0), 0) / meanErrorRows.length : null;
  const top3Rows = confirmed.filter(race => typeof race.top3Coverage === "number"); const top3Coverage = top3Rows.length ? top3Rows.reduce((sum, race) => sum + (race.top3Coverage ?? 0), 0) / top3Rows.length * 100 : null;
  const firstPickRows = confirmed.filter(race => race.aiPickFinish !== null); const firstPickWinRate = firstPickRows.length ? firstPickRows.filter(race => race.aiPickFinish === 1).length / firstPickRows.length * 100 : null; const firstPickPlaceRate = firstPickRows.length ? firstPickRows.filter(race => (race.aiPickFinish ?? 99) <= 3).length / firstPickRows.length * 100 : null;
  const roiRows = confirmed.flatMap(race => [race.winReturnRate, race.placeReturnRate]).filter((value): value is number => typeof value === "number"); const averageRoi = roiRows.length ? roiRows.reduce((sum, value) => sum + value, 0) / roiRows.length : null;
  const recent = filteredRaces.slice(-18); const errorState = Boolean(error); const isLegacySyncing = Boolean(state?.syncStartedAt); const isRunning = refreshing || isLegacySyncing;
  const updateFilters = (patch: Partial<RaceHistoryFilters>) => setFilters(current => ({ ...current, ...patch }));
  const moveToLatest = (date: string) => setFilters(current => ({ ...current, from: date, to: date }));
  useEffect(() => { persistRaceHistoryFilters(filters); }, [filters]);
  return <section className="sync-history-dashboard" aria-label="AI精度と仮想ROIの履歴"><DailyOperationsStrip selectedDate={filters.from && filters.from === filters.to ? filters.from : null} onLatestDate={moveToLatest} /><header className="sync-history-heading"><div><span className="eyebrow">AI OUTCOME ARCHIVE</span><h2>精度と回収率の履歴</h2><p>single_pick_aiが提供した**確定済み**の公式着順・払戻だけを集計します。未確定のレースは推定値へ置き換えません。</p></div><div className="sync-history-actions"><button type="button" className="sync-export-button" onClick={() => downloadRaceHistoryCsv(filteredRaces, filters)} disabled={!filteredRaces.length || isRunning}><Download size={15} /> CSV出力</button><button type="button" className="sync-refresh-button" onClick={onRefresh} disabled={isRunning}>{isRunning ? <LoaderCircle className="spin" size={15} /> : <RefreshCw size={15} />} {isRunning ? "同期中" : "今すぐ同期"}</button></div></header>
    <div className="sync-filter-panel" aria-label="履歴フィルター"><label>開催日（開始）<input type="date" value={filters.from} max={filters.to || undefined} onChange={event => updateFilters({ from: event.target.value })} /></label><label>開催日（終了）<input type="date" value={filters.to} min={filters.from || undefined} onChange={event => updateFilters({ to: event.target.value })} /></label><label>主催<select value={filters.organization} onChange={event => updateFilters({ organization: event.target.value as RaceHistoryFilters["organization"] })}><option value="">JRA/NARすべて</option><option value="JRA">JRA</option><option value="NAR">NAR</option></select></label><label>競馬場<select value={filters.venue} onChange={event => updateFilters({ venue: event.target.value })}><option value="">すべての競馬場</option>{venues.map(venue => <option key={venue} value={venue}>{venue}</option>)}</select></label><button type="button" className="sync-filter-reset" onClick={() => setFilters(DEFAULT_RACE_HISTORY_FILTERS)}><RotateCcw size={13} /> 条件をリセット</button><small className="sync-filter-persistence">{availableDates.length ? `利用可能日: ${availableDates[0]}〜${availableDates.at(-1)}` : "データなし"}</small></div>
    <div className="sync-filter-summary"><span><Filter size={12} /> 表示対象 <strong>{filteredRaces.length}</strong> / {races.length} 件</span><span>{filters.venue || "全競馬場"} · {filters.from || "開始指定なし"}〜{filters.to || "終了指定なし"}</span></div>
    {newlyConfirmedRaces.length ? <section className="sync-confirmation-alert" role="status" aria-label="新たに確定したレース結果"><BellRing size={19} /><div><span>RESULTS CONFIRMED</span><strong>新たに{newlyConfirmedRaces.length}件のレース結果が確定しました</strong><p>{newlyConfirmedRaces.slice(0, 3).map(race => `${race.venue ?? "開催地未取得"} ${race.raceNo ? `${race.raceNo}R` : ""}`).join("・")}{newlyConfirmedRaces.length > 3 ? " ほか" : ""}</p></div><button type="button" onClick={onDismissNotifications}>確認した</button></section> : null}
    <div className={`sync-status-strip ${isRunning ? "is-running" : ""}`} role="status"><div className={isRunning ? "sync-status-icon running" : errorState ? "sync-status-icon error" : "sync-status-icon"}>{isRunning ? <LoaderCircle className="spin" size={17} /> : errorState ? <AlertTriangle size={17} /> : <CheckCircle2 size={17} />}</div><div><span>最終結果反映</span><strong>{dateTime(filteredRaces.map(race => race.lastSyncedAt).filter((value): value is string => Boolean(value)).sort().at(-1) ?? null)}</strong></div><div><span>次回自動処理</span><strong>取得不能</strong></div><div><span>状態</span><strong className={isRunning ? "sync-status-running" : ""}>{isRunning && <LoaderCircle className="spin" size={13} />}{refreshing ? "read-only APIを更新中" : isLegacySyncing ? "バックグラウンド同期中" : errorState ? "API応答エラー" : "正本API read-only"}</strong></div></div>
    <div className="sync-kpi-grid"><article><span>対象レース</span><strong>{filteredRaces.length}</strong><small>母数・未確定を含む</small></article><article><span>CONFIRMED RACES / 結果確定</span><strong>{confirmed.length}</strong><small>未確定 {filteredRaces.filter(race => race.resultStatus !== "CONFIRMED").length}件</small></article><article><span>◎ 1着率 / 複勝内率</span><strong>{firstPickWinRate === null ? "取得不能" : `${firstPickWinRate.toFixed(1)}% / ${firstPickPlaceRate!.toFixed(1)}%`}</strong><small>母数 {firstPickRows.length}レース</small></article><article><span>TOP3 COVERAGE</span><strong>{top3Coverage === null ? "取得不能" : `${top3Coverage.toFixed(1)}%`}</strong><small>母数 {top3Rows.length}レース</small></article><article><span>RANK EXACT</span><strong>{compared ? `${((exact / compared) * 100).toFixed(1)}%` : "取得不能"}</strong><small>{compared ? `${exact} / ${compared}頭` : "照合データなし"}</small></article><article><span>VIRTUAL ROI</span><strong>{averageRoi === null ? "表示対象外" : `${averageRoi.toFixed(1)}%`}</strong><small>{averageRoi === null ? "正規払戻データなし" : "確定データのみ"}</small></article></div>
    <div className="sync-trend-grid"><article className="sync-trend-card brass"><div><span>MODEL RANK TREND</span><strong>{compared ? `${((exact / compared) * 100).toFixed(1)}%` : "未確定"}</strong></div><SparkLine label="モデル素点順位（参考）と公式着順の一致率推移" series={recent.map(race => ({ label: `${race.venue ?? "—"}${race.raceNo ?? ""}R`, value: race.comparedCount ? ((race.exactMatches ?? 0) / race.comparedCount) * 100 : null }))} /></article><article className="sync-trend-card mint"><div><span>VIRTUAL ROI TREND</span><strong>{averageRoi === null ? "未確定" : `${averageRoi.toFixed(1)}%`}</strong></div><SparkLine label="確認できる仮想ROIの推移" series={recent.map(race => ({ label: `${race.venue ?? "—"}${race.raceNo ?? ""}R`, value: race.winReturnRate ?? race.placeReturnRate }))} /></article></div>
    <section className="weekly-outcome-report" aria-label="週次ROIと予測精度レポート"><div className="weekly-outcome-heading"><div><span className="eyebrow">WEEKLY PERFORMANCE REPORT</span><h3>週ごとの実績</h3><p>確定済みレースのみを週単位で集計します。ROIは単勝・複勝の払戻が確認できる項目だけを平均します。</p></div><span>{weeklyReport.length}週を集計</span></div>{weeklyReport.length ? <><div className="weekly-outcome-trends"><article className="brass"><span>WEEKLY MODEL RANK</span><SparkLine label="週次のモデル素点順位一致率（参考）" series={weeklyReport.map(week => ({ label: week.weekLabel, value: week.rankAccuracy }))} /></article><article className="mint"><span>WEEKLY VIRTUAL ROI</span><SparkLine label="週次の仮想ROI" series={weeklyReport.map(week => ({ label: week.weekLabel, value: week.averageRoi }))} /></article></div><div className="weekly-outcome-ledger">{[...weeklyReport].reverse().map(week => <article key={week.weekKey}><div><span>対象週</span><strong>{week.weekLabel}</strong></div><div><span>確定レース</span><strong>{week.confirmedRaces}件</strong></div><div><span>モデル順位一致率（参考）</span><strong>{week.rankAccuracy === null ? "—" : `${week.rankAccuracy.toFixed(1)}%`}</strong><small>{week.comparedCount ? `${week.exactMatches}/${week.comparedCount}頭` : "照合対象なし"}</small></div><div><span>平均順位差</span><strong>{metric(week.meanAbsoluteRankError)}</strong></div><div><span>仮想ROI</span><strong>{week.averageRoi === null ? "—" : `${week.averageRoi.toFixed(1)}%`}</strong><small>{week.roiSampleCount ? `${week.roiSampleCount}件で算出` : "払戻データなし"}</small></div></article>)}</div></> : <div className="sync-dashboard-empty"><Clock3 size={18} /> 確定済みの週次データが届くと、ここにレポートを表示します。</div>}</section>
    <div className="sync-history-table-wrap"><div className="sync-history-table-heading"><div><span className="eyebrow">RACE LEDGER</span><h3>レース結果一覧</h3></div><span>{filteredRaces.length}件を表示</span></div>{loading ? <div className="sync-dashboard-empty"><RefreshCw className="spin" size={18} /> 同期履歴を読み込んでいます。</div> : !filteredRaces.length ? <div className="sync-dashboard-empty"><Clock3 size={18} /> 条件に一致する履歴はありません。</div> : <div className="sync-ledger">{[...filteredRaces].reverse().map(race => <article key={race.raceKey} className={race.resultStatus === "CONFIRMED" ? "confirmed" : "pending"}><div className="sync-race-title"><strong>{race.organization ?? "主催未取得"} · {race.venue ?? "開催地未取得"} {race.raceNo ? `${race.raceNo}R` : ""}</strong><small>{race.raceDate ?? "日付未取得"} · 発走 {race.raceStatus === "CANCELLED" ? "取消" : "正本API未提供"} · 予測 {dateTime(race.asOf)}</small></div><div><span>◎○▲</span><strong>{race.predictedTop3?.length ? race.predictedTop3.map((horse, index) => `${["◎", "○", "▲"][index]}${horse.horseName}`).join(" ") : "取得不能"}</strong></div><div><span>公式1〜3着</span><strong>{race.officialTop3?.length ? race.officialTop3.map(item => `${item.finish}.${item.horseName}`).join(" / ") : race.resultStatus === "CONFIRMED" ? "正本データ不整合" : race.resultStatus === "CANCELLED" ? "取消" : "未確定"}</strong></div><div><span>◎着順 / top3</span><strong>{race.aiPickFinish ? `${race.aiPickFinish}着` : race.resultStatus === "CONFIRMED" ? "取得不能" : "未確定"} / {typeof race.top3Coverage === "number" ? `${(race.top3Coverage * 100).toFixed(1)}%` : "取得不能"}</strong></div><div><span>結果状態</span><strong>{race.resultStatus ?? "取得不能"}{race.specialStatuses?.length ? ` · ${race.specialStatuses.join(" / ")}` : ""}</strong></div><div><span>prediction_id</span><strong>{race.predictionId ?? "正本API未提供"}</strong></div><div><span>単勝ROI</span><strong>{race.winReturnRate === null ? "表示対象外" : `${race.winReturnRate.toFixed(0)}%`}</strong></div><div><span>複勝ROI</span><strong>{race.placeReturnRate === null ? "表示対象外" : `${race.placeReturnRate.toFixed(0)}%`}</strong></div><time>同期 {dateTime(race.lastSyncedAt)}</time></article>)}</div>}</div>
    {data?.recentRuns.length ? <details className="sync-run-history"><summary><Activity size={14} /> 同期実行履歴（直近{data.recentRuns.length}件）</summary>{data.recentRuns.map(run => <p key={run.id}><time>{dateTime(run.finishedAt)}</time><strong>{run.outcome}</strong><span>{run.message ?? "詳細なし"}</span></p>)}</details> : null}
  </section>;
}

const toRaceHistoryRace = (item: LabResultListItem, requestedDate: string): RaceHistoryRace => ({
  raceKey: item.race_key,
  raceDate: item.race_date ?? requestedDate,
  organization: item.organization,
  venue: item.venue,
  raceNo: item.race_no,
  raceStatus: null,
  calibrationStatus: null,
  asOf: item.prediction_created_at,
  resultStatus: item.result_status,
  specialStatuses: item.special_statuses,
  aiPickFinish: item.ai_pick_finish,
  aiPickOutcome: null,
  comparedCount: null,
  exactMatches: null,
  meanAbsoluteRankError: null,
  winReturnRate: null,
  placeReturnRate: null,
  lastSyncedAt: item.result_fetched_at,
  confirmedAt: item.result_status === "CONFIRMED" || item.result_status === "DEAD_HEAT" ? item.result_fetched_at : null,
  predictionId: item.prediction_id,
  predictedTop3: item.predicted_top3?.flatMap((horse, index) => typeof horse === "number" ? [{ rank: index + 1, horseNo: horse, horseName: `#${horse}` }] : typeof horse.rank === "number" && typeof horse.horse_no === "number" ? [{ rank: horse.rank, horseNo: horse.horse_no, horseName: horse.horse_name ?? `#${horse.horse_no}` }] : []) ?? [],
  officialTop3: item.official_top3?.flatMap((horse, index) => typeof horse === "number" ? [{ finish: index + 1, horseNo: horse, horseName: `#${horse}` }] : typeof horse.finish === "number" && typeof horse.horse_no === "number" ? [{ finish: horse.finish, horseNo: horse.horse_no, horseName: horse.horse_name ?? `#${horse.horse_no}` }] : []) ?? [],
  top3Coverage: item.top3_coverage,
});

export function RaceHistoryDashboard() {
  const [filters, setFilters] = useState<RaceHistoryFilters>(() => readRaceHistoryFilters());
  const [races, setRaces] = useState<RaceHistoryRace[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [newlyConfirmedRaces, setNewlyConfirmedRaces] = useState<RaceHistoryRace[]>([]);
  const initializedNotifications = useRef(false);
  useEffect(() => {
    let live = true;
    void fetchAvailablePredictionDates().then(value => {
      if (!live) return;
      const latest = value.latest_prediction_date;
      if (!latest) { setLoading(false); return; }
      setFilters(current => ({ ...current, from: latest, to: latest }));
    }).catch(reason => { if (live) { setError(reason); setLoading(false); } });
    return () => { live = false; };
  }, []);
  const load = async (manual = false) => {
    if (!filters.from || filters.from !== filters.to) { setRaces([]); setLoading(false); return; }
    manual ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      const response = await fetchLabResults({ date: filters.from, organization: filters.organization || undefined, venue: filters.venue || undefined });
      setRaces(response.results.map(item => toRaceHistoryRace(item, response.date ?? response.race_date ?? filters.from)));
    } catch (reason) { setRaces([]); setError(reason); }
    finally { setLoading(false); setRefreshing(false); }
  };
  useEffect(() => { void load(); }, [filters.from, filters.to, filters.organization, filters.venue]);
  useEffect(() => {
    const confirmedKeys = races.filter(race => (race.resultStatus === "CONFIRMED" || race.resultStatus === "DEAD_HEAT") && Boolean(race.confirmedAt)).map(race => race.raceKey);
    const knownKeys = readConfirmedRaceKeys();
    if (!initializedNotifications.current) { initializedNotifications.current = true; if (!knownKeys.length) { persistConfirmedRaceKeys(confirmedKeys); return; } }
    const newlyConfirmed = findNewlyConfirmedRaces(races, knownKeys);
    if (newlyConfirmed.length) { setNewlyConfirmedRaces(newlyConfirmed); toast.success("レース結果が確定しました", { description: `新たに${newlyConfirmed.length}件の公式結果を反映しました。` }); }
    persistConfirmedRaceKeys(confirmedKeys);
  }, [races]);
  const data: RaceHistoryData = { source: null, races, recentRuns: [] };
  return <RaceHistoryDashboardView data={data} loading={loading} refreshing={refreshing} error={error} onRefresh={() => void load(true)} filters={filters} onFiltersChange={setFilters} newlyConfirmedRaces={newlyConfirmedRaces} onDismissNotifications={() => setNewlyConfirmedRaces([])} />;
}
