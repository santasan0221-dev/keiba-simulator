import { fetchAvailablePredictionDates, getJson, LabApiError } from "@/lib/singlePickAi";
import { featureStateLabel } from "@/lib/labels";

export type PublicFeatureState = "AVAILABLE" | "READY" | "EMPTY" | "PENDING_DATA" | "INSUFFICIENT_SAMPLE" | "NOT_APPLICABLE" | "UNAVAILABLE" | "MEMBER_LOCKED" | "NOT_YET_GENERATED" | string;

export type FeatureResult<T> = {
  state: PublicFeatureState;
  data: T | null;
  message: string;
  detail: string | null;
};

export type CanonicalMetric = {
  state: PublicFeatureState;
  value: number | null;
};

export type Entitlement = {
  tier: string | null;
  locked: boolean | null;
};

export type OfficialBettingCandidate = {
  raceKey: string | null;
  raceLabel: string | null;
  betType: string | null;
  horseName: string | null;
  calibratedProbability: CanonicalMetric;
  marketOdds: CanonicalMetric;
  expectedReturn: CanonicalMetric;
  edge: CanonicalMetric;
  decision: "BET" | "NO_BET" | "UNAVAILABLE";
  reason: string | null;
};

export type BettingCandidatesPayload = {
  raceDate: string | null;
  entitlement: Entitlement;
  counts: Record<string, number | null>;
  decisions: OfficialBettingCandidate[];
};

// Both evaluation modes are the SAME fixed-100-yen single-pick simulation
// family -- neither is real purchase data. They differ only in whose pick
// is priced (the formal champion vs. a research shadow model), never in
// whether real money was involved. Do not reintroduce "ACTUAL"/"real"-style
// naming here or in simulatedWinRoi/simulatedPlaceRoi below.
export type ModelComparisonRow = {
  modelId: string;
  modelStage: string | null;
  evaluationMode: "CHAMPION_FIXED_STAKE_SIMULATION" | "SHADOW_FIXED_STAKE_SIMULATION" | string | null;
  sampleStatus: PublicFeatureState;
  period: { start: string | null; end: string | null; range: string | null } | null;
  predictionCount: CanonicalMetric;
  confirmedCount: CanonicalMetric;
  top1HitRate: CanonicalMetric;
  top3HitRate: CanonicalMetric;
  winnerMrr: CanonicalMetric;
  ndcgAt3: CanonicalMetric;
  simulatedWinRoi: CanonicalMetric;
  simulatedPlaceRoi: CanonicalMetric;
  rankResidual: CanonicalMetric;
  marginSeconds: CanonicalMetric;
};

export type ModelDetailPayload = {
  modelId: string | null;
  entitlement: Entitlement;
  sampleStatus: PublicFeatureState | null;
};

export type FreeRacePayload = {
  race: unknown | null;
  reasonCode: string | null;
};

type JsonObject = Record<string, unknown>;

const isObject = (value: unknown): value is JsonObject => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const stringOrNull = (value: unknown): string | null => typeof value === "string" && value.trim() ? value : null;
const finiteOrNull = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) ? value : null;

function normalizeState(value: unknown): PublicFeatureState {
  return typeof value === "string" && value ? value : "UNAVAILABLE";
}

function unavailableMetric(): CanonicalMetric {
  return { state: "UNAVAILABLE", value: null };
}

function normalizeMetric(value: unknown): CanonicalMetric {
  if (!isObject(value)) return unavailableMetric();
  return { state: normalizeState(value.status), value: finiteOrNull(value.value) };
}

function normalizeEntitlement(value: unknown): Entitlement {
  if (!isObject(value)) return { tier: null, locked: null };
  return { tier: stringOrNull(value.tier), locked: typeof value.locked === "boolean" ? value.locked : null };
}

function defaultMessage(state: PublicFeatureState): string {
  if (state === "EMPTY") return "現在、条件を満たす正式データはありません。";
  if (state === "PENDING_DATA") return "観測データを準備中です。";
  if (state === "INSUFFICIENT_SAMPLE") return "比較に必要なサンプル数が不足しています。";
  if (state === "NOT_APPLICABLE") return "この指標は現在の正本データには適用されません。";
  if (state === "MEMBER_LOCKED") return "この機能はMEMBER限定です。";
  if (state === "NOT_YET_GENERATED") return "正式データはまだ生成されていません。";
  if (state === "UNAVAILABLE") return "正本APIからデータを取得できません。";
  return "正本データを読み込みました。";
}

function featureError<T>(error: unknown): FeatureResult<T> {
  const apiError = error instanceof LabApiError || (isObject(error) && typeof error.status === "number" && typeof error.message === "string")
    ? error as { status: number; message: string; detail?: unknown }
    : null;
  if (apiError) {
    const message = apiError.status === 404
      ? "この機能の正本APIはまだ公開されていません。"
      : apiError.status === 401 || apiError.status === 403
        ? "この機能を利用するための認証が必要です。"
        : "正本APIからデータを取得できません。";
    return { state: "UNAVAILABLE", data: null, message, detail: stringOrNull(apiError.detail) ?? apiError.message };
  }
  return { state: "UNAVAILABLE", data: null, message: "正本APIからデータを取得できません。", detail: error instanceof Error ? error.message : null };
}

function normalizeDecision(value: unknown): "BET" | "NO_BET" | "UNAVAILABLE" {
  if (value === "BET") return "BET";
  if (value === "NO_BET") return "NO_BET";
  return "UNAVAILABLE";
}

function normalizeCandidate(value: unknown): OfficialBettingCandidate | null {
  if (!isObject(value)) return null;
  return {
    raceKey: stringOrNull(value.race_key),
    raceLabel: stringOrNull(value.race_label) ?? stringOrNull(value.race_name),
    betType: stringOrNull(value.bet_type),
    horseName: stringOrNull(value.horse_name) ?? stringOrNull(value.target_horse),
    calibratedProbability: normalizeMetric(value.calibrated_probability),
    marketOdds: normalizeMetric(value.market_odds),
    expectedReturn: normalizeMetric(value.expected_return),
    edge: normalizeMetric(value.edge),
    decision: normalizeDecision(value.decision ?? value.status),
    reason: stringOrNull(value.reason) ?? stringOrNull(value.message),
  };
}

/** Fixed read-only endpoint. `date` always comes from canonical available-dates. */
export async function fetchOfficialBettingCandidates(): Promise<FeatureResult<BettingCandidatesPayload>> {
  try {
    const dates = await fetchAvailablePredictionDates();
    const date = dates.latest_prediction_date;
    if (!date) return { state: "UNAVAILABLE", data: null, message: "正本の最新予測日を取得できません。", detail: null };
    const raw = await getJson<unknown>(`/api/betting-candidates?date=${encodeURIComponent(date)}`);
    if (!isObject(raw)) return { state: "UNAVAILABLE", data: null, message: defaultMessage("UNAVAILABLE"), detail: "レスポンス形式を検証できません。" };
    const state = normalizeState(raw.status);
    const decisions = Array.isArray(raw.decisions) ? raw.decisions.map(normalizeCandidate).filter((item): item is OfficialBettingCandidate => item !== null) : [];
    const counts = isObject(raw.counts) ? Object.fromEntries(Object.entries(raw.counts).map(([key, value]) => [key, finiteOrNull(value)])) : {};
    const payload = { raceDate: stringOrNull(raw.race_date) ?? date, entitlement: normalizeEntitlement(raw.entitlement), counts, decisions };
    return { state, data: payload, message: stringOrNull(raw.message) ?? defaultMessage(state), detail: stringOrNull(raw.detail) };
  } catch (error) {
    return featureError(error);
  }
}

function normalizeModel(value: unknown): ModelComparisonRow | null {
  if (!isObject(value)) return null;
  const modelId = stringOrNull(value.model_id);
  if (!modelId) return null;
  const period = isObject(value.period) ? { start: stringOrNull(value.period.start), end: stringOrNull(value.period.end), range: stringOrNull(value.period.range) } : null;
  return {
    modelId,
    modelStage: stringOrNull(value.model_stage),
    evaluationMode: stringOrNull(value.evaluation_mode),
    sampleStatus: normalizeState(value.sample_status),
    period,
    predictionCount: normalizeMetric(value.prediction_count),
    confirmedCount: normalizeMetric(value.confirmed_count),
    top1HitRate: normalizeMetric(value.top1_hit_rate),
    top3HitRate: normalizeMetric(value.top3_hit_rate),
    winnerMrr: normalizeMetric(value.winner_mrr),
    ndcgAt3: normalizeMetric(value.ndcg_at_3),
    simulatedWinRoi: normalizeMetric(value.win_roi),
    simulatedPlaceRoi: normalizeMetric(value.place_roi),
    rankResidual: normalizeMetric(value.rank_residual),
    marginSeconds: normalizeMetric(value.margin_seconds),
  };
}

/** Fixed read-only endpoint. Metrics retain their own canonical status/value pair. */
export async function fetchModelComparison(): Promise<FeatureResult<ModelComparisonRow[]>> {
  try {
    const raw = await getJson<unknown>("/api/analysis/model-comparison");
    if (!isObject(raw) || !Array.isArray(raw.models)) return { state: "UNAVAILABLE", data: null, message: defaultMessage("UNAVAILABLE"), detail: "models配列を検証できません。" };
    const rows = raw.models.map(normalizeModel).filter((item): item is ModelComparisonRow => item !== null);
    if (!rows.length) return { state: "EMPTY", data: [], message: defaultMessage("EMPTY"), detail: null };
    return { state: "AVAILABLE", data: rows, message: defaultMessage("AVAILABLE"), detail: null };
  } catch (error) {
    return featureError(error);
  }
}

export async function fetchModelDetail(modelId: string): Promise<FeatureResult<ModelDetailPayload>> {
  try {
    const raw = await getJson<unknown>(`/api/analysis/models/${encodeURIComponent(modelId)}/detail`);
    if (!isObject(raw)) return { state: "UNAVAILABLE", data: null, message: defaultMessage("UNAVAILABLE"), detail: "レスポンス形式を検証できません。" };
    const entitlement = normalizeEntitlement(raw.entitlement);
    const state = entitlement.locked ? "MEMBER_LOCKED" : normalizeState(raw.sample_status);
    return { state, data: { modelId: stringOrNull(raw.model_id), entitlement, sampleStatus: raw.sample_status === null ? null : normalizeState(raw.sample_status) }, message: entitlement.locked ? "モデル詳細はMEMBER限定です。" : defaultMessage(state), detail: null };
  } catch (error) {
    return featureError(error);
  }
}

export async function fetchFreeRace(): Promise<FeatureResult<FreeRacePayload>> {
  try {
    const raw = await getJson<unknown>("/api/lab/free-race");
    if (!isObject(raw)) return { state: "UNAVAILABLE", data: null, message: defaultMessage("UNAVAILABLE"), detail: "レスポンス形式を検証できません。" };
    const state = normalizeState(raw.status);
    return { state, data: { race: raw.race ?? null, reasonCode: stringOrNull(raw.reason_code) }, message: stringOrNull(raw.message) ?? defaultMessage(state), detail: stringOrNull(raw.detail) };
  } catch (error) {
    return featureError(error);
  }
}

export function metricText(metric: CanonicalMetric, digits = 1, asPercent = false): string {
  if (metric.state !== "AVAILABLE" || metric.value === null) return featureStateLabel(metric.state);
  const value = asPercent ? (metric.value <= 1 ? metric.value * 100 : metric.value) : metric.value;
  return `${value.toFixed(digits)}${asPercent ? "%" : ""}`;
}
