/**
 * Consumer-facing Japanese labels for internal/API status enums.
 * These only change how a state is DISPLAYED -- never what it means.
 * Unmapped values fall back to a safe, still-honest default rather than
 * leaking a raw enum string into the UI.
 */

const FEATURE_STATE_LABELS: Record<string, string> = {
  AVAILABLE: "取得済み",
  READY: "準備完了",
  EMPTY: "データなし",
  PENDING_DATA: "データ確認中",
  INSUFFICIENT_SAMPLE: "サンプル不足",
  NOT_APPLICABLE: "対象外",
  UNAVAILABLE: "データ未取得",
  MEMBER_LOCKED: "MEMBER限定",
  NOT_YET_GENERATED: "未生成",
};

export function featureStateLabel(state: string): string {
  return FEATURE_STATE_LABELS[state] ?? "データ未取得";
}

const DECISION_LABELS: Record<string, string> = {
  BET: "BET",
  NO_BET: "見送り",
  UNAVAILABLE: "判定データなし",
};

export function decisionLabel(decision: string): string {
  return DECISION_LABELS[decision] ?? "判定データなし";
}

/**
 * Normalizes a raw decision status into the three-way bucket used for
 * grouping/filtering/counting UI (never a 4th state, never collapses
 * UNKNOWN into NO_BET). Display-only -- does not touch how BET/NO_BET/
 * UNKNOWN is computed upstream. Both TruthPanel and RealRaceLoader use
 * this so the "anything that isn't BET/NO_BET is UNKNOWN" rule lives in
 * exactly one place.
 */
export function normalizeDecisionStatus(status: string | null | undefined): "BET" | "NO_BET" | "UNKNOWN" {
  return status === "BET" || status === "NO_BET" ? status : "UNKNOWN";
}

const DECISION_BUCKET_LABELS: Record<"BET" | "NO_BET" | "UNKNOWN", string> = {
  BET: "BET",
  NO_BET: "見送り",
  UNKNOWN: "判定待ち",
};

/**
 * Consumer-facing label for the three-way decision bucket (daily summary
 * strip / filter tabs). Distinct from decisionLabel(): the bucket name for
 * UNKNOWN is "判定待ち" (never "NO_BET", never implies a decision was made),
 * while decisionLabel() keeps its existing per-card fallback text.
 */
export function decisionBucketLabel(bucket: "BET" | "NO_BET" | "UNKNOWN"): string {
  return DECISION_BUCKET_LABELS[bucket];
}

const CALIBRATION_STATUS_LABELS: Record<string, string> = {
  UNCALIBRATED_SHADOW_SCORE: "検証中の参考スコア",
  CALIBRATED: "校正済み",
  READY: "校正済み",
  COLLECTING: "データ収集中",
  STATUS_UNKNOWN: "状態未取得",
};

export function calibrationStatusLabel(status: string): string {
  return CALIBRATION_STATUS_LABELS[status] ?? "データ収集中";
}
