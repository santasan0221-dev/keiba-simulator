import { AlertTriangle, FlaskConical, ShieldAlert, Sigma } from "lucide-react";
import type { WhatIfDistributionSummary } from "@/lib/whatIfTransparency";

type Props = {
  summary: WhatIfDistributionSummary;
  formalAvailable: boolean;
};

const percent = (value: number | null) => value === null ? "—" : `${value.toFixed(1)}%`;
const decimal = (value: number | null) => value === null ? "—" : value.toFixed(2);

export function WhatIfTransparencyPanel({ summary, formalAvailable }: Props) {
  const invalid = summary.status === "INVALID";
  const extreme = summary.status === "EXTREME_CONCENTRATION";

  return <section className={`what-if-transparency ${invalid ? "is-invalid" : extreme ? "is-extreme" : ""}`} aria-label="WHAT-IFの表示上の注意">
    <div className="what-if-reference-header">
      <div className="what-if-reference-title"><FlaskConical size={18} /><div><span>WHAT-IF · 参考シミュレーション</span><strong>正式な校正済み確率ではありません</strong></div></div>
      <span className="what-if-mode-badge">REFERENCE ONLY</span>
    </div>
    <p className="what-if-reference-copy">入力条件を変えた場合の相対的な試行結果です。投資・推奨・EV/NO BETには使用されず、TRUTH PANELの正式予測とは別に扱います。</p>

    <div className="what-if-formal-separation">
      <span>正式予測（校正済み）</span>
      <strong>{formalAvailable ? "TRUTH PANELで別表示" : "この画面には表示していません"}</strong>
      <small>WHAT-IF値を正式確率の代替として表示・比較しません。</small>
    </div>

    {invalid ? <div className="what-if-invalid" role="alert"><ShieldAlert size={19} /><div><strong>WHAT-IF表示不可</strong><p>{summary.reason ?? "確率分布の検証に失敗しました。"} 確率値・順位・集中度は表示しません。</p></div></div> : <>
      {extreme && <div className="what-if-low-reliability" role="alert"><AlertTriangle size={19} /><div><strong>LOW RELIABILITY</strong><p>WHAT-IF分布が極端に集中しています。数値を単独で解釈せず、正式な校正済み確率と混同しないでください。</p></div></div>}
      <div className="what-if-concentration" aria-label="WHAT-IFの確率分布集中度">
        <div className="what-if-concentration-heading"><span><Sigma size={15} /> 確率分布の集中度</span><small>{summary.status === "CONCENTRATED" ? "上位候補に集中" : "参考分布"}</small></div>
        <div className="what-if-stat-grid">
          <div><span>上位1頭への集中</span><strong>{percent(summary.top1Probability)}</strong></div>
          <div><span>上位3頭への集中</span><strong>{percent(summary.top3Probability)}</strong></div>
          <div><span>分布の広がり</span><strong>{decimal(summary.normalizedEntropy)} <small>/ 1.00</small></strong></div>
          <div><span>実効的な候補数</span><strong>{decimal(summary.effectiveFieldSize)} <small>頭</small></strong></div>
        </div>
        <p>対象: {summary.runnerCount}頭 · 確率和: {percent(summary.probabilitySum)}。集中度は予測精度・校正の証明ではありません。</p>
      </div>
    </>}

    <section className="what-if-diagnostic-shell" aria-label="予測履歴の診断">
      <div><span>予測履歴の診断</span><strong>過去レースの記述統計</strong></div>
      <p>履歴データ未収集</p>
      <small>確定結果と同一prediction type・同一versionの保存済み履歴がそろうまで、確率bin別の実勝率は表示しません。</small>
    </section>
  </section>;
}
