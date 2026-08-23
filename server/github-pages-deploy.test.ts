import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  resolve(import.meta.dirname, "..", ".github", "workflows", "deploy-pages.yml"),
  "utf8",
);
const indexHtml = readFileSync(
  resolve(import.meta.dirname, "..", "client", "index.html"),
  "utf8",
);
const fallbackHtmlPath = resolve(
  import.meta.dirname,
  "..",
  "client",
  "public",
  "404.html",
);
const clientSources = [
  "client/index.html",
  "client/src/components/AccessTierUI.tsx",
  "client/src/components/LabServiceNavigation.tsx",
  "client/src/pages/MemberPage.tsx",
  "client/src/pages/Home.tsx",
].map((file) => readFileSync(resolve(import.meta.dirname, "..", file), "utf8"));

describe("GitHub Pages deployment contract", () => {
  it("builds the project Pages artifact with the production API origin", () => {
    expect(workflow).toContain("VITE_SINGLE_PICK_AI_BASE: https://api.keibalab.net");
    expect(workflow).toContain("pnpm exec vite build --base=/${{ github.event.repository.name }}/");
  });

  it("publishes an SPA fallback alongside index.html", () => {
    expect(workflow).toContain(
      "sed -i '/%VITE_ANALYTICS_ENDPOINT%/d' dist/public/index.html",
    );
    expect(workflow).not.toContain("cp dist/public/index.html dist/public/404.html");
    expect(existsSync(fallbackHtmlPath)).toBe(true);
    expect(readFileSync(fallbackHtmlPath, "utf8")).toContain("sessionStorage.redirect");
    expect(indexHtml).toContain("sessionStorage.redirect");
    expect(workflow).toContain("path: dist/public");
  });

  it("does not depend on Manus-only static asset routes", () => {
    expect(clientSources.join("\n")).not.toContain("/manus-storage/");
    expect(
      existsSync(
        resolve(
          import.meta.dirname,
          "..",
          "client",
          "public",
          "media",
          "keiba-racecourse-night.png",
        ),
      ),
    ).toBe(true);
  });

  it("routes internal links through the configured Wouter base", () => {
    expect(clientSources.join("\n")).not.toMatch(
      /<a\b[^>]*href=["']\/(?:free|access-code)?["']/,
    );
  });
});
