import React, { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { ArrowRight, Radio, TimerReset } from "lucide-react";
import {
  fetchAvailablePredictionDates,
  fetchDailyOperations,
  fetchLabHealth,
  fetchLabResults,
  fetchRace,
  fetchRaces,
  type LabDailyOperations,
  type LabHealth,
  type LabRace,
  type LabRaceListItem,
  type LabResultListItem,
} from "@/lib/singlePickAi";
import { raceKeyToPath } from "@/lib/raceShareUrl";
import { formatPercent } from "@/lib/displayFormat";
import { todayRecord } from "@/lib/todayRecord";
import { trackCta } from "@/lib/betaAnalytics";
import {
  AGREEMENT_COPY,
  agreementOf,
  countdownLabel,
  honmeiResultLabel,
  isConfirmed,
  listPicks,
  nextRace,
  pickCards,
  startTime,
  uniqueHonmei,
  verdictOf,
  type AgreementState,
  type Verdict,
} from "@/lib/raceView";
import { PickCardView, VerdictChip } from "./RaceParts";
import { TodayRecord } from "./TodayRecord";
import { JourneyRail, RaceTicker, useNow } from "./TraceChrome";

type Load<T> = { state: "loading" } | { state: "ready"; value: T } | { state: "unavailable" };

const VERDICTS: Verdict[] = ["BUY", "WATCH", "PASS", "UNKNOWN"];

function dateLabel(date: string) {
  const value = new Date(`${date}T00:00:00+09:00`);
  return Number.isNaN(value.getTime()) ? date : value.toLocaleDateString("ja-JP", { month: "long", day: "numeric", weekday: "short", timeZone: "Asia/Tokyo" });
}

/** Featured race: the next BUY to start, else the next race, else the day's last race. */
function featuredRace(races: LabRaceListItem[], now: number): LabRaceListItem | null {
  const upcoming = races.filter(race => race.scheduled_start_at && Date.parse(race.scheduled_start_at) > now);
  return nextRace(upcoming.filter(race => verdictOf(race) === "BUY"), now) ?? nextRace(upcoming, now) ?? races.at(-1) ?? null;
}

/**
 * TODAY'S RACING COMMAND CENTER. Everything here is read from the public
 * API for the latest prediction date. Missing pieces render as
 * 取得不能/未確定, never as 0.
 */
export function CommandCenter() {
  const now = useNow();
  const [date, setDate] = useState<Load<string>>({ state: "loading" });
  const [races, setRaces] = useState<Load<LabRaceListItem[]>>({ state: "loading" });
  const [results, setResults] = useState<Load<LabResultListItem[]>>({ state: "loading" });
  const [daily, setDaily] = useState<Load<LabDailyOperations>>({ state: "loading" });
  const [health, setHealth] = useState<Load<LabHealth>>({ state: "loading" });
  const [details, setDetails] = useState<Record<string, LabRace>>({});

  useEffect(() => {
    let live = true;
    fetchAvailablePredictionDates()
      .then(value => { if (live) setDate(value.latest_prediction_date ? { state: "ready", value: value.latest_prediction_date } : { state: "unavailable" }); })
      .catch(() => { if (live) setDate({ state: "unavailable" }); });
    fetchLabHealth().then(value => { if (live) setHealth({ state: "ready", value }); }).catch(() => { if (live) setHealth({ state: "unavailable" }); });
    return () => { live = false; };
  }, []);

  const day = date.state === "ready" ? date.value : null;
  useEffect(() => {
    if (!day) { if (date.state === "unavailable") { setRaces({ state: "unavailable" }); setResults({ state: "unavailable" }); setDaily({ state: "unavailable" }); } return; }
    let live = true;
    Promise.allSettled([fetchRaces(day, "JRA"), fetchRaces(day, "NAR")]).then(([jra, nar]) => {
      if (!live) return;
      const rows = [jra, nar].flatMap(entry => entry.status === "fulfilled" ? entry.value.races : []);
      const failed = jra.status === "rejected" && nar.status === "rejected";
      setRaces(failed ? { state: "unavailable" } : { state: "ready", value: rows.sort((a, b) => (a.scheduled_start_at ?? "").localeCompare(b.scheduled_start_at ?? "")) });
    });
    fetchLabResults({ date: day }).then(value => { if (live) setResults({ state: "ready", value: value.results }); }).catch(() => { if (live) setResults({ state: "unavailable" }); });
    fetchDailyOperations(day).then(value => { if (live) setDaily({ state: "ready", value }); }).catch(() => { if (live) setDaily({ state: "unavailable" }); });
    return () => { live = false; };
  }, [day, date.state]);

  const raceRows = races.state === "ready" ? races.value : [];
  const featured = useMemo(() => featuredRace(raceRows, now), [raceRows, now]);
  // Detail payloads for the featured race + the next few races: the list API
  // does not carry market data, so AI × MARKET needs the race detail.
  const watchKeys = useMemo(() => {
    const upcoming = raceRows.filter(race => race.scheduled_start_at && Date.parse(race.scheduled_start_at) > now).slice(0, 6).map(race => race.race_key);
    return Array.from(new Set([featured?.race_key, ...upcoming].filter((key): key is string => Boolean(key))));
  }, [raceRows, featured?.race_key, now]);
  useEffect(() => {
    let live = true;
    for (const key of watchKeys) {
      if (details[key]) continue;
      fetchRace(key).then(value => { if (live) setDetails(current => ({ ...current, [key]: value })); }).catch(() => undefined);
    }
    return () => { live = false; };
    // details is intentionally read, not tracked: each key is fetched once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchKeys.join("|")]);

  const venues = Array.from(new Set(raceRows.map(race => race.venue).filter((venue): venue is string => Boolean(venue))));
  const verdictCounts = Object.fromEntries(VERDICTS.map(verdict => [verdict, raceRows.filter(race => verdictOf(race) === verdict).length])) as Record<Verdict, number>;
  const record = useMemo(() => races.state === "ready" && results.state === "ready" ? todayRecord(races.value, results.value) : null, [races, results]);
  const recordState = races.state === "unavailable" || results.state === "unavailable" ? "unavailable" : record ? "ready" : "loading";
  const next = nextRace(raceRows, now);
  const featuredDetail = featured ? details[featured.race_key] : undefined;
  const featuredPicks = featuredDetail ? pickCards(featuredDetail) : featured ? { ...listPicks(featured), marketTop: null } : null;

  return <section className="kt-command" aria-label="TODAY'S RACING COMMAND CENTER">
    <header className="kt-command-head">
      <div>
        <span className="kt-eyebrow"><Radio size={12} aria-hidden="true" /> TODAY'S RACING COMMAND CENTER</span>
        <h2>{day ? dateLabel(day) : date.state === "loading" ? "開催日を確認中" : "開催日を取得できません"}</h2>
        <div className="kt-venues">{venues.length ? venues.map(venue => <span key={venue}>{venue}</span>) : <span className="is-muted">{races.state === "loading" ? "開催場を確認中" : "開催場データなし"}</span>}</div>
      </div>
      <div className="kt-next-post" aria-live="polite">
        <span className="kt-eyebrow"><TimerReset size={12} aria-hidden="true" /> NEXT POST</span>
        {next ? <Link href={raceKeyToPath(next.race_key) ?? "/"} className="kt-next-post-link"><strong className="kt-num">{startTime(next.scheduled_start_at)}</strong><span>{next.venue} {next.race_no}R</span><em>{countdownLabel(next.scheduled_start_at, now)}</em></Link>
          : <strong className="kt-next-post-none">{races.state === "loading" ? "確認中" : "本日の発走予定なし"}</strong>}
      </div>
    </header>

    {raceRows.length > 0 && <RaceTicker races={raceRows} nowMs={now} />}
    <JourneyRail step="home" raceKey={featured?.race_key} />

    <div className="kt-command-grid">
      <article className="kt-feature kt-reveal" aria-label="注目レース">
        {featured && featuredPicks ? <>
          <header>
            <div><span className="kt-eyebrow">FEATURED RACE · 注目レース</span>
              <h2>{featured.venue} <b>{featured.race_no}R</b></h2>
              <p>{[featured.surface, featured.distance ? `${featured.distance}m` : null].filter(Boolean).join(" ")} · 発走 <span className="kt-num">{startTime(featured.scheduled_start_at)}</span> · {countdownLabel(featured.scheduled_start_at, now)}</p></div>
            <VerdictChip verdict={featuredDetail ? verdictOf(featuredDetail) : verdictOf(featured)} size="lg" />
          </header>
          <div className="kt-feature-picks">
            <PickCardView card={featuredPicks.honmei} />
            <PickCardView card={featuredPicks.aiTop} />
            {featuredPicks.marketTop ? <PickCardView card={featuredPicks.marketTop} /> : <article className="kt-pick kt-pick--market is-unavailable"><header><span className="kt-pick-tag">MARKET TOP</span><small>市場評価1位</small></header><div className="kt-pick-unavailable"><strong>読込中</strong><small>レース詳細から取得します</small></div></article>}
          </div>
          <footer><Link href={raceKeyToPath(featured.race_key) ?? "/"} className="kt-cta kt-cta--primary" onClick={() => trackCta("featured_race")}>このレースを見る <ArrowRight size={16} aria-hidden="true" /></Link>
            <Link href={`/simulator?race=${encodeURIComponent(featured.race_key)}`} className="kt-cta" onClick={() => trackCta("featured_scenario")}>展開シナリオ</Link></footer>
        </> : <div className="kt-empty">{races.state === "loading" ? "本日のレースを読み込み中…" : races.state === "unavailable" ? "レース一覧を取得できません（0件ではありません）。" : "この日の予測レースはありません。"}</div>}
      </article>

      <aside className="kt-command-side">
        <TodayRecord record={record} state={recordState} daily={daily.state === "ready" ? daily.value : null} healthOk={health.state === "loading" ? null : health.state === "ready" && health.value.reachable === true && health.value.schema_version === "lab-api-v2"} verdicts={verdictCounts} verdictsReady={races.state === "ready"} />
      </aside>
    </div>

    <section id="today-race-board" className="kt-board" aria-label="Today's races">
      <header className="kt-section-head"><div><span className="kt-eyebrow">TODAY'S RACES</span><h2>本日のレース</h2></div><span className="kt-count">{races.state === "ready" ? `${raceRows.length}レース` : ""}</span></header>
      {races.state === "ready" && raceRows.length ? <ol className="kt-race-grid">{raceRows.map((race, index) => <RaceTile key={race.race_key} race={race} now={now} index={index} />)}</ol>
        : <div className="kt-empty">{races.state === "loading" ? "読み込み中…" : races.state === "unavailable" ? "レース一覧を取得できません。" : "この日の予測レースはありません。"}</div>}
    </section>

    <div className="kt-lower-grid">
      <LatestResults results={results} />
      <AgreementBoard races={raceRows} details={details} watchKeys={watchKeys} />
    </div>
  </section>;
}

function RaceTile({ race, now, index }: { race: LabRaceListItem; now: number; index: number }) {
  const { honmei, aiTop } = listPicks(race);
  const verdict = verdictOf(race);
  const path = raceKeyToPath(race.race_key);
  const started = race.scheduled_start_at ? Date.parse(race.scheduled_start_at) <= now : false;
  const body = <>
    <header><span className="kt-tile-org">{race.organization}</span><strong>{race.venue ?? "—"} <b>{race.race_no ?? "—"}R</b></strong><time className="kt-num">{startTime(race.scheduled_start_at)}</time></header>
    <div className="kt-tile-picks">
      <p className="kt-tile-honmei"><span className="kt-honmei-mark" aria-label="公開本命">◎</span>{honmei.available ? <><span className="kt-horse-no">{honmei.horseNo}</span><strong>{honmei.horseName}</strong></> : <em>公開◎なし</em>}</p>
      <p className="kt-tile-ai"><span className="kt-src kt-src--ai">AI TOP</span>{aiTop.available ? <><span className="kt-horse-no">{aiTop.horseNo}</span><span>{aiTop.horseName}</span>{aiTop.probability !== null ? <b className="kt-num">{formatPercent(aiTop.probability)}</b> : null}</> : <em>{aiTop.reason}</em>}</p>
    </div>
    <footer><VerdictChip verdict={verdict} /><small>{race.status === "RESULTED" ? "結果確定" : started ? "発走済み" : countdownLabel(race.scheduled_start_at, now)}</small></footer>
  </>;
  return <li className={`kt-tile kt-reveal${started ? " is-past" : ""}`} style={{ "--kt-i": Math.min(index, 12) } as React.CSSProperties}>
    {path ? <Link href={path} aria-label={`${race.venue} ${race.race_no}R の詳細`}>{body}</Link> : <div>{body}</div>}
  </li>;
}

function LatestResults({ results }: { results: Load<LabResultListItem[]> }) {
  const confirmed = results.state === "ready" ? results.value.filter(isConfirmed).slice(-4).reverse() : [];
  return <section className="kt-panel" aria-label="Latest results">
    <header className="kt-panel-head"><span className="kt-eyebrow">LATEST RESULTS</span><Link href="/ai-history#race-ledger" className="kt-link">すべて <ArrowRight size={13} aria-hidden="true" /></Link></header>
    {results.state === "loading" ? <p className="kt-empty">読み込み中…</p> : results.state === "unavailable" ? <p className="kt-empty">結果を取得できません（0件ではありません）。</p> : confirmed.length ? <ul className="kt-result-mini">{confirmed.map(row => {
      const honmei = uniqueHonmei(row);
      const label = honmeiResultLabel(row);
      const finish = label.kind === "finish" ? row.ai_pick_finish : null;
      const tone = label.kind === "special" ? "na" : finish === 1 ? "hit" : finish !== null && finish <= 3 ? "placed" : "miss";
      return <li key={row.race_key} className={`is-${tone}`}><strong>{row.venue} {row.race_no}R</strong><span>◎{honmei?.horse_no ?? "—"}</span><b className="kt-num">{label.text}</b></li>;
    })}</ul> : <p className="kt-empty">確定済みの結果はまだありません。</p>}
  </section>;
}

function AgreementBoard({ races, details, watchKeys }: { races: LabRaceListItem[]; details: Record<string, LabRace>; watchKeys: string[] }) {
  const rows = watchKeys.map(key => ({ key, race: races.find(item => item.race_key === key), detail: details[key] })).filter(row => row.race);
  return <section className="kt-panel" aria-label="AI × Market agreement">
    <header className="kt-panel-head"><span className="kt-eyebrow">AI × MARKET AGREEMENT</span><small>次の発走レース</small></header>
    {rows.length ? <ul className="kt-agree-mini">{rows.map(({ key, race, detail }) => {
      const state: AgreementState | null = detail ? agreementOf(detail).state : null;
      return <li key={key}><Link href={raceKeyToPath(key) ?? "/"}><strong>{race!.venue} {race!.race_no}R</strong>
        <span className={`kt-agree-tag kt-agree-tag--${(state ?? "loading").toLowerCase()}`}>{state ? AGREEMENT_COPY[state].label : "確認中"}</span></Link></li>;
    })}</ul> : <p className="kt-empty">照合できる発走前レースはありません。</p>}
  </section>;
}
