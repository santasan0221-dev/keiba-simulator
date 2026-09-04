import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarDays, Clock3, Database, RefreshCw, Rows3, SlidersHorizontal } from "lucide-react";
import { DailyOperationsStrip } from "./DailyOperationsStrip";
import { LabApiError, fetchAvailablePredictionDates, fetchLabResults, type LabResultListItem, type LabResultPredictionHorse } from "@/lib/singlePickAi";

type OrganizationFilter = "" | "JRA" | "NAR";

const errorMessage = (reason: unknown) => reason instanceof Error ? reason.message : "API応答エラー";
const errorDetail = (reason: unknown) => reason instanceof LabApiError ? reason.detail : null;
const dateTime = (value: string | null) => value ? new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "取得不能";

export function statusText(status: string | null): string {
  if (!status) return "取得不能";
  const labels: Record<string, string> = {
    CONFIRMED: "確定",
    DEAD_HEAT: "同着",
    PENDING: "未確定",
    REVIEW_REQUIRED: "確認中",
    FAILED: "取得失敗",
    RACE_STOPPED: "競走中止",
  };
  return labels[status] ?? status;
}

function horseLabel(value: unknown, fallbackRank: number): string | null {
  if (typeof value === "number") return `#${value}`;
  if (value && typeof value === "object") {
    const horse = value as { horse_no?: unknown; horse_name?: unknown; rank?: unknown; finish?: unknown };
    const no = typeof horse.horse_no === "number" ? `#${horse.horse_no}` : null;
    const name = typeof horse.horse_name === "string" && horse.horse_name.trim() ? horse.horse_name : null;
    const rank = typeof horse.rank === "number" ? horse.rank : typeof horse.finish === "number" ? horse.finish : fallbackRank;
    return name ? `${rank}.${name}` : no ? `${rank}.${no}` : null;
  }
  return null;
}

export function requestedResultValue(status: string | null, value: number | null, kind: "finish" | "coverage"): string {
  if (typeof value === "number") return kind === "finish" ? `${value}着` : `${value} / 3`;
  if (status === "PENDING") return "未確定";
  if (status === "CONFIRMED" || status === "DEAD_HEAT") return "取得不能";
  return statusText(status);
}

// Each predicted_top3 entry carries its own saved final_mark -- render it
// directly, never derive ◎/○/▲ from the entry's position in the array.
// Kept to the same "#<horse_no>" format the display used before this fix
// (predicted_top3 previously carried no name data at all); not a display
// redesign, only the mark source changed.
export function predictedMarkLabel(entry: LabResultPredictionHorse): string {
  return `${entry.mark}#${entry.horse_no}`;
}

function ResultRow({ item }: { item: LabResultListItem }) {
  const predicted = item.predicted_top3?.map(predictedMarkLabel) ?? [];
  const official = item.official_top3?.map((horse, index) => horseLabel(horse, index + 1)).filter((value): value is string => Boolean(value)) ?? [];
  const isConfirmed = item.result_status === "CONFIRMED" || item.result_status === "DEAD_HEAT";
  const rowClass = isConfirmed ? "is-confirmed" : item.result_status === "PENDING" ? "is-pending" : "is-review";

  return <article className={`ops-result-row ${rowClass}`}>
    <div className="ops-result-race"><strong>{item.organization ?? "主催未取得"} · {item.venue ?? "会場未取得"} {item.race_no ? `${item.race_no}R` : "レース番号未取得"}</strong><small>発走 {dateTime(item.scheduled_start_at)} · 予測生成 {dateTime(item.prediction_created_at)}</small></div>
    <div><span>◎○▲</span><strong>{predicted.length ? predicted.join(" ") : "取得不能"}</strong></div>
    <div><span>公式1〜3着</span><strong>{official.length ? official.join(" / ") : item.special_statuses?.length ? item.special_statuses.join(" / ") : item.result_status === "PENDING" ? "未確定" : "取得不能"}</strong></div>
    <div><span>◎着順 / top3 coverage</span><strong>{requestedResultValue(item.result_status, item.ai_pick_finish, "finish")} / {requestedResultValue(item.result_status, item.top3_coverage, "coverage")}</strong></div>
    <div><span>結果状態</span><strong>{statusText(item.result_status)}{item.special_statuses?.length ? ` · ${item.special_statuses.join(" / ")}` : ""}</strong></div>
    <div><span>結果取得</span><strong>{dateTime(item.result_fetched_at)}</strong><details className="ops-result-id"><summary>詳細ID</summary><small>{item.prediction_id ?? "取得不能"}</small></details></div>
  </article>;
}

export function OperationsDashboard() {
  const [availableDates, setAvailableDates] = useState<string[] | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [organization, setOrganization] = useState<OrganizationFilter>("");
  const [venue, setVenue] = useState("");
  const [results, setResults] = useState<LabResultListItem[] | null>(null);
  const [datesError, setDatesError] = useState<unknown>(null);
  const [resultsError, setResultsError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const refreshDates = useCallback(async (moveToLatest = false) => {
    setDatesError(null);
    try {
      const response = await fetchAvailablePredictionDates();
      const dates = response.available_dates ?? [];
      setAvailableDates(dates);
      setSelectedDate(current => {
        if (moveToLatest) return response.latest_prediction_date ?? null;
        if (current && dates.includes(current)) return current;
        return response.latest_prediction_date ?? null;
      });
    } catch (reason) {
      setAvailableDates(null);
      setSelectedDate(null);
      setResults(null);
      setDatesError(reason);
    }
  }, []);

  useEffect(() => { void refreshDates(); }, [refreshDates]);

  const venues = useMemo(() => Array.from(new Set((results ?? []).map(item => item.venue).filter((value): value is string => Boolean(value)))).sort((left, right) => left.localeCompare(right, "ja")), [results]);

  useEffect(() => {
    if (venue && !venues.includes(venue)) setVenue("");
  }, [venue, venues]);

  const loadResults = useCallback(async (manual = false) => {
    if (!selectedDate) {
      setResults(null);
      return;
    }
    manual ? setRefreshing(true) : setLoading(true);
    setResultsError(null);
    try {
      const response = await fetchLabResults({ date: selectedDate, organization: organization || undefined, venue: venue || undefined });
      setResults(response.results);
    } catch (reason) {
      setResults(null);
      setResultsError(reason);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [organization, selectedDate, venue]);

  useEffect(() => { void loadResults(); }, [loadResults]);

  const summary = useMemo(() => {
    if (!results) return null;
    return {
      total: results.length,
      confirmed: results.filter(item => item.result_status === "CONFIRMED" || item.result_status === "DEAD_HEAT").length,
      pending: results.filter(item => item.result_status === "PENDING").length,
      review: results.filter(item => item.result_status === "REVIEW_REQUIRED").length,
    };
  }, [results]);

  return <section className="ops-dashboard" aria-label="公式結果の運用ダッシュボード">
    <DailyOperationsStrip selectedDate={selectedDate} onLatestDate={date => setSelectedDate(date)} />
    <header className="ops-dashboard-heading">
      <div><span className="eyebrow">検証記録</span><h2>予測と公式結果</h2><p>single_pick_ai正本APIが返した予測時点と結果確定後の情報を同じレコードで示します。WHAT-IF結果や推定値は混在させません。</p></div>
      <button type="button" className="ops-dashboard-refresh" onClick={() => { void refreshDates(); void loadResults(true); }} disabled={refreshing}><RefreshCw className={refreshing ? "spin" : ""} size={15} /> {refreshing ? "更新中" : "更新"}</button>
    </header>

    <section className="ops-filter-panel" aria-label="公式結果の絞り込み">
      <label><CalendarDays size={13} /> 開催日<select value={selectedDate ?? ""} onChange={event => { setSelectedDate(event.target.value || null); setVenue(""); }} disabled={!availableDates?.length}><option value="">{availableDates === null ? "取得不能" : "予測データの日付なし"}</option>{availableDates?.map(date => <option key={date} value={date}>{date}</option>)}</select></label>
      <label><SlidersHorizontal size={13} /> 主催<select value={organization} onChange={event => { setOrganization(event.target.value as OrganizationFilter); setVenue(""); }} disabled={!selectedDate}><option value="">JRA/NARすべて</option><option value="JRA">JRA</option><option value="NAR">NAR</option></select></label>
      <label><Database size={13} /> 競馬場<select value={venue} onChange={event => setVenue(event.target.value)} disabled={!selectedDate || results === null}><option value="">すべての競馬場</option>{venues.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
      <small>{availableDates?.length ? `正本予測がある日付: ${availableDates.length}日` : availableDates === null ? "日付候補を取得できません" : "予測データの日付がありません"}</small>
    </section>

    {datesError ? <details className="ops-api-error" open><summary><AlertTriangle size={14} /> 日付候補を取得できません</summary><p>ブラウザ日付や固定日付へ代替せず、開催日を選択できない状態として扱います。</p><pre>{errorMessage(datesError)}{errorDetail(datesError) ? `\n${errorDetail(datesError)}` : ""}</pre></details> : null}

    <div className="ops-result-summary" aria-label="当日の結果状態集計">
      <span><small>対象レース</small><b>{summary ? summary.total : "取得不能"}</b></span>
      <span><small>確定 / 同着を含む</small><b>{summary ? summary.confirmed : "取得不能"}</b></span>
      <span><small>未確定</small><b>{summary ? summary.pending : "取得不能"}</b></span>
      <span><small>確認中</small><b>{summary ? summary.review : "取得不能"}</b></span>
    </div>

    <section className="ops-result-table-wrap" aria-label="予測と公式結果一覧">
      <header><div><span className="eyebrow">PREDICTION VS OFFICIAL RESULTS</span><h3>結果一覧</h3></div><span>{summary ? `${summary.total}件を表示` : "取得不能"}</span></header>
      {loading ? <div className="ops-empty"><RefreshCw className="spin" size={18} /> 正本結果を読み込み中</div> : resultsError ? <details className="ops-api-error" open><summary><AlertTriangle size={14} /> 結果一覧を取得できません</summary><p>0件や成功へ置き換えず、取得不能として表示しています。</p><pre>{errorMessage(resultsError)}{errorDetail(resultsError) ? `\n${errorDetail(resultsError)}` : ""}</pre></details> : results === null ? <div className="ops-empty"><Clock3 size={18} /> 開催日を選択すると結果一覧を取得します。</div> : !results.length ? <div className="ops-empty"><Rows3 size={18} /> この条件の正本結果は0件です。</div> : <div className="ops-result-ledger">{results.map(item => <ResultRow key={item.race_key} item={item} />)}</div>}
    </section>
  </section>;
}
