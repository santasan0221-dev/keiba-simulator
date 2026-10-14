import { VenueFilter } from "@/components/VenueFilter";
import { filterVenue, validVenue, venueKey } from "@/lib/venueFilter";
import { predictionCardUiEnabled, validPredictionCard } from "@/lib/predictionCardUi";
import { raceKeyToPath } from "@/lib/raceShareUrl";
import { ApiState } from "@/components/ApiState";
import { useEffect, useState, type ReactNode } from "react";
import { ArrowLeft, CircleAlert, Copy, FlaskConical, History, LoaderCircle, Share2, TriangleAlert } from "lucide-react";
import { Link, useParams, useLocation } from "wouter";
import { toast } from "sonner";
import { ProductionPredictionCard } from "@/components/prediction/ProductionPredictionCard";
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
  const [, navigate] = useLocation();
  const [selectedVenue, setSelectedVenue] = useState("");
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

  const uiEnabled = predictionCardUiEnabled();
  useEffect(() => {
    if (!uiEnabled || !selectedVenue || readyRace?.race.race_key !== raceKey) return;
    const organization = readyRace.race.organization;
    const expected = typeof organization === "string" ? venueKey({ organization, venue: readyRace.race.venue }) : "";
    if (selectedVenue !== expected) setSelectedVenue(expected);
  }, [uiEnabled, selectedVenue, raceKey, readyRace?.race.race_key]);
  const venuePrep = uiEnabled && readyRace?.race.race_key === raceKey && validPredictionCard(readyRace?.prediction_card, raceKey);
  const effectiveVenue = validVenue(dayRaces, selectedVenue);
  const readyForVenue = uiEnabled && readyRace?.race.race_key === raceKey && dayRaces.some(r => r.organization === readyRace?.race.organization && typeof r.race_key === "string" && r.race_key.split("|")[1] === readyRace?.race.date);
  const venueRaces = venuePrep ? (readyForVenue ? Array.from(filterVenue(dayRaces, effectiveVenue)) : []) : dayRaces;
  const selectVenue = (venue: string) => {
    setSelectedVenue(venue);
    const first = filterVenue(dayRaces, venue)[0];
    if (venue && first && first.race_key !== raceKey) {
      const path = raceKeyToPath(first.race_key);
      if (path) navigate(path);
    }
  };
  return <main className="race-page kt-page">
    <header className="race-page-topbar kt-topbar">
      <Link href="/" className="race-page-back"><ArrowLeft size={16} /> 今日のレース一覧へ</Link>
      {state.kind === "ready" && <strong className="race-sticky-identity">{state.race.race.venue} {state.race.race.race_no}R <small>{state.race.race.distance ?? "—"}m</small></strong>}
    </header>
    <LabServiceNavigation active="today" />
    {dayRaces.length > 0 && <RaceTicker races={venueRaces} nowMs={now} activeKey={raceKey} />}
    <div className="race-page-body kt-container">
      {state.kind === "loading" && <section className="race-page-status" aria-busy="true"><LoaderCircle className="spin" size={18} /><p>レースを読み込んでいます…</p></section>}
      {state.kind === "invalid_url" && <section className="race-page-status race-page-status--error" role="alert"><CircleAlert size={18} /><div><h2>このレースURLは正しくありません。</h2><p>共有されたURLが正しいか確認するか、レース一覧から選び直してください。</p></div></section>}
      {state.kind === "not_found" && <section className="race-page-status race-page-status--error" role="alert"><CircleAlert size={18} /><div><h2>このレースは見つかりませんでした。</h2><p>race_key: <code>{state.raceKey}</code></p><p>開催がない、または予測がまだ生成されていない可能性があります。0件として扱わず、取得不能として表示しています。</p></div></section>}
      {state.kind === "unavailable" && <section className="race-page-status race-page-status--error" role="alert"><TriangleAlert size={18} /><div><h2>現在データを取得できません。</h2><ApiState kind="unavailable" status={state.status}/><p>正本APIへ接続できないため、0件や取得成功として表示していません。時間をおいて再度お試しください。</p></div></section>}
      {state.kind === "ready" && <RaceExperience race={state.race} raceKey={raceKey} now={now} venueControls={venuePrep && readyForVenue && dayRaces.length > 0 ? <VenueFilter races={dayRaces} selected={effectiveVenue} onChange={selectVenue} /> : null} />}
    </div>
  </main>;
}

function RaceExperience({ race, raceKey, now, venueControls }: { race: LabRace; raceKey: string | null; now: number; venueControls?: ReactNode }) {
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
    <ProductionPredictionCard card={race.prediction_card} raceKey={raceKey} venueControls={venueControls} />
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
