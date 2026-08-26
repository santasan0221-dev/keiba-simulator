import React from "react";
import { BadgeCheck, CircleAlert, CircleCheck, CircleX, Database, ShieldCheck, Trophy } from "lucide-react";
import type { LabDisplayBet, LabHorse, LabRace } from "@/lib/singlePickAi";
import type { RealRaceLoadStatus } from "@/components/RealRaceLoader";
import { aiPickFinishLabel, aiPickOutcomeLabel, getAiPickOutcome, payoutLines } from "@/lib/officialRaceResult";
import { getRankAccuracySummary, getVirtualRoiSummary } from "@/lib/raceOutcomeAnalysis";

const rawProbability = (value: number | null) => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1 ? String(value) : null;

function displayStatus(status: string | null | undefined) {
  return status?.trim() || "STATUS_UNKNOWN";
}

function hasCalibratedProbability(horse: LabHorse) {
  // Backend contract (scripts/keiba_lab_api.py _horse_shape): prob_status is
  // "CALIBRATED" or "UNCALIBRATED_SHADOW_SCORE", never "READY" -- checking
  // against the real value here (not a status string that never occurs).
  return horse.model.prob_status === "CALIBRATED" && (rawProbability(horse.model.win_prob_calibrated) !== null || rawProbability(horse.model.top3_prob) !== null);
}

function horseLabel(horse: LabHorse) {
  return `${horse.no === null ? "#?" : `#${horse.no}`} ${horse.name ?? "馬名取得不能"}`;
}

function decisionLabel(status: string) {
  if (status === "BET") return "BET";
  if (status === "NO_BET") return "見送り";
  return "判定データなし";
}

function betLabel(bet: LabDisplayBet) {
  const selections = bet.pick_names?.length ? bet.pick_names.join("・") : bet.picks?.length ? bet.picks.map((no) => `#${no}`).join("・") : "選択取得不能";
  return [bet.bet_type ?? "券種取得不能", selections, bet.stake === null ? null : `${bet.stake.toLocaleString()}円`].filter(Boolean).join(" / ");
}

function secondaryLabel(mark: string | null | undefined) {
  if (mark === "○") return "対抗";
  if (mark === "▲") return "単穴";
  if (mark === "☆" || mark === "消してはいけない穴") return "穴候補";
  if (mark === "消し") return "危険人気馬";
  return null;
}

export function TruthPanel({ race, loadStatus = "選択日の予測なし" }: { race: LabRace | null; loadStatus?: RealRaceLoadStatus }) {
  const [detailsOpen, setDetailsOpen] = React.useState(false);
  if (!race) {
    return <section className="truth-panel truth-panel--empty" aria-label="実AI予測">
      <div className="truth-panel-heading"><span className="eyebrow">AI TRUTH PANEL</span><Database size={15} /></div>
      <h3>実AI予測：{loadStatus}</h3>
      <p>{loadStatus === "正常読込済み" ? "single_pick_aiから正常に読み込まれています。" : loadStatus === "結果待ち" ? "予測は読み込み済みです。公式結果はまだ確定していません。" : loadStatus === "選択日の予測なし" ? "選択日に予測データがありません。開催日を変更してください。" : loadStatus === "認証エラー" ? "single_pick_aiの認証が必要です。" : loadStatus === "API未接続" ? "single_pick_aiへ接続できません。接続先とネットワークを確認してください。" : "single_pick_ai APIの応答を確認できません。"} 校正済みの確率だけを表示し、what-if結果とは分離しています。</p>
    </section>;
  }

  const calibrationReady = race.model.calibration_status === "READY";
  const calibratedRows = race.horses
    .filter(hasCalibratedProbability)
    .sort((left, right) => (left.model.ai_rank ?? Number.MAX_SAFE_INTEGER) - (right.model.ai_rank ?? Number.MAX_SAFE_INTEGER))
    .slice(0, 5);
  const honmeiRows = race.horses.filter((horse) => horse.display?.final_mark === "◎");
  const honmei = honmeiRows.length === 1 ? honmeiRows[0] : null;
  const secondaryRows = race.horses.filter((horse) => secondaryLabel(horse.display?.final_mark));
  const advancedRows = [...race.horses].sort((left, right) => (left.model.ai_rank ?? Number.MAX_SAFE_INTEGER) - (right.model.ai_rank ?? Number.MAX_SAFE_INTEGER));
  const decisionStatus = race.decision?.status === "BET" || race.decision?.status === "NO_BET" ? race.decision.status : "UNKNOWN";
  const formalBet = decisionStatus === "BET" && race.decision?.gate_status === "selected" ? race.decision.bet : null;
  const statuses = Array.from(new Set(race.horses.map((horse) => displayStatus(horse.model.prob_status))));
  const raceName = [race.race.venue, race.race.race_no ? `${race.race.race_no}R` : null].filter(Boolean).join(" ") || race.race.race_key || "読み込みレース";
  const officialResult = race.result ?? null;
  const outcome = getAiPickOutcome(officialResult);
  const outcomeIcon = outcome === "hit" ? <Trophy size={13} /> : outcome === "placed" ? <CircleCheck size={13} /> : outcome === "outside" ? <CircleX size={13} /> : <CircleAlert size={13} />;
  const payouts = payoutLines(officialResult);
  const rankAccuracy = getRankAccuracySummary(race.horses, officialResult);
  const virtualRoi = getVirtualRoiSummary(officialResult);
  const ready = calibrationReady && calibratedRows.length > 0;
  const honmeiCalibrated = honmei ? hasCalibratedProbability(honmei) : false;

  return <section className={`truth-panel ${ready ? "truth-panel--ready" : "truth-panel--reference"}`} aria-label="single_pick_aiの実AI予測">
    <div className="truth-panel-heading"><span className="eyebrow">AI TRUTH PANEL · SINGLE_PICK_AI</span>{ready ? <span className="truth-state truth-state--ready"><BadgeCheck size={12} /> 校正済み</span> : <span className="truth-state truth-state--reference"><CircleAlert size={12} /> 参考・未校正</span>}</div>
    <div className="truth-panel-title"><div><h3>{raceName}</h3><p>{race.race.date ?? "日付未取得"} · {race.race.distance ? `${race.race.distance.toLocaleString()}m` : "距離未取得"} · {race.race.going ?? "馬場未取得"}</p></div><div className="truth-asof"><ShieldCheck size={14} /><span>AS OF</span><strong>{race.model.as_of ?? "記録時点未取得"}</strong></div></div>
    <div className="truth-primary" aria-label="AI本命と最終判断"><div className="truth-primary-pick"><span>AI本命</span>{honmei ? <strong>◎ {horseLabel(honmei)}</strong> : <strong>AI本命：取得不能</strong>}<small>最終印を正本として表示</small></div><div className={`truth-primary-decision truth-primary-decision--${decisionStatus.toLowerCase()}`}><span>最終判断</span><strong>判断：{decisionLabel(decisionStatus)}</strong>{decisionStatus === "NO_BET" ? <small>本命評価はありますが、馬券として買う条件には達していません。</small> : decisionStatus === "UNKNOWN" ? <small>見送りには変換せず、判定データ取得不能として扱います。</small> : <small>保存済みの正式選抜条件を通過しています。</small>}</div></div>
    {formalBet ? <div className="truth-formal-bet"><span>正式買い目</span><strong>{betLabel(formalBet)}</strong>{race.decision?.gate_reason ? <small>{race.decision.gate_reason}</small> : null}</div> : null}
    {honmei && honmeiCalibrated ? <div className="truth-panel-summary"><span className="truth-summary-label">校正済み確率</span><strong>{honmei.name ?? `#${honmei.no}`}</strong><span>勝率 <b>{rawProbability(honmei.model.win_prob_calibrated) ?? "値なし"}</b></span><span>複勝率 <b>{rawProbability(honmei.model.top3_prob) ?? "値なし"}</b></span></div> : <p className="truth-panel-summary truth-panel-summary--withheld">AI本命の校正済み確率は未表示です。0%や推定値へは置き換えません。</p>}
    <button type="button" className="truth-details-toggle" aria-expanded={detailsOpen} onClick={() => setDetailsOpen((value) => !value)}>{detailsOpen ? "詳細を閉じる ▲" : "詳細を見る ▼"}</button>
    <div className={`truth-panel-details${detailsOpen ? "" : " is-collapsed"}`} aria-hidden={!detailsOpen}>
    <section className="truth-secondary" aria-label="最終印と判断材料"><div className="truth-caption"><span>判断材料</span><small>最終印と保存済み理由のみ。順位から印を再構築しません。</small></div>{secondaryRows.length ? <div className="truth-mark-list">{secondaryRows.map((horse) => <div key={`${horse.no}-${horse.name}`}><b>{secondaryLabel(horse.display?.final_mark)}</b><strong>{horse.display?.final_mark} {horseLabel(horse)}</strong><small>{horse.display?.mark_adjustment_reason ?? "調整理由取得不能"}</small></div>)}</div> : <p className="truth-detail-empty">表示できる対抗・穴候補・危険人気馬情報がありません。</p>}</section>
    <section className="truth-advanced" aria-label="上級者向け参考情報"><div className="truth-caption"><span>ADVANCED · 参考情報</span><small>モデル素点順位と最終印は目的が異なり、一致しない場合があります。</small></div><div className="truth-table truth-table--advanced" role="table" aria-label="モデル素点順位と評価指数"><div className="truth-table-head" role="row"><span>モデル素点順位（参考）</span><span>馬名</span><span>評価指数（勝率ではありません）</span><span>最終印</span></div>{advancedRows.map((horse) => <div className="truth-table-row" role="row" key={`${horse.no}-${horse.name}`}><b>{horse.model.ai_rank ?? "—"}</b><strong>{horseLabel(horse)}</strong><span>{horse.model.v23k_score ?? "取得不能"}</span><span>{horse.display?.final_mark ?? "取得不能"}</span></div>)}</div></section>
    {ready ? <><div className="truth-caption"><span>校正済み確率</span><small>API応答のまま表示。単位変換・補間は行いません。</small></div><div className="truth-table" role="table" aria-label="校正済みAI予測一覧"><div className="truth-table-head" role="row"><span>素点順位</span><span>馬名</span><span>win_prob_calibrated</span><span>top3_prob</span></div>{calibratedRows.map((horse) => <div className="truth-table-row" role="row" key={`${horse.no}-${horse.name}`}><b>{horse.model.ai_rank ?? "—"}</b><strong>{horse.name ?? `#${horse.no}`}</strong><span>{rawProbability(horse.model.win_prob_calibrated) ?? "値なし"}</span><span>{rawProbability(horse.model.top3_prob) ?? "値なし"}</span></div>)}</div></> : <div className="truth-withheld"><strong>校正済み確率は表示しません。</strong><p>このレースは {displayStatus(race.model.calibration_status)} のため、勝率・複勝圏率を推定、補間、またはwhat-ifの数値で代用しません。</p><div>{statuses.map((status) => <code key={status}>{status}</code>)}</div></div>}
    <section className={`truth-result ${officialResult ? "truth-result--confirmed" : "truth-result--pending"}`} aria-label="公式結果とAI本命の結果"><div className="truth-result-heading"><span>OFFICIAL RESULT</span><strong>{officialResult ? "公式確定" : "未確定"}</strong></div>{officialResult ? <><div className={`truth-outcome truth-outcome--${outcome}`}>{outcomeIcon}<div><b>{aiPickOutcomeLabel(officialResult)}</b><small>{officialResult.ai_pick ? `AI本命 #${officialResult.ai_pick.horse_no} ${officialResult.ai_pick.horse_name} · ${aiPickFinishLabel(officialResult.ai_pick)}` : "AI本命情報なし"}</small></div></div><div className="official-order"><span>公式着順（上位5着）</span>{officialResult.official_order?.length ? officialResult.official_order.slice(0, 5).map((entry) => <div key={`${entry.finish}-${entry.horse_no}`}><b>{entry.finish}</b><strong>{entry.horse_name}</strong><small>#{entry.horse_no}{entry.popularity === null ? " · 人気未取得" : ` · ${entry.popularity}番人気`}</small></div>) : <p>公式着順データなし</p>}</div><section className="truth-analysis-panel" aria-label="モデル素点順位と公式着順の比較"><div className="truth-analysis-heading"><span>RANK ACCURACY</span><strong>モデル素点順位（参考）× 公式着順</strong></div>{rankAccuracy.available ? rankAccuracy.compared.length ? <><div className="rank-accuracy-stats"><span>照合 {rankAccuracy.compared.length}頭</span><span>順位一致 {rankAccuracy.exactMatches}頭</span><span>平均順位差 {rankAccuracy.meanAbsoluteRankError?.toFixed(1) ?? "—"}</span></div><div className="rank-accuracy-list">{rankAccuracy.compared.map((entry) => <div key={`${entry.aiRank}-${entry.horseNo}`}><b>素点 {entry.aiRank}</b><strong>{entry.horseName}</strong><span>公式 {entry.officialFinish}着</span><small>{entry.delta === 0 ? "順位一致" : `${entry.delta > 0 ? "+" : ""}${entry.delta}差`}</small></div>)}</div><p>公式上位5着に含まれるモデル素点順位馬だけを照合しています。未提供の着順は推定しません。</p></> : <p>モデル素点順位と照合できる公式着順がありません。</p> : <p>結果はまだ確定していません。順位精度を算出しません。</p>}</section><section className="truth-analysis-panel truth-roi-panel" aria-label="仮想回収率"><div className="truth-analysis-heading"><span>VIRTUAL ROI</span><strong>確定払戻ベース</strong></div>{virtualRoi.available ? <><p>AI本命を各100円で仮想購入した場合の回収率です。払戻が対象馬へ明確に対応する場合だけ算出します。</p><div className="roi-table">{virtualRoi.rows.map((row) => <div key={row.kind}><strong>{row.label}</strong>{row.returnRate === null ? <small>{row.reason}</small> : <><span>投資 ¥{row.stake.toLocaleString()}</span><span>払戻 ¥{row.returned?.toLocaleString()}</span><b>{row.returnRate.toFixed(1)}%</b></>}</div>)}</div></> : <p>{virtualRoi.reason ?? "確定払戻から算出できる回収率はありません。"}</p>}</section>{payouts.length ? <div className="truth-payouts"><span>払戻情報</span>{payouts.map((payout) => <small key={payout}>{payout}</small>)}</div> : <p className="truth-result-note">払戻情報は提供されていません。</p>}</> : <p className="truth-result-note">結果はまだ確定していません。公式着順・AI本命の着順・払戻を推定または代替表示しません。</p>}</section>
    <p className="truth-disclaimer">{race.model.disclaimer || "この枠はsingle_pick_aiから取得した実AI予測の表示専用です。下のwhat-ifシミュレーションとは別の数値です。"}</p>
    </div>
  </section>;
}
