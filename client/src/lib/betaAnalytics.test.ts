import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildReturnVisitEvent,
  memberSourceForPath,
  normalizeAnalyticsConfig,
  raceViewState,
  recordCampaignVisit,
  routeName,
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


describe("growth P0 events stay inside the anonymous contract", () => {
  beforeEach(() => vi.unstubAllGlobals());

  it("accepts /simulator and /rules page views (the simulator view used to be discarded)", () => {
    expect(routeName("/simulator")).toBe("simulator");
    expect(routeName("/rules")).toBe("rules");
    for (const route of ["simulator", "rules", "home", "race_detail", "history"]) {
      expect(sanitizeEvent({ name: "beta_page_view", properties: { route } } as BetaEvent), route).not.toBeNull();
    }
  });

  it("accepts the new events only with fixed-enumeration values", () => {
    const ok: BetaEvent[] = [
      { name: "beta_cta_click", properties: { cta_id: "hero_today" } },
      { name: "beta_outbound_click", properties: { target: "note", placement: "member_gate" } },
      { name: "beta_campaign_visit", properties: { source: "x", campaign: "daily" } },
      { name: "beta_race_detail_view", properties: { organization: "JRA", race_state: "pre" } },
      { name: "beta_simulator_open", properties: { entry: "race_link" } },
      { name: "beta_history_view", properties: {} },
    ];
    for (const event of ok) expect(sanitizeEvent(event), event.name).toEqual(event);
  });

  it("rejects free text, unknown enumerations and Bookers (not allowed yet)", () => {
    const bad = [
      { name: "beta_cta_click", properties: { cta_id: "anything I like" } },
      { name: "beta_outbound_click", properties: { target: "bookers", placement: "member_gate" } },
      { name: "beta_outbound_click", properties: { target: "note", placement: "https://example.com/x" } },
      { name: "beta_campaign_visit", properties: { source: "facebook", campaign: "daily" } },
      { name: "beta_campaign_visit", properties: { source: "x", campaign: "20261004_JRA|2026-10-04|東京|11" } },
      { name: "beta_race_detail_view", properties: { organization: "JRA", race_state: "JRA|2026-10-04|東京|11" } },
      { name: "beta_simulator_open", properties: { entry: "hero" } },
    ] as unknown as BetaEvent[];
    for (const event of bad) expect(sanitizeEvent(event), JSON.stringify(event)).toBeNull();
  });

  it("strips PII-style properties (email, ids, race keys, URLs) from every new event", () => {
    const pii = { email: "person@example.com", visitor_id: "v-1", session_id: "s-1", fingerprint: "abc", race_key: "JRA|2026-10-04|東京|11", url: "https://example.com", utm_content: "20261004_x", ip: "203.0.113.9", name: "山田" };
    const events: BetaEvent[] = [
      { name: "beta_cta_click", properties: { cta_id: "hero_results", ...pii } },
      { name: "beta_outbound_click", properties: { target: "note", placement: "member_page", ...pii } },
      { name: "beta_campaign_visit", properties: { source: "x", campaign: "weekly", ...pii } },
      { name: "beta_race_detail_view", properties: { organization: "NAR", race_state: "post", ...pii } },
      { name: "beta_simulator_open", properties: { entry: "direct", ...pii } },
      { name: "beta_history_view", properties: { ...pii } },
    ] as unknown as BetaEvent[];
    for (const event of events) {
      const cleaned = sanitizeEvent(event);
      expect(cleaned, event.name).not.toBeNull();
      expect(JSON.stringify(cleaned), event.name).not.toMatch(/person@example|v-1|s-1|abc|JRA\|2026|example\.com|20261004|203\.0\.113|山田/);
      for (const key of Object.keys(pii)) expect(Object.keys(cleaned!.properties), `${event.name}:${key}`).not.toContain(key);
    }
  });

  it("reports a campaign arrival once per session and only the fixed values", () => {
    const sent: unknown[] = [];
    vi.stubGlobal("window", { umami: { track: (...args: unknown[]) => sent.push(args) } });
    const store = new Map<string, string>();
    const storage = { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => void store.set(key, value) };
    const search = "?utm_source=x&utm_medium=social&utm_campaign=morning&utm_content=20261004_JRA|2026-10-04|東京|11";
    expect(recordCampaignVisit(search, storage)).toBe(true);
    expect(recordCampaignVisit(search, storage)).toBe(false);
    expect(recordCampaignVisit("?utm_source=other&utm_campaign=morning", storage)).toBe(false);
    expect(sent).toEqual([["beta_campaign_visit", { source: "x", campaign: "morning" }]]);
    expect(JSON.stringify(sent)).not.toMatch(/20261004|JRA/);
  });

  it("buckets a race detail view without exposing the race", () => {
    const now = Date.parse("2026-10-04T05:00:00Z");
    expect(raceViewState("2026-10-04T06:00:00Z", false, now)).toBe("pre");
    expect(raceViewState("2026-10-04T04:00:00Z", false, now)).toBe("pending");
    expect(raceViewState("2026-10-04T04:00:00Z", true, now)).toBe("post");
    expect(raceViewState(null, false, now)).toBe("pre");
  });
});
