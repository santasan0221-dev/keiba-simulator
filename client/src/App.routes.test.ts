import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { routeName } from "@/lib/betaAnalytics";

const appSource = readFileSync(resolve(import.meta.dirname, "App.tsx"), "utf8");

describe("/simulator routing", () => {
  it("App.tsx registers /simulator with the same one-line <Route> pattern as every other route", () => {
    expect(appSource).toContain('<Route path="/simulator" component={SimulatorPage} />');
    // Same base-path mechanism every other route (including the deep
    // /race/:org/:date/:venue/:no route) already relies on for the GH Pages
    // sub-path build -- no special-casing for /simulator.
    expect(appSource).toContain("import.meta.env.BASE_URL");
  });

  it("beta analytics recognizes /simulator as its own route instead of falling through to 'other'", () => {
    expect(routeName("/simulator")).toBe("simulator");
    expect(routeName("/keiba-simulator/simulator", "/keiba-simulator")).toBe("simulator");
  });

  it("Home ('/') route is unaffected by adding /simulator", () => {
    expect(routeName("/")).toBe("home");
  });
});
