import { ApiState } from "@/components/ApiState";
import { useEffect, useState } from "react";
import { ArrowLeft, CircleAlert, Copy, FlaskConical, History, LoaderCircle, Share2, TriangleAlert } from "lucide-react";
import { Link, useParams } from "wouter";
import { toast } from "sonner";
import { TruthPanel } from "@/components/TruthPanel";
import { LabServiceNavigation } from "@/components/LabServiceNavigation";
import { fetchRace, fetchRaces, LabApiError, type LabRace, type LabRaceListItem } from "@/lib/singlePickAi";
import { AgreementPanel, PickTrio, RaceHero, RankingBoard, raceVerdict, VerdictBanner, WinnerStrip } from "@/components/trace/RaceParts";
import { JourneyRail, RaceTicker, useNow } from "@/components/trace/TraceChrome";
import { absoluteRaceUrl, paramsToRaceKey, type RaceUrlParams } from "@/lib/raceShareUrl";
import { organizationFromRaceKey, raceViewState, trackBetaEvent } from "@/lib/betaAnalytics";

type LoadState =
  | { kind: "loading" }
  | { kind: "invalid_url" }
  | { kind: "not_found"; raceKey: string }
  | { kind: "unavailable"; raceKey: string; message: string; status: number }
  | { kind: "ready"; race: LabRace };

export async function shareRace(raceKey: string) {
  const url = absoluteRaceUrl(raceKey);
  if (!url) return;
  const shareData = { title: "KEIBA TRACE", text: "AI視点でこのレースを確認する", url };
  if (typeof navigator !== "undefined" && "share" in navigator) {
    try {
      await navigator.share(shareData);
      trackBetaEvent({ name: "beta_share", properties: { organization: organizationFromRaceKey(raceKey), method: "native" } });
      return;
    } catch {
      // User cancelled the native share sheet, or the platform rejected it --
      // fall through to clipboard copy rather than leaving the button inert.
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    trackBetaEvent({ name: "beta_share", properties: { organization: organizationFromRaceKey(raceKey), method: "clipboard" } });
    toast.success("URLをコピーしました。");
  } catch {
    toast.error("URLのコピーに失敗しました。手動でコピーしてください。", { description: url });
  }
}

/** Open every race at the top: wouter keeps the previous page's scroll on client-side navigation. */
export function resetScrollForRace(target: Pick<Window, "scrollTo"> | undefined) {
  target?.scrollTo(0, 0);
}

export default function RacePage() {
  const params = useParams<RaceUrlParams>();
  const raceKey = paramsToRaceKey(params);
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  useEffect(() => { resetScrollForRace(typeof window === "undefined" ? undefined : window); }, [raceKey]);

  useEffect(() => {
    if (!raceKey) {
      setState({ kind: "invalid_url" });
      return;
    }
    let active = true;
    setState({ kind: "loading" });
    fetchRace(raceKey)
      .then((race) => { if (active) setState({ kind: "ready", race }); })
      .catch((reason: unknown) => {
        if (!active) return;
        if (reason instanceof LabApiError && reason.status === 404) {
          setState({ kind: "not_found", raceKey });
        } else {
          const message = reason instanceof Error ? reason.message : String(reason);
          setState({ kind: "unavailable", raceKey, message, status: reason instanceof LabApiError ? reason.status : 0 });
        }
      });
    return () => { active = false; };
  }, [raceKey]);

  const now = useNow();
  const [dayRaces, setDayRaces] = useState<LabRaceListItem[]>([]);
  const readyRace = state.kind === "ready" ? state.race : null;
  useEffect(() => {
    const date = readyRace?.race.date;
    const org = readyRace?.race.organization ?? undefined;
    if (!date) return;
    let active = true;
    fetchRaces(date, org).then(value => { if (active) setDayRaces(value.races); }).catch(() => { if (active) setDayRaces([]); });
    return () => { active = false; };
  }, [readyRace?.race.date, readyRace?.race.organization]);

  return <main className="race-page kt-page">
    <header className="race-page-topbar kt-topbar">
      <Link href="/" className="race-page-back"><ArrowLeft size={16} /> 今日のレース一覧へ</Link>
      {state.kind === "ready" && <strong className="race-sticky-identity">{state.race.race.venue} {state.race.race.race_no}R <small>{state.race.race.distance ?? "—"}m</small></strong>}
    </header>
    <LabServiceNavigation active="today" />
    {dayRaces.length > 0 && <RaceTicker races={dayRaces} nowMs={now} activeKey={raceKey} />}
    <div className="race-page-body kt-container">
      {state.kind === "loading" && <section className="race-page-status" aria-busy="true"><LoaderCircle className="spin" size={18} /><p>レースを読み込んでいます…</p></section>}
      {state.kind === "invalid_url" && <section className="race-page-status race-page-status--error" role="alert"><CircleAlert size={18} /><div><h2>このレースURLは正しくありません。</h2><p>共有されたURLが正しいか確認するか、レース一覧から選び直してください。</p></div></section>}
      {state.kind === "not_found" && <section className="race-page-status race-page-status--error" role="alert"><CircleAlert size={18} /><div><h2>このレースは見つかりませんでした。</h2><p>race_key: <code>{state.raceKey}</code></p><p>開催がない、または予測がまだ生成されていない可能性があります。0件として扱わず、取得不能として表示しています。</p></div></section>}
      {state.kind === "unavailable" && <section className="race-page-status race-page-status--error" role="alert"><TriangleAlert size={18} /><div><h2>現在データを取得できません。</h2><ApiState kind="unavailable" status={state.status}/><p>正本APIへ接続できないため、0件や取得成功として表示していません。時間をおいて再度お試しください。</p></div></section>}
      {state.kind === "ready" && <RaceExperience race={state.race} raceKey={raceKey} now={now} />}
    </div>
  </main>;
}

function RaceExperience({ race, raceKey, now }: { race: LabRace; raceKey: string | null; now: number }) {
  const { verdict, reasons } = raceVerdict(race);
  const key = race.race.race_key ?? raceKey ?? "";
  // Counted once per successfully loaded race (not on a failed load). Only the
  // organization and a coarse pre/pending/post bucket are reported: no race key.
  useEffect(() => {
    trackBetaEvent({
      name: "beta_race_detail_view",
      properties: {
        organization: organizationFromRaceKey(key),
        race_state: raceViewState(race.race.scheduled_start_at, Boolean(race.result), Date.now()),
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return <div className="kt-race kt-reveal">
    <JourneyRail step="race" raceKey={key} />
    <RaceHero race={race} nowMs={now} />
    <WinnerStrip race={race} />
    <VerdictBanner verdict={verdict} reasons={reasons} />
    <PickTrio race={race} />
    <AgreementPanel race={race} />
    <RankingBoard race={race} />
    <nav className="kt-cta-row" aria-label="次の操作">
      <Link href={`/simulator?race=${encodeURIComponent(key)}`} className="kt-cta kt-cta--primary"><FlaskConical size={16} aria-hidden="true" /> このレースの展開シナリオを見る</Link>
      <Link href="/ai-history#race-ledger" className="kt-cta"><History size={16} aria-hidden="true" /> 結果・履歴を見る</Link>
      <button type="button" className="kt-cta race-page-share" onClick={() => void shareRace(key)}><Share2 size={14} /> このレースを共有 <Copy size={12} /></button>
    </nav>
    <section className="kt-data-room" aria-label="詳細データ">
      <details>
        <summary><div><span className="kt-eyebrow">DATA ROOM</span><h2>詳細データ・期待値・判断材料・公式結果</h2></div></summary>
        <TruthPanel race={race} />
      </details>
    </section>
  </div>;
}
