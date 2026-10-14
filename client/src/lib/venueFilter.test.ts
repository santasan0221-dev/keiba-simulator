import { describe, expect, it } from "vitest";
import { venueKey, venueOptions, validVenue, filterVenue } from "./venueFilter";
import type { LabRaceListItem } from "./singlePickAi";

const races = [
  { organization: "JRA", venue: "東京", race_key: "a", decision: { status: "BET" } },
  { organization: "NAR", venue: "東京", race_key: "b" },
  { organization: "JRA", venue: "京都", race_key: "c" },
  { organization: "JRA", venue: "東京", race_key: "d" },
] as LabRaceListItem[];
describe("venue filter", () => {
  it("extracts real fields, counts venues, and separates organizations", () => {
    expect(venueOptions(races).map(x => [x.label, x.count])).toEqual([["東京", 2], ["東京", 1], ["京都", 1]]);
    expect(venueKey(races[0])).not.toBe(venueKey(races[1]));
  });
  it("filters without altering order, identity, or prediction payloads", () => {
    const before = JSON.stringify(races);
    const result = filterVenue(races, venueKey(races[0]));
    expect(result.map(x => x.race_key)).toEqual(["a", "d"]);
    expect(result[0]).toBe(races[0]);
    expect(JSON.stringify(races)).toBe(before);
    expect(filterVenue(races, "")).toBe(races);
  });
  it("falls back for invalid values and dates with no matching venue", () => {
    expect(validVenue(races, "invalid")).toBe("");
    expect(filterVenue(races, "invalid")).toBe(races);
    expect(validVenue([races[2]], venueKey(races[0]))).toBe("");
    expect(validVenue([races[3]], venueKey(races[0]))).toBe(venueKey(races[0]));
    expect(venueOptions([])).toEqual([]);
  });
});
