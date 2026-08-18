import { and, asc, desc, eq, inArray, isNull, lt } from "drizzle-orm";
import type { LabHorse, LabRace, LabRaceResult } from "../client/src/lib/singlePickAi";
import { raceSyncRuns, raceSyncSnapshots, raceSyncSources, type RaceSyncSource } from "../drizzle/schema";
import { getDb } from "./db";

const SOURCE_KEY = "single_pick_ai_default";
const RETRY_CAP_MINUTES = 360;
const MAX_DETAIL_RACES_PER_SYNC = 18;
const ORGS = ["NAR", "JRA"] as const;

type RemoteRaceList = { races?: Array<{ race_key?: string }> };

export type SyncedRaceMetric = {
  raceKey: string;
  raceDate: string | null;
  organization: string | null;
  venue: string | null;
  raceNo: number | null;
  raceStatus: string;
  calibrationStatus: string;
  asOf: string | null;
  resultStatus: string | null;
  aiPickFinish: number | null;
  aiPickOutcome: string | null;
  comparedCount: number | null;
  exactMatches: number | null;
  meanAbsoluteRankError: number | null;
  winReturnRate: number | null;
  placeReturnRate: number | null;
  lastSyncedAt: string;
  confirmedAt: string | null;
  predictionId: string | null;
  predictedTop3: Array<{ rank: number; horseNo: number; horseName: string }>;
  officialTop3: Array<{ finish: number; horseNo: number; horseName: string }>;
  top3Coverage: number | null;
};

export type RaceSyncDashboard = {
  source: {
    enabled: boolean;
    refreshMinutes: number;
    syncStartedAt: string | null;
    lastAttemptAt: string | null;
    lastSuccessAt: string | null;
    nextRetryAt: string | null;
    consecutiveFailures: number;
    lastError: string | null;
  } | null;
  races: SyncedRaceMetric[];
  recentRuns: Array<{ id: number; outcome: string; message: string | null; racesChecked: number; racesUpdated: number; finishedAt: string }>;
};

type ComputedMetrics = Pick<SyncedRaceMetric, "resultStatus" | "aiPickFinish" | "aiPickOutcome" | "comparedCount" | "exactMatches" | "meanAbsoluteRankError" | "winReturnRate" | "placeReturnRate">;

const asIso = (value: Date | null | undefined) => (value ? value.toISOString() : null);

function jstDate(offsetDays = 0): string {
  const now = new Date(Date.now() + offsetDays * 86_400_000);
  const jst = new Date(now.getTime() + (now.getTimezoneOffset() + 540) * 60_000);
  return jst.toISOString().slice(0, 10);
}

function apiHeaders(baseUrl: string): HeadersInit | undefined {
  try {
    const hostname = new URL(baseUrl).hostname.toLowerCase();
    return hostname.endsWith(".ngrok-free.dev") || hostname.endsWith(".ngrok.io") ? { "ngrok-skip-browser-warning": "true" } : undefined;
  } catch {
    return undefined;
  }
}

async function fetchApi<T>(baseUrl: string, path: string): Promise<T> {
  const response = await fetch(`${baseUrl.replace(/\/+$/, "")}${path}`, { headers: apiHeaders(baseUrl), signal: AbortSignal.timeout(8_000) });
  if (!response.ok) throw new Error(`single_pick_ai HTTP ${response.status}`);
  const type = response.headers.get("content-type") ?? "";
  if (!type.includes("application/json")) throw new Error("single_pick_ai APIがJSONを返しません");
  return (await response.json()) as T;
}

function numberOf(value: unknown): number | null {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value.replace(/[￥¥,]/g, "")) : Number.NaN;
  return Number.isFinite(number) ? number : null;
}

function payoutForHorse(raw: unknown, horseNo: number): number | null {
  if (Array.isArray(raw)) {
    for (const row of raw) {
      if (Array.isArray(row) && numberOf(row[0]) === horseNo) {
        const payout = numberOf(row[1]);
        if (payout !== null) return payout;
      }
      if (row && typeof row === "object") {
        const item = row as Record<string, unknown>;
        if (numberOf(item.horse_no ?? item.horseNo ?? item.no ?? item.number) === horseNo) {
          const payout = numberOf(item.payout ?? item.amount ?? item.return ?? item.value ?? item.yen ?? item.pay);
          if (payout !== null) return payout;
        }
      }
    }
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const direct = numberOf(record[String(horseNo)]);
  if (direct !== null) return direct;
  if (numberOf(record.horse_no ?? record.horseNo ?? record.no ?? record.number) === horseNo) return numberOf(record.payout ?? record.amount ?? record.return ?? record.value ?? record.yen ?? record.pay);
  return payoutForHorse(record.rows ?? record.items ?? record.payouts ?? [], horseNo);
}

function outcomeLabel(result: LabRaceResult): string | null {
  const pick = result.ai_pick;
  if (!pick) return null;
  if (pick.won === true) return "的中";
  if (pick.placed === true) return "複勝圏内";
  if (pick.won === false && pick.placed === false) return "圏外";
  return "着順データなし";
}

function returnRate(result: LabRaceResult, kind: "win" | "place"): number | null {
  if (!result.ai_pick || result.status !== "CONFIRMED") return null;
  const qualified = kind === "win" ? result.ai_pick.won : result.ai_pick.placed;
  if (qualified !== true && qualified !== false) return null;
  if (!qualified) return 0;
  const payout = payoutForHorse(result.payouts?.[kind], result.ai_pick.horse_no);
  return payout === null ? null : payout;
}

function metricsFrom(race: LabRace): ComputedMetrics {
  const result = race.result;
  if (!result || result.status !== "CONFIRMED") return { resultStatus: result?.status ?? null, aiPickFinish: null, aiPickOutcome: null, comparedCount: null, exactMatches: null, meanAbsoluteRankError: null, winReturnRate: null, placeReturnRate: null };
  const official = new Map(result.official_order.map(entry => [entry.horse_no, entry.finish]));
  const compared = race.horses
    .filter((horse: LabHorse) => typeof horse.no === "number" && typeof horse.model.ai_rank === "number" && official.has(horse.no))
    .map((horse: LabHorse) => ({ aiRank: horse.model.ai_rank as number, finish: official.get(horse.no as number) as number }));
  const exactMatches = compared.filter(row => row.aiRank === row.finish).length;
  const meanAbsoluteRankError = compared.length ? compared.reduce((sum, row) => sum + Math.abs(row.finish - row.aiRank), 0) / compared.length : null;
  return {
    resultStatus: result.status,
    aiPickFinish: result.ai_pick?.finish ?? null,
    aiPickOutcome: outcomeLabel(result),
    comparedCount: compared.length,
    exactMatches,
    meanAbsoluteRankError,
    winReturnRate: returnRate(result, "win"),
    placeReturnRate: returnRate(result, "place"),
  };
}

function mapMetric(row: typeof raceSyncSnapshots.$inferSelect): SyncedRaceMetric {
  let predictionId: string | null = null;
  let predictedTop3: Array<{ rank: number; horseNo: number; horseName: string }> = [];
  let officialTop3: Array<{ finish: number; horseNo: number; horseName: string }> = [];
  let top3Coverage: number | null = null;
  try {
    const payload = JSON.parse(row.payloadJson) as LabRace;
    const provenance = payload.provenance && typeof payload.provenance === "object" ? payload.provenance as Record<string, unknown> : {};
    const candidatePredictionId = provenance.prediction_id ?? provenance.predictionId;
    predictionId = typeof candidatePredictionId === "string" ? candidatePredictionId : null;
    predictedTop3 = payload.horses
      .filter(horse => typeof horse.no === "number" && typeof horse.model.ai_rank === "number")
      .sort((left, right) => (left.model.ai_rank as number) - (right.model.ai_rank as number))
      .slice(0, 3)
      .map(horse => ({ rank: horse.model.ai_rank as number, horseNo: horse.no as number, horseName: horse.name ?? `#${horse.no}` }));
    officialTop3 = (payload.result?.official_order ?? [])
      .filter(entry => entry.finish >= 1 && entry.finish <= 3)
      .sort((left, right) => left.finish - right.finish)
      .map(entry => ({ finish: entry.finish, horseNo: entry.horse_no, horseName: entry.horse_name }));
    if (payload.result?.status === "CONFIRMED" && officialTop3.length) {
      const officialNos = new Set(officialTop3.map(entry => entry.horseNo));
      top3Coverage = predictedTop3.length ? predictedTop3.filter(entry => officialNos.has(entry.horseNo)).length / Math.min(3, officialTop3.length) : null;
    }
  } catch {
    // Corrupt or legacy payloads remain visible with explicit unavailable fields.
  }
  return {
    raceKey: row.raceKey,
    raceDate: row.raceDate ?? null,
    organization: row.organization ?? null,
    venue: row.venue ?? null,
    raceNo: row.raceNo ?? null,
    raceStatus: row.raceStatus,
    calibrationStatus: row.calibrationStatus,
    asOf: row.asOf ?? null,
    resultStatus: row.resultStatus ?? null,
    aiPickFinish: row.aiPickFinish ?? null,
    aiPickOutcome: row.aiPickOutcome ?? null,
    comparedCount: row.comparedCount ?? null,
    exactMatches: row.exactMatches ?? null,
    meanAbsoluteRankError: row.meanAbsoluteRankError ?? null,
    winReturnRate: row.winReturnRate ?? null,
    placeReturnRate: row.placeReturnRate ?? null,
    lastSyncedAt: row.lastSyncedAt.toISOString(),
    confirmedAt: asIso(row.confirmedAt),
    predictionId,
    predictedTop3,
    officialTop3,
    top3Coverage,
  };
}

async function ensureSource(taskUid?: string): Promise<RaceSyncSource> {
  const db = await getDb();
  if (!db) throw new Error("同期履歴データベースを利用できません");
  const baseUrl = process.env.SINGLE_PICK_AI_BASE_URL?.replace(/\/+$/, "");
  if (!baseUrl?.startsWith("https://")) throw new Error("SINGLE_PICK_AI_BASE_URLに有効なHTTPS接続先がありません");
  await db.insert(raceSyncSources).values({ sourceKey: SOURCE_KEY, baseUrl, scheduleCronTaskUid: taskUid ?? null }).onDuplicateKeyUpdate({ set: { baseUrl, ...(taskUid ? { scheduleCronTaskUid: taskUid } : {}) } });
  const source = (await db.select().from(raceSyncSources).where(eq(raceSyncSources.sourceKey, SOURCE_KEY)).limit(1))[0];
  if (!source) throw new Error("同期元を初期化できませんでした");
  return source;
}

async function persistRace(sourceId: number, race: LabRace): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("同期履歴データベースを利用できません");
  const now = new Date();
  const metrics = metricsFrom(race);
  const resultIsConfirmed = metrics.resultStatus === "CONFIRMED";
  const values = {
    sourceId,
    raceKey: race.race.race_key ?? "",
    raceDate: race.race.date,
    organization: race.race.organization,
    venue: race.race.venue,
    raceNo: race.race.race_no,
    raceStatus: race.race.status,
    calibrationStatus: race.model.calibration_status,
    asOf: race.model.as_of,
    ...metrics,
    payloadJson: JSON.stringify(race),
    lastSyncedAt: now,
    confirmedAt: resultIsConfirmed ? now : null,
  };
  if (!values.raceKey) return;
  await db.insert(raceSyncSnapshots).values(values).onDuplicateKeyUpdate({ set: { ...values, confirmedAt: resultIsConfirmed ? now : undefined } });
}

async function recordRun(sourceId: number, outcome: string, message: string | null, racesChecked: number, racesUpdated: number, startedAt: Date): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(raceSyncRuns).values({ sourceId, outcome, message, racesChecked, racesUpdated, startedAt, finishedAt: new Date() });
  const oldRuns = await db.select({ id: raceSyncRuns.id }).from(raceSyncRuns).where(eq(raceSyncRuns.sourceId, sourceId)).orderBy(desc(raceSyncRuns.finishedAt)).limit(10_000).offset(80);
  if (oldRuns.length) await db.delete(raceSyncRuns).where(inArray(raceSyncRuns.id, oldRuns.map(run => run.id)));
}

async function fetchRaceKeys(source: RaceSyncSource): Promise<string[]> {
  const db = await getDb();
  if (!db) throw new Error("同期履歴データベースを利用できません");
  const pending = await db.select({ raceKey: raceSyncSnapshots.raceKey }).from(raceSyncSnapshots).where(and(eq(raceSyncSnapshots.sourceId, source.id), eq(raceSyncSnapshots.resultStatus, "PREDICTED")));
  const unsettled = await db.select({ raceKey: raceSyncSnapshots.raceKey }).from(raceSyncSnapshots).where(and(eq(raceSyncSnapshots.sourceId, source.id), isNull(raceSyncSnapshots.resultStatus)));
  const discovered: string[] = [];
  const listRequests = [jstDate(), jstDate(-1)].flatMap(date => ORGS.map(organization => `/api/lab/races?date=${date}&organization=${organization}`));
  const lists = await Promise.all(listRequests.map(async path => {
    try {
      return await fetchApi<RemoteRaceList>(source.baseUrl, path);
    } catch {
      return { races: [] } satisfies RemoteRaceList;
    }
  }));
  lists.forEach(list => discovered.push(...(list.races ?? []).map(race => race.race_key).filter((key): key is string => Boolean(key))));
  return Array.from(new Set([...pending, ...unsettled].map(row => row.raceKey).concat(discovered))).slice(0, MAX_DETAIL_RACES_PER_SYNC);
}

async function inBatches<T>(items: T[], size: number, action: (item: T) => Promise<void>): Promise<void> {
  for (let index = 0; index < items.length; index += size) await Promise.all(items.slice(index, index + size).map(action));
}

export async function runSinglePickSync(options: { taskUid?: string; bypassBackoff?: boolean } = {}): Promise<{ outcome: "success" | "partial" | "backoff" | "failure"; message: string; racesChecked: number; racesUpdated: number }> {
  const startedAt = new Date();
  const source = await ensureSource(options.taskUid);
  const db = await getDb();
  if (!db) throw new Error("同期履歴データベースを利用できません");
  if (!source.enabled) return { outcome: "backoff", message: "同期は停止されています", racesChecked: 0, racesUpdated: 0 };
  if (!options.bypassBackoff && source.nextRetryAt && source.nextRetryAt > startedAt) return { outcome: "backoff", message: "指数バックオフの待機中です", racesChecked: 0, racesUpdated: 0 };
  if (source.syncStartedAt && startedAt.getTime() - source.syncStartedAt.getTime() < 20 * 60_000) return { outcome: "backoff", message: "別の同期処理が実行中です", racesChecked: 0, racesUpdated: 0 };
  await db.update(raceSyncSources).set({ syncStartedAt: startedAt, lastAttemptAt: startedAt, lastError: null }).where(eq(raceSyncSources.id, source.id));
  try {
    const keys = await fetchRaceKeys(source);
    let updated = 0;
    const failed: string[] = [];
    await inBatches(keys, 6, async raceKey => {
      try {
        const race = await fetchApi<LabRace>(source.baseUrl, `/api/lab/race/${encodeURIComponent(raceKey)}`);
        await persistRace(source.id, race);
        updated += 1;
      } catch (reason) {
        failed.push(`${raceKey}: ${reason instanceof Error ? reason.message : String(reason)}`);
      }
    });
    const completedAt = new Date();
    await db.update(raceSyncSources).set({ syncStartedAt: null, lastSuccessAt: completedAt, nextRetryAt: null, consecutiveFailures: 0, lastError: null }).where(eq(raceSyncSources.id, source.id));
    const message = failed.length ? `${updated}件を同期、${failed.length}件は次回再試行します` : `${updated}件を同期しました`;
    await recordRun(source.id, failed.length ? "partial" : "success", failed.length ? `${message} / ${failed.slice(0, 3).join(" | ")}` : message, keys.length, updated, startedAt);
    return { outcome: failed.length ? "partial" : "success", message, racesChecked: keys.length, racesUpdated: updated };
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : String(reason);
    const failures = source.consecutiveFailures + 1;
    const delayMinutes = Math.min(RETRY_CAP_MINUTES, source.refreshMinutes * 2 ** Math.max(0, failures - 1));
    const retryAt = new Date(Date.now() + delayMinutes * 60_000);
    await db.update(raceSyncSources).set({ syncStartedAt: null, consecutiveFailures: failures, lastError: message.slice(0, 1_000), nextRetryAt: retryAt }).where(eq(raceSyncSources.id, source.id));
    await recordRun(source.id, "failure", `${message} / 次回再試行: ${retryAt.toISOString()}`, 0, 0, startedAt);
    return { outcome: "failure", message, racesChecked: 0, racesUpdated: 0 };
  }
}

export async function getRaceSyncDashboard(): Promise<RaceSyncDashboard> {
  const db = await getDb();
  if (!db) return { source: null, races: [], recentRuns: [] };
  const source = (await db.select().from(raceSyncSources).where(eq(raceSyncSources.sourceKey, SOURCE_KEY)).limit(1))[0];
  if (!source) return { source: null, races: [], recentRuns: [] };
  const [snapshots, runs] = await Promise.all([
    db.select().from(raceSyncSnapshots).where(eq(raceSyncSnapshots.sourceId, source.id)).orderBy(asc(raceSyncSnapshots.raceDate), asc(raceSyncSnapshots.raceNo)).limit(160),
    db.select().from(raceSyncRuns).where(eq(raceSyncRuns.sourceId, source.id)).orderBy(desc(raceSyncRuns.finishedAt)).limit(8),
  ]);
  return {
    source: { enabled: Boolean(source.enabled), refreshMinutes: source.refreshMinutes, syncStartedAt: asIso(source.syncStartedAt), lastAttemptAt: asIso(source.lastAttemptAt), lastSuccessAt: asIso(source.lastSuccessAt), nextRetryAt: asIso(source.nextRetryAt), consecutiveFailures: source.consecutiveFailures, lastError: source.lastError ?? null },
    races: snapshots.map(mapMetric),
    recentRuns: runs.map(run => ({ id: run.id, outcome: run.outcome, message: run.message ?? null, racesChecked: run.racesChecked, racesUpdated: run.racesUpdated, finishedAt: run.finishedAt.toISOString() })),
  };
}

export async function getSyncedRace(raceKey: string): Promise<LabRace | null> {
  const db = await getDb();
  if (!db) return null;
  const row = (await db.select({ payloadJson: raceSyncSnapshots.payloadJson }).from(raceSyncSnapshots).where(eq(raceSyncSnapshots.raceKey, raceKey)).limit(1))[0];
  if (!row) return null;
  try {
    return JSON.parse(row.payloadJson) as LabRace;
  } catch {
    return null;
  }
}

export async function attachRaceSyncTask(taskUid: string): Promise<void> {
  const source = await ensureSource(taskUid);
  const db = await getDb();
  if (!db) return;
  await db.update(raceSyncSources).set({ scheduleCronTaskUid: taskUid }).where(eq(raceSyncSources.id, source.id));
}

export async function isRegisteredRaceSyncTask(taskUid: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const source = (await db.select({ id: raceSyncSources.id }).from(raceSyncSources).where(eq(raceSyncSources.scheduleCronTaskUid, taskUid)).limit(1))[0];
  return Boolean(source);
}
