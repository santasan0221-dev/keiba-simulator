import type { LabRace } from "@/lib/singlePickAi";
import { aiPickFinishLabel, aiPickOutcomeLabel, payoutLines } from "@/lib/officialRaceResult";

export type ScenarioProvenance =
  | { kind: "single_pick_ai"; source: "single_pick_ai"; raceKey: string | null; venue: string | null; calibrationStatus: string | null; asOf: string | null; capturedAt: string; officialResult: LabRace["result"] }
  | { kind: "sample"; source: "sample"; capturedAt: string }
  | { kind: "unknown"; source: "unknown" };

export const SIMULATION_DISCLAIMER = "この出力は条件変更後のwhat-ifシミュレーションであり、実際のレース結果・利益を保証しません。";

export function createScenarioProvenance(race: LabRace | null, capturedAt = new Date().toISOString()): ScenarioProvenance {
  if (!race) return { kind: "sample", source: "sample", capturedAt };
  return {
    kind: "single_pick_ai",
    source: "single_pick_ai",
    raceKey: race.race.race_key,
    venue: race.race.venue,
    calibrationStatus: race.model.calibration_status,
    asOf: race.model.as_of,
    capturedAt,
    officialResult: race.result ?? null,
  };
}

export function normalizeScenarioProvenance(provenance: ScenarioProvenance | undefined): ScenarioProvenance {
  return provenance ?? { kind: "unknown", source: "unknown" };
}

export function provenanceBadge(provenance: ScenarioProvenance | undefined): string {
  const normalized = normalizeScenarioProvenance(provenance);
  if (normalized.kind === "single_pick_ai") return `実データ · ${normalized.calibrationStatus ?? "校正状態未確認"}`;
  if (normalized.kind === "sample") return "サンプルデータ";
  return "出所未確認（旧保存形式）";
}

export function provenanceMetadata(provenance: ScenarioProvenance | undefined): Array<[string, string]> {
  const normalized = normalizeScenarioProvenance(provenance);
  if (normalized.kind === "single_pick_ai") {
    return [
      ["実データ元", "single_pick_ai"],
      ["race_key", normalized.raceKey ?? "未確認"],
      ["venue", normalized.venue ?? "未確認"],
      ["校正状態", normalized.calibrationStatus ?? "未確認"],
      ["as_of", normalized.asOf ?? "未確認"],
      ["取得時刻", normalized.capturedAt],
      ["公式結果状態", normalized.officialResult?.status ?? "未確定"],
      ["AI本命結果", aiPickOutcomeLabel(normalized.officialResult)],
      ["AI本命着順", aiPickFinishLabel(normalized.officialResult?.ai_pick)],
      ["公式着順", normalized.officialResult?.official_order?.slice(0, 5).map((entry) => `${entry.finish}着 ${entry.horse_name}`).join(" / ") || "未確定"],
      ["払戻", payoutLines(normalized.officialResult).join(" / ") || "払戻情報なし"],
    ];
  }
  if (normalized.kind === "sample") return [["実データ元", "サンプルデータ（実レース未読込）"], ["保存時刻", normalized.capturedAt]];
  return [["実データ元", "未確認（旧保存形式）"]];
}

export const PROVENANCE_CSV_HEADERS = ["provenanceKind", "dataSource", "raceKey", "venue", "calibrationStatus", "asOf", "capturedAt", "officialResultStatus", "aiPickOutcome", "aiPickFinish", "officialOrder", "payouts"];

export function provenanceCsvValues(provenance: ScenarioProvenance | undefined): string[] {
  const normalized = normalizeScenarioProvenance(provenance);
  if (normalized.kind === "single_pick_ai") return [normalized.kind, normalized.source, normalized.raceKey ?? "未確認", normalized.venue ?? "未確認", normalized.calibrationStatus ?? "未確認", normalized.asOf ?? "未確認", normalized.capturedAt, normalized.officialResult?.status ?? "未確定", aiPickOutcomeLabel(normalized.officialResult), aiPickFinishLabel(normalized.officialResult?.ai_pick), normalized.officialResult?.official_order?.slice(0, 5).map((entry) => `${entry.finish}着 ${entry.horse_name}`).join(" / ") || "未確定", payoutLines(normalized.officialResult).join(" / ") || "払戻情報なし"];
  if (normalized.kind === "sample") return [normalized.kind, "サンプルデータ（実レース未読込）", "", "", "", "", normalized.capturedAt, "", "", "", "", ""];
  return [normalized.kind, "未確認（旧保存形式）", "", "", "", "", "", "", "", "", "", ""];
}

export function provenanceLines(provenance: ScenarioProvenance | undefined): string[] {
  return provenanceMetadata(provenance).map(([label, value]) => `${label}: ${value}`);
}

function escapeCsvCell(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

export function buildProvenanceCsvPreamble(provenance: ScenarioProvenance | undefined): string {
  return [...provenanceMetadata(provenance), ["免責", SIMULATION_DISCLAIMER]]
    .map(([label, value]) => `${escapeCsvCell(label)},${escapeCsvCell(value)}`)
    .join("\n");
}
