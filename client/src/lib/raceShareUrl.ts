/**
 * Shareable race URL <-> race_key mapping. race_key from the single_pick_ai
 * API is a pipe-delimited string, e.g. "JRA|2026-08-23|札幌|12"
 * (scripts/keiba_lab_api.py). This module is the single source of truth for
 * converting between that contract and the /race/:org/:date/:venue/:no route,
 * so the URL always round-trips back to an identical race_key -- no
 * reformatting, padding, or slug guessing that could silently point at the
 * wrong race.
 */

export type RaceUrlParams = { org: string; date: string; venue: string; no: string };

/** race_key -> the path segment for the shareable route (params URL-encoded). */
export function raceKeyToPath(raceKey: string): string | null {
  const parts = raceKey.split("|");
  if (parts.length !== 4 || parts.some((part) => part.length === 0)) return null;
  const [org, date, venue, no] = parts;
  return `/race/${encodeURIComponent(org)}/${encodeURIComponent(date)}/${encodeURIComponent(venue)}/${encodeURIComponent(no)}`;
}

/** Route params (already decoded by wouter) -> the exact race_key to fetch. */
export function paramsToRaceKey(params: Partial<RaceUrlParams> | undefined): string | null {
  if (!params) return null;
  const { org, date, venue, no } = params;
  if (!org || !date || !venue || !no) return null;
  return `${org}|${date}|${venue}|${no}`;
}

/** Absolute, shareable URL for a race, honoring the app's configured base path
 * (GitHub Pages project sites serve under /<repo-name>/). */
export function absoluteRaceUrl(raceKey: string): string | null {
  const path = raceKeyToPath(raceKey);
  if (!path) return null;
  const base = import.meta.env.BASE_URL ?? "/";
  const normalizedBase = base.endsWith("/") ? base.slice(0, -1) : base;
  return `${window.location.origin}${normalizedBase}${path}`;
}
