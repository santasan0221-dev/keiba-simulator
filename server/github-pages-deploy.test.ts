import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  resolve(import.meta.dirname, "..", ".github", "workflows", "deploy-pages.yml"),
  "utf8",
);

describe("GitHub Pages deployment contract", () => {
  it("builds the project Pages artifact with the production API origin", () => {
    expect(workflow).toContain("VITE_SINGLE_PICK_AI_BASE: https://api.keibalab.net");
    expect(workflow).toContain("pnpm exec vite build --base=/${{ github.event.repository.name }}/");
  });

  it("publishes an SPA fallback alongside index.html", () => {
    expect(workflow).toContain("cp dist/public/index.html dist/public/404.html");
    expect(workflow).toContain("path: dist/public");
  });
});
