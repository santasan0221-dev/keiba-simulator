/**
 * First-view value strip: WHAT / TODAY / TRUST + a CTA into today's race
 * list. Deliberately short -- a first-time visitor should understand what
 * this is in a few seconds, not read a marketing page. No performance/ROI
 * claims: this session's own model research has not established a proven
 * betting edge, so copy here must stay to "organizes today's races from an
 * AI perspective," never "wins" or "profits."
 */
export function LabValueStrip() {
  return <section className="lab-value-strip" aria-label="KEIBA TRACEについて">
    <div className="lab-value-strip-head">
      <h1>今日のレースを、AI視点で整理する。<span className="lab-free-badge">無料で見られます</span></h1>
      <span>JRA・地方競馬(NAR)対応</span>
    </div>
    <div className="lab-value-points">
      <div className="lab-value-point"><b>WHAT</b><span>各レースの出走馬をAIモデルでランキングし、本命・対抗をシンプルに確認できます。</span></div>
      <div className="lab-value-point"><b>TODAY</b><span>下の「今日のAI予想」からJRA・NARを選ぶと、当日の開催レース一覧が表示されます。</span></div>
      <div className="lab-value-point"><b>TRUST</b><span>予測は生成時刻を記録し、結果確定後に後出しで変更しません。的中や回収率を保証するものではありません。</span></div>
    </div>
    <a className="lab-value-cta" href="#real-race-list">今日のAI予想を見る</a>
  </section>;
}
