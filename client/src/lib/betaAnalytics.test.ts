import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildReturnVisitEvent,
  memberSourceForPath,
  normalizeAnalyticsConfig,
  sanitizeUmamiPayload,
  sanitizeEvent,
  trackBetaEvent,
  type BetaEvent,
} from "./betaAnalytics";

describe("public beta analytics privacy contract", () => {
  beforeEach(() => vi.unstubAllGlobals());

  it("accepts only HTTPS analytics configuration", () => {
    expect(normalizeAnalyticsConfig("https://analytics.example.com", "site-1")).toEqual({
      scriptUrl: "https://analytics.example.com/script.js",
      websiteId: "site-1",
    });
    expect(normalizeAnalyticsConfig("http://analytics.example.com", "site-1")).toBeNull();
    expect(normalizeAnalyticsConfig("https://analytics.example.com", "")).toBeNull();
    expect(normalizeAnalyticsConfig(
      "https://cloud.umami.is/script.js",
      "13fbca78-7546-408c-a655-aaf81a954436",
    )).toEqual({
      scriptUrl: "https://cloud.umami.is/script.js",
      websiteId: "13fbca78-7546-408c-a655-aaf81a954436",
    });
  });

  it("removes identifiers, race keys, URLs and unknown properties", () => {
    const unsafe = {
      name: "beta_race_select",
      properties: {
        organization: "JRA",
        source: "catalog",
        race_key: "JRA|2026-08-25|札幌|01",
        horse_name: "テスト馬",
        email: "person@example.com",
        url: "https://example.com/race/secret",
      },
    } as unknown as BetaEvent;

    expect(sanitizeEvent(unsafe)).toEqual({
      name: "beta_race_select",
      properties: { organization: "JRA", source: "catalog" },
    });
  });

  it("rejects unknown event names and invalid enum values", () => {
    expect(sanitizeEvent({ name: "login", properties: {} } as unknown as BetaEvent)).toBeNull();
    expect(sanitizeEvent({
      name: "beta_org_switch",
      properties: { organization: "OTHER", source: "catalog" },
    } as unknown as BetaEvent)).toBeNull();
  });

  it("emits a return visit only on a later local calendar day", () => {
    expect(buildReturnVisitEvent(null, "2026-08-25")).toEqual({
      nextFirstVisitDate: "2026-08-25",
      event: null,
    });
    expect(buildReturnVisitEvent("2026-08-25", "2026-08-25").event).toBeNull();
    expect(buildReturnVisitEvent("2026-08-25", "2026-08-26").event).toEqual({
      name: "beta_return_visit",
      properties: { return_bucket: "later_day" },
    });
  });

  it("accepts the fixed three-question survey without free text", () => {
    expect(sanitizeEvent({
      name: "beta_survey_submit",
      properties: {
        primary_value: "time_saving",
        reuse_intent: "yes",
        member_interest: "depends",
        free_text: "do not send",
      },
    })).toEqual({
      name: "beta_survey_submit",
      properties: {
        primary_value: "time_saving",
        reuse_intent: "yes",
        member_interest: "depends",
      },
    });
  });

  it("maps member funnels to categories without returning a raw path", () => {
    expect(memberSourceForPath("/keiba-simulator/performance-analysis", "/keiba-simulator/")).toBe("performance_gate");
    expect(memberSourceForPath("/member")).toBe("member_page");
    expect(memberSourceForPath("/access-code")).toBe("access_code");
    expect(memberSourceForPath("/race/JRA/2026-08-25/TOKYO/1")).toBe("free_gate");
  });

  it("replaces Umami request paths and removes client identifiers before send", () => {
    expect(sanitizeUmamiPayload({
      website: "site-1",
      url: "/race/JRA/2026-08-25/SAPPORO/1",
      referrer: "https://example.com/person?id=1",
      title: "private title",
      id: "custom-id",
      ip: "192.0.2.1",
      userAgent: "browser fingerprint",
      name: "beta_page_view",
      data: { route: "race_detail" },
    })).toEqual({
      website: "site-1",
      url: "/public-beta-event",
      referrer: "",
      title: "KEIBA TRACE Public Beta",
      name: "beta_page_view",
      data: { route: "race_detail" },
    });
  });

  describe("Umami visit counting (regression: dashboard showed 0 visitors/visits/views)", () => {
    it("sends an un-named pageview hit before the beta_page_view custom event, so the visit is not custom-event-only", () => {
      const track = vi.fn();
      vi.stubGlobal("window", { umami: { track } });

      trackBetaEvent({ name: "beta_page_view", properties: { route: "home" } });

      expect(track).toHaveBeenNthCalledWith(1);
      expect(track).toHaveBeenNthCalledWith(2, "beta_page_view", { route: "home" });
      expect(track).toHaveBeenCalledTimes(2);
    });

    it("does not send an extra pageview hit for non-page-view events", () => {
      const track = vi.fn();
      vi.stubGlobal("window", { umami: { track } });

      trackBetaEvent({ name: "beta_share", properties: { organization: "JRA", method: "native" } });

      expect(track).toHaveBeenCalledTimes(1);
      expect(track).toHaveBeenCalledWith("beta_share", { organization: "JRA", method: "native" });
    });

    it("does nothing (no throw) when umami is not yet loaded", () => {
      expect(() =>
        trackBetaEvent({ name: "beta_page_view", properties: { route: "member" } }),
      ).not.toThrow();
    });
  });
});
