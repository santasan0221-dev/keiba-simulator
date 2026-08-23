import { describe, expect, it } from "vitest";

describe("VITE_SINGLE_PICK_AI_BASE", () => {
  it("uses the Cloudflare read-only API origin for the static build", () => {
    const baseUrl = process.env.VITE_SINGLE_PICK_AI_BASE;
    expect(baseUrl).toBe("https://api.keibalab.net");
    expect(new URL(baseUrl!).protocol).toBe("https:");
  });
});
