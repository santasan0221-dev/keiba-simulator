import type { ReactNode } from "react";
import { BarChart3, History, LineChart, LockKeyhole, Sparkles } from "lucide-react";
import { Link } from "wouter";
import { AccessTierBadge } from "@/components/AccessTierUI";
import { publicAssetUrl } from "@/lib/publicAsset";

type ServicePage = "today" | "betting" | "analysis" | "history" | "member";

const links: Array<{ key: ServicePage; href: string; label: string; icon: typeof Sparkles }> = [
  { key: "today", href: "/", label: "本日の予想", icon: Sparkles },
  { key: "betting", href: "/betting-candidates", label: "買い目候補", icon: LineChart },
  { key: "analysis", href: "/performance-analysis", label: "実績・分析", icon: BarChart3 },
  { key: "history", href: "/ai-history", label: "AI履歴", icon: History },
  { key: "member", href: "/member", label: "MEMBER", icon: LockKeyhole },
];

export function LabServiceNavigation({ active }: { active: ServicePage }) {
  return <nav className="lab-service-nav" aria-label="KEIBA LAB サービスナビゲーション">
    <div className="lab-service-nav-inner">
      {links.map(({ key, href, label, icon: Icon }) => <Link key={key} href={href} className={`lab-service-link ${active === key ? "is-active" : ""}`} aria-current={active === key ? "page" : undefined}>
        <Icon size={13} strokeWidth={1.8} />
        <span>{label}</span>
      </Link>)}
    </div>
  </nav>;
}

export function PublicLabHeader({ active, eyebrow, title, description, children }: { active: Exclude<ServicePage, "today">; eyebrow: string; title: string; description: string; children?: ReactNode }) {
  return <div className="app-shell lab-public-shell">
    <header className="topbar lab-public-topbar">
      <Link href="/" className="brand-lockup lab-brand-link" aria-label="KEIBA LAB 本日の予想へ">
        <div className="brand-mark"><img src={publicAssetUrl("media/keiba-lab-mark.png")} alt="KEIBA LAB" /></div>
        <div><div className="brand-name">KEIBA <span>LAB</span></div><div className="brand-caption">RACE INTELLIGENCE STUDIO</div></div>
      </Link>
      <div className="topbar-meta"><AccessTierBadge /><span className="status-dot" />CANONICAL READ-ONLY</div>
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
