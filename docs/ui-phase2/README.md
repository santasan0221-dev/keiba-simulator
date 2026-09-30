# KEIBA TRACE UI/UX Phase 2 — visual evidence

Base: `main` @ `f913c561607eb84ebc913cb031688eff882b5012`.

## Fixture UI check (`scripts/ui-evidence/`)

Screenshots are **not committed**. They are fixture renders, not production
data, and are regenerated on demand into a scratch directory.

- `mockLabApi.mjs` — deterministic FIXTURE of the read-only `/api/lab/*`
  contract (horse names/numbers are fixtures, not real races). Local only;
  never shipped in the client bundle.
- `capture.mjs` — builds nothing itself; serves a static build under
  `/keiba-simulator/`, drives Home / Operations / Race History / Race Detail /
  Simulator at 1440px and 390px with the clock fixed at 2026-09-30 13:05 JST,
  writes PNGs + `metrics.json` to the output dir, and **exits 1** on any
  horizontal overflow, `[object Object]` text or tap target under 44px.

**Requires a globally installed Playwright with Chromium.** Playwright is
intentionally not a package dependency; point `PLAYWRIGHT_MODULE` at the
global install (and `CHROMIUM_PATH` if the browser is not on Playwright's
default path):

```sh
node scripts/ui-evidence/mockLabApi.mjs 4100 &
VITE_SINGLE_PICK_AI_BASE=http://127.0.0.1:4100 pnpm exec vite build --base=/keiba-simulator/ --outDir /tmp/dist
PLAYWRIGHT_MODULE=$(npm root -g)/playwright/index.js \
  node scripts/ui-evidence/capture.mjs /tmp/dist /tmp/ui-evidence   # add REDUCED_MOTION=1 for the reduced-motion pass
```

This is a fixture contract check only. It does not verify the production
API at runtime; that has to be done against `https://api.keibalab.net`.

## Phase 1 audit — why the previous refresh read as "barely changed"

- **Layout was the old structure.** Home was still value strip → FREE strip →
  date/org form → flat list; Race Detail was one 720–960px column with the
  TruthPanel card as the whole page. Only colours and borders changed.
- **Tiny type.** Legacy `index.css` sets 7–10px labels (`brand-caption` 7px,
  table cells 8–9px). The first view on Home was mostly 9–10px copy.
- **No first-view answer.** Nothing on Home said *what is next, what is the
  pick, should I care* — the user had to pick an org and scroll to a list.
- **Weak CTAs.** One gold "今日のAI予想を見る" anchor; race rows had a small
  outlined "詳細を見る".
- **◎ not prominent.** ◎ was a 14px glyph inside a sentence; the ranking table
  printed "無印" in gold on every unmarked row, drowning the real marks.
- **AI / MARKET / SIM indistinct.** Only the simulator had origin panels (all
  "—"); Race Detail mixed AI and market numbers in one uniform table and never
  showed AI評価1位 or 市場評価1位 separately.
- **No racing atmosphere.** No post times up front, no countdown, no ticker,
  no winner moment; the simulator was an empty oval placeholder.
