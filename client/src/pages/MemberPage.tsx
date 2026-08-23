import { Check, CircleAlert, LockKeyhole } from "lucide-react";
import { MemberGate, NoteExternalLink, WeekendPassPanel } from "@/components/AccessTierUI";
import { PublicLabHeader } from "@/components/LabServiceNavigation";
import { Link } from "wouter";

const rows = [
  ["本日のレース情報", "FREEで表示", "FREEで表示"],
  ["事前固定されたFREE対象の発走前公開", "公開設定の検証後のみ", "FREEで表示"],
  ["全JRAレースの発走前詳細", "正本detailはMEMBER_LOCKED", "PENDING_DATA（生成待ち）"],
  ["正式買い目候補", "MEMBER_LOCKED", "NOT_YET_GENERATED（生成待ち）"],
  ["詳細な実績・条件別分析", "基本的な正本statusのみ", "PENDING_DATA／正本entitlement後に表示"],
  ["AI履歴の基本情報", "日付・レース・結果状態", "準備中"],
];

export default function MemberPage() {
  return <PublicLabHeader active="member" eyebrow="MEMBER / INFORMATION ARCHITECTURE" title="MEMBERについて" description="FREEで見られる情報と、将来のMEMBER機能候補を明確に分けます。認証・決済・アクセスコード照合はまだ接続しません。">
    <section className="lab-member-values" aria-label="MEMBERの主要価値">
      <div><span>01</span><h2>全レースのAI予測</h2><p>FREEの正本detailはMEMBER_LOCKEDです。MEMBER側は現在PENDING_DATAであり、値を表示しません。</p></div>
      <div><span>02</span><h2>正式買い目候補</h2><p>FREEではMEMBER_LOCKEDです。MEMBER側も現在NOT_YET_GENERATEDであり、候補は表示しません。</p></div>
      <div><span>03</span><h2>詳細な実績・分析</h2><p>確定結果に基づく正本比較を表示します。MEMBER詳細はentitlementと正本statusがそろうまで準備中です。</p></div>
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

    <div className="lab-member-links"><NoteExternalLink kind="membership" /><WeekendPassPanel /></div>
    <p className="lab-access-code-link"><Link href="/access-code">アクセスコード機能（準備中）を見る</Link></p>
    <MemberGate />
  </PublicLabHeader>;
}
