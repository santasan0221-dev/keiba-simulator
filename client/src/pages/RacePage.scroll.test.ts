import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { resetScrollForRace } from "./RacePage";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// Navigating from a scrolled-down Home race list to /race/... must open the
// detail at the top: wouter does not reset scroll on client-side navigation,
// so without this the phone view lands hundreds of pixels into the page.
describe("RacePage scroll reset on race navigation", () => {
  it("scrolls the window to the top", () => {
    const scrollTo = vi.fn();
    resetScrollForRace({ scrollTo });
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it("is a no-op without a window (SSR / tests)", () => {
    expect(() => resetScrollForRace(undefined)).not.toThrow();
  });

  it("runs from an effect keyed on the race, so every race change starts at the top", () => {
    const source = readFileSync(resolve(import.meta.dirname, "RacePage.tsx"), "utf8");
    expect(source).toMatch(/useEffect\(\(\) => \{ resetScrollForRace\(typeof window === "undefined" \? undefined : window\); \}, \[raceKey\]\);/);
  });
});
