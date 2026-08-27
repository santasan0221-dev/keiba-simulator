import React from "react";
import { ArrowLeft, Database } from "lucide-react";
import { Link } from "wouter";
import { OperationsDashboard } from "@/components/OperationsDashboard";

export default function RaceHistoryPage() {
  return <main className="ai-history-page">
    <header className="ai-history-page-topbar">
      <Link href="/" className="ai-history-back"><ArrowLeft size={16} /> シミュレーターへ戻る</Link>
      <div><Database size={15} /><span>KEIBA TRACE · AI予想の検証履歴</span></div>
    </header>
    <OperationsDashboard />
  </main>;
}
