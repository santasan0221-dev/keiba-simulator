# Simulator V3 — branch integration plan

Audit date 2026-10-07 (after `git fetch --all --prune`). Investigation only: nothing was merged, pushed, rebased or deleted.
`origin/main` = `main` = `61fdc2cfdc45f91a0399d147a13735dcda435f3d`.

**Status after approval (2026-10-07): Plan A approved.** Line P is canonical; Style Model V2 is not ported; line Q contributes diagnostics, tests and UI only (manual port); Visual Polish and Analytics go last. The `record.wins / seconds / thirds` data-source contract extension is approved (see section 12).

Update since the first version of this plan: the four line-P branches are now on `origin` (verified identical to local); the analytics work was committed as `6918420` (parent `96a0301`); the Visual Polish work was found (section 7).

## 1. Topology

| branch | SHA | base | ahead / behind main | merge commits | on origin | worktree |
|---|---|---|---|---|---|---|
| `main` / `origin/main` | `61fdc2c` | – | 0 / 0 | – | yes | `keiba-simulator` (was) |
| `feat/simulator-v3-full-finish` | `fbb0ed5` | `61fdc2c` | 2 / 0 | 0 | yes (pushed) | `C:\t\ksim_finish` |
| `feat/simulator-v3-terrain-tempo` | `17aa6a9` | `61fdc2c` | 3 / 0 | 0 | yes (pushed) | `C:\t\ksim_terrain` |
| `feat/simulator-v3-compat-noise-on-terrain` | `aa2a150` | `61fdc2c` | 4 / 0 | 0 | yes (pushed) | `C:\t\ksim_compat` |
| `feat/simulator-v3-analytics-on-compat` | `6918420` (analytics) on `96a0301` | `61fdc2c` | 6 / 0 | 0 | yes (pushed) | `C:\t\ksim_an2` |
| `feat/simulator-v3-analytics` | `61fdc2c` | `61fdc2c` | 0 / 0 (empty) | 0 | no | `C:\t\ksim_analytics` |
| `feat/simulator-v3-terrain-compat-noise` | `b46c4e4` | `61fdc2c` | 3 / 0 | 0 | yes (`b46c4e4`) | `keiba-simulator` (HEAD) |
| detached `3640075` | `3640075` | `dea5232` | – | – | – | `C:\t\ksim_v31` |

Unrelated branches (all already ancestors of main, or old): `fix/simulator-header-overlap`, `fix/ops-dashboard-result-format` (worktree has uncommitted ops-dashboard edits), `feat/official-result-truth-panel`, `growth-p0-implementation`, `claude/simulator-v3-scenario-order`; `feat/runtime-api-base` is 1 ahead / 99 behind. None is part of this plan.

## 2. Commit graph (Simulator V3 only)

```
61fdc2c (main)  ──┬── 6645997 Full Finish
                  │     └─ fbb0ed5 seeded in-style order (horse-number bias)          [feat/…-full-finish]
                  │          └─ 17aa6a9 Terrain Tempo                                  [feat/…-terrain-tempo]
                  │               └─ aa2a150 compat + seeded noise (+ FINISH_KEEP)     [feat/…-compat-noise-on-terrain]
                  │                    └─ 96a0301 contract pinned as tests              [feat/…-analytics-on-compat]  ← "line P"
                  │                         (+ uncommitted analytics WIP, Visual Polish: not found)
                  └── dea5232 V3.1 sim + terrain + compat + noise + full finish
                        └─ 3640075 going tuning / jump neutral / cap 0.985–1.015
                             └─ b46c4e4 Style Model V2-A                               [feat/…-terrain-compat-noise] ← "line Q"
```

Two independent lines from the same parent. Line P ancestry: `61fdc2c ← 6645997 ← fbb0ed5 ← 17aa6a9 ← aa2a150 ← 96a0301`. Line Q: `61fdc2c ← dea5232 ← 3640075 ← b46c4e4`. Neither contains the other. `aa2a150` says it ports the pure parts of `3640075` (profile, compatibility, noise, audit) but not its simulator.

## 3. Feature matrix

| Feature | Full Finish (6645997, fbb0ed5) | Terrain (17aa6a9) | aa2a150 / 96a0301 | 3640075 (and dea5232) | b46c4e4 | Visual Polish |
|---|---|---|---|---|---|---|
| Full Finish (order to 100%, crossing, run-on, SCENARIO CROSSING ORDER, GOAL checkpoint) | あり (frame engine) | あり (inherited) | あり (inherited, gap cap 5 → 3) | あり、**別実装** (time-stepped `scenarioSim`) | あり (same as 3640075) | なし |
| Seeded tie-break (no horse-number order) | あり (hash slot in style group; fbb0ed5) | あり | あり | 似ているが別実装 (noise decides; ties by number only in a noise-free run) | 同左 | なし |
| Camera fixes (keepInView edge, goal framed, home pull-back) | あり (midway fallback, `GOAL_FRAME_FROM`, `HOME_VIEW_FROM`, anchors) | あり (+ `cameraEnergy`) | あり | 似ているが別実装 (widen-view guarantee; goal only in the eased target) | 同左 | なし |
| Terrain Tempo | なし | あり (4 common factors: pace, compression, lateral spread, camera energy; order-invariant by construction) | あり | **別実装** (tempo / compress / spread / slope on positions; created the style flip) | 別実装 + V2 fix | なし |
| Horse profile | なし | なし | あり (`record.*` only, self-comparison) | **別実装** (`abilities.stamina/start` field-relative z, `record.starts`, going) | 同左 | なし |
| Compatibility | なし | なし | あり (terms ≤ ±1% / start ≤ ±0.5%, total 0.985–1.015; observed 0.991–1.008) | あり (cap 0.985–1.015; observed 0.985–1.015) | 同左 | なし |
| Seeded noise | なし | なし | あり | あり (same constants; P text differs) | あり | なし |
| `FINISH_KEEP` tuning | 旧表 (0.75 / 0.70 / 0.62 / 0.62) | 旧表 | **再校正済み** (1.25 / 1 / 0.5 / 0.3 / 0.29 at the average pace) | なし (no such table) | なし | なし |
| Style Model V2 | なし | なし | なし (not needed, see §6) | なし | **あり** | なし |
| Variant selector UI (STANDARD / ALT A / ALT B, 別の展開を見る) | なし | なし | なし (variants exist in the engine only) | あり | あり | なし |
| COURSE FIT panel | なし | なし | なし | あり | あり | なし |
| COURSE EFFECT | なし | あり (one label line) | あり | あり (chips) | あり | なし |
| Visual course polish / horse-number colours / label-overlap avoidance / selected linkage / crossing chips | なし | なし | なし | なし | なし | **not found** |
| Share View | なし | なし | なし | なし | なし | **not found** |
| Analytics (`beta_sim_*`) | なし | なし | なし (committed) / **WIP uncommitted** in `C:\t\ksim_an2` | なし | なし | – |
| Calibration audit script and docs | なし | なし | script + `SCENARIO_COMPAT_NOISE_AUDIT.md` | script + 3 docs | + `STYLE_MODEL_V2_AUDIT.md` | – |
| Tests | 474+ | green | **547 / 59 files, tsc clean (re-run today)** | 505–538 (4 known env failures) | 538 (4 known env failures) | – |

## 4. File overlap (changed since main)

Changed on both lines (19): `ScenarioOrderPanel.tsx`, `TrackStage.tsx`, `camera.ts`, `camera.test.ts`, `horseScenarioProfile.ts` (+ test), `scenarioMotion.test.ts`, `scenarioNoise.ts` (+ test), `scenarioOrder.ts` (+ test), `scenarioReplay.ts` (+ test), `terrainTempo.ts` (+ test), `SimulatorShell.tsx`, `SimulatorShell.contract.test.tsx`, `trace.css`, `scripts/scenario_calibration_audit.ts`.
Only line P: `courseAtlas.ts`, `scenarioMotion.ts`, `scenarioRunnerField.ts` (+ test), `scenarioContract.test.ts`, `SCENARIO_COMPAT_NOISE_AUDIT.md`.
Only line Q: `scenarioSim.ts` (+ test), `styleModelV2.ts` (+ test), `scenario_diagnostics.ts`, 3 audit docs.

`git merge-tree --write-tree 96a0301 b46c4e4` (dry run, nothing touched): **17 conflicting files** — `ScenarioOrderPanel.tsx`, `TrackStage.tsx`, `camera.ts`, `horseScenarioProfile.ts` and `.test.ts` (add/add), `scenarioMotion.test.ts`, `scenarioNoise.ts` and `.test.ts` (add/add), `scenarioOrder.ts` and `.test.ts`, `scenarioReplay.ts` and `.test.ts`, `terrainTempo.ts` and `.test.ts` (add/add), `SimulatorShell.tsx`, `SimulatorShell.contract.test.tsx`, plus `scenario_calibration_audit.ts`. They are **semantic** conflicts, not textual ones: the lines use different engines (closed-form frame engine vs precomputed time-stepped simulation) behind the same file names, so "ours/theirs" cannot be right for any of them.

## 5. Canonical implementations

Same 100 real JRA races, same conditions (line Q = `b46c4e4`, final build; line P = `96a0301`, re-run today with its own `scenario_calibration_audit.ts`, 60,730 runs in 32 s):

| | line Q `b46c4e4` | line P `96a0301` |
|---|---|---|
| HIGH+ concentration races | 0 | 0 |
| max first-cross mean / p90 / max | 0.170 / 0.30 / 0.395 (10 MODERATE) | **0.158 / 0.225 / 0.295 (all DIVERSE)** |
| normalised entropy / distinct first horses | 0.934 / 13.0 | **0.958 / 13.3** |
| strongest-data horse (all terms saturated, noise on) | 0.61 (derived 0.565) | 0.215 (derived 0.13) |
| AI TOP / ◎ / MARKET TOP first-rate (others) | 0.099 / 0.103 / 0.101 (0.078) | **0.079 / 0.076 / 0.085 (0.079)** |
| average-pace style groups | 0.484–0.511 | 0.422–0.547 |
| slow / fast pace tilt | FRONT 0.42 / FRONT 0.67, CLOSER 0.41 | FRONT 0.30 / CLOSER 0.37 |
| terrain on vs off (deterministic order) | needed Style V2 to be stable | **identical (Spearman 1.000) by construction** |
| variants Spearman / same first horse | 0.066 / 12.4% | 0.076 / 9.9% |
| profile-usable races | 81 (reads `abilities.*`) | 60 (reads `record.*` only) |
| determinism / leakage differences | 0 / 0 | 0 / 0 |
| speed | 163 scenarios/s | **1,910 scenarios/s** |

Data check (today, 1,333 horses of the 100 races): `abilities.stamina`, `abilities.start`, `abilities.form` are exact copies of `record.stamina_distance_band_top3`, `record.start_front_run_share`, `record.form_recent3_top3` (967/967, 1100/1100, 1100/1100). Line Q ranked horses by the **raw** distance-band top-3 rate (field-relative z-score): that is class, not suitability, which is why its MARKET / AI / mark tilt is 1.3×. Line P compares a horse with **itself** (band rate minus its own overall rate), which measures suitability. This is a defect of my line-Q profile, not of the audit.

| feature | canonical | why |
|---|---|---|
| Full Finish | **line P: 6645997 + fbb0ed5** | keeps the engine every other P feature is built on; hash tie-break verified on 6,000 seeds; all runners cross before 100% with the crossing numbers equal to the final frame; 4 real courses × 1440 / 390, 22 runs; about 12× faster than line Q's simulator (1,910 vs 163 scenarios/s). Line Q's finish depends on the time-stepped engine. |
| Terrain Tempo | **line P: 17aa6a9** | common factors, so order cannot change (tested on 5 courses); UNKNOWN neutral; no Atlas import in the order modules (opaque `GapField`). Line Q's terrain acted on positions and caused the style flip that V2-A had to repair. Q's `effects` chips are a UI idea worth porting, not the maths. |
| Compatibility + noise | **line P: aa2a150** | strict `record.*` contract (structural + source test), self-comparison, AI/◎/MARKET at uniform, weaker concentration. Line Q contributes **diagnostics only**: the audit script and the calibration / tuning docs (history), marked superseded. |
| Style model | **line P frame engine + `FINISH_KEEP`**, V2-A **not ported** | see §6 |
| Camera | **line P** | passes the same edge-hugging containment test that motivated Q's widen-view fix (401 cases: 0 points outside for both); P also frames the goal earlier so there is no pop. Port only Q's regression test. |
| Variant selector, COURSE FIT, COURSE EFFECT chips | **port from line Q (manual)** | absent on line P; the analytics WIP already emits `beta_sim_variant_change`. COURSE FIT must be re-expressed on P's `HorseProfile` (distance fit, going fit, start tendency, starts = confidence; the rest UNKNOWN). |
| Analytics | **WIP in `ksim_an2`, last** | built on line P's `crossingSequence`; defines "complete" = last runner crossed. |

## 6. Style model decision (Phase 9)

- Line Q's root cause (corner / straight pull towards the pack mean leaving a permanent offset) **does not exist on line P**: its terrain is a common factor on the gaps; frame order and crossing order are identical with and without terrain.
- V2-A needs a reference runner that advances through the terrain and per-runner dynamics; line P is a closed-form interpolation of phase keyframes (`GAP` in lengths, `FINISH_KEEP`, `GapField`). A literal port would replace the formation maths and invalidate P's 547 tests and pinned contract for no demonstrated gain.
- What *is* worth keeping is V2's principle: converge to level at the average pace and keep only a small pace tilt. P instead fits `FINISH_KEEP` (1.25 / 1 / 0.5 / 0.3 / 0.29) and says itself it was re-tuned after a MARKET-TOP diagnostic ("judgment call, needs review"); closers end at 0.422, front-runners 0.466, and the slow-pace tilt is large (FRONT 0.30).
- **Plan:** integrate P unchanged first; afterwards run one conditional experiment on the integrated branch (30 s audit): replace the fitted `FINISH_KEEP` by the V2 principle (average pace → level, pace tilt only) and adopt it only if the pre-registered style criteria and the concentration / independence metrics of §5 do not get worse.

## 7. Visual Polish (found)

Location: `C:\Users\santa\Documents\single_pick_ai\tmp\ksim_visual_polish\`, a standalone clone (its `origin` is the local folder `C:/t/ksim_finish`), branch `feat/simulator-v3-visual-polish` at `fbb0ed5` (the Full Finish tip), **nothing committed**: 5 modified files (`TrackStage.tsx`, `ScenarioOrderPanel.tsx`, `SimulatorShell.tsx`, `SimulatorShell.contract.test.tsx`, `trace.css`; +158 / -20) and 7 new files (`runnerLabels.ts` + test, `runnerPresentation.ts` + test, `visualInvariance.test.ts`, `scripts/visualPolishPreview.mjs`, `docs/simulator-visual-polish.md`), plus screenshots and measurement JSON under `artifacts/`.
Its own report says **BLOCKED**: tsc, build and 154 focused tests are green, the logic modules are source-identical to the base, and label overlap / off-frame / overflow checks are clean, but foreground 60 fps / p95 < 20 ms was **not** confirmed (the measured run was in a background browser), and the final distance / slope / corner annotations were not re-checked against all conditions. Bundle +2,503 bytes gzip. Not covered on screen: the remaining 5 venues and jump courses.

Read-only handling: nothing in that folder was touched. A snapshot (12 files + a 33 KB patch + base SHA) is in `C:\t\vp_snapshot_20261007`. Probe results: the patch **applies cleanly to `fbb0ed5`**, but on `96a0301` it fails in `ScenarioOrderPanel.tsx`, `TrackStage.tsx`, `SimulatorShell.tsx` and `SimulatorShell.contract.test.tsx` (only `trace.css` and the 7 new files are independent).
Strategy (unchanged): **manual port on top of the integrated logic, last**, never a raw cherry-pick. The new files (`runnerLabels`, `runnerPresentation`, `visualInvariance`) port as they are; the four conflicting files are re-applied by hand against the `GapField` / terrain / profile wiring of `96a0301`. The port keeps the author's logic-invariance test and finishes the open items: foreground-Chrome performance, annotation interference, the remaining venues and jump courses.

## 8. Integration options

| | A: line P as base, port Q's UI and diagnostics | B: line Q as base, port P's fixes | C: new branch from main, port function by function |
|---|---|---|---|
| conflicts | 0 for the P chain (linear, already green); manual ports touch Shell / Panel / CSS | 17 files, all semantic | same as A, more churn |
| regression risk | lowest: P's 547 tests and pinned contract stay | high: P's Full Finish, terrain invariance and runner field must be re-derived in the sim | as A, but nothing is already verified as a unit |
| audit reuse | P's audit script runs in 30 s; Q's audit stays as history | Q's slow audit | both |
| code churn | small | large (frame engine ↔ sim) | largest |
| test burden | add tests for the ported UI only | re-pin the whole contract | re-pin the whole contract |

**Recommendation: Plan A.** (Plan B discards the better data contract and independence; plan C has no advantage over A.)

## 9. Proposed commit sequence

Branch `feat/simulator-v3-integrated` from `96a0301` (linear, no merge; if you prefer to see each step, replay with `git cherry-pick -n` in this order).

1. `6645997` Full Finish.
2. `fbb0ed5` seeded in-style order.
3. `17aa6a9` Terrain Tempo.
4. `aa2a150` compatibility + seeded noise.
5. `96a0301` contract tests.
6. *new* test / doc only (**done on the integrated branch**): the data-source contract test and `overallTop3Rate` (behaviour unchanged), Q's edge-hugging camera cases, the Q calibration docs under `docs/simulator/history_v31_line/` marked "superseded engine", this plan.
7. *new, manual* variant selector + 別の展開を見る (from Q).
8. *new, manual* COURSE FIT panel on P's `HorseProfile` (+ COURSE EFFECT chips if wanted).
9. *conditional* `FINISH_KEEP` → V2 principle (§6).
10. *blocked* Visual Polish (manual port).
11. Analytics: cherry-pick `6918420` last, after the complete semantics are frozen (it touches `SimulatorShell.tsx`, which steps 7, 8 and 10 also change).

Each step is testable alone (tsc, vitest, the P audit).

## 10. Test matrix after integration

- **Logic:** determinism (race + variant + seed); no leakage (rewrite every forbidden field → identical output); horse-number bias; terrain ordering invariance; compatibility cap 0.985–1.015; noise bounds ±3%, zero mean; style neutrality (average pace 0.42–0.58, slow → front, fast → closers); all runners cross before 100%; crossing order ≠ any result field.
- **Runtime (real API, GET only):** Tokyo turf 2000, Kyoto dirt 1800, Nakayama turf 2500, Niigata turf 1000, Kokura fixture; 1440 and 390; normal and reduced motion; STANDARD / ALT A / ALT B.
- **Visual:** runner labels, horse-number colours, Share View, course annotations, crossing chips (when they exist).
- **Performance:** 60 fps, p95 frame ≤ 20 ms, 0 frames over 50 ms, order panel ≤ 10 updates/s.
- **Audit:** the P script on the same 100 races: concentration, entropy, strongest horse, AI / ◎ / MARKET, style bias by pace, terrain interaction, neutral benchmark, variant diversity.

## 11. Invariants (must survive integration)

Official result, odds, popularity, `abilities.*`, `model.*`, `market.*`, `display.*`, ◎, AI TOP, `market_ev`, `bet_decision` never reach the progress; same seed + same variant = same scenario; terrain is common to all runners; UNKNOWN = neutral; all runners finish; crossing order is never shown as an official result and carries no "1着" wording; the camera keeps every runner and the goal line visible; no mobile overflow; no horse-number order.

## 12. Data-source contract (approved; enforced by `horseDataContract.test.ts`)

Usable: run style; `record.start_front_run_share`; distance-band top-3 rate (`record.stamina_distance_band_top3`, band = `record.distance_band`); `record.going_top3_rates`; `record.starts` (confidence). **Approved extension:** `record.wins / seconds / thirds` are read **only** to form `overall_top3_rate = (wins + seconds + thirds) / starts`, the horse's own baseline for the distance-band comparison. They are never used as an ability correction, and nothing about the race being simulated (result, post-race information) may enter. The going term compares a horse with the mean of its own other goings and does not use them. `overallTop3Rate` is the single place that reads them.
Forbidden: `abilities.*` (incl. `speed`, which equals the model score), `model.*`, `market.*`, `display.*`, `honmei`, `ai_top`, `publication_marks`, `result`, `market_ev`, `bet_decision`, `form_recent3_top3`, `avg_finish`.
Line P already has the module source scan and the "rewrite everything forbidden → identical output" test (`scenarioContract.test.ts`); the integrated branch adds the **allow-list** test (exact `record.*` keys; `wins / seconds / thirds` only in the history type, its reader and `overallTop3Rate`; no other scenario module reads any `record.*`; split-invariance and strong/weak-horse invariance of the baseline).

## 13. Calibration reuse

Line P's `scenario_calibration_audit.ts` (derived from mine) re-ran today in 32 s and reproduces its documented table. Line Q's heavier experiment scripts (neutral style grid, style-model switch) depend on removed hooks and are not reusable; keep their results (docs) only.

## 14. Analytics placement

Last. Commit `6918420` (`betaAnalytics.ts` events `beta_sim_*`, `simulatorAnalytics.ts`, tests, `docs/public-beta-analytics.md`; parent `96a0301`) already defines **complete = the last runner crossed the goal** (`beta_sim_last_runner_crossed`, then `beta_sim_complete`) and needs `crossingSequence` from line P. It also emits `beta_sim_variant_change`, so step 7 (variant selector) must land first. Freeze the completion semantics (§11) before it is committed.

## 15. Scratch and untracked inventory (nothing deleted)

Repository `keiba-simulator` (not for commit): `scripts/_calib.ts`, `scripts/_dbg.ts`, `scripts/_dbg2.ts`, `scripts/style_model_audit.ts` (experiment, depends on removed hooks), `scripts/scenario_calibration_audit.ts` (shows as modified: line endings only), `docs/growth-implementation/` (older).
`C:\t`: `calib\`, `v3\` (audit scripts, screenshots), `kcand`, `kmain`, `ksim_*_patch*.py`, `ksim_*_runtime.json/.log`, `ksim_*_shots`, `ksim_finish_diag.png`, `p0base`, `simv3`, `simv3_base`, many other scratch folders. Session scratchpad: audit JSONs.
`C:\t\ksim_an2`: analytics WIP (**work product, keep**). `keiba-simulator_opsfix`: unrelated uncommitted ops-dashboard edits.

## 16. Promotion path

integrated branch → full regression (tsc, vitest vs baseline of known env failures, build) → P audit + runtime audit on the built bundle → you push the branch (the push hook blocks Claude) → review → fast-forward `main` by you → the Pages workflow deploys on push to `main` → public-site runtime audit. A PR / Actions flow is not assumed (confirm first).

## 17. Risks

- Visual Polish is BLOCKED by its own report (foreground performance, annotation interference) and is based on `fbb0ed5`; its port may need design changes against the terrain / profile wiring.
- Line P's compatibility is weak (strongest horse 21.5% against the 50–65% target of the tuning task); it is a deliberate "visible but never decisive" design and can be re-tuned later on the integrated branch.
- `FINISH_KEEP` is a fitted table with a documented judgment call; pace tilts are large.
- The ported UI (variant selector, COURSE FIT) touches the same files as Visual Polish and analytics: order matters.
- The Visual Polish work is an uncommitted clone with a local-folder remote: until it is committed somewhere pushable, only the snapshot protects it.
- No Kokura race in the data (fixture only); real phone not measured.
