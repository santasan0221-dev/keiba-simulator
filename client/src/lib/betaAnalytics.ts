import { CAMPAIGN_IDS, parseCampaignVisit } from "@/lib/campaign";

/** Fixed CTA identifiers. Nothing else can be reported as a CTA. */
export const CTA_IDS = [
  "hero_today",
  "hero_results",
  "hero_simulator",
  "featured_race",
  "featured_scenario",
  "rules_link",
  "value_strip",
] as const;
export type CtaId = (typeof CTA_IDS)[number];

export const OUTBOUND_PLACEMENTS = ["member_gate", "member_page", "weekend_pass", "access_code"] as const;
export type OutboundPlacement = (typeof OUTBOUND_PLACEMENTS)[number];

/** Simulator playback milestones (share of the scenario played), reported once per playback. */
export const SIM_MILESTONES = ["25", "50", "75"] as const;
export type SimMilestone = (typeof SIM_MILESTONES)[number];
export const SIM_CAMERA_MODES = ["TRACK", "BROADCAST", "AUTO"] as const;
export const SIM_VARIANTS = ["STANDARD", "ALT_A", "ALT_B"] as const;
/** How the official-result tab was reached: the automatic switch after the scenario, or the user's own click. */
export const SIM_RESULT_SOURCES = ["auto", "tab"] as const;

export type BetaEventName =
  | "beta_page_view"
  | "beta_race_select"
  | "beta_org_switch"
  | "beta_share"
  | "beta_return_visit"
  | "beta_member_click"
  | "beta_survey_open"
  | "beta_survey_submit"
  | "beta_cta_click"
  | "beta_outbound_click"
  | "beta_campaign_visit"
  | "beta_race_detail_view"
  | "beta_simulator_open"
  | "beta_history_view"
  | "beta_sim_playback_start"
  | "beta_sim_progress"
  | "beta_sim_last_runner_crossed"
  | "beta_sim_complete"
  | "beta_sim_replay"
  | "beta_sim_official_result_view"
  | "beta_sim_camera_change"
  | "beta_sim_variant_change";

export type BetaEvent = {
  name: BetaEventName;
  properties: Record<string, string>;
};

type UmamiClient = {
  // Umami's real tracker allows track() with no arguments to record a plain
  // pageview hit; the app also calls it with (name, properties) for custom
  // events, so both call shapes need to type-check.
  track: (name?: string, properties?: Record<string, string>) => void;
};

declare global {
  interface Window {
    umami?: UmamiClient;
    keibaBetaBeforeSend?: (type: string, payload: unknown) => Record<string, unknown> | false;
  }
}

const EVENT_PROPERTIES: Record<BetaEventName, Record<string, readonly string[]>> = {
  beta_page_view: {
    route: ["home", "race_detail", "free", "betting", "performance", "member", "history", "access_code", "simulator", "rules", "other"],
  },
  beta_race_select: {
    organization: ["JRA", "NAR"],
    source: ["catalog", "direct_open"],
  },
  beta_org_switch: {
    organization: ["JRA", "NAR"],
    source: ["catalog"],
  },
  beta_share: {
    organization: ["JRA", "NAR", "UNKNOWN"],
    method: ["native", "clipboard"],
  },
  beta_return_visit: {
    return_bucket: ["later_day"],
  },
  beta_member_click: {
    source: ["main_nav", "member_page", "free_gate", "performance_gate", "access_code"],
  },
  beta_survey_open: {},
  beta_survey_submit: {
    primary_value: ["information", "comparison", "time_saving", "decision_support", "not_sure"],
    reuse_intent: ["yes", "maybe", "no"],
    member_interest: ["yes", "depends", "no"],
  },
  // Growth P0 events. Every value is a fixed enumeration; free text, race keys,
  // dates, URLs and identifiers are structurally impossible (see sanitizeEvent).
  beta_cta_click: { cta_id: CTA_IDS },
  // Only note exists as an outbound destination today. Bookers is deliberately
  // not allowed until its terms and a link exist.
  beta_outbound_click: { target: ["note"], placement: OUTBOUND_PLACEMENTS },
  beta_campaign_visit: { source: ["x"], campaign: CAMPAIGN_IDS },
  beta_race_detail_view: {
    organization: ["JRA", "NAR", "UNKNOWN"],
    race_state: ["pre", "pending", "post"],
  },
  beta_simulator_open: { entry: ["race_link", "direct"] },
  beta_history_view: {},
  // Simulator playback. Fixed enumerations / no properties only: no race key, horse, number, date or URL.
  beta_sim_playback_start: {},
  beta_sim_progress: { milestone: SIM_MILESTONES },
  beta_sim_last_runner_crossed: {},
  beta_sim_complete: {},
  beta_sim_replay: {},
  beta_sim_official_result_view: { source: SIM_RESULT_SOURCES },
  beta_sim_camera_change: { mode: SIM_CAMERA_MODES },
  beta_sim_variant_change: { variant: SIM_VARIANTS },
};

const queuedEvents: BetaEvent[] = [];
const FIRST_VISIT_KEY = "keiba-lab:beta:first-visit-date:v1";
const RETURN_SENT_KEY = "keiba-lab:beta:return-sent-date:v1";

export function normalizeAnalyticsConfig(endpoint: string, websiteId: string) {
  const trimmedEndpoint = endpoint.trim().replace(/\/$/, "");
  const trimmedWebsiteId = websiteId.trim();
  if (!trimmedEndpoint || !trimmedWebsiteId) return null;
  let parsed: URL;
  try {
    parsed = new URL(trimmedEndpoint);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  const scriptUrl = parsed.pathname.endsWith(".js")
    ? parsed.toString()
    : `${trimmedEndpoint}/script.js`;
  return { scriptUrl, websiteId: trimmedWebsiteId };
}

export function sanitizeEvent(event: BetaEvent): BetaEvent | null {
  const contract = EVENT_PROPERTIES[event.name];
  if (!contract) return null;
  const properties: Record<string, string> = {};
  for (const [key, allowedValues] of Object.entries(contract)) {
    const value = event.properties?.[key];
    if (typeof value !== "string" || !allowedValues.includes(value)) return null;
    properties[key] = value;
  }
  return { name: event.name, properties };
}

export function sanitizeUmamiPayload(payload: Record<string, unknown>) {
  const sanitized = { ...payload };
  delete sanitized.id;
  delete sanitized.ip;
  delete sanitized.userAgent;
  delete sanitized.distinctId;
  sanitized.url = "/public-beta-event";
  sanitized.referrer = "";
  sanitized.title = "KEIBA TRACE Public Beta";
  return sanitized;
}

function sendToUmami(event: BetaEvent) {
  if (!window.umami?.track) return;
  if (event.name === "beta_page_view") {
    // data-auto-track is disabled above so this app fully controls what is
    // sent, but Umami's dashboard (Visitors/Visits/Views/Realtime) only
    // counts a visit that contains at least one real pageview hit
    // (event_type 1); a visit made only of named custom events is excluded
    // from those totals entirely. Emit one un-named pageview per page view
    // so real traffic is reflected there. The keibaBetaBeforeSend hook still
    // sanitizes url/referrer/title on this call like any other.
    window.umami.track();
  }
  window.umami.track(event.name, event.properties);
}

export function trackBetaEvent(event: BetaEvent) {
  const sanitized = sanitizeEvent(event);
  if (!sanitized || typeof window === "undefined") return false;
  if (window.umami?.track) {
    sendToUmami(sanitized);
  } else {
    queuedEvents.push(sanitized);
  }
  return true;
}

function flushQueue() {
  if (!window.umami?.track) return;
  queuedEvents.splice(0).forEach(sendToUmami);
}

export function routeName(pathname: string, basePath = "") {
  const base = basePath.replace(/\/$/, "");
  const path = base && pathname.startsWith(base)
    ? pathname.slice(base.length) || "/"
    : pathname;
  if (path === "/") return "home";
  if (path.startsWith("/race/")) return "race_detail";
  if (path === "/free") return "free";
  if (path === "/betting-candidates") return "betting";
  if (path === "/performance-analysis") return "performance";
  if (path === "/member") return "member";
  if (path === "/ai-history") return "history";
  if (path === "/access-code") return "access_code";
  if (path === "/simulator") return "simulator";
  if (path === "/rules") return "rules";
  return "other";
}

export function memberSourceForPath(pathname: string, basePath = "") {
  const route = routeName(pathname, basePath);
  if (route === "performance") return "performance_gate";
  if (route === "member") return "member_page";
  if (route === "access_code") return "access_code";
  return "free_gate";
}

export function buildReturnVisitEvent(firstVisitDate: string | null, today: string) {
  if (!firstVisitDate) return { nextFirstVisitDate: today, event: null };
  const event: BetaEvent | null = firstVisitDate < today
    ? { name: "beta_return_visit", properties: { return_bucket: "later_day" } }
    : null;
  return { nextFirstVisitDate: firstVisitDate, event };
}

function recordReturnVisit(today: string) {
  try {
    const firstVisitDate = localStorage.getItem(FIRST_VISIT_KEY);
    const result = buildReturnVisitEvent(firstVisitDate, today);
    if (!firstVisitDate) localStorage.setItem(FIRST_VISIT_KEY, result.nextFirstVisitDate);
    if (result.event && localStorage.getItem(RETURN_SENT_KEY) !== today) {
      trackBetaEvent(result.event);
      localStorage.setItem(RETURN_SENT_KEY, today);
    }
  } catch {
    // Analytics must never block the product when browser storage is disabled.
  }
}

export function trackCta(ctaId: CtaId) {
  return trackBetaEvent({ name: "beta_cta_click", properties: { cta_id: ctaId } });
}

export function trackOutbound(placement: OutboundPlacement) {
  return trackBetaEvent({ name: "beta_outbound_click", properties: { target: "note", placement } });
}

/** Race-detail state as a coarse bucket: "post" once a result exists, "pending" after the start, else "pre". */
export function raceViewState(scheduledStartAt: string | null | undefined, hasResult: boolean, nowMs: number) {
  if (hasResult) return "post" as const;
  const start = scheduledStartAt ? Date.parse(scheduledStartAt) : NaN;
  return Number.isFinite(start) && start <= nowMs ? ("pending" as const) : ("pre" as const);
}

const CAMPAIGN_SENT_KEY = "keiba-lab:beta:campaign-sent:v1";

/**
 * Reports an arrival from a campaign link at most once per browser session.
 * Only the fixed source / campaign enumerations are reported; the URL itself,
 * utm_content, utm_medium and the referrer are never read into an event.
 */
export function recordCampaignVisit(
  search: string,
  storage: Pick<Storage, "getItem" | "setItem"> | undefined =
    typeof sessionStorage === "undefined" ? undefined : sessionStorage,
) {
  const visit = parseCampaignVisit(search);
  if (!visit) return false;
  try {
    if (storage?.getItem(CAMPAIGN_SENT_KEY) === visit.campaign) return false;
    storage?.setItem(CAMPAIGN_SENT_KEY, visit.campaign);
  } catch {
    // Session storage may be unavailable; a duplicate count beats blocking the page.
  }
  return trackBetaEvent({ name: "beta_campaign_visit", properties: { source: visit.source, campaign: visit.campaign } });
}

export function initializeBetaAnalytics() {
  if (typeof window === "undefined" || typeof document === "undefined") return false;
  const config = normalizeAnalyticsConfig(
    import.meta.env.VITE_ANALYTICS_ENDPOINT ?? "",
    import.meta.env.VITE_ANALYTICS_WEBSITE_ID ?? "",
  );
  if (!config) return false;
  window.keibaBetaBeforeSend = (_type, payload) =>
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? sanitizeUmamiPayload(payload as Record<string, unknown>)
      : false;
  if (!document.querySelector('script[data-keiba-beta-analytics="true"]')) {
    const script = document.createElement("script");
    script.async = true;
    script.defer = true;
    script.src = config.scriptUrl;
    script.dataset.websiteId = config.websiteId;
    script.dataset.autoTrack = "false";
    script.dataset.doNotTrack = "true";
    script.dataset.beforeSend = "keibaBetaBeforeSend";
    script.dataset.keibaBetaAnalytics = "true";
    script.addEventListener("load", flushQueue, { once: true });
    document.head.appendChild(script);
  }
  recordReturnVisit(new Date().toLocaleDateString("sv-SE"));
  recordCampaignVisit(window.location.search);
  return true;
}

export function organizationFromRaceKey(raceKey: string) {
  const organization = raceKey.split("|", 1)[0]?.toUpperCase();
  return organization === "JRA" || organization === "NAR" ? organization : "UNKNOWN";
}
