import type { RaceHistoryRace } from "@/components/RaceHistoryDashboard";

export type RaceHistoryFilters = { from: string; to: string; venue: string; organization?: "" | "JRA" | "NAR" };

export const DEFAULT_RACE_HISTORY_FILTERS: RaceHistoryFilters = { from: "", to: "", venue: "", organization: "" };
export const RACE_HISTORY_FILTERS_STORAGE_KEY = "keiba-lab.race-history.filters.v1";
export const RACE_HISTORY_CONFIRMED_KEYS_STORAGE_KEY = "keiba-lab.race-history.confirmed-keys.v1";

export type WeeklyRaceHistoryReport = { weekKey: string; weekLabel: string; confirmedRaces: number; comparedCount: number; exactMatches: number; rankAccuracy: number | null; meanAbsoluteRankError: number | null; roiSampleCount: number; averageRoi: number | null };

function isDateInput(value: string): boolean {
  return value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function normalizeRaceHistoryFilters(value: unknown): RaceHistoryFilters {
  if (!value || typeof value !== "object") return DEFAULT_RACE_HISTORY_FILTERS;
  const candidate = value as Partial<RaceHistoryFilters>;
  const from = typeof candidate.from === "string" && isDateInput(candidate.from) ? candidate.from : "";
  const to = typeof candidate.to === "string" && isDateInput(candidate.to) ? candidate.to : "";
  const venue = typeof candidate.venue === "string" && candidate.venue.length <= 80 ? candidate.venue : "";
  const organization = candidate.organization === "JRA" || candidate.organization === "NAR" ? candidate.organization : "";
  const normalized = organization ? { from, to, venue, organization } : { from, to, venue };
  return from && to && from > to ? { ...normalized, from: to, to: from } : normalized;
}

export function readRaceHistoryFilters(): RaceHistoryFilters {
  if (typeof window === "undefined") return DEFAULT_RACE_HISTORY_FILTERS;
  try {
    return normalizeRaceHistoryFilters(JSON.parse(window.localStorage.getItem(RACE_HISTORY_FILTERS_STORAGE_KEY) ?? "null"));
  } catch {
    return DEFAULT_RACE_HISTORY_FILTERS;
  }
}

export function persistRaceHistoryFilters(filters: RaceHistoryFilters): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(RACE_HISTORY_FILTERS_STORAGE_KEY, JSON.stringify(normalizeRaceHistoryFilters(filters)));
  } catch {
    // ブラウザの保存領域を利用できない場合も、画面上の絞り込みは継続する。
  }
}

export function readConfirmedRaceKeys(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const value = JSON.parse(window.localStorage.getItem(RACE_HISTORY_CONFIRMED_KEYS_STORAGE_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").slice(-300) : [];
  } catch {
    return [];
  }
}

export function persistConfirmedRaceKeys(keys: string[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(RACE_HISTORY_CONFIRMED_KEYS_STORAGE_KEY, JSON.stringify(Array.from(new Set(keys)).slice(-300)));
  } catch {
    // 通知の表示に失敗しないよう、保存エラーは画面操作を妨げない。
  }
}

export function filterRaceHistory(races: RaceHistoryRace[], filters: RaceHistoryFilters): RaceHistoryRace[] {
  return races.filter((race) => {
    if (filters.organization && race.organization !== filters.organization) return false;
    if (filters.venue && race.venue !== filters.venue) return false;
    if (filters.from && (!race.raceDate || race.raceDate < filters.from)) return false;
    if (filters.to && (!race.raceDate || race.raceDate > filters.to)) return false;
    return true;
  });
}

function mondayFor(date: string): string | null {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  const offset = (parsed.getUTCDay() + 6) % 7;
  parsed.setUTCDate(parsed.getUTCDate() - offset);
  return parsed.toISOString().slice(0, 10);
}

function weekLabel(weekKey: string): string {
  const start = new Date(`${weekKey}T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  return `${weekKey.replaceAll("-", "/")}〜${String(end.getUTCMonth() + 1).padStart(2, "0")}/${String(end.getUTCDate()).padStart(2, "0")}`;
}

/** 未確定レースと払戻不明レースを混ぜずに、週単位の実績だけを可視化する。 */
export function buildWeeklyRaceHistoryReport(races: RaceHistoryRace[]): WeeklyRaceHistoryReport[] {
  const groups = new Map<string, RaceHistoryRace[]>();
  races.filter(race => race.resultStatus === "CONFIRMED" && Boolean(race.raceDate)).forEach(race => {
    const key = mondayFor(race.raceDate!);
    if (!key) return;
    groups.set(key, [...(groups.get(key) ?? []), race]);
  });
  return Array.from(groups.entries()).sort(([left], [right]) => left.localeCompare(right)).map(([weekKey, rows]) => {
    const comparedCount = rows.reduce((sum, race) => sum + (race.comparedCount ?? 0), 0);
    const exactMatches = rows.reduce((sum, race) => sum + (race.exactMatches ?? 0), 0);
    const errorRows = rows.filter(race => race.meanAbsoluteRankError !== null);
    const roiValues = rows.flatMap(race => [race.winReturnRate, race.placeReturnRate]).filter((value): value is number => typeof value === "number");
    return {
      weekKey,
      weekLabel: weekLabel(weekKey),
      confirmedRaces: rows.length,
      comparedCount,
      exactMatches,
      rankAccuracy: comparedCount ? (exactMatches / comparedCount) * 100 : null,
      meanAbsoluteRankError: errorRows.length ? errorRows.reduce((sum, race) => sum + (race.meanAbsoluteRankError ?? 0), 0) / errorRows.length : null,
      roiSampleCount: roiValues.length,
      averageRoi: roiValues.length ? roiValues.reduce((sum, value) => sum + value, 0) / roiValues.length : null,
    };
  });
}

export function findNewlyConfirmedRaces(races: RaceHistoryRace[], knownRaceKeys: Iterable<string>): RaceHistoryRace[] {
  const known = new Set(knownRaceKeys);
  return races.filter(race => race.resultStatus === "CONFIRMED" && Boolean(race.confirmedAt) && !known.has(race.raceKey));
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
    ["主催", filters.organization || "すべて"],
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
