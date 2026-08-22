export type AccessTier = "FREE" | "MEMBER_PREPARING";

export const FREE_PUBLICATION_RULE_NOTICE = {
  label: "事前固定の自動選定rule",
  description: "FREEの発走前公開対象は、事前固定された自動選定ruleの結果で決まります。結果確定後に対象を入れ替えたり、事後的に選び直したりしません。",
  sourceState: "RULE SOURCE / 未接続",
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
