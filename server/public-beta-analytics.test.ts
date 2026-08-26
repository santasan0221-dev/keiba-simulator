import { describe, expect, it } from "vitest";
import {
  aggregateBetaEvents,
  betaWindow,
  normalizeUmamiEvent,
} from "../scripts/summarizePublicBetaAnalytics";

describe("public beta two-week analytics summary", () => {
  it("keeps the report waiting until fourteen complete days", () => {
    const window = betaWindow("2026-08-25T00:00:00+09:00", new Date("2026-09-01T00:00:00+09:00"));
    expect(window.status).toBe("WAITING");
    expect(window.elapsedDays).toBe(7);
    expect(betaWindow("2026-08-25T00:00:00+09:00", new Date("2026-09-08T00:00:00+09:00")).status).toBe("READY");
  });

  it("normalizes supported Umami event shapes without copying identifiers", () => {
    expect(normalizeUmamiEvent({
      eventName: "beta_race_select",
      createdAt: "2026-08-26T01:00:00Z",
      eventData: { organization: "JRA", source: "catalog" },
      sessionId: "secret-session",
      ip: "192.0.2.1",
      userAgent: "secret-agent",
    })).toEqual({
      name: "beta_race_select",
      timestamp: "2026-08-26T01:00:00Z",
      properties: { organization: "JRA", source: "catalog" },
    });
  });

  it("normalizes the Umami event-data pivot shape", () => {
    expect(normalizeUmamiEvent({
      eventName: "beta_survey_submit",
      createdAt: "2026-08-27T01:02:00Z",
      propertyKeys: ["primary_value", "reuse_intent", "member_interest"],
      propertyValues: ["comparison", "yes", "depends"],
      sessionId: "not-for-the-report",
      urlPath: "/keiba-simulator/member",
    })).toEqual({
      name: "beta_survey_submit",
      timestamp: "2026-08-27T01:02:00Z",
      properties: {
        primary_value: "comparison",
        reuse_intent: "yes",
        member_interest: "depends",
      },
    });
  });

  it("aggregates behavior and the fixed survey choices only", () => {
    const events = [
      { name: "beta_page_view", timestamp: "2026-08-26T01:00:00Z", properties: { route: "home" } },
      { name: "beta_race_select", timestamp: "2026-08-26T01:01:00Z", properties: { organization: "NAR", source: "catalog" } },
      { name: "beta_share", timestamp: "2026-08-26T01:02:00Z", properties: { organization: "NAR", method: "clipboard" } },
      { name: "beta_return_visit", timestamp: "2026-08-27T01:00:00Z", properties: { return_bucket: "later_day" } },
      { name: "beta_member_click", timestamp: "2026-08-27T01:01:00Z", properties: { source: "main_nav" } },
      { name: "beta_survey_submit", timestamp: "2026-08-27T01:02:00Z", properties: { primary_value: "comparison", reuse_intent: "yes", member_interest: "depends" } },
    ];

    const summary = aggregateBetaEvents(events, {
      startAt: "2026-08-25T00:00:00+09:00",
      endAt: "2026-09-08T00:00:00+09:00",
    });

    expect(summary.status).toBe("COMPLETE");
    expect(summary.event_counts.beta_race_select).toBe(1);
    expect(summary.page_views).toEqual({ home: 1 });
    expect(summary.return_visits).toBe(1);
    expect(summary.survey).toEqual({
      responses: 1,
      primary_value: { comparison: 1 },
      reuse_intent: { yes: 1 },
      member_interest: { depends: 1 },
    });
    expect(JSON.stringify(summary)).not.toContain("session");
    expect(JSON.stringify(summary)).not.toContain("192.0.2.1");
  });

  it("reports NO_DATA without inventing beta activity", () => {
    const summary = aggregateBetaEvents([], {
      startAt: "2026-08-25T00:00:00+09:00",
      endAt: "2026-09-08T00:00:00+09:00",
    });
    expect(summary.status).toBe("NO_DATA");
    expect(summary.total_events).toBe(0);
    expect(summary.survey.responses).toBe(0);
  });

  it("keeps API aggregation manual and optional on the Umami Cloud free plan", async () => {
    const workflow = await import("node:fs/promises").then(({ readFile }) =>
      readFile(new URL("../.github/workflows/public-beta-summary.yml", import.meta.url), "utf8"),
    );
    expect(workflow).not.toContain("schedule:");
    expect(workflow).not.toContain("cron:");
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("BETA_START_AT: ${{ vars.BETA_START_AT }}");
    expect(workflow).toContain("UMAMI_API_TOKEN: ${{ secrets.UMAMI_API_TOKEN }}");
    expect(workflow).toContain("scripts/summarizePublicBetaAnalytics.ts");
  });
});
