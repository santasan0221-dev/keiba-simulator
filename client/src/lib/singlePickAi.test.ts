import { afterEach, describe, expect, it, vi } from "vitest";
import { LabApiError, fetchAvailablePredictionDates, fetchDailyOperations, fetchLabHealth, fetchLabResults, fetchRaces, getApiBase, getApiRequestHeaders, NGROK_SKIP_BROWSER_WARNING_HEADER, toHorses, type LabRace } from "./singlePickAi";

const race: LabRace = {
  race: { race_key: "jra-20260815-11", date: "2026-08-15", organization: "JRA", venue: "札幌", race_no: 11, distance: 2000, surface: "芝", going: "良", scheduled_start_at: null, status: "OPEN" },
  model: { champion_id: "v23k", calibration_status: "SHADOW", disclaimer: "test", as_of: "2026-08-14T00:00:00Z" },
  horses: [{
    no: 1, name: "テストホース", style: "先行", withdrawn: false,
    abilities: { speed: 78, stamina: null, start: null, form: null, going_rates: { 良: 67, 稍重: null, 重: null, 不良: null }, mapping_status: "AS_OF_HISTORY_PARTIAL" },
    model: { v23k_score: 0.73, ai_rank: 1, win_prob_calibrated: null, top3_prob: null, prob_status: "UNCALIBRATED_SHADOW_SCORE" },
    market: { popularity: 2, win_odds: 4.3, slot: "A", captured_at: null },
    record: { starts: 12, wins: 3, seconds: 2, thirds: 1, avg_finish: 4.2 },
  }],
  branches: [], market_ev: { note: "test", status: "SKIP", rows: [] }, provenance: {},
};

describe("single_pick_ai toHorses", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("keeps v23k and as-of provenance while labelling fallback abilities as provisional", () => {
    const horse = toHorses(race)[0];

    expect(horse.speed).toBe(78);
    expect(horse.dataSources).toMatchObject({
      speed: "v23k実値",
      stamina: "暫定値",
      start: "暫定値",
      form: "暫定値",
      record: "as-of履歴実値",
      mappingStatus: "AS_OF_HISTORY_PARTIAL",
    });
    expect(horse.dataSources?.goingRates.良).toBe("as-of履歴実値");
    expect(horse.dataSources?.goingRates.重).toBe("暫定値");
  });

  it("does not turn uncalibrated model probabilities into simulator horse fields", () => {
    const horse = toHorses(race)[0] as Record<string, unknown>;

    expect(horse.win_prob_calibrated).toBeUndefined();
    expect(horse.top3_prob).toBeUndefined();
  });

  it("raises a clear connection error when a configured endpoint returns HTML instead of the API JSON", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>not an API</html>", { status: 200, headers: { "content-type": "text/html" } })));

    await expect(fetchRaces("2026-08-15", "JRA")).rejects.toThrow("APIがJSONを返しません");
  });

  it("uses the fixed read-only daily, results, available-dates and health endpoints", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } })));
    vi.stubGlobal("fetch", fetchMock);

    await fetchDailyOperations("2026-08-17");
    await fetchLabResults({ date: "2026-08-17", organization: "NAR", venue: "帯広" });
    await fetchAvailablePredictionDates();
    await fetchLabHealth();

    const base = getApiBase();
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      `${base}/api/lab/operations/daily?date=2026-08-17`,
      `${base}/api/lab/results?date=2026-08-17&organization=NAR&venue=%E5%B8%AF%E5%BA%83`,
      `${base}/api/lab/available-dates?kind=prediction`,
      `${base}/api/lab/health`,
    ]);
  });

  it("preserves canonical 422 and 503 error payloads instead of treating them as empty data", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "invalid date", detail: "date must be YYYY-MM-DD" }), { status: 422, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "source unavailable", detail: "canonical store is not ready" }), { status: 503, headers: { "content-type": "application/json" } })));

    await expect(fetchDailyOperations("not-a-date")).rejects.toMatchObject<Partial<LabApiError>>({ name: "LabApiError", status: 422, message: "invalid date", detail: "date must be YYYY-MM-DD" });
    await expect(fetchLabResults({ date: "2026-08-19" })).rejects.toMatchObject<Partial<LabApiError>>({ name: "LabApiError", status: 503, message: "source unavailable", detail: "canonical store is not ready" });
  });

  it("adds the ngrok browser-warning bypass header only for ngrok tunnel endpoints", () => {
    expect(getApiRequestHeaders("https://unburned-dispose-outlast.ngrok-free.dev")).toEqual({ [NGROK_SKIP_BROWSER_WARNING_HEADER]: "true" });
    expect(getApiRequestHeaders("https://single-pick.example.com")).toBeUndefined();
    expect(getApiRequestHeaders("")).toBeUndefined();
  });
});
