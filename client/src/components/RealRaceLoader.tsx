import React, { useEffect, useMemo, useState } from "react";
import { CircleCheck, Database, History, Hourglass, LoaderCircle, Minus, RefreshCw, TriangleAlert } from "lucide-react";
import { Link } from "wouter";
import type { Horse } from "@/lib/horseTypes";
import { fetchAvailablePredictionDates, fetchRace, fetchRaces, getApiBase, toHorses, type LabRace, type LabRaceListItem } from "@/lib/singlePickAi";
import { retrySinglePick } from "@/lib/singlePickRetry";
import { organizationFromRaceKey, trackBetaEvent } from "@/lib/betaAnalytics";
import { decisionBucketLabel, decisionLabel, normalizeDecisionStatus } from "@/lib/labels";

const ORGS = ["NAR", "JRA"] as const;
export type RealRaceLoad = { race: LabRace; horses: Horse[] };
export type RealRaceLoadStatus = "API未接続" | "認証エラー" | "選択日の予測なし" | "結果待ち" | "API応答エラー" | "正常読込済み";
type DecisionBucket = "BET" | "NO_BET" | "UNKNOWN";
type DecisionFilter = "ALL" | DecisionBucket;

function formatStartTime(iso: string | null): string {
  if (!iso) return "発走時刻未取得";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "発走時刻未取得" : date.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
}

// A race's top_pick is only the true AI honmei when final_mark is exactly
// "◎" -- never inferred from name presence, ai_rank, or v23k_rank. When the
// list API's top_pick isn't honmei-based (e.g. a rank-based fallback pick),
// this must render as absent, not as a fabricated "◎".
function honmeiPick(race: LabRaceListItem): { name: string } | null {
  const pick = race.top_pick;
  return pick?.final_mark === "◎" && pick.name ? { name: pick.name } : null;
}

function decisionIcon(bucket: DecisionBucket) {
  if (bucket === "BET") return CircleCheck;
  if (bucket === "NO_BET") return Minus;
  return Hourglass;
}

async function findLatestPredictionDate() {
  const result = await fetchAvailablePredictionDates();
  return result.latest_prediction_date ?? "";
}

export function RealRaceLoader({ onLoad, onStatusChange }: { onLoad: (loaded: RealRaceLoad) => void; onStatusChange?: (status: RealRaceLoadStatus) => void }) {
  const [base] = useState(getApiBase());
  const [date, setDate] = useState("");
  const [org, setOrg] = useState<(typeof ORGS)[number]>("NAR");
  const [races, setRaces] = useState<LabRaceListItem[]>([]);
  const [loadingRaces, setLoadingRaces] = useState(false);
  const [loadingRaceKey, setLoadingRaceKey] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [selectedRaceKey, setSelectedRaceKey] = useState<string | null>(null);
  const [filter, setFilter] = useState<DecisionFilter>("ALL");

  const refresh = () => {
    if (!date) return;
    setLoadingRaces(true);
    setError("");
    setNotice("レース一覧を取得中です。");
    void retrySinglePick(() => fetchRaces(date, org), { onRetry: ({ attempt, maxAttempts, nextDelayMs }) => setNotice(`接続を再試行しています（${attempt + 1}/${maxAttempts}回・${(nextDelayMs / 1000).toFixed(1)}秒後）。`) }).then((data) => {
      setRaces(data.races);
      setFilter("ALL");
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
    return () => { active = false; };
  }, []);
  useEffect(() => { refresh(); }, [date, org, base]);

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

  // Client-side only: counts and filtering over the already-fetched race
  // array. Never touches race.decision.status or how BET/NO_BET/UNKNOWN is
  // computed -- purely a display-layer summary/filter over real fetched data.
  const counts = useMemo(() => {
    const tally: Record<DecisionBucket, number> = { BET: 0, NO_BET: 0, UNKNOWN: 0 };
    for (const race of races) tally[normalizeDecisionStatus(race.decision?.status)]++;
    return tally;
  }, [races]);
  const filteredRaces = useMemo(
    () => filter === "ALL" ? races : races.filter((race) => normalizeDecisionStatus(race.decision?.status) === filter),
    [races, filter],
  );

  return <section id="real-race-input" className="race-catalog" aria-label="今日のAI予想一覧">
    <div className="race-catalog-panel">
    <div className="race-catalog-heading"><div><span className="eyebrow">TODAY'S AI PICKS</span><h2>今日のAI予想。</h2></div><div className="race-catalog-heading-actions"><Link href="/ai-history" className="real-race-history-link"><History size={14} /> AI履歴</Link><Database size={17} /></div></div>
    <p className="race-catalog-intro">実際のレースデータをもとにAI予測を読み込みます。読み込んだAI予測と、条件を変えたwhat-ifの結果は混ぜずに表示します。</p>
    <div className="real-race-controls"><label><span>開催日</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label><div className="real-race-org" aria-label="主催"><span>主催</span><div>{ORGS.map((value) => <button type="button" key={value} className={org === value ? "selected" : ""} onClick={() => { if (value !== org) trackBetaEvent({ name: "beta_org_switch", properties: { organization: value, source: "catalog" } }); setOrg(value); }}>{value}</button>)}</div></div><button className="real-race-refresh" type="button" onClick={refresh} disabled={loadingRaces || !date}>{loadingRaces ? <LoaderCircle className="spin" size={14} /> : <RefreshCw size={14} />} 更新</button></div>
    {error && <div className="real-race-status real-race-status--error" role="alert"><TriangleAlert size={14} /><span>{error}</span></div>}{notice && !error && <p className="real-race-status" aria-live="polite">{notice}</p>}
    {!loadingRaces && !error && races.length > 0 && <div className="race-catalog-summary">
      <div className="race-catalog-summary-meta"><strong>{date} · {org}</strong><span>全{races.length}件</span></div>
      <div className="race-catalog-filter" role="tablist" aria-label="判断で絞り込み">
        <button type="button" role="tab" aria-selected={filter === "ALL"} className={filter === "ALL" ? "selected" : ""} onClick={() => setFilter("ALL")}>すべて<b>{races.length}</b></button>
        {(["BET", "NO_BET", "UNKNOWN"] as const).map((bucket) => <button type="button" role="tab" key={bucket} aria-selected={filter === bucket} className={`race-catalog-filter-${bucket.toLowerCase()}${filter === bucket ? " selected" : ""}`} onClick={() => setFilter(bucket)}>{decisionBucketLabel(bucket)}<b>{counts[bucket]}</b></button>)}
      </div>
    </div>}
    <div className="real-race-list" id="real-race-list">{loadingRaces ? <div className="real-race-empty"><LoaderCircle className="spin" size={17} /> 一覧を取得しています</div> : filteredRaces.length ? filteredRaces.map((race) => {
      const honmei = honmeiPick(race);
      const bucket = normalizeDecisionStatus(race.decision?.status);
      const DecisionIcon = decisionIcon(bucket);
      return <div key={race.race_key} className="real-race-card">
        <div className="real-race-card-head"><strong>{race.venue ?? race.race_key}{race.race_no ? ` ${race.race_no}R` : ""}</strong><span>{formatStartTime(race.scheduled_start_at)}</span></div>
        <div className="real-race-card-pick"><span className="real-race-pick-label">AI本命</span>{honmei ? <strong className="real-race-pick-name">◎ {honmei.name}</strong> : <strong className="real-race-pick-name real-race-pick-name--empty">AI本命なし</strong>}</div>
        <div className={`real-race-card-decision real-race-card-decision--${bucket.toLowerCase()}`}><DecisionIcon size={13} aria-hidden="true" /><span>{decisionLabel(race.decision?.status ?? "UNKNOWN")}</span></div>
        <button type="button" className="real-race-detail-button" disabled={loadingRaceKey !== null} onClick={() => loadRace(race.race_key)}>{loadingRaceKey === race.race_key ? <LoaderCircle className="spin" size={14} /> : <>詳細を見る<span aria-hidden="true"> ＞</span></>}</button>
      </div>;
    }) : races.length ? <div className="real-race-empty">この条件に一致するレースがありません</div> : <div className="real-race-empty">{date ? "取得できるレースがありません" : "予測可能日を確認しています"}</div>}</div>
    <p className="real-race-provenance"><strong>能力値の出所:</strong> 末脚はv23k実値。as-of履歴として明示される項目のみ履歴実値、それ以外の補助能力は暫定値です。詳細は出走馬タブで確認できます。</p>
    </div>
  </section>;
}
