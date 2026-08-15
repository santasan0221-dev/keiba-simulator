import { describe, expect, it } from "vitest";

const baseUrl = process.env.SINGLE_PICK_AI_BASE_URL?.replace(/\/+$/, "");

describe("SINGLE_PICK_AI_BASE_URL", () => {
  it("バックグラウンド同期に使う公開HTTPS接続先である", () => {
    expect(baseUrl).toMatch(/^https:\/\//);
    const parsed = new URL(baseUrl!);
    expect(parsed.protocol).toBe("https:");
    expect(parsed.hostname).not.toBe("");
  });
});
