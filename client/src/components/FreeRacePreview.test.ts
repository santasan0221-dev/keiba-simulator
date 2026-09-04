import { describe, expect, it } from "vitest";
import { selectFreeRaceHonmei } from "./FreeRacePreview";
import type { LabHorse } from "@/lib/singlePickAi";

// Regression coverage for the /free Display Contract fix: AI本命 must come
// solely from the saved final_mark === "◎", never ai_rank, v23k_rank, or
// raw score. selectFreeRaceHonmei is the pure selection logic FreeRacePreview
// renders; race data loading itself runs in a useEffect that renderToStaticMarkup
// never executes, so this function is the correct, direct testing surface.

function horse(overrides: {
  no: number;
  name: string;
  ai_rank: number | null;
  v23k_score?: number | null;
  final_mark: string | null;
  win_prob_calibrated?: number | null;
}): LabHorse {
  return {
    no: overrides.no,
    name: overrides.name,
    style: "先行",
    withdrawn: false,
    abilities: { speed: 60, stamina: 60, start: 60, form: 60, going_rates: {}, mapping_status: "OK" },
    model: {
      v23k_score: overrides.v23k_score ?? 50,
      ai_rank: overrides.ai_rank,
      win_prob_calibrated: overrides.win_prob_calibrated === undefined ? 0.3 : overrides.win_prob_calibrated,
      top3_prob: 0.6,
      prob_status: "CALIBRATED",
    },
    display: {
      base_mark: overrides.final_mark,
      final_mark: overrides.final_mark,
      v23k_rank: overrides.ai_rank,
      mark_adjustment_reason: null,
      anxiety_tags: [],
      plus_tags: [],
      dismiss_reason_tags: [],
      danger_score: null,
    },
    market: { popularity: null, win_odds: null, slot: null, captured_at: null },
    record: {},
  };
}

describe("selectFreeRaceHonmei (/free Display Contract)", () => {
  it("CASE 1: final_mark ◎ and ai_rank 1 agree -- picks that horse", () => {
    const horses = [horse({ no: 3, name: "本命馬", ai_rank: 1, final_mark: "◎" })];
    expect(selectFreeRaceHonmei(horses)?.no).toBe(3);
  });

  it("CASE 2 (most important): final_mark ◎ disagrees with ai_rank 1 -- final_mark wins", () => {
    const horses = [
      horse({ no: 7, name: "素点1位", ai_rank: 1, v23k_score: 99, final_mark: "○" }),
      horse({ no: 2, name: "最終本命", ai_rank: 5, v23k_score: 40, final_mark: "◎" }),
    ];
    const result = selectFreeRaceHonmei(horses);
    expect(result?.no).toBe(2);
    expect(result?.name).toBe("最終本命");
  });

  it("CASE 3: ◎ missing entirely, ai_rank 1 exists -- fails closed, no rank fallback", () => {
    const horses = [
      horse({ no: 1, name: "素点1位", ai_rank: 1, final_mark: "○" }),
      horse({ no: 4, name: "素点2位", ai_rank: 2, final_mark: "▲" }),
    ];
    expect(selectFreeRaceHonmei(horses)).toBeNull();
  });

  it("CASE 4: duplicate ◎ -- fails closed, does not arbitrarily pick either", () => {
    const horses = [
      horse({ no: 1, name: "馬A", ai_rank: 1, final_mark: "◎" }),
      horse({ no: 2, name: "馬B", ai_rank: 2, final_mark: "◎" }),
    ];
    expect(selectFreeRaceHonmei(horses)).toBeNull();
  });

  it("CASE 5: v23k_score is highest on a non-◎ horse -- ◎ still wins", () => {
    const horses = [
      horse({ no: 9, name: "スコア最大", ai_rank: 2, v23k_score: 999, final_mark: "▲" }),
      horse({ no: 3, name: "最終本命", ai_rank: 1, v23k_score: 10, final_mark: "◎" }),
    ];
    expect(selectFreeRaceHonmei(horses)?.no).toBe(3);
  });

  it("CASE 6: JRA-shaped fixture (multi-digit horse numbers, dense field)", () => {
    const horses = [
      horse({ no: 11, name: "JRA本命", ai_rank: 1, final_mark: "◎" }),
      horse({ no: 16, name: "JRA対抗", ai_rank: 2, final_mark: "○" }),
    ];
    expect(selectFreeRaceHonmei(horses)?.no).toBe(11);
  });

  it("CASE 7: NAR-shaped fixture (small field)", () => {
    const horses = [
      horse({ no: 1, name: "NAR本命", ai_rank: 1, final_mark: "◎" }),
      horse({ no: 2, name: "NAR対抗", ai_rank: 2, final_mark: "○" }),
    ];
    expect(selectFreeRaceHonmei(horses)?.no).toBe(1);
  });

  it("unique ◎ without a calibrated win probability still fails closed (unrelated to the mark contract, but must not regress)", () => {
    const horses = [horse({ no: 3, name: "本命馬", ai_rank: 1, final_mark: "◎", win_prob_calibrated: null })];
    expect(selectFreeRaceHonmei(horses)).toBeNull();
  });

  it("unique ◎ without a name still fails closed", () => {
    const horses = [{ ...horse({ no: 3, name: "本命馬", ai_rank: 1, final_mark: "◎" }), name: null }];
    expect(selectFreeRaceHonmei(horses)).toBeNull();
  });
});
