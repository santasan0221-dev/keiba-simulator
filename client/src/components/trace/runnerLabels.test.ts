import { describe, expect, it } from "vitest";
import { layoutRunnerLabels } from "./runnerLabels";
describe("screen-space runner labels", () => {
  it("separates 18 coincident runners without changing their input coordinates", () => {
    for (const [width, height] of [[360, 320], [640, 300]]) {
      for (const [x, y] of [[0, 0], [width, height], [width / 2, height / 2]]) {
        const input = Array.from({ length: 18 }, (_, i) => ({ no: i + 1, x, y }));
        const before = JSON.stringify(input);
        const labels = layoutRunnerLabels(input, width, height);
        expect(JSON.stringify(input)).toBe(before);
        for (const [i, a] of labels.entries()) {
          expect(a.x).toBeGreaterThanOrEqual(16); expect(a.x).toBeLessThanOrEqual(width - 16);
          expect(a.y).toBeGreaterThanOrEqual(16); expect(a.y).toBeLessThanOrEqual(height - 16);
          for (const b of labels.slice(i + 1)) expect(Math.abs(a.x - b.x) >= 28 || Math.abs(a.y - b.y) >= 28).toBe(true);
        }
      }
    }
  });
});

describe("layout acceptance hook", () => {
  it("without an accept test the layout is exactly the plain 28-unit one, and it is deterministic", () => {
    const input = [3, 1, 2].map((no, i) => ({ no, x: 100 + i, y: 100 }));
    const a = layoutRunnerLabels(input, 640, 300), b = layoutRunnerLabels(input, 640, 300, undefined);
    expect(a).toEqual(b);
    expect(a.map(l => l.no).sort()).toEqual([1, 2, 3]);                              // every label keeps its own runner number
  });
  it("an accept test only vetoes candidates; it never moves the inputs and the flat rule still holds", () => {
    const input = Array.from({ length: 18 }, (_, i) => ({ no: i + 1, x: 320, y: 150 }));
    const before = JSON.stringify(input);
    const out = layoutRunnerLabels(input, 640, 300, (candidate, placed) => placed.every(other => Math.hypot(other.x - candidate.x, other.y - candidate.y) > 31));
    expect(JSON.stringify(input)).toBe(before);
    for (const [i, a] of out.entries()) for (const b of out.slice(i + 1)) expect(Math.abs(a.x - b.x) >= 28 || Math.abs(a.y - b.y) >= 28).toBe(true);
  });
});
