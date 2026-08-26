import { useEffect, useState } from "react";
import { Database, History, LoaderCircle, RefreshCw, Share2, TriangleAlert } from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";
import type { Horse } from "@/pages/Home";
import { fetchAvailablePredictionDates, fetchLabHealth, fetchRace, fetchRaces, getApiBase, setApiBase, toHorses, type LabHealth, type LabRace, type LabRaceListItem } from "@/lib/singlePickAi";
import { retrySinglePick } from "@/lib/singlePickRetry";
import { fetchOfficialResultJob, fetchOpsCapability, fetchResultHealth, startOfficialResultJob, type OfficialResultJob, type ResultHealth } from "@/lib/officialResultOps";
import { absoluteRaceUrl, raceKeyToPath } from "@/lib/raceShareUrl";
import { organizationFromRaceKey, trackBetaEvent } from "@/lib/betaAnalytics";

const ORGS = ["NAR", "JRA"] as const;
export type RealRaceLoad = { race: LabRace; horses: Horse[] };
export type RealRaceLoadStatus = "API未接続" | "認証エラー" | "選択日の予測なし" | "結果待ち" | "API応答エラー" | "正常読込済み";

function formatStartTime(iso: string | null): string {
  if (!iso) return "発走時刻未取得";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "発走時刻未取得" : date.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
}

function formatCalibratedPercent(value: number | null): string {
  return typeof value === "number" && Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : "未校正";
}

async function shareRace(raceKey: string) {
  const url = absoluteRaceUrl(raceKey);
  if (!url) return;
  if (typeof navigator !== "undefined" && "share" in navigator) {
    try {
      await navigator.share({ title: "KEIBA LAB", text: "AI視点でこのレースを確認する", url });
      trackBetaEvent({ name: "beta_share", properties: { organization: organizationFromRaceKey(raceKey), method: "native" } });
      return;
    } catch {
      // Cancelled or unsupported by the platform -- fall back to clipboard.
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    trackBetaEvent({ name: "beta_share", properties: { organization: organizationFromRaceKey(raceKey), method: "clipboard" } });
    toast.success("URLをコピーしました。");
  } catch {
    toast.error("URLのコピーに失敗しました。", { description: url });
  }
}

async function findLatestPredictionDate() {
  const result = await fetchAvailablePredictionDates();
  return result.latest_prediction_date ?? "";
}

const jobLabel: Record<OfficialResultJob["status"], string> = {
  QUEUED: "待機中", RUNNING: "取得中", COMPLETE: "完了", PARTIAL: "一部未確定", FAILED: "失敗", REVIEW_REQUIRED: "要確認",
};

export function RealRaceLoader({ onLoad, onStatusChange }: { onLoad: (loaded: RealRaceLoad) => void; onStatusChange?: (status: RealRaceLoadStatus) => void }) {
  const [base, setBase] = useState(getApiBase());
  const [date, setDate] = useState("");
  const [org, setOrg] = useState<(typeof ORGS)[number]>("NAR");
  const [races, setRaces] = useState<LabRaceListItem[]>([]);
  const [loadingRaces, setLoadingRaces] = useState(false);
  const [loadingRaceKey, setLoadingRaceKey] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [selectedRaceKey, setSelectedRaceKey] = useState<string | null>(null);
  const [opsReady, setOpsReady] = useState(false);
  const [opsMessage, setOpsMessage] = useState("運用APIの認証が必要です。");
  const [resultJob, setResultJob] = useState<OfficialResultJob | null>(null);
  const [resultHealth, setResultHealth] = useState<ResultHealth | null>(null);
  const [labHealth, setLabHealth] = useState<LabHealth | null>(null);

  const refresh = () => {
    if (!date) return;
    setLoadingRaces(true);
    setError("");
    setNotice("レース一覧を取得中です。");
    void retrySinglePick(() => fetchRaces(date, org), { onRetry: ({ attempt, maxAttempts, nextDelayMs }) => setNotice(`接続を再試行しています（${attempt + 1}/${maxAttempts}回・${(nextDelayMs / 1000).toFixed(1)}秒後）。`) }).then((data) => {
      setRaces(data.races);
      onStatusChange?.(data.races.length ? "結果待ち" : "選択日の予測なし");
      setNotice(data.races.length ? `${data.races.length}件のレース候補を取得しました。` : "選択日の予測なし。日付または主催を変更してください。");
    }).catch((reason: unknown) => {
      setRaces([]);
      setNotice("");
      onStatusChange?.("API未接続");
      setError(`API未接続。single_pick_aiに接続できません。${reason instanceof Error ? reason.message : String(reason)}`);
    }).finally(() => setLoadingRaces(false));
  };

  useEffect(() => {
    let active = true;
    void findLatestPredictionDate().then((latest) => { if (active) setDate(latest); }).catch(() => { if (active) setDate(""); });
    void fetchLabHealth().then((health) => { if (active) setLabHealth(health); }).catch(() => { if (active) setLabHealth(null); });
    void fetchOpsCapability().then((capability) => {
      if (!active) return;
      setOpsReady(capability.configured);
      setOpsMessage(capability.configured ? "認証済み運用API。公式結果取得は正本SQLiteへ記録します。" : "ローカル運用APIへの認証・実行環境が必要です。ボタンは実行できません。");
    }).catch(() => { if (active) { setOpsReady(false); setOpsMessage("認証エラー。ローカル運用APIへ接続できません。"); } });
    return () => { active = false; };
  }, [base]);
  useEffect(() => { refresh(); }, [date, org, base]);
  useEffect(() => {
    if (!date) return;
    void fetchResultHealth(date).then(setResultHealth).catch(() => setResultHealth(null));
  }, [date, resultJob?.updatedAt]);
  useEffect(() => {
    if (!resultJob || !["QUEUED", "RUNNING"].includes(resultJob.status)) return;
    const timer = window.setInterval(() => { void fetchOfficialResultJob(resultJob.jobId).then(setResultJob).catch(() => undefined); }, 1500);
    return () => window.clearInterval(timer);
  }, [resultJob]);
  useEffect(() => {
    if (!resultJob || !["COMPLETE", "PARTIAL", "FAILED", "REVIEW_REQUIRED"].includes(resultJob.status)) return;
    if (resultJob.status === "COMPLETE") {
      setNotice("公式結果とpost-result analysisが完了しました。表示を再読み込みしています。");
      refresh();
      if (selectedRaceKey) void loadRace(selectedRaceKey);
      void fetchLabHealth().then(setLabHealth).catch(() => setLabHealth(null));
      window.dispatchEvent(new Event("keiba:official-results-updated"));
    } else {
      setError(`公式結果取得は${jobLabel[resultJob.status]}です。${resultJob.error ?? "未確定または要確認の項目があります。"}`);
    }
  }, [resultJob?.status]);

  const updateBase = (value: string) => { setBase(value); setApiBase(value); };
  const loadRace = async (raceKey: string) => {
    trackBetaEvent({ name: "beta_race_select", properties: { organization: organizationFromRaceKey(raceKey), source: "catalog" } });
    setLoadingRaceKey(raceKey); setSelectedRaceKey(raceKey); setError(""); setNotice("実レースの入力データを確認しています。");
    try {
      const race = await retrySinglePick(() => fetchRace(raceKey), { onRetry: ({ attempt, maxAttempts, nextDelayMs }) => setNotice(`実レースの取得を再試行しています（${attempt + 1}/${maxAttempts}回・${(nextDelayMs / 1000).toFixed(1)}秒後）。`) });
      onLoad({ race, horses: toHorses(race) });
      onStatusChange?.("正常読込済み");
      setNotice(race.model.calibration_status === "READY" ? "実レースを読み込みました。校正済み予測はTRUTH PANEL、what-ifは別セクションに表示します。" : "実レースを読み込みました。確率は未校正のため、TRUTH PANELでは数値を表示しません。");
    } catch (reason) { onStatusChange?.("API応答エラー"); setError(`API応答エラー。実レースを読み込めませんでした。${reason instanceof Error ? reason.message : String(reason)}`); setNotice(""); }
    finally { setLoadingRaceKey(null); }
  };
  const fetchOfficialResults = () => {
    if (!date || !opsReady || resultJob && ["QUEUED", "RUNNING"].includes(resultJob.status)) return;
    const message = `${date}のJRA/NAR公式結果を取得します。未確定結果はPENDINGとして記録されます。`;
    if (!window.confirm(message)) return;
    setError(""); setNotice("公式結果取得ジョブを開始しています。");
    void startOfficialResultJob(date).then(({ job_id }) => fetchOfficialResultJob(job_id)).then(setResultJob).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason)));
  };
  const jobRunning = Boolean(resultJob && ["QUEUED", "RUNNING"].includes(resultJob.status));
  const resultHealthState = resultHealth?.status === "COMPLETE" ? "正常" : resultHealth?.status === "NO_RUN" ? "注意" : "異常";
  const labHealthNormal = labHealth?.reachable === true && labHealth.schema_version === "lab-api-v2" && labHealth.auth_state === "NOT_REQUIRED_READ_ONLY";

  return <section id="real-race-input" className="real-race-loader" aria-label="single_pick_ai実レース入力">
    <div className="real-race-heading"><div><span className="eyebrow">REAL RACE INPUT</span><h2>実レースを取り込む。</h2></div><div className="real-race-heading-actions"><Link href="/ai-history" className="real-race-history-link"><History size={14} /> AI履歴</Link><Database size={17} /></div></div>
    <p className="real-race-intro">single_pick_aiのread-only APIから実データを読み込みます。読み込んだAI予測と、条件変更後のwhat-ifは混ぜずに表示します。</p>
    <label className="real-race-base"><span>接続先 single_pick_ai</span><input value={base} onChange={(event) => updateBase(event.target.value)} placeholder="空欄: 同一オリジン /api/lab" /><small>公開版ではHTTPSの接続先が必要です。ローカルのHTTP URLは利用できません。</small></label>
    <div className="real-race-controls"><label><span>開催日</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label><div className="real-race-org" aria-label="主催"><span>主催</span><div>{ORGS.map((value) => <button type="button" key={value} className={org === value ? "selected" : ""} onClick={() => { if (value !== org) trackBetaEvent({ name: "beta_org_switch", properties: { organization: value, source: "catalog" } }); setOrg(value); }}>{value}</button>)}</div></div><button className="real-race-refresh" type="button" onClick={refresh} disabled={loadingRaces || !date}>{loadingRaces ? <LoaderCircle className="spin" size={14} /> : <RefreshCw size={14} />} 更新</button></div>
    <div className="real-race-ops" aria-label="運用"><div className="real-race-ops-heading"><span>運用</span><small>{opsMessage}</small></div><button type="button" className="real-race-result-button" onClick={fetchOfficialResults} disabled={!opsReady || !date || jobRunning}>{jobRunning ? <LoaderCircle className="spin" size={14} /> : <Database size={14} />} 公式結果を取得</button>{resultJob && <div className="real-race-ops-grid"><span>対象日<strong>{resultJob.raceDate}</strong></span><span>状態<strong>{jobLabel[resultJob.status]}</strong></span><span>selected_races<strong>{resultJob.selectedRaces ?? "—"}</strong></span><span>result_count<strong>{resultJob.resultCount ?? "—"}</strong></span><span>already_recorded<strong>{resultJob.alreadyRecorded ?? "—"}</strong></span><span>retryable_failures<strong>{resultJob.retryableFailures ?? "—"}</strong></span><span>review_required<strong>{resultJob.reviewRequiredFailures ?? "—"}</strong></span><span>batch_status<strong>{resultJob.batchStatus ?? "—"}</strong></span><span>最終成功<strong>{resultJob.lastSuccessAt ? new Date(resultJob.lastSuccessAt).toLocaleString("ja-JP") : "—"}</strong></span>{resultJob.error && <span className="real-race-ops-error">エラー<strong>{resultJob.error}</strong></span>}</div>}<div className="real-race-health">結果健全性: <b>{resultHealthState}</b> / 予測済み {resultHealth?.predictedRaces ?? "—"} / 取得済み {resultHealth?.resultFetchedRaces ?? "—"} / 未確定 {resultHealth?.pendingRaces ?? "—"} / 要確認 {resultHealth?.reviewRequired ?? "—"}</div></div>
    <div className={labHealthNormal ? "real-race-sync-state" : "real-race-sync-state is-error"}><span>API HEALTH</span><strong>{labHealthNormal ? "正本read-only APIは正常です" : "正本read-only APIを確認できません"}</strong><small>{labHealth ? `schema ${labHealth.schema_version ?? "取得不能"} · ${labHealth.auth_state ?? "取得不能"} · 最終更新 ${labHealth.last_updated_at ? new Date(labHealth.last_updated_at).toLocaleString("ja-JP") : "取得不能"}` : "health APIの応答を取得できません。"}</small>{!labHealthNormal && <p>接続失敗時は同期成功や0件へ置き換えず、取得不能として扱います。</p>}</div>
    {error && <div className="real-race-status real-race-status--error" role="alert"><TriangleAlert size={14} /><span>{error}</span></div>}{notice && !error && <p className="real-race-status" aria-live="polite">{notice}</p>}
    <div className="real-race-list" id="real-race-list">{loadingRaces ? <div className="real-race-empty"><LoaderCircle className="spin" size={17} /> 一覧を取得しています</div> : races.length ? races.map((race) => {
      const pick = race.top_pick;
      const calibrated = pick?.prob_status === "CALIBRATED";
      const raceUrlPath = raceKeyToPath(race.race_key);
      return <div key={race.race_key} className="real-race-card">
        <div className="real-race-card-head"><strong>{race.venue ?? race.race_key}{race.race_no ? ` ${race.race_no}R` : ""}</strong><span>{formatStartTime(race.scheduled_start_at)}</span></div>
        <div className="real-race-card-pick"><span className="real-race-pick-name">{pick?.name ? `◎ ${pick.name}` : "AI本命取得不能"}</span>{pick?.selection_basis === "FINAL_MARK_HONMEI" ? <em className="real-race-pick-rank">AI本命</em> : null}</div>
        <div className={`real-race-card-decision real-race-card-decision--${race.decision?.status?.toLowerCase() ?? "unknown"}`}>{race.decision?.status === "BET" ? "BET" : race.decision?.status === "NO_BET" ? "見送り" : "判定データなし"}</div>
        <div className="real-race-card-probs"><span>勝率 <b>{calibrated ? formatCalibratedPercent(pick.win_prob_calibrated) : "未校正"}</b></span><span>複勝率 <b>{calibrated ? formatCalibratedPercent(pick.top3_prob) : "未校正"}</b></span></div>
        <div className="real-race-card-actions">
          <button type="button" className="real-race-detail-button" disabled={loadingRaceKey !== null} onClick={() => loadRace(race.race_key)}>{loadingRaceKey === race.race_key ? <LoaderCircle className="spin" size={14} /> : "詳細を見る"}</button>
          {raceUrlPath && <Link href={raceUrlPath} className="real-race-page-link">共有ページ</Link>}
          {raceUrlPath && <button type="button" className="real-race-share-button" aria-label="このレースを共有" onClick={() => void shareRace(race.race_key)}><Share2 size={13} /></button>}
        </div>
      </div>;
    }) : <div className="real-race-empty">{date ? "取得できるレースがありません" : "予測可能日を確認しています"}</div>}</div>
    <p className="real-race-provenance"><strong>能力値の出所:</strong> 末脚はv23k実値。as-of履歴として明示される項目のみ履歴実値、それ以外の補助能力は暫定値です。詳細は出走馬タブで確認できます。</p>
  </section>;
}
