import { useEffect, useState } from "react";
import { Info } from "lucide-react";
import { Link } from "wouter";
import { RealRaceLoader, type RealRaceLoad, type RealRaceLoadStatus } from "@/components/RealRaceLoader";
import { TruthPanel } from "@/components/TruthPanel";
import { fetchDailyOperations, type LabDailyOperations, type LabRace } from "@/lib/singlePickAi";
import { trpc } from "@/lib/trpc";
import { shouldApplySyncedRace, syncedRaceNotice } from "@/lib/singlePickSyncUpdate";
import { toast } from "sonner";
import { AccessTierBadge, FreeScopeStrip, MemberGate } from "@/components/AccessTierUI";
import { LabServiceNavigation } from "@/components/LabServiceNavigation";
import { LabValueStrip } from "@/components/LabValueStrip";
import { publicAssetUrl } from "@/lib/publicAsset";

const BRAND_MARK_URL = publicAssetUrl("media/keiba-lab-mark.png");

// Home is the real-prediction product (single_pick_ai's actual AI picks,
// TRUTH PANEL, official results). It intentionally holds no simulator state
// -- selecting a real race here must never seed, reset, or otherwise touch
// the /simulator what-if sandbox, and vice versa. See SimulatorPage.tsx for
// the what-if tool.
export default function Home() {
  const [realRace, setRealRace] = useState<LabRace | null>(null);
  const [realRaceLoadStatus, setRealRaceLoadStatus] = useState<RealRaceLoadStatus>("選択日の予測なし");
  const syncedRace = trpc.raceSync.race.useQuery({ raceKey: realRace?.race.race_key ?? "" }, { enabled: Boolean(realRace?.race.race_key), refetchInterval: 60_000, refetchOnWindowFocus: true });
  const [dailyFreshness, setDailyFreshness] = useState<LabDailyOperations | null>(null);
  const formatFreshness = (value: string | null | undefined) => value ? new Date(value).toLocaleString("ja-JP", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "未取得";

  useEffect(() => {
    const date = realRace?.race.date;
    if (!date) { setDailyFreshness(null); return; }
    let live = true;
    void fetchDailyOperations(date).then(value => { if (live) setDailyFreshness(value); }).catch(() => { if (live) setDailyFreshness(null); });
    return () => { live = false; };
  }, [realRace?.race.date]);

  useEffect(() => {
    const latest = syncedRace.data;
    if (!latest?.race.race_key) return;
    setRealRace(current => {
      if (!shouldApplySyncedRace(current, latest)) return current;
      if (JSON.stringify(current?.result ?? null) !== JSON.stringify(latest.result ?? null)) toast.success(syncedRaceNotice(latest));
      return latest;
    });
  }, [syncedRace.data]);

  // Severed from the simulator: selecting a real race only sets the real
  // prediction Home actually renders (realRace, consumed by TruthPanel and
  // the freshness/sync effects above). It must never write any what-if
  // sandbox state on the /simulator page (its field data, run settings,
  // scenario history, or seed) -- that coupling used to force a full
  // simulator re-seed on every real race click, which is exactly what this
  // product split removes. No localStorage/query-param/navigation-state
  // hand-off to /simulator either;
  // that bridge is explicitly out of scope for this round.
  const handleRealRaceLoad = ({ race }: RealRaceLoad) => {
    setRealRace(race);
  };

  return <div className="app-shell">
    <header className="topbar">
      <div className="brand-lockup">
        <div className="brand-mark"><img src={BRAND_MARK_URL} alt="Keiba Simulator mark" /></div>
        <div><div className="brand-name">KEIBA <span>TRACE</span></div><div className="brand-caption">AI予想を、結果まで追う。</div></div>
      </div>
      <div className="topbar-meta"><AccessTierBadge /><span className="status-dot" /><span>予測 {formatFreshness(dailyFreshness?.last_prediction_at)}</span><span>公式結果 {formatFreshness(dailyFreshness?.last_result_at)}</span><button className="ghost-icon" aria-label="Information"><Info size={16} /></button></div>
    </header>
    <LabServiceNavigation active="today" />
    <LabValueStrip />
    <FreeScopeStrip />
    <RealRaceLoader onLoad={handleRealRaceLoad} onStatusChange={setRealRaceLoadStatus} />
    <div className="lab-section-width">
      <TruthPanel race={realRace} loadStatus={realRaceLoadStatus} />
      <div className="lab-related-links">
        <Link href="/performance-analysis" className="real-race-history-link">実績・分析を見る<span aria-hidden="true"> ＞</span></Link>
        <Link href="/ai-history" className="real-race-history-link">AI履歴を見る<span aria-hidden="true"> ＞</span></Link>
      </div>
      <MemberGate />
    </div>
    <footer className="footer"><span>KEIBA TRACE / PRIVATE RACE MODEL</span><span>予測はAIモデルによる推計であり、的中・回収率を保証するものではありません。</span></footer>
  </div>;
}
