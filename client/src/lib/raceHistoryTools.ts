import type { RaceHistoryRace } from "@/components/RaceHistoryDashboard";

export type RaceHistoryFilters = { from: string; to: string; venue: string };

export const DEFAULT_RACE_HISTORY_FILTERS: RaceHistoryFilters = { from: "", to: "", venue: "" };

export function filterRaceHistory(races: RaceHistoryRace[], filters: RaceHistoryFilters): RaceHistoryRace[] {
  return races.filter((race) => {
    if (filters.venue && race.venue !== filters.venue) return false;
    if (filters.from && (!race.raceDate || race.raceDate < filters.from)) return false;
    if (filters.to && (!race.raceDate || race.raceDate > filters.to)) return false;
    return true;
  });
}

function csvCell(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function buildRaceHistoryCsv(races: RaceHistoryRace[], filters: RaceHistoryFilters): string {
  const period = `${filters.from || "開始指定なし"}〜${filters.to || "終了指定なし"}`;
  const rows = [
    ["AI OUTCOME ARCHIVE", "履歴エクスポート"],
    ["対象期間", period],
    ["競馬場", filters.venue || "すべて"],
    ["出力件数", races.length],
    [],
    ["raceKey", "raceDate", "organization", "venue", "raceNo", "raceStatus", "calibrationStatus", "resultStatus", "aiPickOutcome", "aiPickFinish", "comparedCount", "exactMatches", "meanAbsoluteRankError", "winReturnRate", "placeReturnRate", "asOf", "lastSyncedAt", "confirmedAt"],
    ...races.map((race) => [race.raceKey, race.raceDate, race.organization, race.venue, race.raceNo, race.raceStatus, race.calibrationStatus, race.resultStatus, race.aiPickOutcome, race.aiPickFinish, race.comparedCount, race.exactMatches, race.meanAbsoluteRankError, race.winReturnRate, race.placeReturnRate, race.asOf, race.lastSyncedAt, race.confirmedAt]),
  ];
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\n")}`;
}

export function downloadRaceHistoryCsv(races: RaceHistoryRace[], filters: RaceHistoryFilters): void {
  const blob = new Blob([buildRaceHistoryCsv(races, filters)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `keiba-lab-ai-outcome-archive-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}
