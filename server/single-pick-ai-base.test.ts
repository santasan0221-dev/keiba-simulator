import { describe, expect, it } from "vitest";

describe("VITE_SINGLE_PICK_AI_BASE", () => {
  it("calls the configured base endpoint without a server-side failure", async () => {
    const baseUrl = process.env.VITE_SINGLE_PICK_AI_BASE;
    expect(baseUrl).toBe("https://unburned-dispose-outlast.ngrok-free.dev");

    const response = await fetch(baseUrl!, {
      method: "HEAD",
      redirect: "manual",
    });

    expect(response.status).toBeLessThan(500);
  }, 15_000);
});
