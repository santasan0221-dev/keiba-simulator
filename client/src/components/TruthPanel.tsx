import { BadgeCheck, CircleAlert, CircleCheck, CircleX, Database, ShieldCheck, Trophy } from "lucide-react";
import type { LabHorse, LabRace } from "@/lib/singlePickAi";
import { aiPickFinishLabel, aiPickOutcomeLabel, getAiPickOutcome, payoutLines } from "@/lib/officialRaceResult";

const rawProbability = (value: number | null) => typeof value === "number" && Number.isFinite(value) ? String(value) : null;

function displayStatus(status: string | null | undefined) {
  return status?.trim() || "STATUS_UNKNOWN";
}

function hasCalibratedProbability(horse: LabHorse) {
  return typeof horse.model.win_prob_calibrated === "number" || typeof horse.model.top3_prob === "number";
}

export function TruthPanel({ race }: { race: LabRace | null }) {
  if (!race) {
    return <section className="truth-panel truth-panel--empty" aria-label="実AI予測">
      <div className="truth-panel-heading"><span className="eyebrow">AI TRUTH PANEL</span><Database size={15} /></div>
      <h3>実AI予測は未読込です。</h3>
      <p>左側の「REAL RACE INPUT」からsingle_pick_aiのレースを読み込むと、承認済みの校正確率だけをここに表示します。ブラウザ内のwhat-if結果は別セクションで表示されます。</p>
    </section>;
  }

  const calibrationReady = race.model.calibration_status === "READY";
  const calibratedRows = race.horses
    .filter(hasCalibratedProbability)
    .sort((left, right) => (left.model.ai_rank ?? Number.MAX_SAFE_INTEGER) - (right.model.ai_rank ?? Number.MAX_SAFE_INTEGER))
    .slice(0, 5);
  const statuses = Array.from(new Set(race.horses.map((horse) => displayStatus(horse.model.prob_status))));
  const raceName = [race.race.venue, race.race.race_no ? `${race.race.race_no}R` : null].filter(Boolean).join(" ") || race.race.race_key || "読み込みレース";
  const officialResult = race.result ?? null;
  const outcome = getAiPickOutcome(officialResult);
  const outcomeIcon = outcome === "hit" ? <Trophy size={13} /> : outcome === "placed" ? <CircleCheck size={13} /> : outcome === "outside" ? <CircleX size={13} /> : <CircleAlert size={13} />;
  const payouts = payoutLines(officialResult);

  return <section className={`truth-panel ${calibrationReady && calibratedRows.length ? "truth-panel--ready" : "truth-panel--reference"}`} aria-label="single_pick_aiの実AI予測">
    <div className="truth-panel-heading"><span className="eyebrow">AI TRUTH PANEL · SINGLE_PICK_AI</span>{calibrationReady && calibratedRows.length ? <span className="truth-state truth-state--ready"><BadgeCheck size={12} /> 校正済み</span> : <span className="truth-state truth-state--reference"><CircleAlert size={12} /> 参考・未校正</span>}</div>
    <div className="truth-panel-title"><div><h3>{raceName}</h3><p>{race.race.date ?? "日付未取得"} · {race.race.distance ? `${race.race.distance.toLocaleString()}m` : "距離未取得"} · {race.race.going ?? "馬場未取得"}</p></div><div className="truth-asof"><ShieldCheck size={14} /><span>AS OF</span><strong>{race.model.as_of ?? "記録時点未取得"}</strong></div></div>
    {calibrationReady && calibratedRows.length ? <><div className="truth-caption"><span>承認済みAI予測</span><small>校正済みの値をAPI応答のまま表示。単位変換・補間は行いません。</small></div><div className="truth-table" role="table" aria-label="校正済みAI予測一覧"><div className="truth-table-head" role="row"><span>AI</span><span>馬名</span><span>win_prob_calibrated</span><span>top3_prob</span></div>{calibratedRows.map((horse, index) => <div className="truth-table-row" role="row" key={`${horse.no}-${horse.name}`}><b>{horse.model.ai_rank ?? index + 1}</b><strong>{horse.name ?? `#${horse.no ?? index + 1}`}</strong><span>{rawProbability(horse.model.win_prob_calibrated) ?? "値なし"}</span><span>{rawProbability(horse.model.top3_prob) ?? "値なし"}</span></div>)}</div></> : <div className="truth-withheld"><strong>校正済み確率は表示しません。</strong><p>このレースは {displayStatus(race.model.calibration_status)} のため、勝率・複勝圏率を推定、補間、またはwhat-ifの数値で代用しません。</p><div>{statuses.map((status) => <code key={status}>{status}</code>)}</div></div>}
    <section className={`truth-result ${officialResult ? "truth-result--confirmed" : "truth-result--pending"}`} aria-label="公式結果とAI本命の結果"><div className="truth-result-heading"><span>OFFICIAL RESULT</span><strong>{officialResult ? "公式確定" : "未確定"}</strong></div>{officialResult ? <><div className={`truth-outcome truth-outcome--${outcome}`}>{outcomeIcon}<div><b>{aiPickOutcomeLabel(officialResult)}</b><small>{officialResult.ai_pick ? `AI本命 #${officialResult.ai_pick.horse_no} ${officialResult.ai_pick.horse_name} · ${aiPickFinishLabel(officialResult.ai_pick)}` : "AI本命情報なし"}</small></div></div><div className="official-order"><span>公式着順（上位5着）</span>{officialResult.official_order?.length ? officialResult.official_order.slice(0, 5).map((entry) => <div key={`${entry.finish}-${entry.horse_no}`}><b>{entry.finish}</b><strong>{entry.horse_name}</strong><small>#{entry.horse_no}{entry.popularity === null ? " · 人気未取得" : ` · ${entry.popularity}番人気`}</small></div>) : <p>公式着順データなし</p>}</div>{payouts.length ? <div className="truth-payouts"><span>払戻情報</span>{payouts.map((payout) => <small key={payout}>{payout}</small>)}</div> : <p className="truth-result-note">払戻情報は提供されていません。</p>}</> : <p className="truth-result-note">結果はまだ確定していません。公式着順・AI本命の着順・払戻を推定または代替表示しません。</p>}</section>
    <p className="truth-disclaimer">{race.model.disclaimer || "この枠はsingle_pick_aiから取得した実AI予測の表示専用です。下のwhat-ifシミュレーションとは別の数値です。"}</p>
  </section>;
}
