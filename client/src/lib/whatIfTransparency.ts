export type WhatIfProbabilityRow = {
  no: number;
  name: string;
  winRate: number;
};

export type WhatIfDistributionStatus =
  | "NORMAL"
  | "CONCENTRATED"
  | "EXTREME_CONCENTRATION"
  | "INVALID";

export type WhatIfDistributionSummary = {
  status: WhatIfDistributionStatus;
  reason: string | null;
  probabilitySum: number | null;
  runnerCount: number;
  top1Probability: number | null;
  top3Probability: number | null;
  normalizedEntropy: number | null;
  effectiveFieldSize: number | null;
};

export function formatWhatIfReferenceProbability(probabilityPercent: number): string {
  if (!Number.isFinite(probabilityPercent) || probabilityPercent < 0) return "表示不可";
  if (probabilityPercent > 0 && probabilityPercent < 0.1) return "<0.1%";
  return `${probabilityPercent.toFixed(1)}%`;
}

export function getWhatIfDistributionSummary(rows: WhatIfProbabilityRow[]): WhatIfDistributionSummary {
  if (rows.length < 2) {
    return invalidSummary(rows.length, "出走馬数が不足しています");
  }
  if (rows.some((row) => !Number.isFinite(row.winRate) || row.winRate < 0)) {
    return invalidSummary(rows.length, "確率に欠損または負値があります");
  }

  const probabilitySum = rows.reduce((total, row) => total + row.winRate, 0);
  if (Math.abs(probabilitySum - 100) > 0.05) {
    return invalidSummary(rows.length, `確率和が100%と一致しません（${probabilitySum.toFixed(2)}%）`, probabilitySum);
  }

  const probabilities = rows.map((row) => row.winRate / 100).sort((a, b) => b - a);
  const entropy = -probabilities.reduce((total, probability) => probability > 0 ? total + probability * Math.log(probability) : total, 0);
  const normalizedEntropy = entropy / Math.log(rows.length);
  const top1Probability = probabilities[0] * 100;
  const top3Probability = probabilities.slice(0, 3).reduce((total, probability) => total + probability, 0) * 100;
  const status: WhatIfDistributionStatus = top1Probability >= 50 || normalizedEntropy < 0.6
    ? "EXTREME_CONCENTRATION"
    : top1Probability >= 35 || normalizedEntropy < 0.75
      ? "CONCENTRATED"
      : "NORMAL";

  return {
    status,
    reason: status === "EXTREME_CONCENTRATION" ? "WHAT-IF分布が極端に集中しています" : null,
    probabilitySum,
    runnerCount: rows.length,
    top1Probability,
    top3Probability,
    normalizedEntropy,
    effectiveFieldSize: Math.exp(entropy),
  };
}

function invalidSummary(runnerCount: number, reason: string, probabilitySum: number | null = null): WhatIfDistributionSummary {
  return {
    status: "INVALID",
    reason,
    probabilitySum,
    runnerCount,
    top1Probability: null,
    top3Probability: null,
    normalizedEntropy: null,
    effectiveFieldSize: null,
  };
}
