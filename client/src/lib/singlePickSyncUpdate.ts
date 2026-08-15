import type { LabRace } from "./singlePickAi";

export function shouldApplySyncedRace(current: LabRace | null, latest: LabRace | null | undefined): boolean {
  if (!current || !latest || current.race.race_key !== latest.race.race_key) return false;
  return JSON.stringify(current.result ?? null) !== JSON.stringify(latest.result ?? null) || current.model.as_of !== latest.model.as_of;
}

export function syncedRaceNotice(latest: LabRace): string {
  return latest.result?.status === "CONFIRMED" ? "公式結果・払戻の同期を反映しました。" : "実レースの同期データを更新しました。";
}
