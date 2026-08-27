export type BetaEventName =
  | "beta_page_view"
  | "beta_race_select"
  | "beta_org_switch"
  | "beta_share"
  | "beta_return_visit"
  | "beta_member_click"
  | "beta_survey_open"
  | "beta_survey_submit";

export type BetaEvent = {
  name: BetaEventName;
  properties: Record<string, string>;
};

type UmamiClient = {
  track: (name: string, properties?: Record<string, string>) => void;
};

declare global {
  interface Window {
    umami?: UmamiClient;
    keibaBetaBeforeSend?: (type: string, payload: unknown) => Record<string, unknown> | false;
  }
}

const EVENT_PROPERTIES: Record<BetaEventName, Record<string, readonly string[]>> = {
  beta_page_view: {
    route: ["home", "race_detail", "free", "betting", "performance", "member", "history", "access_code", "other"],
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

export function trackBetaEvent(event: BetaEvent) {
  const sanitized = sanitizeEvent(event);
  if (!sanitized || typeof window === "undefined") return false;
  if (window.umami?.track) {
    window.umami.track(sanitized.name, sanitized.properties);
  } else {
    queuedEvents.push(sanitized);
  }
  return true;
}

function flushQueue() {
  if (!window.umami?.track) return;
  queuedEvents.splice(0).forEach((event) => {
    window.umami?.track(event.name, event.properties);
  });
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
  return true;
}

export function organizationFromRaceKey(raceKey: string) {
  const organization = raceKey.split("|", 1)[0]?.toUpperCase();
  return organization === "JRA" || organization === "NAR" ? organization : "UNKNOWN";
}
