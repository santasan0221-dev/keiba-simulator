import React from "react";
import { ArrowLeft, CircleCheck } from "lucide-react";
import { Link } from "wouter";
import { FREE_SCOPE_NOTICE } from "@/lib/accessTier";

// /free used to describe a "one pre-fixed race per week" release. Decision D1
// replaced that: the publication ◎, AI TOP, MARKET TOP, the buy verdict and the
// basic results are free for every race. The route stays so shared links keep
// working; it now says so and points to the real pages.
export default function FreeRacesPage() {
  return <main className="free-races-page">
    <header className="free-races-topbar">
      <Link href="/" className="free-races-brand">KEIBA <span>TRACE</span></Link>
      <span>FREE</span>
    </header>
    <section className="free-races-intro">
      <span className="eyebrow">FREE</span>
      <h1>{FREE_SCOPE_NOTICE.headline}</h1>
      <p>{FREE_SCOPE_NOTICE.description}</p>
      <div className="free-races-principles">
        <span><CircleCheck size={14} /> 発走前に記録した予想を、そのまま公開</span>
        <span><CircleCheck size={14} /> 外れ・確定待ちも同じ形式で記録</span>
        <span><CircleCheck size={14} /> ◎は購入推奨ではありません</span>
      </div>
    </section>
    <section className="free-races-postrace">
      <div><span className="eyebrow">TODAY</span><h2>今日の予想と、これまでの結果。</h2><p>数え方や、確定待ち・特殊な結果の扱いは記録ルールにまとめています。</p></div>
      <Link href="/">今日の予想を見る</Link>
    </section>
    <section className="free-races-postrace">
      <div><span className="eyebrow">RESULTS</span><h2>全レースの結果と履歴。</h2><p>的中も外れも、確定待ちも同じ形式で確認できます。</p></div>
      <Link href="/ai-history">結果を見る</Link>
    </section>
    <Link className="free-races-back" href="/rules"><ArrowLeft size={14} /> 記録ルールを読む</Link>
  </main>;
}
