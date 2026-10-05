/**
 * Internal diagnostics for the scenario simulation (not shown in the UI): crossing-order diversity,
 * per-variant determinism, rank distribution, and how the scenario order relates to the AI / marks
 * (diagnostic only -- nothing is tuned to it). Reads the public read-only API with GET.
 *
 *   pnpm exec tsx scripts/scenario_diagnostics.ts [race_key ...]
 */
import { resolveCourse } from "../client/src/lib/courseAtlas";
import { buildHorseProfiles } from "../client/src/lib/horseScenarioProfile";
import { buildSim } from "../client/src/lib/scenarioSim";
import { normalizeStyle, VARIANTS, type Pace, type ScenarioRunner, type ScenarioVariant } from "../client/src/lib/scenarioReplay";
import type { LabRace } from "../client/src/lib/singlePickAi";

const API = "https://api.keibalab.net/api/lab";
const DEFAULT_KEYS = ["JRA|2026-10-04|東京|05", "JRA|2026-10-04|京都|01", "JRA|2026-09-12|中山|08", "JRA|2026-08-30|新潟|09", "JRA|2026-10-04|京都|06"];
const RUNS = 100;

async function load(key: string): Promise<LabRace> {
  const response = await fetch(`${API}/race/${encodeURIComponent(key)}`, { headers: { "user-agent": "curl/8" } });
  if (!response.ok) throw new Error(`${key}: HTTP ${response.status}`);
  return response.json() as Promise<LabRace>;
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
const variance = (xs: number[]) => { const m = mean(xs); return mean(xs.map(x => (x - m) ** 2)); };

export type Report = Record<string, unknown>;

export function diagnose(race: LabRace, pace: Pace = "平均"): Report {
  const course = resolveCourse(race.race.venue ?? null, race.race.surface ?? null, race.race.distance ?? null);
  const horses = race.horses.filter(horse => typeof horse.no === "number" && !horse.withdrawn);
  const runners: ScenarioRunner[] = horses.map(horse => ({ no: horse.no as number, name: horse.name, style: normalizeStyle(horse.style) }));
  const profiles = buildHorseProfiles(race.horses, { distance: race.race.distance ?? null, going: race.race.going ?? null, course });
  const key = race.race.race_key;
  const nos = runners.map(r => r.no).sort((a, b) => a - b);
  const crossingFor = (variant: ScenarioVariant, salt: string) => buildSim({ raceKey: salt ? `${key}${salt}` : key, variant, runners, profiles, course, pace }).crossOrder;

  // Determinism: same race + variant is identical; another variant differs.
  const std = crossingFor("STANDARD", "");
  const deterministic = JSON.stringify(std) === JSON.stringify(crossingFor("STANDARD", ""));
  const variantOrders = Object.fromEntries(VARIANTS.map(v => [v, crossingFor(v, "").join(",")]));
  const distinctVariants = new Set(Object.values(variantOrders)).size;

  // 100 internal scenarios (distinct seeds via a salted key; the real UI exposes three variants).
  const ranks = new Map<number, number[]>(nos.map(no => [no, []]));
  const first = new Map<number, number>(nos.map(no => [no, 0]));
  const top3 = new Map<number, number>(nos.map(no => [no, 0]));
  const distinct = new Set<string>();
  for (let i = 0; i < RUNS; i++) {
    const order = crossingFor("STANDARD", `#${i}`);
    distinct.add(order.join(","));
    order.forEach((no, index) => { ranks.get(no)?.push(index + 1); if (index === 0) first.set(no, (first.get(no) ?? 0) + 1); if (index < 3) top3.set(no, (top3.get(no) ?? 0) + 1); });
  }
  const meanRank = new Map(nos.map(no => [no, mean(ranks.get(no) ?? [])]));
  const byNo = new Map(horses.map(h => [h.no as number, h]));
  const sortedRanks = (no: number) => [...(ranks.get(no) ?? [])].sort((a, b) => a - b);
  const median = (no: number) => { const s = sortedRanks(no); return s.length ? s[Math.floor(s.length / 2)] : 0; };
  const aiTopNo = race.ai_top && "horse_no" in race.ai_top ? (race.ai_top.horse_no as number | null) : null;
  const honmeiNo = race.honmei && "horse_no" in race.honmei ? (race.honmei.horse_no as number | null) : null;
  const others = nos.filter(no => no !== aiTopNo && no !== honmeiNo);
  const styleMean = Object.fromEntries(["逃げ", "先行", "差し", "追込", "不明"].map(style => {
    const group = runners.filter(r => r.style === style).map(r => meanRank.get(r.no) ?? 0);
    return [style, group.length ? { n: group.length, meanCrossingRank: Math.round(mean(group) * 100) / 100 } : null];
  }));
  const withProfile = [...profiles.values()].filter(p => p.surfaceCompatibility.confidence !== "UNKNOWN" || p.straightSustain.confidence !== "UNKNOWN").length;
  return {
    race: key, course: `${course.venue}-${course.surface}-${course.distance}`, field: nos.length, pace,
    deterministic_same_variant: deterministic, distinct_variant_orders: distinctVariants, variantOrders,
    distinct_crossing_orders_of_100: distinct.size,
    max_first_cross_frequency: Math.max(...first.values()) / RUNS,
    first_cross_frequency: Object.fromEntries([...first].filter(([, v]) => v > 0).map(([no, v]) => [no, v / RUNS])),
    top3_frequency_max: Math.max(...top3.values()) / RUNS,
    rank_variance_mean: Math.round(mean(nos.map(no => variance(ranks.get(no) ?? []))) * 100) / 100,
    mean_rank_by_horse: Object.fromEntries(nos.map(no => [no, { mean: Math.round((meanRank.get(no) ?? 0) * 100) / 100, median: median(no), style: byNo.get(no)?.style }])),
    mean_crossing_rank_by_style: styleMean,
    diagnostic_only_correlation: {
      ai_top_horse: aiTopNo, ai_top_mean_crossing_rank: aiTopNo !== null ? Math.round((meanRank.get(aiTopNo) ?? 0) * 100) / 100 : null,
      publication_honmei_horse: honmeiNo, honmei_mean_crossing_rank: honmeiNo !== null ? Math.round((meanRank.get(honmeiNo) ?? 0) * 100) / 100 : null,
      others_mean_crossing_rank: Math.round(mean(others.map(no => meanRank.get(no) ?? 0)) * 100) / 100,
    },
    horses_with_any_usable_profile: withProfile,
    profile_confidence_counts: ["HIGH", "MEDIUM", "LOW", "UNKNOWN"].map(level => [level, [...profiles.values()].filter(p => p.surfaceCompatibility.confidence === level).length]),
  };
}

/** Aggregate view over a whole day: how the scenario order relates to the AI TOP / ◎ (diagnostic only, never tuned). */
async function day(date: string) {
  const list = await (await fetch(`${API}/races?date=${date}&organization=JRA`, { headers: { "user-agent": "curl/8" } })).json() as { races: { race_key: string }[] };
  const rows: { ai?: number; honmei?: number; others: number; field: number }[] = [];
  for (const item of list.races) {
    const report = diagnose(await load(item.race_key));
    const c = report.diagnostic_only_correlation as { ai_top_mean_crossing_rank: number | null; honmei_mean_crossing_rank: number | null; others_mean_crossing_rank: number };
    rows.push({ ai: c.ai_top_mean_crossing_rank ?? undefined, honmei: c.honmei_mean_crossing_rank ?? undefined, others: c.others_mean_crossing_rank, field: report.field as number });
  }
  const norm = (rank: number | undefined, field: number) => (rank === undefined ? null : (rank - 1) / Math.max(1, field - 1));
  const avg = (xs: (number | null)[]) => { const v = xs.filter((x): x is number => x !== null); return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 1000) / 1000 : null; };
  console.log(JSON.stringify({ date, races: rows.length, races_with_ai_top: rows.filter(r => r.ai !== undefined).length, mean_normalized_crossing_rank: { ai_top: avg(rows.map(r => norm(r.ai, r.field))), publication_honmei: avg(rows.map(r => norm(r.honmei, r.field))), others: avg(rows.map(r => norm(r.others, r.field))) }, note: "0 = crossing first, 0.5 = middle; diagnostic only" }, null, 1));
}

async function main() {
  const dayArg = process.argv.find(arg => arg.startsWith("day:"));
  if (dayArg) return day(dayArg.slice(4));
  const keys = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_KEYS;
  const reports: Report[] = [];
  for (const key of keys) {
    const race = await load(key);
    for (const pace of ["平均"] as Pace[]) reports.push(diagnose(race, pace));
  }
  console.log(JSON.stringify(reports, null, 1));
}

if (process.argv[1] && /scenario_diagnostics/.test(process.argv[1])) main().catch(error => { console.error(error); process.exit(1); });
