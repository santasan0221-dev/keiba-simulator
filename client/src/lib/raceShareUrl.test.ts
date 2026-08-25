import { describe, expect, it } from "vitest";
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
});

describe("absoluteRaceUrl", () => {
  it("returns null for an invalid race_key without touching window/location", () => {
    expect(absoluteRaceUrl("bad-key")).toBeNull();
  });
});
