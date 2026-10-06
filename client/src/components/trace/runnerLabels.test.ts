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
