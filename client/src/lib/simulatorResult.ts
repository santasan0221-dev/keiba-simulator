/**
 * OFFICIAL RESULT for the simulator, built only from canonical sources:
 * the /api/lab/results row for the race (status, official top 3, ◎ finish,
 * coverage, special statuses) and the race detail's `result` block
 * (official order with names). Nothing here reads the scenario -- the
 * simulator never produces a winner, finish order or result of its own.
 *
 * PENDING and REVIEW_REQUIRED are states, not results: they never produce a
 * top 3, a finish position, or a 0.
 */
import type { LabRace, LabResultListItem } from "@/lib/singlePickAi";
import { formatCoverageRatio, formatSpecialStatuses } from "@/lib/resultFormat";
import { finishOfHorse, pickCards, uniqueHonmei } from "@/lib/raceView";

export type OfficialState = "CONFIRMED" | "PENDING" | "REVIEW_REQUIRED" | "UNAVAILABLE" | "OTHER";

export type PodiumEntry = { finish: number; horseNo: number; horseName: string | null };

export type OfficialResultView = {
  state: OfficialState;
  label: string;
  message: string;
  deadHeat: boolean;
  top3: PodiumEntry[];
  honmei: { horseNo: number | null; finish: string };
  aiTop: { horseNo: number | null; finish: string };
  marketTop: { horseNo: number | null; finish: string };
  specials: string;
  coverage: string;
};

const SPECIAL: Record<string, string> = { CANCELLED: "取消", EXCLUDED: "除外", DID_NOT_FINISH: "競走中止", DISQUALIFIED: "失格", RACE_STOPPED: "レース中止" };

function empty(state: OfficialState, label: string, message: string): OfficialResultView {
  const none = { horseNo: null, finish: "—" };
  return { state, label, message, deadHeat: false, top3: [], honmei: none, aiTop: none, marketTop: none, specials: "", coverage: "—" };
}

/**
 * @param row   the canonical results row for this race_key (undefined = not found)
 * @param race  the race detail (for names / official order / AI & market tops)
 * @param failed true when the results request itself failed
 */
export function officialResultView(row: LabResultListItem | null | undefined, race: LabRace | null, failed = false): OfficialResultView {
  if (failed) return empty("UNAVAILABLE", "RESULT UNAVAILABLE", "公式結果を取得できません。0件や着外としては扱いません。");
  if (!row) return empty("UNAVAILABLE", "RESULT UNAVAILABLE", "このレースの公式結果データが見つかりません。");
  const status = row.result_status;
  if (status === "PENDING") return empty("PENDING", "RESULT PENDING", "公式結果を確認中です。確定前の着順は表示しません。");
  if (status === "REVIEW_REQUIRED") return empty("REVIEW_REQUIRED", "REVIEW REQUIRED", "公式結果の確認が必要な状態です。確定するまで結果としては扱いません。");
  if (status !== "CONFIRMED" && status !== "DEAD_HEAT") {
    const label = status === "RACE_STOPPED" ? "RACE STOPPED" : status === "FAILED" ? "RESULT FETCH FAILED" : "RESULT UNAVAILABLE";
    return empty("OTHER", label, "確定した公式着順はありません。");
  }

  const names = new Map((race?.horses ?? []).map(horse => [horse.no, horse.name]));
  const fromDetail = (race?.result?.official_order ?? []).filter(entry => entry.finish >= 1 && entry.finish <= 3)
    .map(entry => ({ finish: entry.finish, horseNo: entry.horse_no, horseName: entry.horse_name ?? names.get(entry.horse_no) ?? null }));
  const fromRow = (row.official_top3 ?? []).map((value, index) => typeof value === "number"
    ? { finish: index + 1, horseNo: value, horseName: names.get(value) ?? null }
    : { finish: value.finish ?? index + 1, horseNo: value.horse_no ?? 0, horseName: value.horse_name ?? names.get(value.horse_no) ?? null })
    .filter(entry => entry.horseNo > 0);
  const top3 = (fromDetail.length ? fromDetail : fromRow).sort((x, y) => x.finish - y.finish || x.horseNo - y.horseNo);

  const specials = row.special_statuses ?? [];
  const honmeiPick = uniqueHonmei(row);
  const honmeiSpecial = honmeiPick ? specials.find(entry => entry.horse_no === honmeiPick.horse_no)?.status : undefined;
  const honmeiFinish = !honmeiPick ? "公開◎なし"
    : honmeiSpecial ? (SPECIAL[honmeiSpecial] ?? "状態確認中")
    : typeof row.ai_pick_finish === "number" && Number.isInteger(row.ai_pick_finish) && row.ai_pick_finish > 0 ? `${row.ai_pick_finish}着` : "取得不能";

  const cards = race ? pickCards(race) : null;
  const top = (card: ReturnType<typeof pickCards>["aiTop"] | undefined, missing: string) => card?.available
    ? { horseNo: card.horseNo, finish: finishOfHorse(card.horseNo, race?.result ?? null, specials) }
    : { horseNo: null, finish: missing };

  return {
    state: "CONFIRMED",
    label: "OFFICIAL RESULT",
    message: top3.length ? "公式確定の着順です。" : "確定済みですが、着順データを取得できません。",
    deadHeat: status === "DEAD_HEAT",
    top3,
    honmei: { horseNo: honmeiPick?.horse_no ?? null, finish: honmeiFinish },
    aiTop: top(cards?.aiTop, "対象外"),
    marketTop: top(cards?.marketTop, "市場データなし"),
    specials: formatSpecialStatuses(specials),
    coverage: formatCoverageRatio(row.top3_coverage) ?? "取得不能",
  };
}

/** Poll only while a result can still change, and only a few times. */
export function shouldPollResult(state: OfficialState, startIso: string | null | undefined, nowMs: number, polls: number, maxPolls = 12): boolean {
  if (polls >= maxPolls) return false;
  if (state !== "PENDING" && state !== "REVIEW_REQUIRED") return false;
  const start = startIso ? Date.parse(startIso) : NaN;
  return Number.isFinite(start) && nowMs >= start;
}
