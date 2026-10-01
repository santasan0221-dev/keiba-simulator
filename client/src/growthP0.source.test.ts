import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..", "..");
const read = (...parts: string[]) => readFileSync(resolve(root, ...parts), "utf8");

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap(entry => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sources(full);
    return /\.(ts|tsx)$/.test(entry) && !/\.test\./.test(entry) && !/\.d\.ts$/.test(entry) ? [full] : [];
  });
}

const publicSurfaces = [...sources(resolve(root, "client/src/pages")), ...sources(resolve(root, "client/src/components"))]
  .filter(file => !file.includes("/components/ui/") && !file.endsWith("ComponentShowcase.tsx"));

describe("Growth P0 source contracts", () => {
  it("registers /rules next to the other routes with the same <Route> pattern", () => {
    expect(read("client/src/App.tsx")).toContain('<Route path="/rules" component={RulesPage} />');
  });

  it("D3: no public surface shows the retired KEIBA LAB brand, even when split by markup", () => {
    for (const file of publicSurfaces) {
      const source = readFileSync(file, "utf8");
      expect(source, `${file} must not render "KEIBA LAB" (also not as KEIBA <span>LAB</span>)`).not.toMatch(/\bKEIBA(?:\s+|\s*(?:<[^>]*>\s*)+)LAB\b/i);
      expect(source, `${file} must not use the old "Keiba Simulator" mark alt`).not.toContain('alt="Keiba Simulator');
    }
  });

  it("D2: no public URL is written into the new growth code; the base URL comes from KEIBA_TRACE_BASE_URL only", () => {
    for (const file of ["client/src/lib/campaign.ts", "client/src/components/trace/TraceHero.tsx", "client/src/components/trace/TodayRecord.tsx", "client/src/pages/RulesPage.tsx", "client/src/pages/FreeRacesPage.tsx", "client/src/lib/todayRecord.ts"]) {
      expect(read(file), file).not.toMatch(/https?:\/\/[^\s"'`)]*(github\.io|keibalab\.net|manus\.space)/);
    }
    expect(read("client/src/lib/campaign.ts")).toContain("import.meta.env.KEIBA_TRACE_BASE_URL");
    expect(read("vite.config.ts")).toMatch(/envPrefix:\s*\["VITE_",\s*"KEIBA_TRACE_"\]/);
    const workflow = read(".github/workflows/deploy-pages.yml");
    expect(workflow).toContain("KEIBA_TRACE_BASE_URL: ${{ vars.KEIBA_TRACE_BASE_URL }}");
  });

  it("D5: the analytics layer adds no persistent identifiers or fingerprinting", () => {
    const analytics = read("client/src/lib/betaAnalytics.ts") + read("client/src/lib/campaign.ts");
    for (const forbidden of ["visitor_id", "session_id", "fingerprint", "canvas.toDataURL", "navigator.userAgent", "navigator.plugins", "document.cookie", "email"]) {
      expect(analytics, forbidden).not.toContain(forbidden);
    }
    expect(analytics).toContain("sanitizeUmamiPayload");
  });

  it("every outbound note link reports through the fixed-enumeration outbound event", () => {
    const tier = read("client/src/components/AccessTierUI.tsx");
    expect(tier).toContain("trackOutbound(");
  });

  it("the growth P0 work touches no prediction, betting, ledger, auth or payment code", () => {
    for (const file of sources(resolve(root, "client/src/lib"))) {
      if (!/(todayRecord|campaign)\.ts$/.test(file)) continue;
      expect(readFileSync(file, "utf8"), file).not.toMatch(/stripe|payment|checkout|entitlement|runSimulation|bet_decision\s*=/i);
    }
  });
});
