/**
 * Scenario calibration audit (diagnostic only), adapted from the V3.1 audit (3640075) to the engine built on
 * the Full Finish / Terrain Tempo line (17aa6a9). Same sample, conditions, metrics and pre-registered rules, so the
 * two reports compare field by field. Reads the public read-only API with GET (or the shared race cache), builds
 * the scenario field many times per race and reports concentration / diversity / strength numbers. It changes no
 * runtime module: "noise off" is the field's own `noise: false` option, "terrain off" is a neutral (unknown)
 * course, "compat off" passes no profiles. Nothing here is fed back into the simulation.
 *
 *   pnpm exec tsx scripts/scenario_calibration_audit.ts --out=<json path> [--races=100] [--seeds=200]
 *
 * PRE-REGISTERED CLASSIFICATION RULES (written before any result was seen; not to be edited after):
 *   concentration flags (per race, max first-cross rate): VERY_HIGH >60%, HIGH >45%, MODERATE 30-45%, DIVERSE <30%
 *   COMPATIBILITY_TOO_STRONG : >=20% of audited races are HIGH or VERY_HIGH in the full condition (D)
 *   NOISE_TOO_WEAK           : mean exact-order match between variants of one race > 5% (races with >=8 runners)
 *                              or mean Spearman between those variants > 0.85
 *   NOISE_TOO_STRONG         : mean Spearman between per-horse mean rank without noise (C) and with noise (D) < 0.40
 *   STYLE_BIAS               : at the average pace any run-style group's mean normalized crossing rank is outside 0.40-0.60
 *                              (groups with >= 200 runner-samples)
 *   COURSE_BIAS              : a course-type bucket (>= 5 races) with >= 30% HIGH or VERY_HIGH races
 *   DATA_LIMITED             : fewer than 50 races, or more than 50% of races have no usable horse profile
 *   BALANCED                 : none of the above
 */
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { performance } from "node:perf_hooks";
import { resolveCourse, type CourseLayout } from "../client/src/lib/courseAtlas";
import { buildHorseProfiles, compatMultiplier, horseHistoryOf, NEUTRAL_PROFILE, type HorseHistory, type HorseProfile } from "../client/src/lib/horseScenarioProfile";
import { noiseAt, noiseKnots } from "../client/src/lib/scenarioNoise";
import { crossingSequence } from "../client/src/lib/scenarioOrder";
import { buildScenarioField, offsetTables, RUNNER_MAX, RUNNER_MIN, runnerFactor } from "../client/src/lib/scenarioRunnerField";
import { frontAt, normalizeStyle, OFFSET_MAX, scenarioSeed, scenarioSeedFor, VARIANTS, type Pace, type ScenarioRunner, type ScenarioStyle } from "../client/src/lib/scenarioReplay";
import { buildTerrainProfile, tempoSummary, type TerrainProfile } from "../client/src/lib/terrainTempo";
import type { LabRace } from "../client/src/lib/singlePickAi";

const API = "https://api.keibalab.net/api/lab";
const arg = (name: string, fallback: string) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const OUT = arg("out", "scenario_calibration_audit.json");
const TARGET_RACES = Number(arg("races", "100"));
const SEEDS_D = Number(arg("seeds", "200"));
const SEEDS_MID = 100;
const SEEDS_PACE = 40;
const CACHE = arg("cache", OUT.replace(/\.json$/, "") + ".races-cache.json");

// ------------------------------------------------------------------ small helpers
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const variance = (xs: number[]) => { const m = mean(xs); return mean(xs.map(x => (x - m) ** 2)); };
const sd = (xs: number[]) => Math.sqrt(variance(xs));
const pct = (xs: number[], q: number) => { if (!xs.length) return NaN; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
const r4 = (x: number) => (Number.isFinite(x) ? Math.round(x * 10000) / 10000 : null);
const entropy = (counts: number[]) => { const t = counts.reduce((a, b) => a + b, 0); return t ? -counts.filter(c => c > 0).reduce((a, c) => a + (c / t) * Math.log2(c / t), 0) : 0; };
function spearman(a: number[], b: number[]): number {
  const rank = (xs: number[]) => { const idx = xs.map((v, i) => [v, i] as const).sort((p, q) => p[0] - q[0]); const r = new Array<number>(xs.length); idx.forEach(([, i], k) => { r[i] = k + 1; }); return r; };
  const ra = rank(a), rb = rank(b), ma = mean(ra), mb = mean(rb);
  const num = ra.reduce((s, v, i) => s + (v - ma) * (rb[i] - mb), 0);
  const den = Math.sqrt(ra.reduce((s, v) => s + (v - ma) ** 2, 0) * rb.reduce((s, v) => s + (v - mb) ** 2, 0));
  return den ? num / den : NaN;
}
const flagOf = (maxFirst: number) => (maxFirst > 0.6 ? "VERY_HIGH_CONCENTRATION" : maxFirst > 0.45 ? "HIGH_CONCENTRATION" : maxFirst >= 0.3 ? "MODERATE" : "DIVERSE");
const STYLE_GROUP: Record<ScenarioStyle, string> = { 逃げ: "FRONT", 先行: "PACE", 差し: "MID", 追込: "CLOSER", 不明: "UNKNOWN" };

// ------------------------------------------------------------------ data
async function get(path: string): Promise<any> {
  const response = await fetch(`${API}${path}`, { headers: { "user-agent": "curl/8" } });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json();
}

async function loadRaces(): Promise<LabRace[]> {
  if (existsSync(CACHE)) return JSON.parse(readFileSync(CACHE, "utf8")) as LabRace[];
  const dates: string[] = (await get("/available-dates")).available_dates.slice(0, 70);
  const candidates: { key: string; bucket: string }[] = [];
  for (const date of dates) {
    const list = (await get(`/races?date=${date}&organization=JRA`)).races as { race_key: string; venue: string; surface: string; distance: number }[];
    for (const r of list) candidates.push({ key: r.race_key, bucket: `${r.venue}|${r.surface}|${Math.round((r.distance ?? 0) / 400)}` });
  }
  // Stratified: round-robin over venue x surface x distance-band buckets.
  const buckets = new Map<string, string[]>();
  for (const c of candidates) { const list = buckets.get(c.bucket) ?? []; list.push(c.key); buckets.set(c.bucket, list); }
  const order = [...buckets.values()];
  const picked: string[] = [];
  for (let round = 0; picked.length < TARGET_RACES * 1.3 && order.some(list => list.length > round); round++) {
    for (const list of order) if (list[round] && picked.length < TARGET_RACES * 1.3) picked.push(list[round]);
  }
  const races: LabRace[] = [];
  for (const key of picked) {
    if (races.length >= TARGET_RACES) break;
    try {
      const race = (await get(`/race/${encodeURIComponent(key)}`)) as LabRace;
      if (race.horses.filter(h => typeof h.no === "number" && !h.withdrawn).length >= 5) races.push(race);
    } catch { /* skip unreachable race */ }
  }
  mkdirSync(dirname(CACHE), { recursive: true });
  writeFileSync(CACHE, JSON.stringify(races));
  return races;
}

type Ctx = { key: string; race: LabRace; course: CourseLayout; terrain: TerrainProfile; runners: ScenarioRunner[]; nos: number[]; profiles: Map<number, HorseProfile>; usable: boolean };
function context(race: LabRace): Ctx {
  const course = resolveCourse(race.race.venue ?? null, race.race.surface ?? null, race.race.distance ?? null);
  const horses = race.horses.filter(h => typeof h.no === "number" && !h.withdrawn);
  const runners: ScenarioRunner[] = horses.map(h => ({ no: h.no as number, name: h.name, style: normalizeStyle(h.style) }));
  // Jump races have no course model: their profiles stay neutral (as in the shipped shell).
  const histories = race.horses.map(horseHistoryOf).filter((h): h is HorseHistory => h !== null);
  const profiles = course.surface === "JUMP" ? new Map<number, HorseProfile>() : buildHorseProfiles(histories, { organization: race.race.organization, going: race.race.going });
  const usable = [...profiles.values()].some(p => p.surfaceCompatibility.confidence !== "UNKNOWN" || p.distanceCompatibility.confidence !== "UNKNOWN" || p.earlyPositionStrength !== 0);
  return { key: race.race.race_key as string, race, course, terrain: buildTerrainProfile(course), runners, nos: runners.map(r => r.no).sort((a, b) => a - b), profiles, usable };
}

// ------------------------------------------------------------------ conditions and Monte Carlo
type Cond = { terrain: boolean; compat: boolean; noise: boolean };
const NEUTRAL_TERRAIN = buildTerrainProfile(resolveCourse(null, null, null));
let simCount = 0;
function crossing(ctx: Ctx, cond: Cond, seedKey: string, variant: (typeof VARIANTS)[number] = "STANDARD", pace: Pace = "平均"): number[] {
  simCount += 1;
  const runners = ctx.runners.slice(); // a fresh array per scenario so the per-field caches can be collected
  const seed = scenarioSeedFor(seedKey, variant);
  const field = buildScenarioField({ terrain: cond.terrain ? ctx.terrain : NEUTRAL_TERRAIN, runners, profiles: cond.compat ? ctx.profiles : undefined, seed, noise: cond.noise });
  return crossingSequence(runners, pace, seed, field).map(entry => entry.no);
}

type Dist = { first: Map<number, number>; top3: Map<number, number>; ranks: Map<number, number[]>; n: number; orders: Set<string> };
function monteCarlo(ctx: Ctx, cond: Cond, seeds: number, pace: Pace = "平均"): Dist {
  const d: Dist = { first: new Map(), top3: new Map(), ranks: new Map(ctx.nos.map(no => [no, [] as number[]])), n: seeds, orders: new Set() };
  for (let i = 0; i < seeds; i++) {
    const order = crossing(ctx, cond, `${ctx.key}#${i}`, "STANDARD", pace);
    d.orders.add(order.join(","));
    order.forEach((no, index) => {
      d.ranks.get(no)!.push(index + 1);
      if (index === 0) d.first.set(no, (d.first.get(no) ?? 0) + 1);
      if (index < 3) d.top3.set(no, (d.top3.get(no) ?? 0) + 1);
    });
  }
  return d;
}

function raceMetrics(ctx: Ctx, d: Dist) {
  const firsts = ctx.nos.map(no => (d.first.get(no) ?? 0) / d.n).sort((a, b) => b - a);
  const top3s = ctx.nos.map(no => (d.top3.get(no) ?? 0) / d.n);
  const counts = ctx.nos.map(no => d.first.get(no) ?? 0);
  const horses = ctx.nos.map(no => {
    const r = d.ranks.get(no)!;
    return { no, first: r4((d.first.get(no) ?? 0) / d.n), top3: r4((d.top3.get(no) ?? 0) / d.n), mean: r4(mean(r)), median: pct(r, 0.5), variance: r4(variance(r)), best: Math.min(...r), worst: Math.max(...r) };
  });
  return {
    field: ctx.nos.length, maxFirst: r4(firsts[0]), secondFirst: r4(firsts[1] ?? 0), distinctFirst: counts.filter(c => c > 0).length,
    entropyBits: r4(entropy(counts)), entropyNorm: r4(entropy(counts) / Math.log2(ctx.nos.length)), top3Concentration: r4(Math.max(...top3s)),
    meanRankVariance: r4(mean(horses.map(h => h.variance as number))), distinctOrders: d.orders.size, flag: flagOf(firsts[0]), horses,
  };
}

// ------------------------------------------------------------------ race tagging
function courseTags(course: CourseLayout): string[] {
  const tags: string[] = [];
  if (course.venue === "UNKNOWN") return ["unknown_course"];
  if (!course.pathClosed) { tags.push("straight_course"); }
  else {
    const straight = typeof course.homeStraightMeters === "number" ? course.homeStraightMeters : null;
    if (straight !== null) tags.push(straight >= 400 ? "long_straight" : straight < 300 ? "short_straight" : "mid_straight");
    const lap = typeof course.lapMeters === "number" ? course.lapMeters : null;
    if (lap !== null) { if (lap < 1750) tags.push("tight_turns"); if (lap >= 2000) tags.push("large_loop"); }
  }
  const gain = typeof course.elevationGainMeters === "number" ? course.elevationGainMeters : null;
  if (gain !== null) tags.push(gain >= 3 ? "strong_elevation" : gain < 1.5 ? "flat" : "mild_elevation");
  return tags;
}
const fieldBucket = (n: number) => (n <= 8 ? "<=8" : n <= 12 ? "9-12" : n <= 16 ? "13-16" : ">=17");

// ------------------------------------------------------------------ main
async function main() {
  const wall = performance.now();
  let peakRss = 0;
  const sample = () => { peakRss = Math.max(peakRss, process.memoryUsage().rss); };
  const races = (await loadRaces()).map(context);
  console.error(`races loaded: ${races.length}`);

  const perRace: any[] = [];
  const styleAgg: Record<Pace, Record<string, { n: number; rankSum: number; firstSum: number }>> = { スロー: {}, 平均: {}, ハイ: {} };
  const styleByTag: Record<string, Record<string, { n: number; rankSum: number }>> = {};
  const corr = { ai: [] as any[], honmei: [] as any[], market: [] as any[], others: [] as any[] };
  const variantDiv: any[] = [];
  const decompSpearman: any[] = [];
  const mcD = new Map<string, Dist>();

  for (const ctx of races) {
    const norm = (rank: number) => (rank - 1) / Math.max(1, ctx.nos.length - 1);
    // A-C are deterministic (no noise): one outcome each. E,F,D carry noise.
    const A = crossing(ctx, { terrain: false, compat: false, noise: false }, ctx.key);
    const B = crossing(ctx, { terrain: true, compat: false, noise: false }, ctx.key);
    const C = crossing(ctx, { terrain: true, compat: true, noise: false }, ctx.key);
    const E = monteCarlo(ctx, { terrain: false, compat: false, noise: true }, SEEDS_MID);
    const F = monteCarlo(ctx, { terrain: true, compat: false, noise: true }, SEEDS_MID);
    const D = monteCarlo(ctx, { terrain: true, compat: true, noise: true }, SEEDS_D);
    mcD.set(ctx.key, D);
    const metricsD = raceMetrics(ctx, D);
    const rankVec = (order: number[]) => ctx.nos.map(no => order.indexOf(no) + 1);
    const meanVec = (d: Dist) => ctx.nos.map(no => mean(d.ranks.get(no)!));
    decompSpearman.push({ key: ctx.key, field: ctx.nos.length, usable: ctx.usable, A_vs_B: r4(spearman(rankVec(A), rankVec(B))), B_vs_C: r4(spearman(rankVec(B), rankVec(C))), C_vs_Dmean: r4(spearman(rankVec(C), meanVec(D))), E_vs_Dmean: r4(spearman(meanVec(E), meanVec(D))), F_vs_Dmean: r4(spearman(meanVec(F), meanVec(D))) });

    // style aggregates by pace (D, fewer seeds for the non-standard paces)
    for (const pace of ["スロー", "平均", "ハイ"] as Pace[]) {
      const d = pace === "平均" ? D : monteCarlo(ctx, { terrain: true, compat: true, noise: true }, SEEDS_PACE, pace);
      for (const r of ctx.runners) {
        const g = STYLE_GROUP[r.style];
        const slot = (styleAgg[pace][g] ??= { n: 0, rankSum: 0, firstSum: 0 });
        d.ranks.get(r.no)!.forEach(rank => { slot.n += 1; slot.rankSum += norm(rank); });
        slot.firstSum += d.first.get(r.no) ?? 0;
        if (pace === "平均") for (const tag of courseTags(ctx.course)) { const t = ((styleByTag[tag] ??= {})[g] ??= { n: 0, rankSum: 0 }); d.ranks.get(r.no)!.forEach(rank => { t.n += 1; t.rankSum += norm(rank); }); }
      }
    }

    // AI / mark / market correlation (diagnostic only; these fields never reach the simulation)
    const aiNo = (ctx.race.ai_top as any)?.horse_no ?? null, honNo = (ctx.race.honmei as any)?.horse_no ?? null;
    const mkNo = (ctx.race as any).honmei_view?.sources?.market?.horse_no ?? null;
    const rate = (no: number | null) => (no === null || !D.ranks.has(no) ? null : { first: (D.first.get(no) ?? 0) / D.n, top3: (D.top3.get(no) ?? 0) / D.n, meanNorm: mean(D.ranks.get(no)!.map(norm)) });
    const special = new Set([aiNo, honNo, mkNo].filter((x): x is number => x !== null));
    const others = ctx.nos.filter(no => !special.has(no));
    if (rate(aiNo)) corr.ai.push({ key: ctx.key, field: ctx.nos.length, ...rate(aiNo)! });
    if (rate(honNo)) corr.honmei.push({ key: ctx.key, field: ctx.nos.length, ...rate(honNo)! });
    if (rate(mkNo)) corr.market.push({ key: ctx.key, field: ctx.nos.length, ...rate(mkNo)! });
    if (others.length) corr.others.push({ key: ctx.key, field: ctx.nos.length, first: mean(others.map(no => (D.first.get(no) ?? 0) / D.n)), top3: mean(others.map(no => (D.top3.get(no) ?? 0) / D.n)), meanNorm: mean(others.flatMap(no => D.ranks.get(no)!.map(norm))) });

    // variant diversity (the real UI variants plus diagnostic seed pairs)
    const vo = VARIANTS.map(v => crossing(ctx, { terrain: true, compat: true, noise: true }, ctx.key, v));
    const pairs: [number[], number[]][] = [[vo[0], vo[1]], [vo[0], vo[2]], [vo[1], vo[2]]];
    for (let i = 0; i < 20; i++) pairs.push([crossing(ctx, { terrain: true, compat: true, noise: true }, `${ctx.key}#pa${i}`), crossing(ctx, { terrain: true, compat: true, noise: true }, `${ctx.key}#pb${i}`)]);
    variantDiv.push({ key: ctx.key, field: ctx.nos.length, usable: ctx.usable,
      realVariantsExact: r4(pairs.slice(0, 3).filter(([a, b]) => a.join() === b.join()).length / 3),
      exact: r4(pairs.filter(([a, b]) => a.join() === b.join()).length / pairs.length),
      top3Set: r4(pairs.filter(([a, b]) => [...a.slice(0, 3)].sort().join() === [...b.slice(0, 3)].sort().join()).length / pairs.length),
      firstSame: r4(pairs.filter(([a, b]) => a[0] === b[0]).length / pairs.length),
      spearman: r4(mean(pairs.map(([a, b]) => spearman(ctx.nos.map(no => a.indexOf(no)), ctx.nos.map(no => b.indexOf(no)))))) });

    perRace.push({ key: ctx.key, venue: ctx.race.race.venue, surface: ctx.race.race.surface, distance: ctx.race.race.distance, going: ctx.race.race.going, field: ctx.nos.length, fieldBucket: fieldBucket(ctx.nos.length),
      tags: courseTags(ctx.course), usableProfile: ctx.usable, styles: Object.fromEntries(Object.entries(ctx.runners.reduce<Record<string, number>>((acc, r) => { acc[STYLE_GROUP[r.style]] = (acc[STYLE_GROUP[r.style]] ?? 0) + 1; return acc; }, {}))),
      D: metricsD, E: { maxFirst: raceMetrics(ctx, E).maxFirst, meanRankVariance: raceMetrics(ctx, E).meanRankVariance, distinctOrders: E.orders.size }, F: { maxFirst: raceMetrics(ctx, F).maxFirst, meanRankVariance: raceMetrics(ctx, F).meanRankVariance, distinctOrders: F.orders.size },
      deterministicAC: { A, B, C } });
    sample();
    if (perRace.length % 10 === 0) console.error(`  ${perRace.length}/${races.length} races, ${simCount} sims, ${Math.round((performance.now() - wall) / 1000)}s`);
  }

  // ---- compatibility factor strength (the multiplier the engine applies: start x early + distance x late + going)
  const compatSamples: { v: number; conf: string; key: string; no: number }[] = [];
  const offsetMax: number[] = [];
  for (const ctx of races) {
    for (const [no, p] of ctx.profiles) {
      const confs = [p.distanceCompatibility.confidence, p.surfaceCompatibility.confidence];
      const best = (["HIGH", "MEDIUM", "LOW"] as const).find(c => confs.includes(c)) ?? (p.earlyPositionStrength !== 0 ? p.confidence : "UNKNOWN");
      for (let lap = 0; lap <= 1.0001; lap += 0.02) {
        const early = 1 - Math.min(1, Math.max(0, lap / 0.15)) ** 2 * (3 - 2 * Math.min(1, Math.max(0, lap / 0.15)));
        const lateRaw = Math.min(1, Math.max(0, (lap - 0.4) / 0.4));
        compatSamples.push({ v: compatMultiplier(p, { early, late: lateRaw * lateRaw * (3 - 2 * lateRaw) }), conf: best, key: ctx.key, no });
      }
    }
    const tables = offsetTables({ runners: ctx.runners, profiles: ctx.profiles, seed: scenarioSeedFor(ctx.key) });
    for (const table of tables.values()) offsetMax.push(Math.max(...Array.from(table).map(Math.abs)));
  }
  const stat = (xs: number[]) => ({ n: xs.length, min: r4(Math.min(...xs)), max: r4(Math.max(...xs)), mean: r4(mean(xs)), p50: r4(pct(xs, 0.5)), p90: r4(pct(xs, 0.9)), p95: r4(pct(xs, 0.95)), p99: r4(pct(xs, 0.99)) });
  const byConf = Object.fromEntries(["HIGH", "MEDIUM", "LOW", "UNKNOWN"].map(c => [c, compatSamples.filter(s => s.conf === c).length ? stat(compatSamples.filter(s => s.conf === c).map(s => s.v)) : null]));
  const maxCompat = compatSamples.reduce((a, b) => (b.v > a.v ? b : a));
  const minCompat = compatSamples.reduce((a, b) => (b.v < a.v ? b : a));
  const compatStrength = { all: stat(compatSamples.map(s => s.v)), byConfidence: byConf, maxExample: maxCompat, minExample: minCompat, withinBand: compatSamples.every(s => s.v >= 0.985 - 1e-9 && s.v <= 1.015 + 1e-9), nonNeutralShare: r4(compatSamples.filter(s => s.v !== 1).length / compatSamples.length), runnerFactorBand: [RUNNER_MIN, RUNNER_MAX], offsetCap: OFFSET_MAX, offsetMaxAbs: stat(offsetMax) };

  // ---- noise strength
  const sectionLaps = { START: 0.02, EARLY: 0.15, BACKSTRETCH: 0.4, TURN: 0.65, HOME_STRAIGHT: 0.88 };
  const noiseVals: Record<string, number[]> = Object.fromEntries(Object.keys(sectionLaps).map(k => [k, []]));
  const noiseAll: number[] = [];
  const biasByNo = new Map<number, number[]>();
  for (let s = 0; s < 400; s++) {
    const seed = scenarioSeed(`noise-audit#${s}`);
    for (let no = 1; no <= 18; no++) {
      const knots = noiseKnots(seed, no);
      let acc = 0;
      for (let lap = 0; lap <= 1.0001; lap += 0.02) acc += noiseAt(knots, lap);
      (biasByNo.get(no) ?? biasByNo.set(no, []).get(no)!).push(acc / 51);
      for (const [name, lap] of Object.entries(sectionLaps)) { const f = 1 + noiseAt(knots, lap); noiseVals[name].push(f); noiseAll.push(f); }
    }
  }
  const nstat = (xs: number[]) => ({ n: xs.length, min: r4(Math.min(...xs)), max: r4(Math.max(...xs)), mean: r4(mean(xs)), sd: r4(sd(xs)), p95AbsDev: r4(pct(xs.map(x => Math.abs(x - 1)), 0.95)) });
  const noiseStrength = { all: nstat(noiseAll), bySection: Object.fromEntries(Object.entries(noiseVals).map(([k, v]) => [k, nstat(v)])), perRunnerNumberMeanBias: Object.fromEntries([...biasByNo].map(([no, v]) => [no, r4(mean(v))])), maxAbsRunnerBias: r4(Math.max(...[...biasByNo.values()].map(v => Math.abs(mean(v))))) };

  // ---- terrain strength (pace multiplier of the course tempo; a course with nothing in the Atlas is neutral)
  const byVenue: Record<string, { min: number; max: number; means: number[]; courses: number }> = {};
  const seenCourse = new Set<string>();
  for (const ctx of races) {
    const id = `${ctx.course.venue}|${ctx.course.surface}|${ctx.course.distance}`;
    if (seenCourse.has(id)) continue; seenCourse.add(id);
    const t = tempoSummary(ctx.terrain);
    const slot = (byVenue[ctx.course.venue] ??= { min: 9, max: 0, means: [], courses: 0 });
    slot.min = Math.min(slot.min, t.pace.min); slot.max = Math.max(slot.max, t.pace.max); slot.means.push(t.pace.mean); slot.courses += 1;
  }
  const terrainStrength = Object.fromEntries(Object.entries(byVenue).map(([v, s]) => [v, { courses: s.courses, min: r4(s.min), max: r4(s.max), mean: r4(mean(s.means)) }]));

  // ---- determinism: 100 rebuilds of 10 races with the real variants
  const detRaces = races.slice(0, 10);
  let detDiff = 0;
  for (const ctx of detRaces) for (const v of VARIANTS) {
    const base = crossing(ctx, { terrain: true, compat: true, noise: true }, ctx.key, v).join();
    for (let i = 0; i < 100; i++) if (crossing(ctx, { terrain: true, compat: true, noise: true }, ctx.key, v).join() !== base) detDiff += 1;
  }
  const determinism = { races: detRaces.length, variants: 3, reruns: 100, differences: detDiff };

  // ---- leakage sensitivity: change every field the simulation must not read; results must be identical
  let leakDiff = 0;
  for (const ctx of races.slice(0, 10)) {
    const mutated = structuredClone(ctx.race) as LabRace;
    mutated.horses.forEach((h, i) => {
      h.abilities.speed = 100 - i; h.abilities.form = i * 3; h.model.v23k_score = 1 + i; h.model.ai_rank = 99 - i; (h.model as any).win_probability = (i + 1) / 100;
      h.market.popularity = 18 - i; h.market.win_odds = 1 + i * 5; if (h.display) { h.display.final_mark = i % 2 ? "◎" : "×"; h.display.base_mark = "○"; }
    });
    (mutated as any).result = { status: "CONFIRMED", official_order: mutated.horses.map((h, i) => ({ finish: i + 1, horse_no: h.no, horse_name: h.name, popularity: 1 })), ai_pick: null, payouts: null };
    (mutated as any).ai_top = { status: "AVAILABLE", horse_no: mutated.horses[0].no }; (mutated as any).honmei = { status: "AVAILABLE", horse_no: mutated.horses[1].no };
    const other = context(mutated);
    for (let i = 0; i < 30; i++) if (crossing(ctx, { terrain: true, compat: true, noise: true }, `${ctx.key}#leak${i}`).join() !== crossing(other, { terrain: true, compat: true, noise: true }, `${ctx.key}#leak${i}`).join()) leakDiff += 1;
  }

  // ---- neutral benchmark (synthetic): same style, neutral profiles, only the seed varies
  const neutral: any[] = [];
  for (const [venue, surface, distance] of [["東京", "芝", 2000], ["中山", "芝", 2500], ["新潟", "芝", 1000]] as const) {
    for (const n of [8, 12, 16]) {
      const course = resolveCourse(venue, surface, distance);
      const runners: ScenarioRunner[] = Array.from({ length: n }, (_, i) => ({ no: i + 1, name: null, style: "先行" }));
      const ctx: Ctx = { key: `neutral|${venue}|${n}`, race: {} as LabRace, course, terrain: buildTerrainProfile(course), runners, nos: runners.map(r => r.no), profiles: new Map(), usable: false };
      const d = monteCarlo(ctx, { terrain: true, compat: true, noise: true }, 300);
      const m = raceMetrics(ctx, d);
      neutral.push({ venue, field: n, maxFirst: m.maxFirst, entropyNorm: m.entropyNorm, distinctFirst: m.distinctFirst, rankVar: m.meanRankVariance, spearmanMeanRankVsHorseNo: r4(spearman(ctx.nos, ctx.nos.map(no => mean(d.ranks.get(no)!)))), expectedMaxFirstIfUniform: r4(1 / n) });
    }
  }

  // ---- strongest-data horse (the V3.1 77% case), 12 same-style neutral rivals, Tokyo turf 2000, 200 seeds
  const strongProfile = (edge: number, conf: "HIGH" | "MEDIUM", start: number): HorseProfile => ({ ...NEUTRAL_PROFILE(1), earlyPositionStrength: start, confidence: conf, distanceCompatibility: { edge, confidence: conf, n: 10 }, surfaceCompatibility: { edge, confidence: conf, n: 10 } });
  const extreme = strongProfile(1, "HIGH", 1), moderate = strongProfile(0.5, "MEDIUM", 0.5);
  const strongestCase: any[] = [];
  const tokyo = resolveCourse("東京", "芝", 2000);
  const tokyoTerrain = buildTerrainProfile(tokyo);
  const synthRunners: ScenarioRunner[] = Array.from({ length: 12 }, (_, i) => ({ no: i + 1, name: null, style: "先行" }));
  const synthOrder = (key: string, profiles: Map<number, HorseProfile> | undefined, noise: boolean) => {
    simCount += 1;
    const runners = synthRunners.slice();
    const seed = scenarioSeedFor(key);
    return crossingSequence(runners, "平均", seed, buildScenarioField({ terrain: tokyoTerrain, runners, profiles, seed, noise })).map(e => e.no);
  };
  for (const [label, prof] of [["all_HIGH_edge1", extreme], ["moderate", moderate]] as const) {
    for (const noise of [true, false]) for (const useCompat of [true, false]) {
      let wins = 0, top3 = 0, sum = 0; const N = 200;
      for (let i = 0; i < N; i++) {
        const order = synthOrder(`strong-${i}`, useCompat ? new Map([[1, prof]]) : undefined, noise);
        const rank = order.indexOf(1) + 1; sum += rank; if (rank === 1) wins += 1; if (rank <= 3) top3 += 1;
      }
      strongestCase.push({ profile: label, noise, compat: useCompat, firstRate: wins / N, top3Rate: top3 / N, meanRank: sum / N, note: !noise && !useCompat ? "no compat, no noise: runners differ only by the seeded in-style order" : undefined });
    }
  }

  // ---- strongest horse DERIVED from record data (goes through horseHistoryOf + buildHorseProfiles)
  const derivedHorse = (no: number, strong: boolean): any => ({
    no, name: `H${no}`, style: "先行", withdrawn: false,
    abilities: { speed: 50, stamina: 50, start: 50, form: 50, going_rates: {}, mapping_status: "P2_V23K_PLUS_AS_OF_HISTORY" },
    model: { v23k_score: 50, ai_rank: 5, win_prob_calibrated: null, top3_prob: null, prob_status: "X" }, market: { popularity: 5, win_odds: 10, slot: null, captured_at: null },
    record: { starts: 10, wins: 1, seconds: 1, thirds: 1, stamina_distance_band_top3: strong ? 100 : 30, start_front_run_share: no === 1 ? 64 : 10 + (no % 4) * 5, going_top3_rates: strong ? { 良: 100, 稍重: 20, 重: 20, 不良: 20 } : { 良: 40, 稍重: 40, 重: 40, 不良: 40 } },
  });
  const derivedHorses = Array.from({ length: 12 }, (_, i) => derivedHorse(i + 1, i === 0));
  const derivedProfiles = buildHorseProfiles(derivedHorses.map(horseHistoryOf).filter((h): h is HorseHistory => h !== null), { organization: "JRA", going: "良" });
  const derivedStrongest = (() => {
    let wins = 0, top3 = 0, sum = 0; const N = 200;
    for (let i = 0; i < N; i++) {
      const order = synthOrder(`derived-${i}`, derivedProfiles, true);
      const rank = order.indexOf(1) + 1; sum += rank; if (rank === 1) wins += 1; if (rank <= 3) top3 += 1;
    }
    const p1 = derivedProfiles.get(1)!;
    return { firstRate: wins / N, top3Rate: top3 / N, meanRank: sum / N, profile: { surface: `${p1.surfaceCompatibility.confidence}:${r4(p1.surfaceCompatibility.edge)}`, distance: `${p1.distanceCompatibility.confidence}:${r4(p1.distanceCompatibility.edge)}`, early: r4(p1.earlyPositionStrength) } };
  })();
  const styleDeterministic = Object.fromEntries(["A", "B", "C"].map(c => {
    const acc: Record<string, number[]> = {};
    for (const r of perRace) { const ctx = races.find(x => x.key === r.key)!; const order = r.deterministicAC[c] as number[]; order.forEach((no, i) => (acc[STYLE_GROUP[ctx.runners.find(q => q.no === no)!.style]] ??= []).push(i / Math.max(1, order.length - 1))); }
    return [c, Object.fromEntries(Object.entries(acc).map(([g, v]) => [g, r4(mean(v))]))];
  }));

  // ---- aggregate / classification inputs
  const D = perRace.map(r => r.D);
  const flags = D.reduce<Record<string, number>>((a, m) => { a[m.flag] = (a[m.flag] ?? 0) + 1; return a; }, {});
  const highPlus = (flags.VERY_HIGH_CONCENTRATION ?? 0) + (flags.HIGH_CONCENTRATION ?? 0);
  const bucketStats = (key: (r: any) => string[]) => {
    const groups: Record<string, any[]> = {};
    for (const r of perRace) for (const k of key(r)) (groups[k] ??= []).push(r);
    return Object.fromEntries(Object.entries(groups).map(([k, rs]) => [k, { races: rs.length, maxFirstMean: r4(mean(rs.map(r => r.D.maxFirst))), maxFirstP90: r4(pct(rs.map(r => r.D.maxFirst), 0.9)), entropyNormMean: r4(mean(rs.map(r => r.D.entropyNorm))), rankVarMean: r4(mean(rs.map(r => r.D.meanRankVariance))), highPlusShare: r4(rs.filter(r => r.D.maxFirst > 0.45).length / rs.length) }]));
  };
  const usableRaces = perRace.filter(r => r.usableProfile);
  const styleOut = Object.fromEntries((["スロー", "平均", "ハイ"] as Pace[]).map(p => [p, Object.fromEntries(Object.entries(styleAgg[p]).map(([g, s]) => [g, { runnerSamples: s.n, meanNormRank: r4(s.rankSum / s.n), firstCrossShare: r4(s.firstSum / Math.max(1, Object.values(styleAgg[p]).reduce((a, b) => a + b.firstSum, 0))) }]))]));
  const styleTag = Object.fromEntries(Object.entries(styleByTag).map(([tag, groups]) => [tag, Object.fromEntries(Object.entries(groups).map(([g, s]) => [g, { runnerSamples: s.n, meanNormRank: r4(s.rankSum / s.n) }]))]));
  const aggCorr = (rows: any[]) => ({ races: rows.length, firstRateMean: r4(mean(rows.map(r => r.first))), top3RateMean: r4(mean(rows.map(r => r.top3))), meanNormRank: r4(mean(rows.map(r => r.meanNorm))), expectedFirstRateIfUniform: r4(mean(rows.map(r => 1 / r.field))) });
  const concentration = { flags, highPlusShare: r4(highPlus / perRace.length), maxFirst: stat(D.map(m => m.maxFirst)), secondFirst: stat(D.map(m => m.secondFirst)), entropyNorm: stat(D.map(m => m.entropyNorm)), rankVariance: stat(D.map(m => m.meanRankVariance)), distinctFirst: stat(D.map(m => m.distinctFirst)), top3Concentration: stat(D.map(m => m.top3Concentration)) };
  const concentrationByCondition = { E_baseNoise: stat(perRace.map(r => r.E.maxFirst)), F_baseTerrainNoise: stat(perRace.map(r => r.F.maxFirst)), D_full: stat(D.map(m => m.maxFirst)),
    E_rankVar: r4(mean(perRace.map(r => r.E.meanRankVariance))), F_rankVar: r4(mean(perRace.map(r => r.F.meanRankVariance))), D_rankVar: r4(mean(D.map(m => m.meanRankVariance))),
    E_distinctOrders: r4(mean(perRace.map(r => r.E.distinctOrders))), F_distinctOrders: r4(mean(perRace.map(r => r.F.distinctOrders))), D_distinctOrders: r4(mean(D.map(m => m.distinctOrders))) };
  const decompAgg = { A_vs_B: r4(mean(decompSpearman.map(d => d.A_vs_B))), B_vs_C: r4(mean(decompSpearman.map(d => d.B_vs_C))), C_vs_Dmean: r4(mean(decompSpearman.map(d => d.C_vs_Dmean))), C_vs_Dmean_usableOnly: r4(mean(decompSpearman.filter(d => d.usable).map(d => d.C_vs_Dmean))), E_vs_Dmean: r4(mean(decompSpearman.map(d => d.E_vs_Dmean))), F_vs_Dmean: r4(mean(decompSpearman.map(d => d.F_vs_Dmean))) };
  const variantAgg = (rows: any[]) => ({ races: rows.length, exactMean: r4(mean(rows.map(r => r.exact))), realVariantsExactMean: r4(mean(rows.map(r => r.realVariantsExact))), top3SetMean: r4(mean(rows.map(r => r.top3Set))), firstSameMean: r4(mean(rows.map(r => r.firstSame))), spearmanMean: r4(mean(rows.map(r => r.spearman))) });

  // ---- extreme cases (>= 10) with component breakdown
  const horseRows = perRace.flatMap(r => r.D.horses.map((h: any) => ({ ...h, key: r.key, field: r.field })));
  const withProfile = (key: string, no: number) => { const ctx = races.find(c => c.key === key)!; const p = ctx.profiles.get(no) ?? NEUTRAL_PROFILE(no); const st = ctx.runners.find(r => r.no === no)!.style; return { style: st, earlyPositionStrength: r4(p.earlyPositionStrength), startConfidence: p.confidence, compat: { distance: `${p.distanceCompatibility.confidence}:${r4(p.distanceCompatibility.edge)}`, going: `${p.surfaceCompatibility.confidence}:${r4(p.surfaceCompatibility.edge)}` } }; };
  const top = (rows: any[], f: (h: any) => number, k = 3, desc = true) => [...rows].sort((a, b) => (desc ? f(b) - f(a) : f(a) - f(b))).slice(0, k).map(h => ({ key: h.key, no: h.no, field: h.field, first: h.first, top3: h.top3, mean: h.mean, variance: h.variance, ...withProfile(h.key, h.no) }));
  const extremeCases = {
    maxFirstCross: top(horseRows, h => h.first), maxTop3: top(horseRows, h => h.top3), minRankVariance: top(horseRows, h => h.variance, 3, false), maxRankVariance: top(horseRows, h => h.variance),
    bestMeanRank: top(horseRows, h => h.mean, 3, false), worstMeanRank: top(horseRows, h => h.mean),
    maxCompatibilityFactor: { key: maxCompat.key, no: maxCompat.no, value: r4(maxCompat.v), profile: withProfile(maxCompat.key, maxCompat.no) },
    minCompatibilityFactor: { key: minCompat.key, no: minCompat.no, value: r4(minCompat.v), profile: withProfile(minCompat.key, minCompat.no) },
    maxNoiseInfluence: { maxAbsFactorDeviation: r4(Math.max(...noiseAll.map(x => Math.abs(x - 1)))), note: "ceiling is the section amplitude (<= 0.03)" },
  };

  const elapsed = (performance.now() - wall) / 1000;
  const report = {
    derivedStrongest, styleDeterministic,
    meta: { generatedAt: new Date().toISOString(), races: perRace.length, seedsFull: SEEDS_D, seedsMid: SEEDS_MID, seedsPace: SEEDS_PACE, scenarioRunsTotal: simCount, usableProfileRaces: usableRaces.length, sampleLimited: perRace.length < 100 },
    performance: { totalRuns: simCount, elapsedSeconds: r4(elapsed), scenariosPerSecond: r4(simCount / elapsed), peakRssMB: Math.round(peakRss / 1048576) },
    sample: { byVenue: bucketStats(r => [r.venue]), byFieldBucket: bucketStats(r => [r.fieldBucket]), byCourseTag: bucketStats(r => r.tags), byUsable: bucketStats(r => [r.usableProfile ? "profile_usable" : "profile_unknown"]), bySurface: bucketStats(r => [r.surface]) },
    concentration, concentrationByCondition, decomposition: { deterministicAndMeanRankSpearman: decompAgg, perRace: decompSpearman },
    compatibilityStrength: compatStrength, noiseStrength, terrainStrength,
    correlation: { aiTop: aggCorr(corr.ai), publicationHonmei: aggCorr(corr.honmei), marketTop: aggCorr(corr.market), others: aggCorr(corr.others) },
    style: { byPace: styleOut, byCourseTagAveragePace: styleTag },
    variantDiversity: { all: variantAgg(variantDiv), usableProfileOnly: variantAgg(variantDiv.filter(v => v.usable)), field8plus: variantAgg(variantDiv.filter(v => v.field >= 8)), perRace: variantDiv },
    determinism, leakageSensitivity: { races: 10, seedsEach: 30, differencesWhenForbiddenFieldsChanged: leakDiff },
    neutralBenchmark: neutral, strongestDataHorse: strongestCase, extremeCases, perRace,
  };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(report, null, 1));
  const { perRace: _p, ...summary } = report as any;
  summary.variantDiversity = { ...summary.variantDiversity, perRace: undefined };
  summary.decomposition = { ...summary.decomposition, perRace: undefined };
  console.log(JSON.stringify(summary, null, 1));
}

main().catch(error => { console.error(error); process.exit(1); });
