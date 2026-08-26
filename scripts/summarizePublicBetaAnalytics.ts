import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const DAY_MS = 24 * 60 * 60 * 1000;
const BETA_DAYS = 14;

const EVENT_NAMES = [
  "beta_page_view",
  "beta_race_select",
  "beta_org_switch",
  "beta_share",
  "beta_return_visit",
  "beta_member_click",
  "beta_survey_open",
  "beta_survey_submit",
] as const;

type BetaEventName = (typeof EVENT_NAMES)[number];

export type NormalizedBetaEvent = {
  name: string;
  timestamp: string;
  properties: Record<string, string>;
};

export type SummaryWindow = {
  startAt: string;
  endAt: string;
};

function validDate(value: string) {
  const parsed = new Date(value);
  if (!value || Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid beta date: ${value || "<empty>"}`);
  }
  return parsed;
}

export function betaWindow(startAt: string, now = new Date()) {
  const start = validDate(startAt);
  const end = new Date(start.getTime() + BETA_DAYS * DAY_MS);
  const elapsedDays = Math.max(0, Math.floor((now.getTime() - start.getTime()) / DAY_MS));
  return {
    startAt,
    endAt: end.toISOString(),
    elapsedDays,
    status: now.getTime() >= end.getTime() ? "READY" as const : "WAITING" as const,
  };
}

function eventProperties(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter((entry): entry is [string, string] => typeof entry[1] === "string")
      .map(([key, item]) => [key, item]),
  );
}

export function normalizeUmamiEvent(value: unknown): NormalizedBetaEvent | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const name = raw.eventName ?? raw.event_name ?? raw.name;
  const timestamp = raw.createdAt ?? raw.created_at ?? raw.timestamp;
  if (typeof name !== "string" || typeof timestamp !== "string") return null;
  if (Number.isNaN(new Date(timestamp).getTime())) return null;
  const pivotKeys = Array.isArray(raw.propertyKeys) ? raw.propertyKeys : [];
  const pivotValues = Array.isArray(raw.propertyValues) ? raw.propertyValues : [];
  const pivotProperties = Object.fromEntries(
    pivotKeys.flatMap((key, index) =>
      typeof key === "string" && typeof pivotValues[index] === "string"
        ? [[key, pivotValues[index] as string]]
        : [],
    ),
  );
  return {
    name,
    timestamp,
    properties: Object.keys(pivotProperties).length
      ? pivotProperties
      : eventProperties(raw.eventData ?? raw.event_data ?? raw.properties),
  };
}

function increment(target: Record<string, number>, key: string) {
  target[key] = (target[key] ?? 0) + 1;
}

function allowed(value: string | undefined, choices: readonly string[]) {
  return value && choices.includes(value) ? value : null;
}

export function aggregateBetaEvents(events: NormalizedBetaEvent[], window: SummaryWindow) {
  const recognized = events.filter((event) => EVENT_NAMES.includes(event.name as BetaEventName));
  const eventCounts: Record<string, number> = {};
  const pageViews: Record<string, number> = {};
  const raceSelects: Record<string, number> = {};
  const orgSwitches: Record<string, number> = {};
  const shareMethods: Record<string, number> = {};
  const shareOrganizations: Record<string, number> = {};
  const memberSources: Record<string, number> = {};
  const primaryValue: Record<string, number> = {};
  const reuseIntent: Record<string, number> = {};
  const memberInterest: Record<string, number> = {};
  let returnVisits = 0;
  let shareTotal = 0;
  let memberTotal = 0;
  let surveyResponses = 0;

  for (const event of recognized) {
    increment(eventCounts, event.name);
    const properties = event.properties;
    if (event.name === "beta_page_view") {
      const route = allowed(properties.route, ["home", "race_detail", "free", "betting", "performance", "member", "history", "access_code", "other"]);
      if (route) increment(pageViews, route);
    } else if (event.name === "beta_race_select") {
      const organization = allowed(properties.organization, ["JRA", "NAR"]);
      if (organization) increment(raceSelects, organization);
    } else if (event.name === "beta_org_switch") {
      const organization = allowed(properties.organization, ["JRA", "NAR"]);
      if (organization) increment(orgSwitches, organization);
    } else if (event.name === "beta_share") {
      const method = allowed(properties.method, ["native", "clipboard"]);
      const organization = allowed(properties.organization, ["JRA", "NAR", "UNKNOWN"]);
      if (method && organization) {
        shareTotal += 1;
        increment(shareMethods, method);
        increment(shareOrganizations, organization);
      }
    } else if (event.name === "beta_return_visit" && properties.return_bucket === "later_day") {
      returnVisits += 1;
    } else if (event.name === "beta_member_click") {
      const source = allowed(properties.source, ["main_nav", "member_page", "free_gate", "performance_gate", "access_code"]);
      if (source) {
        memberTotal += 1;
        increment(memberSources, source);
      }
    } else if (event.name === "beta_survey_submit") {
      const primary = allowed(properties.primary_value, ["information", "comparison", "time_saving", "decision_support", "not_sure"]);
      const reuse = allowed(properties.reuse_intent, ["yes", "maybe", "no"]);
      const interest = allowed(properties.member_interest, ["yes", "depends", "no"]);
      if (primary && reuse && interest) {
        surveyResponses += 1;
        increment(primaryValue, primary);
        increment(reuseIntent, reuse);
        increment(memberInterest, interest);
      }
    }
  }

  return {
    schema_version: "PUBLIC_BETA_SUMMARY_V1",
    status: recognized.length ? "COMPLETE" : "NO_DATA",
    period: { start_at: window.startAt, end_at: window.endAt },
    total_events: recognized.length,
    event_counts: eventCounts,
    page_views: pageViews,
    race_selects: raceSelects,
    organization_switches: orgSwitches,
    shares: { total: shareTotal, by_method: shareMethods, by_organization: shareOrganizations },
    return_visits: returnVisits,
    member_clicks: { total: memberTotal, by_source: memberSources },
    survey: {
      responses: surveyResponses,
      primary_value: primaryValue,
      reuse_intent: reuseIntent,
      member_interest: memberInterest,
    },
    privacy: { raw_events_persisted: false, custom_identifiers_included: false },
  };
}

function reportMarkdown(summary: ReturnType<typeof aggregateBetaEvents>, status: string) {
  return [
    "# Public Beta Analytics",
    "",
    `Status: ${status === "WAITING" ? "WAITING_FOR_14_DAYS" : summary.status}`,
    `Period: ${summary.period.start_at} - ${summary.period.end_at}`,
    `Recognized events: ${summary.total_events}`,
    `Survey responses: ${summary.survey.responses}`,
    "",
    "This report contains aggregate counts only. Raw events and custom identifiers are not written to the artifact.",
    "",
  ].join("\n");
}

async function fetchUmamiEvents(apiUrl: string, websiteId: string, token: string, window: SummaryWindow) {
  const events: NormalizedBetaEvent[] = [];
  const pageSize = 500;
  for (const eventName of EVENT_NAMES) {
    for (let page = 1; ; page += 1) {
      const url = new URL(`/api/websites/${encodeURIComponent(websiteId)}/event-data-pivot`, apiUrl);
      url.searchParams.set("startAt", String(validDate(window.startAt).getTime()));
      url.searchParams.set("endAt", String(validDate(window.endAt).getTime()));
      url.searchParams.set("eventName", eventName);
      url.searchParams.set("pageSize", String(pageSize));
      url.searchParams.set("page", String(page));
      const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error(`Umami event-data request failed: HTTP ${response.status}`);
      const payload: unknown = await response.json();
      const rawItems = payload && typeof payload === "object" && Array.isArray((payload as { data?: unknown }).data)
        ? (payload as { data: unknown[] }).data
        : null;
      if (!rawItems) throw new Error("Umami event-data response did not match the pivot list contract");
      events.push(...rawItems.map(normalizeUmamiEvent).filter((event): event is NormalizedBetaEvent => Boolean(event)));
      if (rawItems.length < pageSize) break;
    }
  }
  return events;
}

async function main() {
  const startAt = process.env.BETA_START_AT ?? "";
  const windowState = betaWindow(startAt);
  const outputDir = resolve(process.env.BETA_REPORT_DIR ?? "artifacts/public-beta");
  await mkdir(outputDir, { recursive: true });
  const window = { startAt: windowState.startAt, endAt: windowState.endAt };
  let summary = aggregateBetaEvents([], window);

  if (windowState.status === "READY") {
    const apiUrl = process.env.UMAMI_API_URL ?? "";
    const websiteId = process.env.UMAMI_WEBSITE_ID ?? "";
    const token = process.env.UMAMI_API_TOKEN ?? "";
    if (!apiUrl || !websiteId || !token) throw new Error("UMAMI_API_URL, UMAMI_WEBSITE_ID and UMAMI_API_TOKEN are required after day 14");
    const events = await fetchUmamiEvents(apiUrl, websiteId, token, window);
    summary = aggregateBetaEvents(events, window);
  }

  const artifact = {
    ...summary,
    collection_status: windowState.status === "WAITING" ? "WAITING_FOR_14_DAYS" : summary.status,
    elapsed_days: windowState.elapsedDays,
  };
  await writeFile(resolve(outputDir, "summary.json"), `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  await writeFile(resolve(outputDir, "REPORT.md"), reportMarkdown(summary, windowState.status), "utf8");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
