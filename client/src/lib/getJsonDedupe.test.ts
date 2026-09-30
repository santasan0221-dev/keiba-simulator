import { afterEach, describe, expect, it, vi } from "vitest";
import { getJson, inFlightRequestCount, LabApiError } from "./singlePickAi";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function deferredFetch() {
  const pending: Array<{ url: string; resolve: (value: Response) => void; reject: (reason: unknown) => void }> = [];
  const fetchMock = vi.fn((url: string) => new Promise<Response>((resolve, reject) => { pending.push({ url, resolve, reject }); }));
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, pending };
}

describe("getJson in-flight GET de-duplication", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("shares one network call between simultaneous identical GETs", async () => {
    const { fetchMock, pending } = deferredFetch();
    const first = getJson<{ n: number }>("/api/lab/available-dates?kind=prediction");
    const second = getJson<{ n: number }>("/api/lab/available-dates?kind=prediction");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    pending[0].resolve(json({ n: 1 }));
    await expect(first).resolves.toEqual({ n: 1 });
    await expect(second).resolves.toEqual({ n: 1 });
  });

  it("removes the in-flight entry after success, so a later call hits the network again", async () => {
    const { fetchMock, pending } = deferredFetch();
    const first = getJson("/api/lab/health");
    expect(inFlightRequestCount()).toBe(1);
    pending[0].resolve(json({ ok: true }));
    await first;
    expect(inFlightRequestCount()).toBe(0);
    const again = getJson("/api/lab/health");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    pending[1].resolve(json({ ok: true }));
    await again;
  });

  it("removes the in-flight entry after failure and propagates the error to every caller", async () => {
    const { fetchMock, pending } = deferredFetch();
    const first = getJson("/api/lab/race/JRA%7C2026-09-30%7C%E4%B8%AD%E5%B1%B1%7C11");
    const second = getJson("/api/lab/race/JRA%7C2026-09-30%7C%E4%B8%AD%E5%B1%B1%7C11");
    pending[0].resolve(json({ error: "unavailable" }, 503));
    await expect(first).rejects.toBeInstanceOf(LabApiError);
    await expect(second).rejects.toMatchObject({ status: 503 });
    expect(inFlightRequestCount()).toBe(0);
    const retry = getJson("/api/lab/race/JRA%7C2026-09-30%7C%E4%B8%AD%E5%B1%B1%7C11");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    pending[1].reject(new TypeError("network down"));
    await expect(retry).rejects.toThrow("network down");
    expect(inFlightRequestCount()).toBe(0);
  });

  it("never shares between different URLs", async () => {
    const { fetchMock, pending } = deferredFetch();
    const jra = getJson("/api/lab/races?date=2026-09-30&organization=JRA");
    const nar = getJson("/api/lab/races?date=2026-09-30&organization=NAR");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(pending.map(entry => entry.url)).toEqual([expect.stringContaining("organization=JRA"), expect.stringContaining("organization=NAR")]);
    pending[0].resolve(json({ org: "JRA" }));
    pending[1].resolve(json({ org: "NAR" }));
    await expect(jra).resolves.toEqual({ org: "JRA" });
    await expect(nar).resolves.toEqual({ org: "NAR" });
  });
});
