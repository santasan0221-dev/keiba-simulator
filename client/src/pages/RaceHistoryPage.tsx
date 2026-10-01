import React, { useEffect } from "react";
import { ArrowLeft, Database } from "lucide-react";
import { Link } from "wouter";
import { OperationsDashboard } from "@/components/OperationsDashboard";
import { LabServiceNavigation } from "@/components/LabServiceNavigation";
import { JourneyRail } from "@/components/trace/TraceChrome";
import { trackBetaEvent } from "@/lib/betaAnalytics";

export default function RaceHistoryPage() {
  useEffect(() => { trackBetaEvent({ name: "beta_history_view", properties: {} }); }, []);
  // wouter does not follow #hash targets on client-side navigation.
  useEffect(() => {
    const id = typeof window === "undefined" ? "" : window.location.hash.slice(1);
    if (!id) return;
    const timer = window.setTimeout(() => document.getElementById(id)?.scrollIntoView(), 300);
    return () => window.clearTimeout(timer);
  }, []);
  return <main className="ai-history-page kt-page">
    <header className="ai-history-page-topbar kt-topbar">
      <Link href="/" className="ai-history-back"><ArrowLeft size={16} /> 本日の予想へ</Link>
      <div><Database size={15} /><span>KEIBA TRACE · RACE DAY MONITOR</span></div>
    </header>
    <LabServiceNavigation active="history" />
    <div className="kt-container">
      <JourneyRail step="results" />
      <nav className="kt-subnav" aria-label="ページ内ナビゲーション">
        <a href="#operations">Operations · 運用状況</a>
        <a href="#race-ledger">Race History · 結果履歴</a>
      </nav>
      <OperationsDashboard />
    </div>
  </main>;
}
