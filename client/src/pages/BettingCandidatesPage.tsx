import { CircleAlert, Loader2, LockKeyhole, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { MemberGate } from "@/components/AccessTierUI";
import { PublicLabHeader } from "@/components/LabServiceNavigation";
import { fetchOfficialBettingCandidates, metricText, type FeatureResult, type BettingCandidatesPayload } from "@/lib/publicFeatureApi";
import { decisionLabel, featureStateLabel } from "@/lib/labels";

const initialState: FeatureResult<BettingCandidatesPayload> = { state: "PENDING_DATA", data: null, message: "正本の正式買い目候補を確認しています。", detail: null };

function stateHeading(state: string): string {
  if (state === "MEMBER_LOCKED") return "正式買い目候補はMEMBER限定です。";
  if (state === "NOT_YET_GENERATED") return "正式買い目候補はまだ生成されていません。";
  if (state === "UNAVAILABLE") return "正式買い目候補を確認できません。";
  if (state === "EMPTY") return "現在、条件を満たす正式買い目候補はありません。";
  return "正本の正式買い目候補を確認しています。";
}

export default function BettingCandidatesPage() {
  const [result, setResult] = useState(initialState);

  useEffect(() => {
    let active = true;
    void fetchOfficialBettingCandidates().then((value) => { if (active) setResult(value); });
    return () => { active = false; };
  }, []);

  const locked = result.state === "MEMBER_LOCKED" || result.data?.entitlement.locked === true;

  return <PublicLabHeader active="betting" eyebrow="正式買い目 / 検証専用" title="正式買い目候補" description="校正済み確率と実オッズに基づく正本のBET / 見送り判定だけを表示します。WHAT-IFの数値は使用しません。">
    {result.state === "PENDING_DATA" && !result.data ? <section className="lab-feature-status is-pending" aria-busy="true"><Loader2 size={21} className="spin-icon" /><div><span className="eyebrow">データ確認中</span><h2>正式買い目候補を確認しています。</h2><p>正本の最新予測日とMEMBER閲覧状態を検証するまで、候補・期待値・判定は表示しません。</p></div></section> : <section className={`lab-feature-status ${locked || result.state === "UNAVAILABLE" ? "is-unavailable" : "is-pending"}`} role="status" aria-labelledby="betting-api-title">
      <CircleAlert size={21} aria-hidden="true" />
      <div>
        <span className="eyebrow">正式買い目 / {featureStateLabel(result.state)}</span>
        <h2 id="betting-api-title">{stateHeading(result.state)}</h2>
        <p>{result.message}</p>
        {result.detail ? <small className="lab-status-detail">詳細: {result.detail}</small> : null}
      </div>
    </section>}

    {!locked && result.data?.decisions.length ? <section className="lab-candidate-list" aria-label="正本の正式買い目候補">
      {result.data.decisions.map((candidate, index) => <article className="lab-candidate-row" key={`${candidate.raceKey ?? "race"}-${index}`}>
        <div><span className="eyebrow">{decisionLabel(candidate.decision)}</span><h2>{candidate.raceLabel ?? candidate.raceKey ?? "レース情報を確認中"}</h2><p>{candidate.betType ?? "券種未取得"} · {candidate.horseName ?? "対象馬未取得"}</p></div>
        <dl><div><dt>校正済み確率</dt><dd>{metricText(candidate.calibratedProbability, 3)}</dd></div><div><dt>実オッズ</dt><dd>{metricText(candidate.marketOdds, 3)}</dd></div><div><dt>期待値（参考）</dt><dd>{metricText(candidate.expectedReturn, 3)}</dd></div><div><dt>市場との差（参考）</dt><dd>{metricText(candidate.edge, 3)}</dd></div></dl>
        <p className="lab-candidate-reason">{candidate.reason ?? "判定理由を正本APIから取得できません。"}</p>
      </article>)}
    </section> : null}

    <section className="lab-principle-grid" aria-label="正式買い目候補の判定経路">
      <div><span>01</span><h2>校正済み確率</h2><p>TRUTH PANELと同じ正本の校正済み確率が提供された場合だけ使用します。</p></div>
      <div><span>02</span><h2>実市場オッズ</h2><p>実市場オッズが正本APIから返る場合だけ使用します。推定値は使いません。</p></div>
      <div><span>03</span><h2>判定結果</h2><p>正本が返すBET / 見送り / 判定データなしをそのまま表示します。自動購入は提供しません。</p></div>
    </section>

    <section className="lab-member-callout">
      <div><LockKeyhole size={18} /><span className="eyebrow">MEMBER限定 / 閲覧権限が必要</span><h2>閲覧権限が正本で確認された場合だけ表示します。</h2><p>対象レース、券種、対象馬、校正済み確率、実オッズ、期待値（参考）、市場との差（参考）は、認証済みの正本応答だけから表示します。</p></div>
      <div className="lab-callout-safeguard"><ShieldCheck size={15} /> WHAT-IFから候補・EVを生成しません。</div>
    </section>

    <MemberGate />
  </PublicLabHeader>;
}
