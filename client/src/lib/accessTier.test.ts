import { describe, expect, it } from "vitest";
import { ACCESS_TIER_NOTICE, FREE_SCOPE_NOTICE, getSafeExternalUrl } from "./accessTier";

describe("FREE / MEMBER Phase A access boundary", () => {
  it("describes the FREE scope as every race (D1) and no longer as a pre-fixed one-race rule", () => {
    expect(FREE_SCOPE_NOTICE.headline).toContain("全レース無料");
    expect(FREE_SCOPE_NOTICE.description).toContain("すべてのレース");
    expect(FREE_SCOPE_NOTICE.description).toContain("変わりません");
    for (const retired of ["事前固定", "選び直", "自動選定"]) {
      expect(`${FREE_SCOPE_NOTICE.headline}${FREE_SCOPE_NOTICE.description}`).not.toContain(retired);
    }
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
