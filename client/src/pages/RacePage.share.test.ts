import { afterEach, describe, expect, it, vi } from "vitest";
import { shareRace } from "./RacePage";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const RACE_KEY_JRA = "JRA|2026-08-23|札幌|12";
const RACE_KEY_NAR = "NAR|2026-08-25|笠松|01";

describe("RacePage shareRace", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("does nothing for a malformed race_key (never shares/copies a broken URL)", async () => {
    vi.stubGlobal("navigator", { share: vi.fn(), clipboard: { writeText: vi.fn() } });
    const nav = globalThis.navigator as unknown as { share: ReturnType<typeof vi.fn>; clipboard: { writeText: ReturnType<typeof vi.fn> } };

    await shareRace("not-a-race-key");

    expect(nav.share).not.toHaveBeenCalled();
    expect(nav.clipboard.writeText).not.toHaveBeenCalled();
  });

  it("prefers the native Web Share sheet, with minimal text (no ◎ horse name / prediction content)", async () => {
    vi.stubGlobal("window", { location: { origin: "https://santasan0221-dev.github.io" } });
    const share = vi.fn().mockResolvedValue(undefined);
    const writeText = vi.fn();
    vi.stubGlobal("navigator", { share, clipboard: { writeText } });

    await shareRace(RACE_KEY_JRA);

    expect(share).toHaveBeenCalledWith({
      title: "KEIBA TRACE",
      text: "AI視点でこのレースを確認する",
      url: `https://santasan0221-dev.github.io/race/${encodeURIComponent("JRA")}/2026-08-23/${encodeURIComponent("札幌")}/12`,
    });
    expect(writeText).not.toHaveBeenCalled();
  });

  it("builds the same share URL shape for a NAR race_key", async () => {
    vi.stubGlobal("window", { location: { origin: "https://santasan0221-dev.github.io" } });
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { share, clipboard: { writeText: vi.fn() } });

    await shareRace(RACE_KEY_NAR);

    expect(share).toHaveBeenCalledWith(expect.objectContaining({
      url: `https://santasan0221-dev.github.io/race/NAR/2026-08-25/${encodeURIComponent("笠松")}/01`,
    }));
  });

  it("falls back to clipboard copy when the user cancels or the platform rejects the native share sheet", async () => {
    vi.stubGlobal("window", { location: { origin: "https://santasan0221-dev.github.io" } });
    const share = vi.fn().mockRejectedValue(new DOMException("cancelled", "AbortError"));
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { share, clipboard: { writeText } });

    await shareRace(RACE_KEY_JRA);

    expect(writeText).toHaveBeenCalledTimes(1);
  });

  it("copies to clipboard directly when the Web Share API is unavailable", async () => {
    vi.stubGlobal("window", { location: { origin: "https://santasan0221-dev.github.io" } });
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });

    await shareRace(RACE_KEY_JRA);

    expect(writeText).toHaveBeenCalledWith(`https://santasan0221-dev.github.io/race/JRA/2026-08-23/${encodeURIComponent("札幌")}/12`);
  });

  it("does not throw when both native share and clipboard copy fail", async () => {
    vi.stubGlobal("window", { location: { origin: "https://santasan0221-dev.github.io" } });
    const writeText = vi.fn().mockRejectedValue(new Error("clipboard denied"));
    vi.stubGlobal("navigator", { clipboard: { writeText } });

    await expect(shareRace(RACE_KEY_JRA)).resolves.toBeUndefined();
  });
});
