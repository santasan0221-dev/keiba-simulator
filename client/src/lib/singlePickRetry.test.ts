import { describe, expect, it, vi } from "vitest";
import { exponentialBackoffDelay, retrySinglePick } from "./singlePickRetry";

describe("single_pick_ai retry", () => {
  it("指数バックオフを上限付きで計算する", () => {
    expect(exponentialBackoffDelay(1, 100)).toBe(100);
    expect(exponentialBackoffDelay(2, 100)).toBe(200);
    expect(exponentialBackoffDelay(8, 100, 1_000)).toBe(1_000);
  });

  it("一時失敗後に再試行して成功値を返す", async () => {
    vi.useFakeTimers();
    const operation = vi.fn().mockRejectedValueOnce(new Error("temporary")).mockResolvedValueOnce("ok");
    const promise = retrySinglePick(operation, { baseDelayMs: 10 });
    await vi.advanceTimersByTimeAsync(10);
    await expect(promise).resolves.toBe("ok");
    expect(operation).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
