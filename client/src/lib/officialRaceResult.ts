import type { LabAiPickResult, LabRaceResult } from "@/lib/singlePickAi";

export type AiPickOutcome = "pending" | "hit" | "placed" | "outside" | "missing_finish" | "unknown";

export function getAiPickOutcome(result: LabRaceResult | null | undefined): AiPickOutcome {
  if (!result) return "pending";
  const pick = result.ai_pick;
  if (!pick || pick.finish === null) return "missing_finish";
  if (pick.won === true) return "hit";
  if (pick.placed === true && pick.won === false) return "placed";
  if (pick.won === false && pick.placed === false) return "outside";
  return "unknown";
}

export function aiPickOutcomeLabel(result: LabRaceResult | null | undefined): string {
  const outcome = getAiPickOutcome(result);
  if (outcome === "pending") return "結果はまだ確定していません";
  if (outcome === "hit") return "的中（1着）";
  if (outcome === "placed") return "複勝圏内（3着以内）";
  if (outcome === "outside") return "見送り（圏外）";
  if (outcome === "missing_finish") return "本命の着順データなし";
  return "本命結果は未確認";
}

export function aiPickFinishLabel(pick: LabAiPickResult | null | undefined): string {
  if (!pick) return "本命情報なし";
  return pick.finish === null ? "着順データなし" : `${pick.finish}着`;
}

export function payoutLines(result: LabRaceResult | null | undefined): string[] {
  if (!result?.payouts || !Object.keys(result.payouts).length) return [];
  const labels: Record<string, string> = { win: "単勝", place: "複勝" };
  const valueOf = (value: Record<string, unknown>) => value.payout ?? value.amount ?? value.return ?? value.value ?? value.yen;
  const format = (value: unknown): string => {
    if (typeof value === "string" || typeof value === "number") return String(value);
    if (Array.isArray(value)) return value.map((entry) => format(entry)).filter(Boolean).join(" / ") || "払戻形式未対応";
    if (value && typeof value === "object") {
      const row = value as Record<string, unknown>;
      const horseNo = row.horse_no ?? row.horseNo ?? row.no ?? row.number;
      const amount = valueOf(row);
      if ((typeof horseNo === "number" || typeof horseNo === "string") && (typeof amount === "number" || typeof amount === "string")) return `#${horseNo} ¥${amount}`;
      return "払戻形式未対応";
    }
    return "払戻形式未対応";
  };
  return Object.entries(result.payouts).map(([kind, value]) => `${labels[kind] ?? kind}: ${format(value)}`);
}

export function getConfirmedResultSummary(result: LabRaceResult | null | undefined) {
  if (!result || result.status !== "CONFIRMED") return null;
  return {
    outcome: aiPickOutcomeLabel(result),
    pick: result.ai_pick ? `AI本命 ${result.ai_pick.horse_name} · ${aiPickFinishLabel(result.ai_pick)}` : "AI本命情報なし",
    order: result.official_order?.slice(0, 5).map((entry) => `${entry.finish}着 ${entry.horse_name}`).join(" / ") || "公式着順データなし",
  };
}
