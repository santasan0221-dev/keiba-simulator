// Campaign (UTM) handling for the anonymous public-beta analytics.
//
// Contract (docs/public-beta-analytics.md, D5 privacy-first):
//  - Only a FIXED list of campaign ids is ever read or reported. Anything else
//    is dropped -- raw utm_* values, utm_content (dates / race keys), referrers
//    and URLs are never stored or sent.
//  - The only accepted source is "x".
//  - Absolute public URLs are NEVER written in source. The canonical public
//    URL comes from the single build variable KEIBA_TRACE_BASE_URL (exposed to
//    the client through vite's envPrefix "KEIBA_TRACE_").

export const CAMPAIGN_IDS = [
  "morning",
  "compare",
  "agree",
  "split",
  "prerace",
  "result",
  "daily",
  "weekly",
  "monthly",
  "research",
  "simulator",
  "edu",
  "profile",
  "pinned",
] as const;

export type CampaignId = (typeof CAMPAIGN_IDS)[number];
export const CAMPAIGN_SOURCE = "x" as const;
export type CampaignVisit = { source: typeof CAMPAIGN_SOURCE; campaign: CampaignId };

const isCampaignId = (value: string): value is CampaignId => (CAMPAIGN_IDS as readonly string[]).includes(value);

/**
 * Reads a campaign visit out of a location.search string. Returns null unless
 * utm_source is exactly "x" and utm_campaign is one of CAMPAIGN_IDS.
 * utm_medium / utm_content / utm_term and every other parameter are ignored.
 */
export function parseCampaignVisit(search: string): CampaignVisit | null {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search);
  } catch {
    return null;
  }
  const source = params.get("utm_source")?.trim().toLowerCase();
  const campaign = params.get("utm_campaign")?.trim().toLowerCase();
  if (source !== CAMPAIGN_SOURCE || !campaign || !isCampaignId(campaign)) return null;
  return { source: CAMPAIGN_SOURCE, campaign };
}

/**
 * The canonical public base URL (no trailing slash), or null when it is not
 * configured / not a plain https origin+path. Reads KEIBA_TRACE_BASE_URL only.
 */
export function getTraceBaseUrl(raw: unknown = import.meta.env.KEIBA_TRACE_BASE_URL): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash) return null;
  return `${parsed.origin}${parsed.pathname.replace(/\/+$/, "")}`;
}

/**
 * Builds a campaign link for a site path, e.g. for social-post tooling.
 * Returns null when the base URL is unset or the path / campaign is invalid,
 * so a missing configuration can never produce a hard-coded or malformed URL.
 */
export function buildCampaignUrl(
  path: string,
  campaign: CampaignId,
  baseUrl: string | null = getTraceBaseUrl(),
): string | null {
  if (!baseUrl) return null;
  if (!isCampaignId(campaign)) return null;
  if (!path.startsWith("/") || path.startsWith("//") || /[?#\s]/.test(path)) return null;
  const query = `utm_source=${CAMPAIGN_SOURCE}&utm_medium=social&utm_campaign=${campaign}`;
  return `${baseUrl}${path === "/" ? "/" : path}?${query}`;
}
