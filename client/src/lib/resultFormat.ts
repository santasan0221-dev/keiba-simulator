export function formatSpecialStatuses(value: unknown): string {
  if (!Array.isArray(value)) return "";
  const labels: Record<string, string> = {
    CANCELLED: "取消",
    EXCLUDED: "除外",
    DID_NOT_FINISH: "競走中止",
    RACE_STOPPED: "レース中止",
    DISQUALIFIED: "失格",
  };
  return value
    .map(item => {
      if (!item || typeof item !== "object") return "状態確認中";
      const status = typeof item.status === "string" ? item.status : "";
      const no =
        Number.isInteger(item.horse_no) && item.horse_no > 0
          ? `#${item.horse_no} `
          : "";
      return no + (labels[status] ?? "状態確認中");
    })
    .join(" / ");
}
export function formatCoverageRatio(value: unknown): string | null {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1
    ? `${Math.round(value * 1000) / 10}%`
    : null;
}
