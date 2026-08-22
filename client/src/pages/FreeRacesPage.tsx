import { ArrowLeft, CircleAlert, CircleCheck, Loader2, LockKeyhole } from "lucide-react";
import { useEffect, useState } from "react";
import { FreeRacePreview } from "@/components/FreeRacePreview";
import { fetchFreeRace, type FeatureResult, type FreeRacePayload } from "@/lib/publicFeatureApi";

const pendingState: FeatureResult<FreeRacePayload> = { state: "PENDING_DATA", data: null, message: "FREE対象レースの正本状態を確認しています。", detail: null };

function CanonicalFreeRaceStatus() {
  const [result, setResult] = useState(pendingState);

  useEffect(() => {
    let active = true;
    void fetchFreeRace().then((value) => { if (active) setResult(value); });
    return () => { active = false; };
  }, []);

  if (result.state === "PENDING_DATA" && !result.data) return <section className="free-race-preview is-pending" aria-busy="true"><Loader2 size={17} className="spin-icon" /><div><span className="eyebrow">FREE PRE-RACE / VERIFYING</span><h2>FREE対象レースを確認しています。</h2><p>正本のselection lock状態を検証するまで、発走前予測は表示しません。</p></div></section>;
  if (result.state === "UNAVAILABLE") return <section className="free-race-preview is-error" role="status"><CircleAlert size={18} /><div><span className="eyebrow">FREE PRE-RACE / UNAVAILABLE</span><h2>今週のFREE発走前公開は利用できません。</h2><p>{result.message}</p>{result.data?.reasonCode ? <small className="lab-status-detail">正本理由: {result.data.reasonCode}</small> : null}</div></section>;
  return <FreeRacePreview />;
}

export default function FreeRacesPage() {
  return <main className="free-races-page">
    <header className="free-races-topbar">
      <a href="/" className="free-races-brand">KEIBA <span>LAB</span></a>
      <span>FREE / PRE-RACE</span>
    </header>
    <section className="free-races-intro">
      <span className="eyebrow">FREE PRE-RACE RELEASE</span>
      <h1>固定された公開対象だけを、発走前に確認する。</h1>
      <p>FREE公開対象はJRA土日9R〜12Rの事前固定候補から、`free_prerace_v1`で決まります。結果を見た後の追加・入替・選び直しは行いません。</p>
      <div className="free-races-principles"><span><CircleCheck size={14} /> 正本race keyとprediction as-ofを照合</span><span><CircleCheck size={14} /> 校正済み確率がREADYのときだけ表示</span><span><LockKeyhole size={14} /> MEMBER詳細分析は表示しない</span></div>
    </section>
    <CanonicalFreeRaceStatus />
    <section className="free-races-postrace">
      <div><span className="eyebrow">POST-RACE OPEN</span><h2>全レースの事後公開は運用ダッシュボードで確認できます。</h2><p>未確定・同着・取消・要確認は正本statusのまま表示します。FREE対象外のレースを発走前に代替表示することはありません。</p></div>
      <a href="/ai-history">全レースの事後公開を見る</a>
    </section>
    <a className="free-races-back" href="/"><ArrowLeft size={14} /> KEIBA LABへ戻る</a>
  </main>;
}
