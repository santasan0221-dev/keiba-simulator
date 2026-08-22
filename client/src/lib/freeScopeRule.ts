import type { LabRace, LabRaceListItem } from "@/lib/singlePickAi";

export const FREE_RULE_ID = "free_prerace_v1" as const;
export const FREE_RULE_TIMEZONE = "Asia/Tokyo" as const;
export const FREE_RULE_LOCK_HOUR_JST = 18;
export const FREE_CANDIDATE_RACE_NUMBERS = [9, 10, 11, 12] as const;

export type FreeScopeStatus = "NOT_PUBLISHED" | "PUBLISHED";
export type FreeScopeEntry = {
  race_date: string;
  race_key: string;
  model_as_of: string;
  scheduled_start_at: string;
};
export type FreeScopeManifest = {
  schema_version: "free-scope-v1";
  rule_id: typeof FREE_RULE_ID;
  target_week: string | null;
  locked_at: string | null;
  input_snapshot_sha256: string | null;
  status: FreeScopeStatus;
  entries: FreeScopeEntry[];
};
export type FreeRuleCandidate = LabRaceListItem & {
  prediction_as_of: string | null;
  calibration_status: string | null;
  is_prerace: boolean;
};

export type FreeScopeState =
  | { kind: "NOT_PUBLISHED"; message: string }
  | { kind: "INVALID_MANIFEST"; message: string }
  | { kind: "NO_ELIGIBLE_RACE"; message: string }
  | { kind: "READY"; entry: FreeScopeEntry };

const isIsoString = (value: unknown): value is string => typeof value === "string" && !Number.isNaN(Date.parse(value));
const isDateString = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

export function parseFreeScopeManifest(value: unknown): FreeScopeManifest | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  if (source.schema_version !== "free-scope-v1" || source.rule_id !== FREE_RULE_ID) return null;
  if (source.status !== "NOT_PUBLISHED" && source.status !== "PUBLISHED") return null;
  if (!Array.isArray(source.entries)) return null;
  if (source.status === "NOT_PUBLISHED") {
    if (source.entries.length !== 0 || source.target_week !== null || source.locked_at !== null || source.input_snapshot_sha256 !== null) return null;
  }
  if (source.status === "PUBLISHED") {
    if (typeof source.target_week !== "string" || !isIsoString(source.locked_at) || typeof source.input_snapshot_sha256 !== "string" || !source.input_snapshot_sha256) return null;
  }
  const entries: FreeScopeEntry[] = [];
  for (const entry of source.entries) {
    if (!entry || typeof entry !== "object") return null;
    const item = entry as Record<string, unknown>;
    if (!isDateString(item.race_date) || typeof item.race_key !== "string" || !item.race_key || !isIsoString(item.model_as_of) || !isIsoString(item.scheduled_start_at)) return null;
    entries.push({ race_date: item.race_date, race_key: item.race_key, model_as_of: item.model_as_of, scheduled_start_at: item.scheduled_start_at });
  }
  if (entries.length > 2) return null;
  return {
    schema_version: "free-scope-v1",
    rule_id: FREE_RULE_ID,
    target_week: source.target_week as string | null,
    locked_at: source.locked_at as string | null,
    input_snapshot_sha256: source.input_snapshot_sha256 as string | null,
    status: source.status,
    entries,
  };
}

export function getFreeScopeState(manifest: FreeScopeManifest | null): FreeScopeState {
  if (!manifest) return { kind: "INVALID_MANIFEST", message: "FREE公開設定を検証できません。発走前予測は表示しません。" };
  if (manifest.status === "NOT_PUBLISHED") return { kind: "NOT_PUBLISHED", message: "今週のFREE発走前公開は準備中です。公開対象が固定されるまで予測は表示しません。" };
  if (!manifest.entries.length) return { kind: "NO_ELIGIBLE_RACE", message: "JRA土日9R〜12Rの固定候補に適格レースがありません。別レースへの置換は行いません。" };
  return { kind: "READY", entry: manifest.entries[0] };
}

export function isEligibleFreeCandidate(race: FreeRuleCandidate): boolean {
  if (race.organization !== "JRA") return false;
  if (!race.race_key || !race.scheduled_start_at || !isIsoString(race.prediction_as_of)) return false;
  if (race.calibration_status !== "READY" || !race.is_prerace) return false;
  if (typeof race.race_no !== "number" || !FREE_CANDIDATE_RACE_NUMBERS.includes(race.race_no as typeof FREE_CANDIDATE_RACE_NUMBERS[number])) return false;
  const day = new Date(`${race.scheduled_start_at}`).toLocaleDateString("en-US", { timeZone: FREE_RULE_TIMEZONE, weekday: "short" });
  return day === "Sat" || day === "Sun";
}

export function jstWeekendDay(isoDateTime: string): "SATURDAY" | "SUNDAY" | null {
  const day = new Date(isoDateTime).toLocaleDateString("en-US", { timeZone: FREE_RULE_TIMEZONE, weekday: "short" });
  return day === "Sat" ? "SATURDAY" : day === "Sun" ? "SUNDAY" : null;
}

export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function selectFreeCandidates(targetWeek: string, candidates: FreeRuleCandidate[]): Promise<FreeRuleCandidate[]> {
  const eligible = candidates.filter(isEligibleFreeCandidate);
  const ranked = await Promise.all(eligible.map(async (race) => ({ race, day: jstWeekendDay(race.scheduled_start_at as string), hash: await sha256Hex(`${FREE_RULE_ID}|${targetWeek}|${race.race_key}`) })));
  return (["SATURDAY", "SUNDAY"] as const).flatMap((day) => ranked.filter((item) => item.day === day).sort((left, right) => left.hash.localeCompare(right.hash) || left.race.race_key.localeCompare(right.race.race_key)).slice(0, 1).map((item) => item.race));
}

export function verifyFreeRace(entry: FreeScopeEntry, race: LabRace): { ok: true } | { ok: false; message: string } {
  if (race.race.race_key !== entry.race_key) return { ok: false, message: "正本race keyが固定公開設定と一致しません。予測は表示しません。" };
  if (race.race.scheduled_start_at !== entry.scheduled_start_at) return { ok: false, message: "正本の発走時刻が固定公開設定と一致しません。予測は表示しません。" };
  if (race.model.as_of !== entry.model_as_of) return { ok: false, message: "正本の予測時点を確認できません。予測は表示しません。" };
  if (race.model.calibration_status !== "READY") return { ok: false, message: "校正済み確率がREADYではありません。予測は表示しません。" };
  return { ok: true };
}
