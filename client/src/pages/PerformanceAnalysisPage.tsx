import { BarChart3, CircleAlert, Layers3, Loader2, LockKeyhole } from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import { MemberGate } from "@/components/AccessTierUI";
import { PublicLabHeader } from "@/components/LabServiceNavigation";
import { fetchModelComparison, fetchModelDetail, metricText, type FeatureResult, type ModelComparisonRow, type ModelDetailPayload } from "@/lib/publicFeatureApi";
import { featureStateLabel } from "@/lib/labels";

const pendingComparison: FeatureResult<ModelComparisonRow[]> = { state: "PENDING_DATA", data: null, message: "正本のモデル比較を確認しています。", detail: null };
const pendingDetail: FeatureResult<ModelDetailPayload> = { state: "PENDING_DATA", data: null, message: "モデル詳細の閲覧状態を確認しています。", detail: null };

function Metric({ label, value, percent = false, className }: { label: string; value: ModelComparisonRow["predictionCount"]; percent?: boolean; className?: string }) {
  return <div className={className}><span>{label}</span><strong>{metricText(value, 3, percent)}</strong></div>;
}

export function ModelRow({ row }: { row: ModelComparisonRow }) {
  const isChampion = row.evaluationMode === "CHAMPION_FIXED_STAKE_SIMULATION";
  // Only surface these when the backend actually sent a number for this
  // row -- a shadow row (no champion-only fields at all) or an old
  // response missing the field both land on state !== "AVAILABLE", and
  // must stay hidden rather than read as a fabricated 0-count.
  const showInactiveNote = isChampion && row.inactiveHonmeiCount.state === "AVAILABLE" && (row.inactiveHonmeiCount.value ?? 0) > 0;
  const showDuplicateNote = isChampion && row.duplicateHonmeiCount.state === "AVAILABLE" && (row.duplicateHonmeiCount.value ?? 0) > 0;
  return <article className={`lab-model-row ${isChampion ? "is-actual" : "is-shadow"}`}>
    <header><div><span className="eyebrow">{isChampion ? "正式モデル｜100円固定シミュレーション" : "研究用（参考）｜100円固定シミュレーション"}</span><h2>{row.modelId}</h2><p>{row.modelStage ?? "stage未取得"} · サンプル状況 {featureStateLabel(row.sampleStatus)}</p></div><span className="lab-model-state">{featureStateLabel(row.sampleStatus)}</span></header>
    <div className="lab-model-metrics">
      <Metric label="予測件数" value={row.predictionCount} />
      <Metric label="結果確定件数" value={row.confirmedCount} />
      <Metric label="Top1的中率" value={row.top1HitRate} percent />
      <Metric label="Top3的中率" value={row.top3HitRate} percent />
      <Metric label="MRR" value={row.winnerMrr} />
      <Metric label="NDCG@3" value={row.ndcgAt3} />
      <Metric label="単勝回収率（100円固定・仮想）" value={row.simulatedWinRoi} />
      <Metric label="複勝回収率（100円固定・仮想）" value={row.simulatedPlaceRoi} />
      {isChampion && <Metric label="ROI評価対象" value={row.evaluatedCount} className="lab-model-metric--wide" />}
      {isChampion && <Metric label="AI本命◎なし" value={row.missingHonmeiCount} className="lab-model-metric--wide" />}
    </div>
    {isChampion && <div className="lab-model-roi-basis">
      <p>ROIは保存済みAI本命◎が一意に存在し、評価可能なレースのみを対象にしています。</p>
      {showInactiveNote && <p className="lab-model-roi-note">取消・除外等による評価対象外：{row.inactiveHonmeiCount.value}件</p>}
      {showDuplicateNote && <p className="lab-model-roi-note">AI本命◎重複による評価対象外：{row.duplicateHonmeiCount.value}件</p>}
    </div>}
  </article>;
}

export default function PerformanceAnalysisPage() {
  const [comparison, setComparison] = useState(pendingComparison);
  const [detail, setDetail] = useState(pendingDetail);

  useEffect(() => {
    let active = true;
    void Promise.all([fetchModelComparison(), fetchModelDetail("champion")]).then(([models, modelDetail]) => {
      if (!active) return;
      setComparison(models);
      setDetail(modelDetail);
    });
    return () => { active = false; };
  }, []);

  const championModels = useMemo(() => (comparison.data ?? []).filter((row) => row.evaluationMode === "CHAMPION_FIXED_STAKE_SIMULATION"), [comparison.data]);
  const shadowModels = useMemo(() => (comparison.data ?? []).filter((row) => row.evaluationMode !== "CHAMPION_FIXED_STAKE_SIMULATION"), [comparison.data]);

  return <PublicLabHeader active="analysis" eyebrow="検証指標" title="実績・分析" description="確定した公式払戻を用い、対象レースで本命1頭に100円を購入したと仮定したシミュレーション結果です。実際の馬券購入履歴や実収支ではありません。BET/見送り判定とは別に、確定結果がある対象レースを評価しています。">
    {comparison.state === "PENDING_DATA" && !comparison.data ? <section className="lab-feature-status is-pending" aria-busy="true"><Loader2 size={21} className="spin-icon" /><div><span className="eyebrow">データ確認中</span><h2>モデル比較を確認しています。</h2><p>正本の状態と値を検証するまで、精度・ROI・比較結果を表示しません。</p></div></section> : comparison.state !== "AVAILABLE" ? <section className="lab-feature-status is-unavailable" role="status"><CircleAlert size={21} /><div><span className="eyebrow">モデル比較 / {featureStateLabel(comparison.state)}</span><h2>モデル比較データを表示できません。</h2><p>{comparison.message}</p></div></section> : <>
      <section className="lab-analysis-availability" aria-label="モデル比較の正本状態"><div className="lab-analysis-icon"><BarChart3 size={20} /></div><span className="eyebrow">検証指標 / モデル比較</span><h2>正本の比較結果</h2><p>各指標は正本APIの状態と値をそのまま表示します。「データ確認中」「対象外」「サンプル不足」は0件・0%へ変換しません。</p></section>
      <section className="lab-model-section" aria-labelledby="champion-model-title"><header><span className="eyebrow">正式モデル｜100円固定シミュレーション</span><h2 id="champion-model-title">確定結果に基づく仮想評価</h2><p>正式モデルの観測値です。本命1頭に100円を購入したと仮定し、確定済み公式払戻と照合した仮想ROIです。実際の購入記録ではありません。</p></header>{championModels.length ? championModels.map((row) => <ModelRow key={row.modelId} row={row} />) : <p className="lab-inline-empty">正式モデルの比較データは取得不能です。</p>}</section>
      <section className="lab-model-section is-shadow" aria-labelledby="shadow-model-title"><header><Layers3 size={18} /><span className="eyebrow">研究用（参考）｜100円固定シミュレーション</span><h2 id="shadow-model-title">研究上の仮想評価</h2><p>研究用モデルも正式モデルと同じ100円固定シミュレーションです。実際の収益実績ではありません。「データ確認中」は観測データ未蓄積であり、0%・0件として扱いません。</p></header>{shadowModels.length ? shadowModels.map((row) => <ModelRow key={row.modelId} row={row} />) : <p className="lab-inline-empty">研究用の比較データは取得不能です。</p>}</section>
    </>}

    <section className={`lab-member-callout ${detail.state === "MEMBER_LOCKED" ? "is-locked" : ""}`}>
      <div><LockKeyhole size={18} /><span className="eyebrow">モデル詳細 / {featureStateLabel(detail.state)}</span><h2>{detail.state === "MEMBER_LOCKED" ? "モデル詳細はMEMBER限定です。" : "モデル詳細の状態を確認しています。"}</h2><p>{detail.message} 19軸条件別分析、順位のずれ、タイム差の指標などは、閲覧権限が確認された場合だけ表示します。</p></div>
    </section>

    <MemberGate />
  </PublicLabHeader>;
}
