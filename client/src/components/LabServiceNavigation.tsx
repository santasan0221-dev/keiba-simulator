import React, { type ReactNode } from "react";
import { BarChart3, FlaskConical, History, LineChart, LockKeyhole, Sparkles } from "lucide-react";
import { Link } from "wouter";
import { AccessTierBadge } from "@/components/AccessTierUI";
import { publicAssetUrl } from "@/lib/publicAsset";
import { trackBetaEvent } from "@/lib/betaAnalytics";

type ServicePage = "today" | "betting" | "analysis" | "history" | "simulator" | "member";

// "simulator" is deliberately placed after the real-prediction pages (today /
// betting / analysis / history) and before MEMBER -- it's a secondary, opt-in
// what-if tool, not the site's primary product, so it must never read as
// more prominent than the real AI prediction pages.
const links: Array<{ key: ServicePage; href: string; label: string; icon: typeof Sparkles }> = [
  { key: "today", href: "/", label: "本日の予想", icon: Sparkles },
  { key: "betting", href: "/betting-candidates", label: "買い目候補", icon: LineChart },
  { key: "analysis", href: "/performance-analysis", label: "実績・分析", icon: BarChart3 },
  { key: "history", href: "/ai-history", label: "AI履歴", icon: History },
  { key: "simulator", href: "/simulator", label: "シミュレーター", icon: FlaskConical },
  { key: "member", href: "/member", label: "MEMBER", icon: LockKeyhole },
];

export function LabServiceNavigation({ active }: { active: ServicePage }) {
  return <nav className="lab-service-nav" aria-label="KEIBA TRACE サービスナビゲーション">
    <div className="lab-service-nav-inner">
      {links.map(({ key, href, label, icon: Icon }) => <Link key={key} href={href} className={`lab-service-link ${active === key ? "is-active" : ""}`} aria-current={active === key ? "page" : undefined} onClick={() => { if (key === "member") trackBetaEvent({ name: "beta_member_click", properties: { source: "main_nav" } }); }}>
        <Icon size={13} strokeWidth={1.8} />
        <span>{label}</span>
      </Link>)}
    </div>
  </nav>;
}

export function PublicLabHeader({ active, eyebrow, title, description, children }: { active: Exclude<ServicePage, "today">; eyebrow: string; title: string; description: string; children?: ReactNode }) {
  return <div className="app-shell lab-public-shell">
    <header className="topbar lab-public-topbar">
      <Link href="/" className="brand-lockup lab-brand-link" aria-label="KEIBA TRACE 本日の予想へ">
        <div className="brand-mark"><img src={publicAssetUrl("media/keiba-lab-mark.png")} alt="KEIBA TRACE" /></div>
        <div><div className="brand-name">KEIBA <span>TRACE</span></div><div className="brand-caption">AI予想を、結果まで追う。</div></div>
      </Link>
      <div className="topbar-meta"><AccessTierBadge /><span className="status-dot" />閲覧専用</div>
    </header>
    <LabServiceNavigation active={active} />
    <main className="lab-public-page">
      <header className="lab-page-heading">
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </header>
      {children}
    </main>
  </div>;
}
