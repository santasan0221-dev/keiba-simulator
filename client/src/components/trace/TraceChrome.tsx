import React, { useEffect, useState } from "react";
import { Link } from "wouter";
import type { LabRaceListItem } from "@/lib/singlePickAi";
import { raceKeyToPath } from "@/lib/raceShareUrl";
import { countdownLabel, listPicks, startTime, verdictOf } from "@/lib/raceView";
import { VerdictChip } from "./RaceParts";

/** Wall clock that re-renders every `intervalMs` (countdowns only; no data is derived from it). */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

/**
 * Broadcast-style race ticker: every race of the day in start order with
 * post time, publication ◎ and bet verdict. A plain scrollable strip -- it
 * never auto-scrolls, so it is safe under prefers-reduced-motion.
 */
export function RaceTicker({ races, nowMs, activeKey }: { races: LabRaceListItem[]; nowMs: number; activeKey?: string | null }) {
  if (!races.length) return null;
  const sorted = [...races].sort((a, b) => (a.scheduled_start_at ?? "").localeCompare(b.scheduled_start_at ?? ""));
  return <nav className="kt-ticker" aria-label="本日のレースティッカー">
    <span className="kt-ticker-label">RACE TICKER</span>
    <ol>{sorted.map(race => {
      const path = raceKeyToPath(race.race_key);
      const started = race.scheduled_start_at ? Date.parse(race.scheduled_start_at) <= nowMs : false;
      const { honmei } = listPicks(race);
      const body = <>
        <span className="kt-ticker-time kt-num">{startTime(race.scheduled_start_at)}</span>
        <strong>{race.venue ?? "—"}{race.race_no ?? "—"}R</strong>
        <span className="kt-ticker-pick">{honmei.available ? `◎${honmei.horseNo}` : "◎—"}</span>
        <VerdictChip verdict={verdictOf(race)} />
        <small>{started ? (race.status === "RESULTED" ? "確定" : "発走済") : countdownLabel(race.scheduled_start_at, nowMs).replace("発走まで ", "あと")}</small>
      </>;
      return <li key={race.race_key} className={`${started ? "is-past" : ""}${activeKey === race.race_key ? " is-active" : ""}`}>
        {path ? <Link href={path} aria-current={activeKey === race.race_key ? "page" : undefined}>{body}</Link> : <span>{body}</span>}
      </li>;
    })}</ol>
  </nav>;
}

/** Home → Race → Simulator → Results guide rail shown under page heros. */
export function JourneyRail({ step, raceKey }: { step: "home" | "race" | "simulator" | "results"; raceKey?: string | null }) {
  const racePath = raceKey ? raceKeyToPath(raceKey) : null;
  const steps: Array<{ key: typeof step; label: string; href: string | null }> = [
    { key: "home", label: "今日", href: "/" },
    { key: "race", label: "レース", href: racePath ?? "/#today-races" },
    { key: "simulator", label: "展開SIM", href: raceKey ? `/simulator?race=${encodeURIComponent(raceKey)}` : "/simulator" },
    { key: "results", label: "結果", href: "/ai-history#race-ledger" },
  ];
  return <ol className="kt-journey" aria-label="閲覧ステップ">
    {steps.map((item, index) => <li key={item.key} className={item.key === step ? "is-current" : ""}>
      {item.href && item.key !== step ? <Link href={item.href}><b>{index + 1}</b>{item.label}</Link> : <span aria-current={item.key === step ? "step" : undefined}><b>{index + 1}</b>{item.label}</span>}
    </li>)}
  </ol>;
}
