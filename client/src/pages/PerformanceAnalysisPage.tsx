import { BarChart3, CircleAlert, Layers3, Loader2, LockKeyhole } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { MemberGate } from "@/components/AccessTierUI";
import { PublicLabHeader } from "@/components/LabServiceNavigation";
import { fetchModelComparison, fetchModelDetail, metricText, type FeatureResult, type ModelComparisonRow, type ModelDetailPayload } from "@/lib/publicFeatureApi";

const pendingComparison: FeatureResult<ModelComparisonRow[]> = { state: "PENDING_DATA", data: null, message: "正本のモデル比較を確認しています。", detail: null };
const pendingDetail: FeatureResult<ModelDetailPayload> = { state: "PENDING_DATA", data: null, message: "モデル詳細の閲覧状態を確認しています。", detail: null };

function Metric({ label, value, percent = false }: { label: string; value: ModelComparisonRow["predictionCount"]; percent?: boolean }) {
  return <div><span>{label}</span><strong>{metricText(value, 3, percent)}</strong></div>;
}

function ModelRow({ row }: { row: ModelComparisonRow }) {
  const actual = row.evaluationMode === "ACTUAL";
  return <article className={`lab-model-row ${actual ? "is-actual" : "is-shadow"}`}>
    <header><div><span className="eyebrow">{actual ? "ACTUAL / FORMAL" : "SHADOW HYPOTHETICAL"}</span><h2>{row.modelId}</h2><p>{row.modelStage ?? "stage未取得"} · sample {row.sampleStatus}</p></div><span className="lab-model-state">{row.sampleStatus}</span></header>
    <div className="lab-model-metrics">
      <Metric label="予測件数" value={row.predictionCount} />
      <Metric label="結果確定件数" value={row.confirmedCount} />
      <Metric label="Top1的中率" value={row.top1HitRate} percent />
      <Metric label="Top3的中率" value={row.top3HitRate} percent />
      <Metric label="MRR" value={row.winnerMrr} />
      <Metric label="NDCG@3" value={row.ndcgAt3} />
      <Metric label="単勝ROI（正本値）" value={row.actualWinRoi} />
      <Metric label="複勝ROI（正本値）" value={row.actualPlaceRoi} />
    </div>
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

  const actualModels = useMemo(() => (comparison.data ?? []).filter((row) => row.evaluationMode === "ACTUAL"), [comparison.data]);
  const shadowModels = useMemo(() => (comparison.data ?? []).filter((row) => row.evaluationMode !== "ACTUAL"), [comparison.data]);

  return <PublicLabHeader active="analysis" eyebrow="MODEL PERFORMANCE / CANONICAL METRICS" title="実績・分析" description="確定結果に基づく正本の評価だけを表示します。shadowの仮説的ROIは実績の収益と明確に分離します。">
    {comparison.state === "PENDING_DATA" && !comparison.data ? <section className="lab-feature-status is-pending" aria-busy="true"><Loader2 size={21} className="spin-icon" /><div><span className="eyebrow">CANONICAL API / VERIFYING</span><h2>モデル比較を確認しています。</h2><p>正本のstatusとvalueを検証するまで、精度・ROI・比較結果を表示しません。</p></div></section> : comparison.state !== "AVAILABLE" ? <section className="lab-feature-status is-unavailable" role="status"><CircleAlert size={21} /><div><span className="eyebrow">MODEL COMPARISON / {comparison.state}</span><h2>モデル比較データを表示できません。</h2><p>{comparison.message}</p></div></section> : <>
      <section className="lab-analysis-availability" aria-label="モデル比較の正本状態"><div className="lab-analysis-icon"><BarChart3 size={20} /></div><span className="eyebrow">CANONICAL METRICS / MODEL_COMPARISON_V1</span><h2>正本の比較結果</h2><p>各指標は正本APIの`status`と`value`をそのまま表示します。`PENDING_DATA`、`NOT_APPLICABLE`、`INSUFFICIENT_SAMPLE`は0件・0%へ変換しません。</p></section>
      <section className="lab-model-section" aria-labelledby="actual-model-title"><header><span className="eyebrow">ACTUAL / FORMAL</span><h2 id="actual-model-title">確定結果に基づく実績</h2><p>正式モデルの観測値です。ACTUAL ROIは確定払戻と正本の賭け記録がそろう場合だけの正本値です。</p></header>{actualModels.length ? actualModels.map((row) => <ModelRow key={row.modelId} row={row} />) : <p className="lab-inline-empty">ACTUALの正本比較データは取得不能です。</p>}</section>
      <section className="lab-model-section is-shadow" aria-labelledby="shadow-model-title"><header><Layers3 size={18} /><span className="eyebrow">SHADOW HYPOTHETICAL</span><h2 id="shadow-model-title">研究上の仮説的評価</h2><p>shadowの値は実際の収益実績ではありません。`PENDING_DATA`は観測データ未蓄積であり、0%・0件として扱いません。</p></header>{shadowModels.length ? shadowModels.map((row) => <ModelRow key={row.modelId} row={row} />) : <p className="lab-inline-empty">shadowの正本比較データは取得不能です。</p>}</section>
    </>}

    <section className={`lab-member-callout ${detail.state === "MEMBER_LOCKED" ? "is-locked" : ""}`}>
      <div><LockKeyhole size={18} /><span className="eyebrow">MODEL DETAIL / {detail.state}</span><h2>{detail.state === "MEMBER_LOCKED" ? "モデル詳細はMEMBER限定です。" : "モデル詳細の状態を確認しています。"}</h2><p>{detail.message} 19軸条件別分析、rank residual、margin secondsなどは、正本entitlementが許可した場合だけ表示します。</p></div>
    </section>

    <MemberGate />
  </PublicLabHeader>;
}
