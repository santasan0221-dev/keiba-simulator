import { useEffect, useState } from "react";
import { Database, History, LoaderCircle, RefreshCw, TriangleAlert } from "lucide-react";
import { Link } from "wouter";
import type { Horse } from "@/pages/Home";
import { fetchRace, fetchRaces, getApiBase, setApiBase, toHorses, type LabRace, type LabRaceListItem } from "@/lib/singlePickAi";
import { retrySinglePick } from "@/lib/singlePickRetry";
import { describeLastSync, describeNextSync, describeSyncError } from "@/lib/singlePickSyncStatus";
import { trpc } from "@/lib/trpc";

const ORGS = ["NAR", "JRA"] as const;
export type RealRaceLoad = { race: LabRace; horses: Horse[] };

function todayJst(): string {
  const now = new Date();
  const jst = new Date(now.getTime() + (now.getTimezoneOffset() + 540) * 60_000);
  return jst.toISOString().slice(0, 10);
}

export function RealRaceLoader({ onLoad }: { onLoad: (loaded: RealRaceLoad) => void }) {
  const [base, setBase] = useState(getApiBase());
  const [date, setDate] = useState(todayJst());
  const [org, setOrg] = useState<(typeof ORGS)[number]>("NAR");
  const [races, setRaces] = useState<LabRaceListItem[]>([]);
  const [loadingRaces, setLoadingRaces] = useState(false);
  const [loadingRaceKey, setLoadingRaceKey] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const syncStatus = trpc.raceSync.dashboard.useQuery(undefined, { refetchInterval: 60_000, refetchOnWindowFocus: true });

  const refresh = () => {
    setLoadingRaces(true);
    setError("");
    setNotice("レース一覧を取得中です。");
    void retrySinglePick(() => fetchRaces(date, org), { onRetry: ({ attempt, maxAttempts, nextDelayMs }) => setNotice(`接続を再試行しています（${attempt + 1}/${maxAttempts}回・${(nextDelayMs / 1000).toFixed(1)}秒後）。`) }).then((data) => {
      setRaces(data.races);
      setNotice(data.races.length ? `${data.races.length}件のレース候補を取得しました。` : "対象レースがありません。日付または主催を変更してください。");
    }).catch((reason: unknown) => {
      setRaces([]);
      setNotice("");
      setError(`single_pick_aiに接続できません。3回の自動再試行後も失敗しました。${reason instanceof Error ? reason.message : String(reason)}`);
    }).finally(() => setLoadingRaces(false));
  };

  useEffect(() => { refresh(); }, [date, org, base]);

  const updateBase = (value: string) => {
    setBase(value);
    setApiBase(value);
  };

  const loadRace = async (raceKey: string) => {
    setLoadingRaceKey(raceKey);
    setError("");
    setNotice("実レースの入力データを確認しています。");
    try {
      const race = await retrySinglePick(() => fetchRace(raceKey), { onRetry: ({ attempt, maxAttempts, nextDelayMs }) => setNotice(`実レースの取得を再試行しています（${attempt + 1}/${maxAttempts}回・${(nextDelayMs / 1000).toFixed(1)}秒後）。`) });
      onLoad({ race, horses: toHorses(race) });
      setNotice(race.model.calibration_status === "READY" ? "実レースを読み込みました。校正済み予測はTRUTH PANEL、what-ifは別セクションに表示します。" : "実レースを読み込みました。確率は未校正のため、TRUTH PANELでは数値を表示しません。");
    } catch (reason) {
      setError(`実レースを読み込めませんでした。${reason instanceof Error ? reason.message : String(reason)}`);
      setNotice("");
    } finally {
      setLoadingRaceKey(null);
    }
  };

  return <section className="real-race-loader" aria-label="single_pick_ai実レース入力">
    <div className="real-race-heading"><div><span className="eyebrow">REAL RACE INPUT</span><h2>実レースを取り込む。</h2></div><div className="real-race-heading-actions"><Link href="/ai-history" className="real-race-history-link"><History size={14} /> AI履歴</Link><Database size={17} /></div></div>
    <p className="real-race-intro">single_pick_aiのread-only APIから実データを読み込みます。読み込んだAI予測と、条件変更後のwhat-ifは混ぜずに表示します。</p>
    <label className="real-race-base"><span>接続先 single_pick_ai</span><input value={base} onChange={(event) => updateBase(event.target.value)} placeholder="空欄: 同一オリジン /api/lab" /><small>公開版ではHTTPSの接続先が必要です。ローカルのHTTP URLは利用できません。</small></label>
    <div className="real-race-controls"><label><span>開催日</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label><div className="real-race-org" aria-label="主催"><span>主催</span><div>{ORGS.map((value) => <button type="button" key={value} className={org === value ? "selected" : ""} onClick={() => setOrg(value)}>{value}</button>)}</div></div><button className="real-race-refresh" type="button" onClick={refresh} disabled={loadingRaces}>{loadingRaces ? <LoaderCircle className="spin" size={14} /> : <RefreshCw size={14} />} 更新</button></div>
    <div className={syncStatus.data?.source?.lastError ? "real-race-sync-state is-error" : "real-race-sync-state"}><span>BG SYNC</span><strong>{describeLastSync(syncStatus.data?.source)}</strong><small>{describeNextSync(syncStatus.data?.source)}</small>{describeSyncError(syncStatus.data?.source) && <p>{describeSyncError(syncStatus.data?.source)}</p>}</div>
    {error && <div className="real-race-status real-race-status--error" role="alert"><TriangleAlert size={14} /><span>{error}</span></div>}{notice && !error && <p className="real-race-status" aria-live="polite">{notice}</p>}
    <div className="real-race-list">{loadingRaces ? <div className="real-race-empty"><LoaderCircle className="spin" size={17} /> 一覧を取得しています</div> : races.length ? races.map((race) => <button key={race.race_key} type="button" disabled={loadingRaceKey !== null} className="real-race-option" onClick={() => loadRace(race.race_key)}><b>{race.race_no ?? "—"}R</b><span><strong>{race.venue ?? race.race_key}</strong><small>{race.distance ? `${race.distance.toLocaleString()}m` : "距離未取得"} · {race.surface ?? "馬場種別未取得"} · {race.status}</small></span>{loadingRaceKey === race.race_key ? <LoaderCircle className="spin" size={15} /> : <em>{race.top_pick?.name ?? ""}</em>}</button>) : <div className="real-race-empty">取得できるレースがありません</div>}</div>
    <p className="real-race-provenance"><strong>能力値の出所:</strong> 末脚はv23k実値。as-of履歴として明示される項目のみ履歴実値、それ以外の補助能力は暫定値です。詳細は出走馬タブで確認できます。</p>
  </section>;
}
