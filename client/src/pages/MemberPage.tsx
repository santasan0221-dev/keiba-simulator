import { Check, CircleAlert, LockKeyhole } from "lucide-react";
import { MemberGate, NoteExternalLink, WeekendPassPanel } from "@/components/AccessTierUI";
import { PublicLabHeader } from "@/components/LabServiceNavigation";
import { Link } from "wouter";
import { trackBetaEvent } from "@/lib/betaAnalytics";

const rows = [
  ["本日のレース情報", "FREEで表示", "FREEで表示"],
  ["公開◎・AI TOP・MARKET TOP（全レース、発走前）", "FREEで表示", "FREEで表示（変わりません）"],
  ["買い判定（BUY / WATCH / PASS）と基本の結果・AI履歴", "FREEで表示", "FREEで表示（変わりません）"],
  ["正式買い目候補", "MEMBER限定（準備中）", "準備中"],
  ["詳細な実績・条件別分析・データ", "基本的な正本statusのみ", "準備中"],
];

export default function MemberPage() {
  return <PublicLabHeader active="member" eyebrow="MEMBER / INFORMATION ARCHITECTURE" title="MEMBERについて" description="全レース無料で見られる範囲と、将来のMEMBER機能候補を分けて説明します。認証・決済・アクセスコード照合はまだ接続しません。">
    <section className="lab-member-values" aria-label="MEMBERの主要価値">
      <div><span>01</span><h2>全レース無料の範囲</h2><p>公開◎・AI TOP・MARKET TOP・買い判定・基本の結果は、全レースでFREEのまま見られます。MEMBERを始めても、この範囲は変わりません。</p></div>
      <div><span>02</span><h2>正式買い目候補</h2><p>FREEでは表示しません。MEMBER側は準備中で、候補はまだ表示しません。</p></div>
      <div><span>03</span><h2>詳細な実績・分析</h2><p>基本の実績は無料で見られます。条件別などの詳細分析は、認証の準備が整うまで準備中です。</p></div>
    </section>

    <section className="lab-tier-comparison" aria-labelledby="tier-compare-title">
      <header><span className="eyebrow">FREE / MEMBER COMPARISON</span><h2 id="tier-compare-title">現在の閲覧範囲</h2></header>
      <div className="lab-tier-table" role="table" aria-label="FREEとMEMBERの比較">
        <div className="lab-tier-row lab-tier-head" role="row"><span role="columnheader">機能</span><span role="columnheader">FREE</span><span role="columnheader">MEMBER</span></div>
        {rows.map(([feature, free, member]) => <div className="lab-tier-row" role="row" key={feature}><span role="cell">{feature}</span><span role="cell"><Check size={13} />{free}</span><span role="cell"><LockKeyhole size={13} />{member}</span></div>)}
      </div>
    </section>

    <section className="lab-feature-status is-pending" role="status">
      <CircleAlert size={20} aria-hidden="true" />
      <div><span className="eyebrow">ENTITLEMENT / NOT CONNECTED</span><h2>MEMBER認証・決済は未接続です。</h2><p>Stripe、note決済、アクセスコード照合、閲覧状態の付与は行いません。料金も設定しません。</p></div>
    </section>

    <div className="lab-member-links"><NoteExternalLink kind="membership" placement="member_page" /><WeekendPassPanel /></div>
    <p className="lab-access-code-link"><Link href="/access-code" onClick={() => trackBetaEvent({ name: "beta_member_click", properties: { source: "access_code" } })}>アクセスコード機能（準備中）を見る</Link></p>
    <MemberGate />
  </PublicLabHeader>;
}
