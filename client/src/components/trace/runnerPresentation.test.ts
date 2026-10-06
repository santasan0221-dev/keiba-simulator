import { describe, expect, it } from "vitest";
import { runnerPresentation } from "./runnerPresentation";

const luminance = (hex: string) => {
  const channels = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4);
  return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
};
describe("runner identity presentation", () => {
  it("never infers a frame from a horse number or invalid frame", () => {
    for (const frame of [undefined, null, 0, 9, 1.5, "1", NaN]) {
      for (let no = 1; no <= 18; no++) expect(runnerPresentation(no, frame).basis).toBe("VISUAL_ONLY");
    }
  });
  it("uses explicit valid frames and keeps text contrast at least 4.5:1", () => {
    for (const frame of [undefined, 1, 2, 3, 4, 5, 6, 7, 8]) {
      for (let no = 1; no <= 18; no++) {
        const p = runnerPresentation(no, frame);
        const a = luminance(p.fill), b = luminance(p.ink);
        expect((Math.max(a, b) + .05) / (Math.min(a, b) + .05)).toBeGreaterThanOrEqual(4.5);
        expect(p).toEqual(runnerPresentation(no, frame));
      }
    }
  });
});
