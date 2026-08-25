import { afterEach, describe, expect, it, vi } from "vitest";
import { absoluteRaceUrl, paramsToRaceKey, raceKeyToPath } from "./raceShareUrl";

describe("raceKeyToPath", () => {
  it("builds a path from a well-formed race_key", () => {
    expect(raceKeyToPath("JRA|2026-08-23|札幌|12")).toBe(`/race/JRA/2026-08-23/${encodeURIComponent("札幌")}/12`);
  });

  it("URL-encodes each segment independently", () => {
    const path = raceKeyToPath("NAR|2026-08-23|大井|01");
    expect(path).toBe(`/race/NAR/2026-08-23/${encodeURIComponent("大井")}/01`);
  });

  it("returns null for a race_key with the wrong number of segments", () => {
    expect(raceKeyToPath("JRA|2026-08-23|札幌")).toBeNull();
    expect(raceKeyToPath("JRA|2026-08-23|札幌|12|extra")).toBeNull();
  });

  it("returns null for a race_key with an empty segment", () => {
    expect(raceKeyToPath("JRA||札幌|12")).toBeNull();
  });

  it("returns null for a non-pipe-delimited string", () => {
    expect(raceKeyToPath("not-a-race-key")).toBeNull();
  });
});

describe("paramsToRaceKey", () => {
  it("joins decoded route params back into the exact race_key format", () => {
    expect(paramsToRaceKey({ org: "JRA", date: "2026-08-23", venue: "札幌", no: "12" })).toBe("JRA|2026-08-23|札幌|12");
  });

  it("round-trips through raceKeyToPath -> decode -> paramsToRaceKey", () => {
    const original = "JRA|2026-08-23|札幌|12";
    const path = raceKeyToPath(original)!;
    // Simulate what wouter's useParams() gives us: decoded path segments.
    const segments = path.split("/").slice(2).map(decodeURIComponent);
    const [org, date, venue, no] = segments;
    expect(paramsToRaceKey({ org, date, venue, no })).toBe(original);
  });

  it("returns null when any param is missing", () => {
    expect(paramsToRaceKey({ org: "JRA", date: "2026-08-23", venue: "札幌" })).toBeNull();
    expect(paramsToRaceKey(undefined)).toBeNull();
    expect(paramsToRaceKey({})).toBeNull();
  });

  it("returns null when a param is an empty string", () => {
    expect(paramsToRaceKey({ org: "JRA", date: "", venue: "札幌", no: "12" })).toBeNull();
  });

  it("round-trips a NAR race_key the same way as JRA", () => {
    const original = "NAR|2026-08-25|笠松|01";
    const path = raceKeyToPath(original)!;
    const segments = path.split("/").slice(2).map(decodeURIComponent);
    const [org, date, venue, no] = segments;
    expect(paramsToRaceKey({ org, date, venue, no })).toBe(original);
  });
});

describe("absoluteRaceUrl", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns null for an invalid race_key without touching window/location", () => {
    expect(absoluteRaceUrl("bad-key")).toBeNull();
  });

  it("builds the exact shareable URL for a JRA race_key, honoring the configured base path", () => {
    vi.stubGlobal("window", { location: { origin: "https://santasan0221-dev.github.io" } });
    expect(absoluteRaceUrl("JRA|2026-08-23|札幌|12")).toBe(`https://santasan0221-dev.github.io${import.meta.env.BASE_URL.endsWith("/") ? import.meta.env.BASE_URL.slice(0, -1) : import.meta.env.BASE_URL}/race/JRA/2026-08-23/${encodeURIComponent("札幌")}/12`);
  });

  it("builds the exact shareable URL for a NAR race_key", () => {
    vi.stubGlobal("window", { location: { origin: "https://santasan0221-dev.github.io" } });
    expect(absoluteRaceUrl("NAR|2026-08-25|笠松|01")).toBe(`https://santasan0221-dev.github.io${import.meta.env.BASE_URL.endsWith("/") ? import.meta.env.BASE_URL.slice(0, -1) : import.meta.env.BASE_URL}/race/NAR/2026-08-25/${encodeURIComponent("笠松")}/01`);
  });
});
