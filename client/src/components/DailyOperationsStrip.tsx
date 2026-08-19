import React, { useCallback, useEffect, useState } from "react";
import { Activity, AlertTriangle, CircleHelp, RefreshCw } from "lucide-react";
import { LabApiError, fetchAvailablePredictionDates, fetchDailyOperations, fetchLabHealth, getApiBase, type LabAvailableDates, type LabDailyOperations, type LabHealth } from "@/lib/singlePickAi";

const fmt = (value: string | null | undefined) => value ? new Date(value).toLocaleString("ja-JP", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "取得不能";
const errorText = (reason: unknown) => reason instanceof Error ? reason.message : typeof reason === "string" ? reason : "API応答エラー";
const errorDetail = (reason: unknown) => reason instanceof LabApiError ? reason.detail : null;

type Diagnostic = {
  state: "idle" | "checking" | "ok" | "error";
  origin: string;
  responseMs: number | null;
  schema: string;
  auth: string;
  detail: string;
  features: string[];
};

type Props = { selectedDate: string | null; onLatestDate?: (date: string) => void };

export function DailyOperationsStrip({ selectedDate, onLatestDate }: Props) {
  const [daily, setDaily] = useState<LabDailyOperations | null>(null);
  const [availableDates, setAvailableDates] = useState<LabAvailableDates | null>(null);
  const [dailyError, setDailyError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [diagnostic, setDiagnostic] = useState<Diagnostic>({ state: "idle", origin: "取得不能", responseMs: null, schema: "未確認", auth: "未確認", detail: "未実行", features: [] });
  const activeDate = selectedDate ?? availableDates?.latest_prediction_date ?? null;

  const runDiagnostic = useCallback(async () => {
    const started = performance.now();
    const base = getApiBase();
    let configuredOrigin = "同一origin";
    try { configuredOrigin = new URL(base || window.location.origin).origin; } catch { configuredOrigin = "不正な接続先"; }
    setDiagnostic({ state: "checking", origin: configuredOrigin, responseMs: null, schema: "確認中", auth: "確認中", detail: "read-only health APIへ接続しています。", features: [] });
    try {
      const health: LabHealth = await fetchLabHealth();
      const authNormal = health.auth_state === "NOT_REQUIRED_READ_ONLY";
      const schemaNormal = health.schema_version === "lab-api-v2";
      const reachable = health.reachable === true;
      const apiNormal = reachable && authNormal && schemaNormal;
      setDiagnostic({
        state: apiNormal ? "ok" : "error",
        origin: health.origin ?? configuredOrigin,
        responseMs: Math.round(performance.now() - started),
        schema: health.schema_version ?? "取得不能",
        auth: health.auth_state ?? "取得不能",
        detail: !reachable ? "正本APIが到達不可を返しました。" : !schemaNormal ? "想定外のAPI schema versionです。" : !authNormal ? "read-only APIの認証状態を確認してください。" : "read-only APIは正常です。",
        features: health.features ?? [],
      });
    } catch (reason) {
      setDiagnostic({ state: "error", origin: configuredOrigin, responseMs: Math.round(performance.now() - started), schema: "確認不能", auth: "確認不能", detail: errorText(reason), features: [] });
    }
  }, []);

  const refreshAvailableDates = useCallback(async () => {
    try {
      const value = await fetchAvailablePredictionDates();
      setAvailableDates(value);
      if (!value.latest_prediction_date) setDaily(null);
    } catch (reason) {
      setAvailableDates(null);
      setDaily(null);
      setDailyError(reason);
    }
  }, []);

  useEffect(() => { void refreshAvailableDates(); void runDiagnostic(); }, [refreshAvailableDates, runDiagnostic]);

  useEffect(() => {
    if (!activeDate) return;
    let live = true;
    setLoading(true);
    setDailyError(null);
    void fetchDailyOperations(activeDate)
      .then(value => { if (live) setDaily(value); })
      .catch(reason => { if (live) { setDaily(null); setDailyError(reason); } })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [activeDate]);

  const refreshAll = async () => {
    await Promise.all([refreshAvailableDates(), runDiagnostic()]);
  };

  const automation = !daily ? { label: "取得不能", className: "is-error" } : daily.automation_status === "NORMAL" ? { label: "正常", className: "is-ok" } : daily.automation_status === "WAITING" ? { label: "結果待ち", className: "is-warn" } : daily.automation_status === "REVIEW_REQUIRED" ? { label: "要人手確認", className: "is-error" } : { label: "取得不能", className: "is-error" };
  const requestedDate = activeDate ?? "開催日未選択";
  const apiErrorDetail = errorDetail(dailyError);

  return <section className="daily-operations-strip" aria-label="日次運用ステータス">
    <div className="daily-operations-heading">
      <div><span className="eyebrow">DAILY OPERATIONS</span><strong>{requestedDate} · 正本APIレスポンス基準</strong></div>
      <div className="daily-operations-actions">
        {availableDates?.latest_prediction_date ? <button type="button" onClick={() => onLatestDate?.(availableDates.latest_prediction_date!)}><RefreshCw size={13} /> 最新開催日へ移動</button> : null}
        <button type="button" onClick={() => void refreshAll()}><Activity size={13} /> 接続診断を更新</button>
      </div>
    </div>
    <div className="daily-operations-grid">
      <span><small>本日の予測 JRA / NAR</small><b>{daily?.prediction_counts ? `${daily.prediction_counts.JRA ?? "取得不能"} / ${daily.prediction_counts.NAR ?? "取得不能"}` : "取得不能"}</b></span>
      <span><small>公式結果取得数</small><b>{daily?.official_result_count ?? "取得不能"}</b></span>
      <span><small>未確定 / REVIEW_REQUIRED</small><b>{daily ? `${daily.pending_count ?? "取得不能"} / ${daily.review_required_count ?? "取得不能"}` : "取得不能"}</b></span>
      <span><small>最終予測日時</small><b>{fmt(daily?.last_prediction_at)}</b></span>
      <span><small>最終結果取得日時</small><b>{fmt(daily?.last_result_at)}</b></span>
      <span><small>最終PDCA更新日時</small><b>{fmt(daily?.last_pdca_at)}</b></span>
      <span><small>自動処理</small><b className={automation.className}>{automation.label}</b><small>次回: {daily?.next_scheduled_at ? fmt(daily.next_scheduled_at) : "未定"}</small></span>
    </div>
    {dailyError ? <details className="daily-error-detail" open><summary><AlertTriangle size={13} /> 日次運用データを取得できません</summary><p>件数・時刻は0件へ置き換えず、取得不能として表示しています。</p><pre>{errorText(dailyError)}{apiErrorDetail ? `\n${apiErrorDetail}` : ""}</pre></details> : null}
    {diagnostic.state !== "idle" && <details className="daily-diagnostic" open={diagnostic.state === "error"}><summary><CircleHelp size={13} /> 接続診断 {diagnostic.state === "checking" ? "実行中" : diagnostic.state === "ok" ? "正常" : "要確認"}</summary><div><span>接続先origin <b>{diagnostic.origin}</b></span><span>到達可否 <b>{diagnostic.state === "ok" ? "可能" : diagnostic.state === "checking" ? "確認中" : "不可"}</b></span><span>schema version <b>{diagnostic.schema}</b></span><span>認証状態 <b>{diagnostic.auth}</b></span><span>応答時間 <b>{diagnostic.responseMs === null ? "取得不能" : `${diagnostic.responseMs}ms`}</b></span><span>利用可能機能 <b>{diagnostic.features.length ? diagnostic.features.join(" / ") : "取得不能"}</b></span><small>{diagnostic.detail}</small></div></details>}
    {loading && <div className="daily-operations-loading"><RefreshCw className="spin" size={14} /> 日次運用データを読み込み中</div>}
  </section>;
}
