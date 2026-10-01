import React from "react";
import { Link } from "wouter";
import { ArrowRight } from "lucide-react";
import { trackCta } from "@/lib/betaAnalytics";

/** The one-line promise of the site. Fixed copy: no claims about hit rates or returns. */
export const HERO_TITLE = "AIは競馬をどこまで予測できるのか。";
export const HERO_LEAD = "発走前に記録したAIの◎を、市場と比べ、結果まで検証します。外れも含めて、すべて。";
export const HERO_NOTICE = "◎は購入推奨ではありません。";

const scrollToTodayRaces = (event: { preventDefault: () => void }) => {
  trackCta("hero_today");
  const target = typeof document === "undefined" ? null : document.getElementById("today-race-board");
  if (!target) return; // no target on this render: let the browser follow the #anchor
  event.preventDefault();
  const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
};

/**
 * First view of Home: what this site is, what to press next. This is the only
 * <h1> on the page. Primary = today's races, secondary = latest results; the
 * simulator is a third, text-level path.
 */
export function TraceHero() {
  return <section className="kt-hero" aria-labelledby="kt-hero-title">
    <h1 id="kt-hero-title">{HERO_TITLE}</h1>
    <p className="kt-hero-lead">{HERO_LEAD}</p>
    <div className="kt-hero-actions">
      <a href="#today-race-board" className="kt-cta kt-cta--primary" onClick={scrollToTodayRaces}>今日の予想を見る <ArrowRight size={16} aria-hidden="true" /></a>
      <Link href="/ai-history#race-ledger" className="kt-cta" onClick={() => trackCta("hero_results")}>最新結果を見る</Link>
      <Link href="/simulator" className="kt-hero-tertiary" onClick={() => trackCta("hero_simulator")}>シミュレーターを見る</Link>
    </div>
    <p className="kt-hero-notice"><strong>{HERO_NOTICE}</strong> 的中や利益は保証しません。<Link href="/rules" onClick={() => trackCta("rules_link")}>記録ルールを読む</Link></p>
  </section>;
}
