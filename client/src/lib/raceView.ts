/**
 * Display view-model for the race experience (Home command center, race
 * detail, history). Pure functions over the read-only API payloads.
 *
 * Contracts this module enforces for every screen:
 * - ◎ belongs to the publication honmei (saved final_mark) only. AI評価1位
 *   (ai_top) and 市場評価1位 never carry a mark, even when they are the same
 *   horse as each other or ranked first in a table.
 * - AI TOP / MARKET TOP come from the API as published. Nothing here derives
 *   them from ranks, odds or popularity when the API does not publish them.
 * - BUY / WATCH / PASS / UNKNOWN mirror scripts/honmei_ranking.py
 *   build_bet_decision. UNKNOWN is never folded into PASS.
 * - Missing values stay null. Never 0.
 */
import type {
  LabHorse,
  LabPredictionDecision,
  LabBetDecision,
  LabRace,
  LabRaceListItem,
  LabRaceResult,
  LabResultListItem,
} from "@/lib/singlePickAi";
import { buildHorseMarketRows } from "@/lib/raceMarketTable";

const HONMEI = "◎";
const BET_EQUIVALENT = new Set(["BET", "SENBATSU", "NORMAL"]);
const PUBLICATION_MARKS = new Set(["◎", "○", "▲", "△", "☆"]);

const probability = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1 ? value : null;
const positive = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
const horseNo = (value: unknown): number | null =>
  typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;

export type PickKind = "HONMEI" | "AI_TOP" | "MARKET_TOP";

export type PickCard = {
  kind: PickKind;
  available: boolean;
  /** "◎" on the publication honmei only; always null for AI_TOP / MARKET_TOP. */
  mark: typeof HONMEI | null;
  horseNo: number | null;
  horseName: string | null;
  /** Win probability from the card's own source (AI for HONMEI/AI_TOP, market for MARKET_TOP). */
  probability: number | null;
  odds: number | null;
  reason: string | null;
  caution: string | null;
};

const unavailable = (kind: PickKind, reason: string): PickCard => ({
  kind, available: false, mark: null, horseNo: null, horseName: null, probability: null, odds: null, reason, caution: null,
});

function horseByNo(race: LabRace, no: number | null): LabHorse | undefined {
  return no === null ? undefined : race.horses.find(horse => horse.no === no);
}

function reasonText(code: string | null | undefined): string {
  if (!code) return "APIが公開していません";
  if (code.startsWith("ORGANIZATION_NOT_ENABLED")) return "この主催はAI評価1位の対象外です";
  if (code.startsWith("MULTIPLE_PUBLICATION_HONMEI")) return "◎が重複しているため表示しません";
  if (code === "NO_PUBLICATION_HONMEI") return "公開◎がありません";
  if (code.startsWith("WIN_PROBABILITY")) return "勝率データが揃っていません";
  if (code === "NOT_PUBLISHED" || code === "MARKET_UNAVAILABLE") return "発走前オッズが未公開です";
  return "取得できません";
}

export function publicationHonmei(race: LabRace): PickCard {
  const api = race.honmei;
  let no: number | null = null;
  if (api) {
    if (api.status !== "AVAILABLE" || horseNo(api.horse_no) === null) return unavailable("HONMEI", reasonText(api.reason ?? "NO_PUBLICATION_HONMEI"));
    no = api.horse_no;
  } else {
    // Older API: the publication ◎ is exactly one saved final_mark ◎.
    const rows = race.horses.filter(horse => horse.display?.final_mark === HONMEI);
    if (rows.length !== 1 || horseNo(rows[0].no) === null) return unavailable("HONMEI", reasonText(rows.length > 1 ? "MULTIPLE_PUBLICATION_HONMEI" : "NO_PUBLICATION_HONMEI"));
    no = rows[0].no;
  }
  const horse = horseByNo(race, no);
  return {
    kind: "HONMEI", available: true, mark: HONMEI, horseNo: no,
    horseName: api?.horse_name ?? horse?.name ?? null,
    probability: probability(api?.win_probability) ?? probability(horse?.model.win_probability),
    odds: positive(horse?.market.win_odds), reason: null,
    caution: api?.caution?.label ?? null,
  };
}

export function aiTop(race: LabRace): PickCard {
  const api = race.ai_top;
  if (!api) return unavailable("AI_TOP", reasonText(null));
  if (api.status !== "AVAILABLE" || horseNo(api.horse_no) === null) return unavailable("AI_TOP", reasonText(api.reason));
  const horse = horseByNo(race, api.horse_no);
  return { kind: "AI_TOP", available: true, mark: null, horseNo: api.horse_no, horseName: api.horse_name ?? horse?.name ?? null, probability: probability(api.win_probability), odds: positive(horse?.market.win_odds), reason: null, caution: null };
}

export function marketTop(race: LabRace): PickCard {
  const source = race.honmei_view?.sources?.market;
  if (!source) return unavailable("MARKET_TOP", reasonText(null));
  if (source.status !== "AVAILABLE" || horseNo(source.horse_no) === null) return unavailable("MARKET_TOP", reasonText(source.status));
  const horse = horseByNo(race, source.horse_no);
  return { kind: "MARKET_TOP", available: true, mark: null, horseNo: source.horse_no, horseName: horse?.name ?? null, probability: probability(source.win_probability), odds: positive(horse?.market.win_odds), reason: null, caution: null };
}

export function pickCards(race: LabRace) {
  return { honmei: publicationHonmei(race), aiTop: aiTop(race), marketTop: marketTop(race) };
}

// ---------------------------------------------------------------- verdict

export type Verdict = "BUY" | "WATCH" | "PASS" | "UNKNOWN";

export function verdictOf(source: { bet_decision?: LabBetDecision | null; decision?: LabPredictionDecision | null }): Verdict {
  const api = source.bet_decision?.status;
  if (api === "BUY" || api === "WATCH" || api === "PASS" || api === "UNKNOWN") return api;
  const decision = source.decision;
  if (!decision) return "UNKNOWN";
  if (decision.status === "BET") return "BUY";
  if (decision.status === "NO_BET") return "PASS";
  const raw = String(decision.raw_status ?? "").toUpperCase();
  const gate = String(decision.gate_status ?? "").toLowerCase();
  if (BET_EQUIVALENT.has(raw) && gate !== "selected") return "WATCH";
  return "UNKNOWN";
}

export const VERDICT_COPY: Record<Verdict, { label: string; ja: string; explanation: string }> = {
  BUY: { label: "BUY", ja: "購入条件を通過", explanation: "保存済みの正式選抜ゲートを通過したレースです。" },
  WATCH: { label: "WATCH", ja: "注視", explanation: "事前判定は購入相当ですが、最終ゲートで選抜されていません。" },
  PASS: { label: "PASS", ja: "見送り", explanation: "購入条件に達していません。◎の評価とは別の判断です。" },
  UNKNOWN: { label: "UNKNOWN", ja: "判定待ち", explanation: "判定データを取得できません。見送りとしては扱いません。" },
};

// -------------------------------------------------------------- agreement

export type AgreementState = "AGREEMENT" | "PARTIAL" | "DISAGREE" | "MARKET_UNAVAILABLE" | "AI_UNAVAILABLE" | "INSUFFICIENT_DATA";

export const AGREEMENT_COPY: Record<AgreementState, { label: string; explanation: string }> = {
  AGREEMENT: { label: "AGREEMENT", explanation: "公開◎・AI評価1位・市場評価1位が同じ馬です。" },
  PARTIAL: { label: "PARTIAL", explanation: "一部だけが同じ馬を1位に評価しています。" },
  DISAGREE: { label: "DISAGREE", explanation: "公開◎・AI・市場の1位がすべて異なります。" },
  MARKET_UNAVAILABLE: { label: "MARKET UNAVAILABLE", explanation: "発走前の市場評価が未公開のため比較できません。" },
  AI_UNAVAILABLE: { label: "AI UNAVAILABLE", explanation: "AI評価1位が公開されていないため比較できません。" },
  INSUFFICIENT_DATA: { label: "INSUFFICIENT DATA", explanation: "公開◎未取得のため比較できません。" },
};

/**
 * AGREEMENT / PARTIAL / DISAGREE only when all three sources (publication ◎,
 * AI評価1位, 市場評価1位) are published. Any missing source yields its own
 * unavailable state; no comparison with a missing source is ever asserted,
 * and nothing is substituted for the missing one.
 */
export function agreementOf(race: LabRace) {
  const { honmei, aiTop: ai, marketTop: market } = pickCards(race);
  const pair = (a: PickCard, b: PickCard) => (a.available && b.available ? a.horseNo === b.horseNo : null);
  const flags = { honmeiAi: pair(honmei, ai), honmeiMarket: pair(honmei, market), aiMarket: pair(ai, market) };
  let state: AgreementState;
  if (!market.available) state = "MARKET_UNAVAILABLE";
  else if (!ai.available) state = "AI_UNAVAILABLE";
  else if (!honmei.available) state = "INSUFFICIENT_DATA";
  else {
    const distinct = new Set([honmei.horseNo, ai.horseNo, market.horseNo]).size;
    state = distinct === 1 ? "AGREEMENT" : distinct === 3 ? "DISAGREE" : "PARTIAL";
  }
  return { state, ...flags };
}

// ---------------------------------------------------------------- ranking

export type RankingRow = {
  no: number | null;
  name: string | null;
  /** Publication mark; "◎" only on the publication honmei. */
  mark: string | null;
  isHonmei: boolean;
  isAiTop: boolean;
  isMarketTop: boolean;
  aiProbability: number | null;
  top3Probability: number | null;
  marketProbability: number | null;
  odds: number | null;
  aiRank: number | null;
  marketRank: number | null;
  style: string | null;
  cautions: string[];
  notes: string[];
};

export function rankingRows(race: LabRace): RankingRow[] {
  const { honmei, aiTop: ai, marketTop: market } = pickCards(race);
  const ranked = race.honmei_view?.ranking?.status === "OK" ? race.honmei_view.ranking.ranked : [];
  const aiRankByNo = new Map(ranked.map(entry => [entry.horse_no, entry.rank]));
  const horseByNumber = new Map(race.horses.map(horse => [horse.no, horse]));
  const rows = buildHorseMarketRows(race).map((row): RankingRow => {
    const horse = horseByNumber.get(row.no);
    const isHonmei = honmei.available && row.no === honmei.horseNo;
    const saved = row.mark && PUBLICATION_MARKS.has(row.mark) ? row.mark : null;
    const cautions = [...(horse?.display?.anxiety_tags ?? [])];
    if (isHonmei && honmei.caution) cautions.unshift(honmei.caution);
    const notes = [...(horse?.display?.plus_tags ?? [])];
    return {
      no: row.no, name: row.name,
      mark: isHonmei ? HONMEI : saved === HONMEI ? null : saved,
      isHonmei,
      isAiTop: ai.available && row.no === ai.horseNo,
      isMarketTop: market.available && row.no === market.horseNo,
      aiProbability: row.winProbability,
      top3Probability: row.top3Probability,
      marketProbability: probability(horse?.model.market_win_probability) ?? row.marketProbability,
      odds: row.winOdds,
      aiRank: row.no === null ? null : aiRankByNo.get(row.no) ?? null,
      marketRank: row.popularity,
      style: horse?.style && horse.style !== "不明" ? horse.style : null,
      cautions,
      notes,
    };
  });
  if (aiRankByNo.size) rows.sort((a, b) => (a.aiRank ?? Infinity) - (b.aiRank ?? Infinity));
  return rows;
}

// ------------------------------------------------------------ list / home

export function listPicks(row: LabRaceListItem) {
  const api = row.honmei;
  let honmei: PickCard;
  if (api) {
    honmei = api.status === "AVAILABLE" && horseNo(api.horse_no) !== null
      ? { kind: "HONMEI", available: true, mark: HONMEI, horseNo: api.horse_no, horseName: api.horse_name, probability: probability(api.win_probability), odds: null, reason: null, caution: api.caution?.label ?? null }
      : unavailable("HONMEI", reasonText(api.reason));
  } else {
    const pick = row.top_pick;
    honmei = pick?.final_mark === HONMEI && horseNo(pick.no) !== null
      ? { kind: "HONMEI", available: true, mark: HONMEI, horseNo: pick.no, horseName: pick.name, probability: null, odds: null, reason: null, caution: null }
      : unavailable("HONMEI", reasonText("NO_PUBLICATION_HONMEI"));
  }
  const top = row.ai_top;
  const ai: PickCard = top && top.status === "AVAILABLE" && horseNo(top.horse_no) !== null
    ? { kind: "AI_TOP", available: true, mark: null, horseNo: top.horse_no, horseName: top.horse_name, probability: probability(top.win_probability), odds: null, reason: null, caution: null }
    : unavailable("AI_TOP", reasonText(top?.reason));
  return { honmei, aiTop: ai };
}

export function countdownLabel(startIso: string | null | undefined, nowMs: number): string {
  const start = startIso ? Date.parse(startIso) : NaN;
  if (!Number.isFinite(start)) return "発走時刻未取得";
  const minutes = Math.ceil((start - nowMs) / 60_000);
  if (minutes <= 0) return "発走済み";
  if (minutes < 60) return `発走まで ${minutes}分`;
  return `発走まで ${Math.floor(minutes / 60)}時間${minutes % 60}分`;
}

export function startTime(iso: string | null | undefined): string {
  const value = iso ? new Date(iso) : null;
  return value && !Number.isNaN(value.getTime())
    ? value.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tokyo" })
    : "—";
}

/** The next race not yet started, or null. Never guesses a missing start time. */
export function nextRace<T extends { scheduled_start_at: string | null }>(races: T[], nowMs: number): T | null {
  return races
    .filter(race => race.scheduled_start_at && Date.parse(race.scheduled_start_at) > nowMs)
    .sort((a, b) => Date.parse(a.scheduled_start_at!) - Date.parse(b.scheduled_start_at!))[0] ?? null;
}

// ---------------------------------------------------------------- results

const SPECIAL_LABELS: Record<string, string> = { CANCELLED: "取消", EXCLUDED: "除外", DID_NOT_FINISH: "競走中止", DISQUALIFIED: "失格", RACE_STOPPED: "レース中止" };

/** Finish of a horse from the detail's official order (top 5). Never guessed. */
export function finishOfHorse(no: number | null, result: LabRaceResult | null | undefined, special: { horse_no: number | null; status: string }[] | null): string {
  if (no === null) return "対象なし";
  const status = special?.find(entry => entry.horse_no === no)?.status;
  if (status) return SPECIAL_LABELS[status] ?? "状態確認中";
  if (!result) return "未確定";
  const entry = result.official_order?.find(row => row.horse_no === no);
  if (entry) return `${entry.finish}着`;
  return (result.official_order?.length ?? 0) >= 5 ? "6着以下" : "取得不能";
}

export function uniqueHonmei(row: LabResultListItem) {
  const picks = row.predicted_top3?.filter(entry => entry.mark === HONMEI) ?? [];
  return picks.length === 1 ? picks[0] : null;
}

export function isConfirmed(row: LabResultListItem) {
  return row.result_status === "CONFIRMED" || row.result_status === "DEAD_HEAT";
}

export function honmeiAccuracy(rows: LabResultListItem[]) {
  const scored = rows.filter(row => isConfirmed(row) && uniqueHonmei(row) && horseNo(row.ai_pick_finish) !== null);
  const wins = scored.filter(row => row.ai_pick_finish === 1).length;
  const top3 = scored.filter(row => (row.ai_pick_finish ?? 99) <= 3).length;
  const coverages = rows.filter(isConfirmed).map(row => probability(row.top3_coverage)).filter((value): value is number => value !== null);
  return {
    confirmed: scored.length,
    wins,
    top3,
    winRate: scored.length ? wins / scored.length : null,
    top3Rate: scored.length ? top3 / scored.length : null,
    meanCoverage: coverages.length ? coverages.reduce((sum, value) => sum + value, 0) / coverages.length : null,
  };
}
