import { describeLastSync, describeNextSync, describeSyncError } from "./singlePickSyncStatus";
import { describe, expect, it } from "vitest";

describe("singlePickSyncStatus", () => {
  it("keeps the initial state explicit", () => {
    expect(describeLastSync(undefined)).toBe("最終成功: 初回同期前");
    expect(describeNextSync(undefined)).toBe("次回確認: 設定を確認中");
    expect(describeSyncError(undefined)).toBeNull();
  });

  it("shows the refresh cadence for a healthy source", () => {
    const source = { refreshMinutes: 15, lastSuccessAt: "2026-08-15T02:30:00.000Z", nextRetryAt: null, lastError: null };
    expect(describeLastSync(source)).toContain("最終成功:");
    expect(describeNextSync(source)).toBe("次回確認: 15分ごと");
    expect(describeSyncError(source)).toBeNull();
  });

  it("uses the scheduled retry moment and preserves the failure text", () => {
    const source = { refreshMinutes: 15, lastSuccessAt: null, nextRetryAt: "2026-08-15T03:45:00.000Z", lastError: "接続タイムアウト" };
    expect(describeNextSync(source)).toContain("次回確認:");
    expect(describeNextSync(source)).not.toContain("15分ごと");
    expect(describeSyncError(source)).toBe("直近エラー: 接続タイムアウト");
  });
});
