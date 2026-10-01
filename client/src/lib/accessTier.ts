export type AccessTier = "FREE" | "MEMBER_PREPARING";

// FREE scope (decision D1): the publication ◎, AI TOP, MARKET TOP, the buy
// verdict and the basic results are free for EVERY race. There is no
// "one free race per week" selection any more; paid features, when they exist,
// sit on top of this (deeper analysis, data), never in place of it.
export const FREE_SCOPE_NOTICE = {
  label: "全レース無料",
  headline: "◎・AI TOP・MARKET TOP・基本結果は、全レース無料。",
  description: "公開◎、AI評価1位、市場評価1位、買い判定、基本の結果と履歴は、すべてのレースで無料で確認できます。有料機能は準備中で、この範囲は変わりません。",
} as const;

export const ACCESS_TIER_NOTICE = {
  tier: "FREE" as AccessTier,
  memberStatus: "MEMBER機能 準備中",
  accessCodeStatus: "アクセスコード照合 / 認証未接続",
} as const;

export function getSafeExternalUrl(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export const noteLinks = {
  membership: getSafeExternalUrl(import.meta.env.VITE_NOTE_MEMBERSHIP_URL),
  weekendPass: getSafeExternalUrl(import.meta.env.VITE_NOTE_WEEKEND_PASS_URL),
} as const;
