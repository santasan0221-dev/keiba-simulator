import { describe, expect, it } from "vitest";

const baseUrl = process.env.SINGLE_PICK_AI_BASE_URL?.replace(/\/+$/, "");

describe("SINGLE_PICK_AI_BASE_URL", () => {
  it(
    "公開HTTPS APIからレース一覧を取得できる",
    async () => {
      expect(baseUrl).toMatch(/^https:\/\//);
      const hostname = new URL(baseUrl!).hostname.toLowerCase();
      const headers = hostname.endsWith(".ngrok-free.dev") || hostname.endsWith(".ngrok.io") ? { "ngrok-skip-browser-warning": "true" } : undefined;
      const response = await fetch(`${baseUrl}/api/lab/races?date=2026-08-15&organization=NAR`, { headers });
      expect(response.ok).toBe(true);
      const body = (await response.json()) as { races?: unknown };
      expect(Array.isArray(body.races)).toBe(true);
    },
    30_000
  );
});
