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
import type { Going, Horse, Style } from "@/pages/Home";

// Prediction API base, resolved at RUNTIME (not build time) so the deployed
// site can point at whichever single_pick_ai the viewer is running — including
// http://localhost:8000 on their own machine (browsers allow https pages to
// call http://localhost). Overridable in the UI and remembered in localStorage.
const DEFAULT_BASE =
  (import.meta.env.VITE_SINGLE_PICK_AI_BASE as string | undefined) || "http://localhost:8000";
const BASE_STORAGE_KEY = "single_pick_ai_base";

export function getApiBase(): string {
  try {
    return localStorage.getItem(BASE_STORAGE_KEY) || DEFAULT_BASE;
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

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${getApiBase()}${path}`);
  if (!response.ok) throw new Error(`single_pick_ai HTTP ${response.status}`);
  return (await response.json()) as T;
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
      withdrawn: horse.withdrawn || undefined,
      latestOdds:
        typeof horse.market.win_odds === "number" && horse.market.win_odds > 0
          ? horse.market.win_odds
          : undefined,
    };
  });
}
