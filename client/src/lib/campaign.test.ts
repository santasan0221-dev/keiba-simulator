import { describe, expect, it } from "vitest";
import { buildCampaignUrl, CAMPAIGN_IDS, getTraceBaseUrl, parseCampaignVisit } from "./campaign";

describe("campaign (UTM) handling", () => {
  it("accepts only source=x with a fixed campaign id", () => {
    expect(parseCampaignVisit("?utm_source=x&utm_medium=social&utm_campaign=daily")).toEqual({ source: "x", campaign: "daily" });
    expect(parseCampaignVisit("?utm_source=X&utm_campaign=PINNED")).toEqual({ source: "x", campaign: "pinned" });
    for (const id of CAMPAIGN_IDS) expect(parseCampaignVisit(`?utm_source=x&utm_campaign=${id}`)).toEqual({ source: "x", campaign: id });
  });

  it("drops anything outside the fixed list and never exposes extra parameters", () => {
    expect(parseCampaignVisit("?utm_source=facebook&utm_campaign=daily")).toBeNull();
    expect(parseCampaignVisit("?utm_source=x&utm_campaign=free-text-campaign")).toBeNull();
    expect(parseCampaignVisit("?utm_source=x")).toBeNull();
    expect(parseCampaignVisit("")).toBeNull();
    const visit = parseCampaignVisit("?utm_source=x&utm_campaign=result&utm_content=20261004_JRA|2026-10-04|東京|11&email=a@example.com");
    expect(visit).toEqual({ source: "x", campaign: "result" });
    expect(JSON.stringify(visit)).not.toMatch(/20261004|JRA|example\.com/);
  });

  it("reads the canonical base URL from the single variable only, https only", () => {
    expect(getTraceBaseUrl("https://example.test/app/")).toBe("https://example.test/app");
    expect(getTraceBaseUrl("https://example.test")).toBe("https://example.test");
    expect(getTraceBaseUrl("http://example.test")).toBeNull();
    expect(getTraceBaseUrl("https://user:pass@example.test")).toBeNull();
    expect(getTraceBaseUrl("https://example.test/?x=1")).toBeNull();
    expect(getTraceBaseUrl("")).toBeNull();
    expect(getTraceBaseUrl(undefined)).toBeNull();
  });

  it("builds campaign links only from a configured base and a valid path", () => {
    expect(buildCampaignUrl("/rules", "weekly", "https://example.test/app")).toBe("https://example.test/app/rules?utm_source=x&utm_medium=social&utm_campaign=weekly");
    expect(buildCampaignUrl("/", "pinned", "https://example.test/app")).toBe("https://example.test/app/?utm_source=x&utm_medium=social&utm_campaign=pinned");
    expect(buildCampaignUrl("/rules", "weekly", null)).toBeNull();
    expect(buildCampaignUrl("rules", "weekly", "https://example.test")).toBeNull();
    expect(buildCampaignUrl("//evil.test", "weekly", "https://example.test")).toBeNull();
    expect(buildCampaignUrl("/rules?x=1", "weekly", "https://example.test")).toBeNull();
    expect(buildCampaignUrl("/rules", "not-a-campaign" as never, "https://example.test")).toBeNull();
  });
});
