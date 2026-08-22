import { describe, expect, it } from "vitest";
import { ACCESS_TIER_NOTICE, FREE_PUBLICATION_RULE_NOTICE, getSafeExternalUrl } from "./accessTier";

describe("FREE / MEMBER Phase A access boundary", () => {
  it("describes FREE pre-race exposure as a pre-fixed automatic rule and forbids post-result reselection", () => {
    expect(FREE_PUBLICATION_RULE_NOTICE.description).toContain("事前固定");
    expect(FREE_PUBLICATION_RULE_NOTICE.description).toContain("結果確定後");
    expect(FREE_PUBLICATION_RULE_NOTICE.description).toContain("選び直したりしません");
  });

  it("keeps MEMBER and access-code states explicitly unavailable until authentication exists", () => {
    expect(ACCESS_TIER_NOTICE.memberStatus).toContain("準備中");
    expect(ACCESS_TIER_NOTICE.accessCodeStatus).toContain("認証未接続");
  });

  it("allows only absolute HTTPS URLs for note external links", () => {
    expect(getSafeExternalUrl("https://note.com/example")).toBe("https://note.com/example");
    expect(getSafeExternalUrl("http://note.com/example")).toBeNull();
    expect(getSafeExternalUrl("javascript:alert(1)")).toBeNull();
    expect(getSafeExternalUrl("/member")).toBeNull();
    expect(getSafeExternalUrl(undefined)).toBeNull();
  });
});
