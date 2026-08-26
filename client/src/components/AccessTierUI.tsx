import { ExternalLink, KeyRound, LockKeyhole, ShieldCheck, Timer, UserRoundCheck } from "lucide-react";
import { ACCESS_TIER_NOTICE, FREE_PUBLICATION_RULE_NOTICE, noteLinks } from "@/lib/accessTier";
import { Link } from "wouter";
import { memberSourceForPath, trackBetaEvent } from "@/lib/betaAnalytics";

type NoteKind = "membership" | "weekendPass";

function scrollToMemberGate() {
  trackBetaEvent({
    name: "beta_member_click",
    properties: { source: memberSourceForPath(window.location.pathname, import.meta.env.BASE_URL) },
  });
  document.getElementById("member-gate")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function trackMemberFunnel() {
  trackBetaEvent({
    name: "beta_member_click",
    properties: { source: memberSourceForPath(window.location.pathname, import.meta.env.BASE_URL) },
  });
}

export function AccessTierBadge() {
  return <div className="access-tier-badge" aria-label="現在の閲覧状態: FREE">
    <span className="access-tier-dot" aria-hidden="true" />
    <span>FREE</span>
    <i aria-hidden="true" />
    <small>{ACCESS_TIER_NOTICE.memberStatus}</small>
  </div>;
}

export function FreeScopeStrip() {
  return <section className="free-scope-strip free-scope-strip--compact" aria-labelledby="free-scope-title">
    <div className="free-scope-heading"><span className="eyebrow">FREE</span><h2 id="free-scope-title">FREE公開対象は事前固定ruleで自動選定。</h2></div>
    <p className="free-scope-note">{FREE_PUBLICATION_RULE_NOTICE.description}</p>
    <div className="free-scope-actions">
      <Link href="/free">FREE公開を見る</Link>
      <button type="button" onClick={scrollToMemberGate}>MEMBERを見る</button>
    </div>
  </section>;
}

export function NoteExternalLink({ kind, compact = false }: { kind: NoteKind; compact?: boolean }) {
  const isMembership = kind === "membership";
  const href = isMembership ? noteLinks.membership : noteLinks.weekendPass;
  const label = isMembership ? "noteでMEMBERの案内を見る" : "週末パスをnoteで見る";
  const description = isMembership ? "MEMBERの対象範囲・利用条件はnoteの案内で確認してください。" : "対象日・閲覧範囲・利用条件はnoteの案内で確認してください。";

  if (!href) {
    return <span className={`note-external-link is-pending${compact ? " compact" : ""}`} title="note外部URLの設定待ちです">
      {compact ? <ExternalLink size={13} /> : null}
      <span>{compact ? "note案内URLを設定後に有効化" : "note案内URLを設定後に有効化"}</span>
    </span>;
  }

  return <a className={`note-external-link${compact ? " compact" : ""}`} href={href} target="_blank" rel="noreferrer" onClick={trackMemberFunnel}>
    <span>{label}</span><ExternalLink size={13} aria-hidden="true" />
    {!compact && <small>{description}</small>}
  </a>;
}

export function WeekendPassPanel() {
  return <section className="weekend-pass-panel" aria-labelledby="weekend-pass-title">
    <div className="weekend-pass-icon"><Timer size={17} /></div>
    <div>
      <span className="eyebrow">WEEKEND PASS</span>
      <h3 id="weekend-pass-title">週末だけ発走前の詳細分析を確認したい方へ。</h3>
      <p>有効期間・対象範囲・利用方法は、noteの案内で確認してください。LAB側では利用状態を判定しません。</p>
    </div>
    <NoteExternalLink kind="weekendPass" compact />
  </section>;
}

export function MemberGate() {
  return <section id="member-gate" className="member-gate member-gate--compact" aria-labelledby="member-gate-title">
    <div className="member-gate-symbol"><LockKeyhole size={16} /></div>
    <div className="member-gate-copy">
      <span className="eyebrow">MEMBER</span>
      <h2 id="member-gate-title">MEMBER機能は準備中です。</h2>
      <div className="member-gate-scope"><span><ShieldCheck size={13} /> FREE: 一部発走前＋全事後公開</span><span><UserRoundCheck size={13} /> MEMBER: 全発走前＋詳細分析（準備中）</span></div>
    </div>
    <div className="member-gate-actions">
      <NoteExternalLink kind="membership" compact />
      <Link className="access-code-link" href="/access-code" onClick={trackMemberFunnel}><KeyRound size={13} /> アクセスコード</Link>
    </div>
  </section>;
}

export function AccessCodeForm() {
  return <main className="access-code-page">
    <section className="access-code-panel" aria-labelledby="access-code-title">
      <div className="access-code-icon"><KeyRound size={22} /></div>
      <span className="eyebrow">ACCESS CODE / PREPARING</span>
      <h1 id="access-code-title">アクセスコード機能は準備中です。</h1>
      <p>noteの案内で受け取るアクセスコードは、認証サービス接続後に確認できる予定です。現在はコードの照合、有効化、MEMBER閲覧状態の付与を行いません。</p>
      <label className="access-code-field">アクセスコード
        <input type="text" placeholder="XXXX-XXXX-XXXX" disabled aria-describedby="access-code-help" />
      </label>
      <p id="access-code-help" className="access-code-status">{ACCESS_TIER_NOTICE.accessCodeStatus}。コードの可否は判定していません。</p>
      <div className="access-code-actions">
        <NoteExternalLink kind="membership" compact />
        <Link href="/">FREE公開へ戻る</Link>
      </div>
    </section>
  </main>;
}
