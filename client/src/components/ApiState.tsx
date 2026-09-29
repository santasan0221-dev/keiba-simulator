import React from "react";
import { getApiBase, LabApiError } from "@/lib/singlePickAi";
export function apiOrigin(): string {
  try {
    return new URL(
      getApiBase() ||
        (typeof window === "undefined"
          ? "https://api.keibalab.net"
          : window.location.origin)
    ).origin;
  } catch {
    return "接続先未設定";
  }
}
export function ApiState({
  kind,
  status,
  origin,
  onRetry,
}: {
  kind: "loading" | "empty" | "unavailable";
  status?: number;
  origin?: string;
  onRetry?: () => void;
}) {
  return (
    <div
      className={`broadcast-state is-${kind}`}
      role={kind === "unavailable" ? "alert" : "status"}
      aria-live="polite"
    >
      <strong>
        {kind === "loading"
          ? "読み込み中"
          : kind === "empty"
            ? "この条件の結果は0件です"
            : "データを取得できません"}
      </strong>
      <p>
        {kind === "loading"
          ? "選択した開催日の情報を確認しています。"
          : kind === "empty"
            ? "開催日や絞り込み条件を変更してください。"
            : "接続状態を確認して、再取得してください。"}
      </p>
      {kind === "unavailable" && (
        <p className="connection-detail">
          HTTP {status && status > 0 ? status : "応答なし"} · API origin:{" "}
          {origin ?? apiOrigin()}
        </p>
      )}
      {kind === "unavailable" && onRetry && (
        <button type="button" onClick={onRetry}>
          再取得
        </button>
      )}
    </div>
  );
}
export function ApiFailure({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry?: () => void;
}) {
  return (
    <ApiState
      kind="unavailable"
      status={error instanceof LabApiError ? error.status : 0}
      onRetry={onRetry}
    />
  );
}
