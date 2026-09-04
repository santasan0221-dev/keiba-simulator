import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/singlePickAi", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/singlePickAi")>();
  return { ...actual, getJson: vi.fn(), fetchAvailablePredictionDates: vi.fn() };
});

import { fetchAvailablePredictionDates, getJson } from "@/lib/singlePickAi";
import { fetchFreeRace, fetchModelComparison, fetchModelDetail, fetchOfficialBettingCandidates, metricText } from "@/lib/publicFeatureApi";
import { featureStateLabel } from "@/lib/labels";

const getJsonMock = vi.mocked(getJson);
const availableDatesMock = vi.mocked(fetchAvailablePredictionDates);

beforeEach(() => {
  getJsonMock.mockReset();
  availableDatesMock.mockReset();
  availableDatesMock.mockResolvedValue({ latest_prediction_date: "2026-08-22", available_dates: ["2026-08-22"] });
});

describe("public feature API fail-closed boundary", () => {
  it("preserves MEMBER_LOCKED and uses the canonical latest prediction date", async () => {
    getJsonMock.mockResolvedValue({
      schema_version: "BETTING_CANDIDATES_V1",
      race_date: "2026-08-22",
      status: "MEMBER_LOCKED",
      message: "正式買い目候補はMEMBER限定機能です。",
      entitlement: { tier: "FREE", locked: true },
      counts: { BET: 0, NO_BET: 0, UNAVAILABLE: 0 },
      decisions: [],
    });

    const result = await fetchOfficialBettingCandidates();

    expect(getJsonMock).toHaveBeenCalledWith("/api/betting-candidates?date=2026-08-22");
    expect(result.state).toBe("MEMBER_LOCKED");
    expect(result.data?.entitlement).toEqual({ tier: "FREE", locked: true });
    expect(result.data?.decisions).toEqual([]);
  });

  it("preserves NOT_YET_GENERATED rather than fabricating a BET, NO BET, or zero-count decision", async () => {
    getJsonMock.mockResolvedValue({
      schema_version: "BETTING_CANDIDATES_V1",
      race_date: "2026-08-22",
      status: "NOT_YET_GENERATED",
      message: "正式買い目候補はまだ生成されていません。",
      entitlement: { tier: "MEMBER", locked: false },
      counts: { BET: 0, NO_BET: 0, UNAVAILABLE: 0 },
      decisions: [],
    });

    const result = await fetchOfficialBettingCandidates();

    expect(result.state).toBe("NOT_YET_GENERATED");
    expect(result.data?.decisions).toEqual([]);
    expect(result.data?.counts).toEqual({ BET: 0, NO_BET: 0, UNAVAILABLE: 0 });
  });

  it("does not replace an unavailable canonical latest date with a browser or fixed date", async () => {
    availableDatesMock.mockResolvedValue({ latest_prediction_date: null, available_dates: [] });

    const result = await fetchOfficialBettingCandidates();

    expect(result).toEqual({ state: "UNAVAILABLE", data: null, message: "正本の最新予測日を取得できません。", detail: null });
    expect(getJsonMock).not.toHaveBeenCalled();
  });

  it("preserves nested PENDING_DATA metrics as a status rather than zero", async () => {
    getJsonMock.mockResolvedValue({
      schema_version: "MODEL_COMPARISON_V1",
      models: [{
        model_id: "v24",
        model_stage: "SHADOW",
        evaluation_mode: "SHADOW_FIXED_STAKE_SIMULATION",
        sample_status: "PENDING_DATA",
        period: { start: "1970-01-01T00:00:00+00:00", end: "2026-08-22T00:00:00+00:00", range: "lifetime" },
        prediction_count: { status: "PENDING_DATA", value: 0 },
        confirmed_count: { status: "PENDING_DATA", value: 0 },
        top1_hit_rate: { status: "PENDING_DATA", value: null },
        top3_hit_rate: { status: "PENDING_DATA", value: null },
        winner_mrr: { status: "PENDING_DATA", value: null },
        ndcg_at_3: { status: "PENDING_DATA", value: null },
        win_roi: { status: "PENDING_DATA", value: null },
        place_roi: { status: "PENDING_DATA", value: null },
        rank_residual: { status: "PENDING_DATA", value: null },
        margin_seconds: { status: "PENDING_DATA", value: null },
      }],
    });

    const result = await fetchModelComparison();

    expect(result.state).toBe("AVAILABLE");
    expect(result.data?.[0].predictionCount).toEqual({ state: "PENDING_DATA", value: 0 });
    expect(result.data?.[0].top1HitRate).toEqual({ state: "PENDING_DATA", value: null });
    expect(metricText({ state: "PENDING_DATA", value: 0 }, 3, true)).toBe(featureStateLabel("PENDING_DATA"));
  });

  it("preserves a FREE model-detail lock and does not return detail data", async () => {
    getJsonMock.mockResolvedValue({ model_id: "champion", entitlement: { tier: "FREE", locked: true }, overall: null, axes: [] });

    const result = await fetchModelDetail("champion");

    expect(result.state).toBe("MEMBER_LOCKED");
    expect(result.data?.entitlement.locked).toBe(true);
  });

  it("preserves FREE race UNAVAILABLE and the canonical selection-lock reason", async () => {
    getJsonMock.mockResolvedValue({ status: "UNAVAILABLE", reason_code: "SELECTION_LOCK_NOT_CONFIGURED", message: "本日のFREE対象レースはまだ選定されていません。", race: null });

    const result = await fetchFreeRace();

    expect(result.state).toBe("UNAVAILABLE");
    expect(result.data).toEqual({ race: null, reasonCode: "SELECTION_LOCK_NOT_CONFIGURED" });
    expect(result.message).toBe("本日のFREE対象レースはまだ選定されていません。");
  });
});

// Regression coverage for the percent-formatter correctness fix: asPercent
// must always multiply by 100 on every caller's fraction/ratio contract,
// never guess based on whether the value happens to already be <= 1 --
// that heuristic silently under-rendered any ratio > 1 (ROI can exceed
// +100%; hit rates never do, which is exactly why this went unnoticed).
describe("metricText (percent conversion contract)", () => {
  const available = (value: number) => ({ state: "AVAILABLE", value });

  it("0 -> 0.000%", () => {
    expect(metricText(available(0), 3, true)).toBe("0.000%");
  });

  it("a hit-rate-shaped fraction (0.175) -> 17.500%", () => {
    expect(metricText(available(0.175), 3, true)).toBe("17.500%");
  });

  it("exactly 1 (the old heuristic's boundary) -> 100.000%, not 1.000%", () => {
    expect(metricText(available(1), 3, true)).toBe("100.000%");
  });

  it("a ROI-shaped ratio above 1 (1.5, i.e. +150%) -> 150.000%, not 1.500%", () => {
    expect(metricText(available(1.5), 3, true)).toBe("150.000%");
  });

  it("2.25 -> 225.000%", () => {
    expect(metricText(available(2.25), 3, true)).toBe("225.000%");
  });

  it("a real negative ROI (-0.285) -> -28.500%", () => {
    expect(metricText(available(-0.285), 3, true)).toBe("-28.500%");
  });

  it("-1 (the ROI floor, a total loss) -> -100.000%", () => {
    expect(metricText(available(-1), 3, true)).toBe("-100.000%");
  });

  it("unavailable/null still falls back to the existing status label, not a percent", () => {
    expect(metricText({ state: "PENDING_DATA", value: null }, 3, true)).toBe(featureStateLabel("PENDING_DATA"));
  });
});
