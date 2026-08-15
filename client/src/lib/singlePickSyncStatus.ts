export type SyncSourceStatus = {
  refreshMinutes: number;
  lastSuccessAt: string | null;
  nextRetryAt: string | null;
  lastError: string | null;
};

const formatter = new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tokyo" });

const format = (value: string | null) => value ? formatter.format(new Date(value)) : null;

export function describeLastSync(source: SyncSourceStatus | null | undefined): string {
  return `最終成功: ${format(source?.lastSuccessAt ?? null) ?? "初回同期前"}`;
}

export function describeNextSync(source: SyncSourceStatus | null | undefined): string {
  if (!source) return "次回確認: 設定を確認中";
  return `次回確認: ${format(source.nextRetryAt) ?? `${source.refreshMinutes}分ごと`}`;
}

export function describeSyncError(source: SyncSourceStatus | null | undefined): string | null {
  return source?.lastError ? `直近エラー: ${source.lastError}` : null;
}
