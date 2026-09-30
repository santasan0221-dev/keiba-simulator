// Capture before/after UI evidence against a static build + the fixture API.
//
//   node scripts/ui-evidence/capture.mjs <distDir> <outDir>
//
// Expects the build to have been made with
//   VITE_SINGLE_PICK_AI_BASE=http://127.0.0.1:4100 vite build --base=/keiba-simulator/
// and mockLabApi.mjs listening on 4100. Writes one PNG per page/viewport and
// a metrics.json with horizontal overflow, "[object Object]" count and
// undersized tap targets per page. Write outDir outside the repo: the images
// are fixture renders and are not committed.
//
// Requires a GLOBAL Playwright + Chromium (not a package dependency), e.g.
//   PLAYWRIGHT_MODULE=$(npm root -g)/playwright/index.js node scripts/ui-evidence/capture.mjs ...
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
const playwright = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const chromium = playwright.chromium ?? playwright.default.chromium;

const [distDir, outDir] = process.argv.slice(2);
if (!distDir || !outDir) throw new Error("usage: capture.mjs <distDir> <outDir>");
fs.mkdirSync(outDir, { recursive: true });
const BASE = "/keiba-simulator";
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".json": "application/json", ".ttf": "font/ttf", ".svg": "image/svg+xml" };

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  let rel = decodeURIComponent(url.pathname.replace(BASE, "")) || "/";
  let file = path.join(distDir, rel);
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(distDir, "index.html");
  res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
}).listen(4173, "127.0.0.1");

const PAGES = [
  ["home", "/"],
  ["operations", "/ai-history"],
  ["race-history", "/ai-history#race-ledger"],
  ["race-detail", "/race/JRA/2026-09-30/中山/11"],
  ["simulator", "/simulator"],
  ["simulator-race", `/simulator?race=${encodeURIComponent("JRA|2026-09-30|中山|11")}`, "TURN"],
];
const VIEWPORTS = [["1440", { width: 1440, height: 900 }], ["390", { width: 390, height: 844 }]];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const metrics = {};
for (const [vpName, viewport] of VIEWPORTS) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, locale: "ja-JP", timezoneId: "Asia/Tokyo", reducedMotion: process.env.REDUCED_MOTION ? "reduce" : "no-preference" });
  for (const [name, route, clickText] of PAGES) {
    const page = await context.newPage();
    await page.clock.setFixedTime(new Date("2026-09-30T13:05:00+09:00"));
    await page.goto(`http://127.0.0.1:4173${BASE}${route}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    if (clickText) { await page.getByRole("button", { name: clickText, exact: true }).click(); await page.waitForTimeout(1500); }
    if (route.includes("#")) {
      const id = route.split("#")[1];
      await page.evaluate((target) => document.getElementById(target)?.scrollIntoView(), id);
      await page.waitForTimeout(400);
    }
    if (vpName === "390" && !route.includes("#")) await page.screenshot({ path: path.join(outDir, `${name}-${vpName}-fold.png`) });
    const shot = path.join(outDir, `${name}-${vpName}.png`);
    await page.screenshot({ path: shot, fullPage: !route.includes("#") && name !== "operations" });
    metrics[`${name}-${vpName}`] = await page.evaluate(() => {
      const doc = document.documentElement;
      const small = [...document.querySelectorAll("a[href], button, select, summary, input")]
        .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden"; })
        .filter((el) => { const r = el.getBoundingClientRect(); return r.height < 44 || r.width < 44; })
        .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).split(" ")[0]} ${Math.round(el.getBoundingClientRect().width)}x${Math.round(el.getBoundingClientRect().height)}`);
      return {
        horizontalOverflow: Math.max(0, doc.scrollWidth - doc.clientWidth),
        objectObject: (document.body.innerText.match(/\[object Object\]/g) ?? []).length,
        undersizedTapTargets: small.length,
        undersizedSample: small.slice(0, 8),
      };
    });
    await page.close();
  }
  await context.close();
}
fs.writeFileSync(path.join(outDir, "metrics.json"), JSON.stringify(metrics, null, 2));
console.log(JSON.stringify(metrics, null, 2));
await browser.close();
server.close();
const failures = Object.entries(metrics).filter(([, value]) => value.horizontalOverflow > 0 || value.objectObject > 0 || value.undersizedTapTargets > 0);
if (failures.length) { console.error("UI evidence gate FAILED:", failures.map(([key]) => key).join(", ")); process.exitCode = 1; }
