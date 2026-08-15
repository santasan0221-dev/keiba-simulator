import type { LabHorse, LabRaceResult } from "@/lib/singlePickAi";

type PayoutKind = "win" | "place";

export type RankAccuracySummary = {
  available: boolean;
  compared: Array<{ aiRank: number; horseNo: number | null; horseName: string; officialFinish: number; delta: number }>;
  exactMatches: number;
  meanAbsoluteRankError: number | null;
  topPickFinish: number | null;
  topPickDataStatus: "available" | "missing";
};

export type VirtualRoiRow = {
  kind: PayoutKind;
  label: string;
  stake: number;
  payout: number | null;
  returned: number | null;
  returnRate: number | null;
  reason: string | null;
};

export type VirtualRoiSummary = { available: boolean; rows: VirtualRoiRow[]; reason: string | null };

const horseNumber = (value: unknown): number | null => {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
};

const payoutNumber = (value: unknown): number | null => {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value.replace(/[￥¥,]/g, "")) : Number.NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

function findPayout(raw: unknown, horseNo: number): number | null {
  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (Array.isArray(entry) && horseNumber(entry[0]) === horseNo) {
        const value = payoutNumber(entry[1]);
        if (value !== null) return value;
      }
      if (entry && typeof entry === "object") {
        const row = entry as Record<string, unknown>;
        const rowHorseNo = horseNumber(row.horse_no ?? row.horseNo ?? row.no ?? row.number);
        if (rowHorseNo === horseNo) {
          const value = payoutNumber(row.payout ?? row.amount ?? row.return ?? row.value ?? row.yen ?? row.pay);
          if (value !== null) return value;
        }
      }
    }
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const direct = payoutNumber(record[String(horseNo)]);
  if (direct !== null) return direct;
  const rowHorseNo = horseNumber(record.horse_no ?? record.horseNo ?? record.no ?? record.number);
  if (rowHorseNo === horseNo) return payoutNumber(record.payout ?? record.amount ?? record.return ?? record.value ?? record.yen ?? record.pay);
  return findPayout(record.rows ?? record.items ?? record.payouts ?? [], horseNo);
}

export function getRankAccuracySummary(horses: LabHorse[], result: LabRaceResult | null | undefined): RankAccuracySummary {
  if (!result || result.status !== "CONFIRMED") return { available: false, compared: [], exactMatches: 0, meanAbsoluteRankError: null, topPickFinish: null, topPickDataStatus: "missing" };
  const officialByHorse = new Map(result.official_order?.map((entry) => [entry.horse_no, entry.finish]) ?? []);
  const compared = horses
    .filter((horse) => typeof horse.model.ai_rank === "number" && typeof horse.no === "number" && officialByHorse.has(horse.no))
    .map((horse) => {
      const aiRank = horse.model.ai_rank as number;
      const officialFinish = officialByHorse.get(horse.no as number) as number;
      return { aiRank, horseNo: horse.no, horseName: horse.name ?? `#${horse.no}`, officialFinish, delta: officialFinish - aiRank };
    })
    .sort((left, right) => left.aiRank - right.aiRank);
  const topPickFinish = result.ai_pick?.finish ?? null;
  return {
    available: true,
    compared,
    exactMatches: compared.filter((entry) => entry.delta === 0).length,
    meanAbsoluteRankError: compared.length ? compared.reduce((sum, entry) => sum + Math.abs(entry.delta), 0) / compared.length : null,
    topPickFinish,
    topPickDataStatus: topPickFinish === null ? "missing" : "available",
  };
}

function payoutRow(kind: PayoutKind, result: LabRaceResult, stake: number): VirtualRoiRow {
  const pick = result.ai_pick;
  const label = kind === "win" ? "単勝（AI本命）" : "複勝（AI本命）";
  const qualified = kind === "win" ? pick?.won : pick?.placed;
  if (!pick || qualified === null || qualified === undefined) return { kind, label, stake, payout: null, returned: null, returnRate: null, reason: "AI本命の結果データなし" };
  const rawPayout = result.payouts?.[kind];
  if (rawPayout === undefined || rawPayout === null) return { kind, label, stake, payout: null, returned: null, returnRate: null, reason: "払戻情報なし" };
  if (!qualified) return { kind, label, stake, payout: 0, returned: 0, returnRate: 0, reason: null };
  const payout = findPayout(rawPayout, pick.horse_no);
  if (payout === null) return { kind, label, stake, payout: null, returned: null, returnRate: null, reason: "対象馬の払戻金を特定できません" };
  return { kind, label, stake, payout, returned: payout, returnRate: (payout / stake) * 100, reason: null };
}

export function getVirtualRoiSummary(result: LabRaceResult | null | undefined, stake = 100): VirtualRoiSummary {
  if (!result || result.status !== "CONFIRMED") return { available: false, rows: [], reason: "結果はまだ確定していません" };
  const rows = [payoutRow("win", result, stake), payoutRow("place", result, stake)];
  return { available: rows.some((row) => row.returnRate !== null), rows, reason: rows.every((row) => row.returnRate === null) ? "確定払戻から算出できるAI本命の回収率はありません" : null };
}
