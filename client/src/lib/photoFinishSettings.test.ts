import { describe, expect, it } from "vitest";
import { DEFAULT_PHOTO_LOOP_RANGE, normalizePhotoLoopRange, parsePhotoLoopRange } from "./photoFinishSettings";

describe("photo finish loop range settings", () => {
  it("uses the documented default range when no saved setting exists", () => {
    expect(parsePhotoLoopRange(null)).toEqual(DEFAULT_PHOTO_LOOP_RANGE);
  });

  it("restores a valid saved range", () => {
    expect(parsePhotoLoopRange('{"start":86,"end":97}')).toEqual({ start: 86, end: 97 });
  });

  it("falls back when saved JSON is malformed", () => {
    expect(parsePhotoLoopRange("not-json")).toEqual(DEFAULT_PHOTO_LOOP_RANGE);
  });

  it("keeps a minimum two-percent loop window inside the supported bounds", () => {
    expect(normalizePhotoLoopRange({ start: 99, end: 80 })).toEqual({ start: 98, end: 100 });
  });
});
