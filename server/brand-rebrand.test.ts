import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (...segments: string[]) =>
  readFileSync(resolve(import.meta.dirname, "..", ...segments), "utf8");

const indexHtml = read("client", "index.html");
const notFoundHtml = read("client", "public", "404.html");

const rebrandedClientSources: Record<string, string> = {
  "client/src/components/LabServiceNavigation.tsx": read("client", "src", "components", "LabServiceNavigation.tsx"),
  "client/src/components/LabValueStrip.tsx": read("client", "src", "components", "LabValueStrip.tsx"),
  "client/src/pages/Home.tsx": read("client", "src", "pages", "Home.tsx"),
  "client/src/pages/RacePage.tsx": read("client", "src", "pages", "RacePage.tsx"),
  "client/src/pages/FreeRacesPage.tsx": read("client", "src", "pages", "FreeRacesPage.tsx"),
  "client/src/pages/RaceHistoryPage.tsx": read("client", "src", "pages", "RaceHistoryPage.tsx"),
  "client/src/pages/ResearchWorkbenchPage.tsx": read("client", "src", "pages", "ResearchWorkbenchPage.tsx"),
  "client/src/components/RealRaceLoader.tsx": read("client", "src", "components", "RealRaceLoader.tsx"),
  "client/src/lib/betaAnalytics.ts": read("client", "src", "lib", "betaAnalytics.ts"),
};

describe("KEIBA TRACE rebrand -- user-facing surfaces", () => {
  it("index.html title/OGP/Twitter Card all use the new brand and catchphrase", () => {
    expect(indexHtml).toContain("<title>KEIBA TRACE — AI予想を、結果まで追う。</title>");
    expect(indexHtml).toContain('<meta property="og:site_name" content="KEIBA TRACE" />');
    expect(indexHtml).toContain('<meta property="og:title" content="KEIBA TRACE — AI予想を、結果まで追う。" />');
    expect(indexHtml).toContain('<meta name="twitter:title" content="KEIBA TRACE — AI予想を、結果まで追う。" />');
    expect(indexHtml).not.toContain("KEIBA LAB");
  });

  it("404.html fallback page title uses the new brand", () => {
    expect(notFoundHtml).toContain("<title>KEIBA TRACE</title>");
    expect(notFoundHtml).not.toContain("KEIBA LAB");
  });

  it("no rebranded client surface still shows the retired KEIBA LAB brand text", () => {
    for (const [path, source] of Object.entries(rebrandedClientSources)) {
      expect(source, `${path} must not contain the retired "KEIBA LAB" brand text`).not.toContain("KEIBA LAB");
    }
  });

  it("header/logo lockup and share text present the new brand", () => {
    expect(rebrandedClientSources["client/src/components/LabServiceNavigation.tsx"]).toContain("KEIBA <span>TRACE</span>");
    expect(rebrandedClientSources["client/src/pages/Home.tsx"]).toContain("KEIBA <span>TRACE</span>");
    expect(rebrandedClientSources["client/src/pages/RacePage.tsx"]).toContain('title: "KEIBA TRACE"');
    expect(rebrandedClientSources["client/src/components/RealRaceLoader.tsx"]).toContain('title: "KEIBA TRACE"');
  });
});

describe("KEIBA TRACE rebrand -- protected internal identifiers are untouched", () => {
  it("the single_pick_ai KEIBA LAB API integration comment is preserved (refers to the real, unrenamed backend module/route)", () => {
    const singlePickAi = read("client", "src", "lib", "singlePickAi.ts");
    expect(singlePickAi).toContain("KEIBA LAB API (/api/lab/*)");
  });

  it("the production API origin domain is untouched", () => {
    const workflow = read(".github", "workflows", "deploy-pages.yml");
    expect(workflow).toContain("VITE_SINGLE_PICK_AI_BASE: https://api.keibalab.net");
  });

  it("the brand-mark asset path and localStorage-backed backup format tag are untouched", () => {
    expect(indexHtml).toContain("media/keiba-lab-mark.png");
    const home = rebrandedClientSources["client/src/pages/Home.tsx"];
    expect(home).toContain('"keiba-lab-backup"');
    expect(home).toContain('localStorage.setItem("keiba-lab-distance"');
  });
});
