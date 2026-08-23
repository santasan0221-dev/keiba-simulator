// Integration with single_pick_ai's read-only KEIBA LAB API (/api/lab/*).
//
// single_pick_ai is the prediction brain: it exposes real per-race model output
// (v23k score, calibrated probabilities when READY, as-of history going rates,
// market odds). This module fetches that and maps it into the simulator's own
// `Horse` model so the client-side what-if simulation runs on real seed data.
//
// Honesty: calibrated probabilities are only present when the backend reports
// calibration_status === "READY"; otherwise they are null. This module never
// fabricates them — it surfaces what the backend provides. The simulation that
// consumes these horses is a what-if sandbox, not the validated prediction.
import type { Going, Horse, InputSource, Style } from "@/pages/Home";

// Prediction API base, resolved at RUNTIME (not build time).
// Default is empty = same origin, so serving the app from single_pick_ai at
// /sim just works (fetches /api/lab on the same host). For the standalone
// deployed site, the viewer can paste an HTTPS single_pick_ai URL (e.g. a
// cloudflared tunnel) in the loader; a plain http://localhost URL cannot be
// used from an https page (browser mixed-content blocking).
const DEFAULT_BASE = (import.meta.env.VITE_SINGLE_PICK_AI_BASE as string | undefined) || "";
const BASE_STORAGE_KEY = "single_pick_ai_base";
export const NGROK_SKIP_BROWSER_WARNING_HEADER = "ngrok-skip-browser-warning";

// Hostnames retired now that the fixed Cloudflare Tunnel domain is production.
// A value stored here from before that migration must never silently keep
// overriding the new default, on any viewer's browser, forever.
const KNOWN_DEPRECATED_BASE_HOST_SUFFIXES = [".ngrok-free.dev", ".ngrok.io"];

function isLoopbackHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname === "::1";
}

/** Export for tests: what a fresh browser with no saved override resolves to. */
export function getDefaultApiBase(): string {
  return DEFAULT_BASE;
}

/**
 * A stored endpoint is valid only if it's a well-formed http(s) URL, isn't a
 * plain-HTTP URL pointed at a non-loopback host (mixed-content on the HTTPS
 * public site, and never actually reachable from it), and isn't a known
 * deprecated host (e.g. an old ngrok tunnel) now that the tunnel domain is
 * the fixed production endpoint.
 */
export function isValidApiBase(value: string): boolean {
  if (!value) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  const hostname = url.hostname.toLowerCase();
  if (url.protocol === "http:" && !isLoopbackHostname(hostname)) return false;
  if (KNOWN_DEPRECATED_BASE_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) return false;
  return true;
}

export function getApiBase(): string {
  try {
    const stored = localStorage.getItem(BASE_STORAGE_KEY);
    if (!stored) return DEFAULT_BASE;
    if (isValidApiBase(stored)) return stored;
    // Stale endpoint (old ngrok URL, deprecated host, malformed, or a
    // non-loopback http URL): fall back to production and migrate storage so
    // this browser doesn't keep re-triggering the fallback on every read.
    try { localStorage.setItem(BASE_STORAGE_KEY, DEFAULT_BASE); } catch { /* ignore storage failures */ }
    return DEFAULT_BASE;
  } catch {
    return DEFAULT_BASE;
  }
}

export function setApiBase(url: string): void {
  try {
    localStorage.setItem(BASE_STORAGE_KEY, url.replace(/\/+$/, ""));
  } catch {
    /* ignore storage failures */
  }
}

export function getApiRequestHeaders(base = getApiBase()): HeadersInit | undefined {
  try {
    const hostname = new URL(base).hostname.toLowerCase();
    if (hostname.endsWith(".ngrok-free.dev") || hostname.endsWith(".ngrok.io")) {
      return { [NGROK_SKIP_BROWSER_WARNING_HEADER]: "true" };
    }
  } catch {
    // Same-origin and malformed values are handled by the eventual request.
  }
  return undefined;
}

export class LabApiError extends Error {
  readonly status: number;
  readonly detail: string | null;

  constructor(status: number, message: string, detail: string | null = null) {
    super(message);
    this.name = "LabApiError";
    this.status = status;
    this.detail = detail;
  }
}

export type LabRaceListItem = {
  race_key: string;
  organization: string;
  venue: string | null;
  race_no: number | null;
  scheduled_start_at: string | null;
  status: string;
  distance: number | null;
  surface: string | null;
  top_pick: { no: number | null; name: string | null } | null;
};

export type LabHorse = {
  no: number | null;
  name: string | null;
  style: string | null;
  withdrawn: boolean;
  abilities: {
    speed: number | null;
    stamina: number | null;
    start: number | null;
    form: number | null;
    going_rates: Record<string, number | null>;
    mapping_status: string;
  };
  model: {
    v23k_score: number | null;
    ai_rank: number | null;
    win_prob_calibrated: number | null;
    top3_prob: number | null;
    prob_status: string;
  };
  market: { popularity: number | null; win_odds: number | null; slot: string | null; captured_at: string | null };
  record: Record<string, unknown>;
};

export type LabOfficialOrder = { finish: number; horse_no: number; horse_name: string; popularity: number | null };
export type LabAiPickResult = { horse_no: number; horse_name: string; ai_rank: number; finish: number | null; won: boolean | null; placed: boolean | null };
export type LabRaceResult = { status: string; official_order: LabOfficialOrder[]; ai_pick: LabAiPickResult | null; payouts: Record<string, unknown> | null };

export type LabRace = {
  race: {
    race_key: string | null;
    date: string | null;
    organization: string | null;
    venue: string | null;
    race_no: number | null;
    distance: number | null;
    surface: string | null;
    going: string | null;
    scheduled_start_at: string | null;
    status: string;
  };
  model: { champion_id: string | null; calibration_status: string; disclaimer: string; as_of: string | null };
  horses: LabHorse[];
  branches: Array<{ key: string; label: string; probability: number }>;
  market_ev: { note: string; status: string; rows: Array<Record<string, unknown>> };
  provenance: Record<string, unknown>;
  result?: LabRaceResult | null;
};

const PALETTE = ["#b9c3d4", "#e7b66a", "#db7e70", "#95c6b0", "#aa9ad6", "#d7a5ca", "#8ebc83", "#9bbbd2"];
const GOING_BANDS: Going[] = ["良", "稍重", "重", "不良"];
const GOING_FALLBACK: Record<Going, number> = { 良: 62, 稍重: 58, 重: 52, 不良: 44 };

const clamp = (n: number, min = 0, max = 100) => Math.max(min, Math.min(max, n));
const num = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

function toAppStyle(style: string | null): Style {
  if (style === "追い込み" || style === "追込") return "追込";
  if (style === "逃げ" || style === "先行" || style === "差し") return style;
  return "差し";
}

export async function getJson<T>(path: string): Promise<T> {
  const base = getApiBase();
  const response = await fetch(`${base}${path}`, { headers: getApiRequestHeaders(base) });
  const contentType = response.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");
  const body: unknown = isJson ? await response.json().catch(() => null) : null;

  if (!response.ok) {
    const errorBody = body && typeof body === "object" ? body as { error?: unknown; detail?: unknown } : null;
    const message = typeof errorBody?.error === "string" ? errorBody.error : `single_pick_ai HTTP ${response.status}`;
    const detail = typeof errorBody?.detail === "string" ? errorBody.detail : null;
    throw new LabApiError(response.status, message, detail);
  }
  if (!isJson || body === null) {
    throw new LabApiError(0, "single_pick_ai APIがJSONを返しません。接続先URLまたはサーバーの公開状態を確認してください。");
  }
  return body as T;
}

export function fetchRaces(date: string, organization?: string): Promise<{ date: string; races: LabRaceListItem[] }> {
  const org = organization ? `&organization=${organization}` : "";
  return getJson(`/api/lab/races?date=${date}${org}`);
}

export function fetchRace(raceKey: string): Promise<LabRace> {
  return getJson(`/api/lab/race/${encodeURIComponent(raceKey)}`);
}

/** Map a real single_pick_ai race into the simulator's Horse[] seed. */
export function toHorses(race: LabRace): Horse[] {
  return race.horses.map((horse, index) => {
    const speed = clamp(num(horse.abilities.speed, 60));
    const rate = (band: Going): number => {
      const value = horse.abilities.going_rates?.[band];
      return typeof value === "number" && Number.isFinite(value) ? clamp(value) : GOING_FALLBACK[band];
    };
    const goingRates = Object.fromEntries(GOING_BANDS.map((band) => [band, rate(band)])) as Record<Going, number>;
    const goingRateSources = Object.fromEntries(GOING_BANDS.map((band) => [band, typeof horse.abilities.going_rates?.[band] === "number" ? "as-of履歴実値" : "暫定値"])) as Record<Going, InputSource>;
    const record = horse.record ?? {};
    return {
      no: num(horse.no, index + 1),
      name: horse.name ?? `${horse.no ?? index + 1}番`,
      color: PALETTE[index % PALETTE.length],
      style: toAppStyle(horse.style),
      // Only `speed` (v23k) is a real value; sub-abilities are neutral seeds
      // (single_pick_ai P2 will supply real stamina/start/form). Editable in UI.
      speed,
      stamina: clamp(num(horse.abilities.stamina, 62)),
      start: clamp(num(horse.abilities.start, 60)),
      form: clamp(num(horse.abilities.form, 62)),
      popularity: num(horse.market.popularity, 0),
      starts: num(record["starts"], 0),
      winsPast: num(record["wins"], 0),
      secondsPast: num(record["seconds"], 0),
      thirdsPast: num(record["thirds"], 0),
      avgFinish: clamp(num(record["avg_finish"], 6), 1, 18),
      goingRates,
      dataSources: {
        speed: typeof horse.abilities.speed === "number" ? "v23k実値" : "暫定値",
        stamina: "暫定値",
        start: "暫定値",
        form: "暫定値",
        goingRates: goingRateSources,
        record: Object.keys(record).length ? "as-of履歴実値" : "未取得",
        mappingStatus: horse.abilities.mapping_status,
      },
      withdrawn: horse.withdrawn || undefined,
      latestOdds:
        typeof horse.market.win_odds === "number" && horse.market.win_odds > 0
          ? horse.market.win_odds
          : undefined,
    };
  });
}


export type LabDailyOperations = {
  race_date: string;
  prediction_counts: { JRA: number | null; NAR: number | null } | null;
  official_result_count: number | null;
  pending_count: number | null;
  review_required_count: number | null;
  last_prediction_at: string | null;
  last_result_at: string | null;
  last_pdca_at: string | null;
  automation_status: "NORMAL" | "WAITING" | "REVIEW_REQUIRED" | string | null;
  next_scheduled_at: string | null;
};

export type LabAvailableDates = {
  latest_prediction_date: string | null;
  available_dates: string[] | null;
};

export type LabHealth = {
  origin: string | null;
  reachable: boolean | null;
  schema_version: string | null;
  auth_state: string | null;
  last_updated_at: string | null;
  features: string[] | null;
};

export type LabResultStatus = "CONFIRMED" | "DEAD_HEAT" | "PENDING" | "REVIEW_REQUIRED" | "FAILED" | "RACE_STOPPED" | string;
export type LabResultHorse = number | { finish: number | null; horse_no: number | null; horse_name: string | null };
export type LabResultPredictionHorse = number | { rank: number | null; horse_no: number | null; horse_name: string | null };
export type LabResultListItem = {
  race_key: string;
  race_date: string | null;
  organization: string | null;
  venue: string | null;
  race_no: number | null;
  scheduled_start_at: string | null;
  prediction_id: string | null;
  prediction_created_at: string | null;
  predicted_top3: LabResultPredictionHorse[] | null;
  official_top3: LabResultHorse[] | null;
  ai_pick_finish: number | null;
  top3_coverage: number | null;
  result_status: LabResultStatus | null;
  special_statuses: string[] | null;
  result_fetched_at: string | null;
};

export async function fetchDailyOperations(date: string): Promise<LabDailyOperations> {
  return getJson(`/api/lab/operations/daily?date=${encodeURIComponent(date)}`);
}

export async function fetchAvailablePredictionDates(): Promise<LabAvailableDates> {
  return getJson(`/api/lab/available-dates?kind=prediction`);
}

export async function fetchLabHealth(): Promise<LabHealth> {
  return getJson(`/api/lab/health`);
}

export async function fetchLabResults(params: { date: string; organization?: "JRA" | "NAR"; venue?: string }): Promise<{ date?: string; race_date?: string; results: LabResultListItem[] }> {
  const search = new URLSearchParams({ date: params.date });
  if (params.organization) search.set("organization", params.organization);
  if (params.venue) search.set("venue", params.venue);
  return getJson(`/api/lab/results?${search.toString()}`);
}
