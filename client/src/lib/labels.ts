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
