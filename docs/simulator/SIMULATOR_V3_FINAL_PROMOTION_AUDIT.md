# Simulator V3 final promotion package audit (2026-10-13)

Label: **KEIBA_TRACE_SIMULATOR_V3_FINAL_PROMOTION_HUMAN_CHECK_PENDING**
Branch `feat/simulator-v3-final-promotion-package` = origin/main `5e9bda1f38588397e5cfbf6a6dff08c8a87bd8ac` + 3 commits (fast-forward only, 0 behind). Nothing pushed, nothing deployed.

## Finding that changes the premise
origin/main is already `5e9bda1` (the TOP_3D final line). All 11 earlier prerequisite commits are ancestors of main, so the new prerequisite set is **empty**; no prerequisite runtime/test commits exist in this package. Previous blocker ("11 unapproved ancestors") does not apply to main now.

## Sources and identity
- Visual Polish: the claimed commit `32bf5ebe2e99…` and snapshot `d6ec0c4c…` cannot be resolved in any local repository/worktree. The 9-file READY change exists as `c6c4a80` (feat/simulator-v3-top3d-prereq-repackage); its 9 files are byte-identical (modulo CRLF checkout) to the saved audit sources `C:/t/v3/visual_polish_closure/top3d_final_20261010_085057_d6ec0c4cd1c4/sources`. The package uses `git cherry-pick c6c4a80` (clean, patch-id 915a9a4a… identical). The identity with `32bf5ebe` itself is **not proven** (object absent); the snapshot hash `d6ec0c4c…` is the saved audit value and was not recomputed (algorithm not recorded).
- Visual UX: `aea0f690` + `14aa7f0a` cherry-picked (-n) and committed as one commit (single revert unit).
- Overlap: Polish and UX both change `trace.css` (both append at EOF), `SimulatorShell.tsx` (adjacent lines around the capture title / track section). Conflicts: `trace.css` kept both blocks; `SimulatorShell.tsx` kept Polish's header line plus UX's `data-layout`. Strategy chosen: selected-commit cherry-pick (no old features come along because main already holds the prerequisites); file-level port and squash were unnecessary.

## Commit structure
1. `f9d4502` Visual Polish (9 files). 2. `4a5b232` Visual UX (squashed). 3. docs. No runtime/test prerequisite commits (not needed).

## Verification
- tsc clean. Production build ok, also with the Pages settings (`--base=/keiba-simulator/`, `VITE_SINGLE_PICK_AI_BASE`). dist is not tracked (source-only commits). Pages workflow: push to main -> pnpm install -> vite build -> `dist/public` artifact -> deploy; hashed asset names, no cache-purge step.
- Tests: origin/main baseline 620 pass / 4 fail (624). Candidate 641 pass / 4 fail (645). The 4 failures are identical (resultOps x2, VITE_SINGLE_PICK_AI_BASE, SINGLE_PICK_AI_BASE_URL: environment/existing). Candidate-only failures: 0. Includes annotationLayout, annotationProjection, top3dClosureInvariance, visualInvariance, SimulatorShell contract, simulatorAnalytics, new layout and strip tests.
- Protected files (scenario*, camera, terrain*, top3dProjection, analytics, server, shared, courseAtlas/Sections): 0 changed. TrackStage's only layout read (`getBBox`) stays in the static annotation placement effect, not in the rAF loop.
- Browser (fixtures, Playwright): 116-case matrix (5 courses incl. 小倉, 390/1440, 2D/3D, 8/18 runners, 0/30/60/95%, reduced, Share) + 52 cases at 12/16 runners: overflow 0, label overlap 0, 5/5 leader chips, targets >=44px, 0 JS errors. Annotations (56 states: 390/1440, 2D/3D, normal/reduced, 30..100%): outside-svg 0, overlap 0. GOAL line visible and GOAL text inside the svg at 80/85/90/95/100% in all 40 states. Non-font console/page/network errors 0 (the only errors are Google Fonts blocked by the fixture server's CSP, identical on base).
- Visual UX identity (card height / track size / controls distance): 390 2D 829px / 382x340 / 104px, 390 3D 817px / 363x267 / 110px, 1440 2D 724px, 1440 3D 679px: same numbers as the READY measurement.
- Share View with Polish (canvas = viewport): 16:9 1280x720, 1:1 800x800, 9:16 450x800 all fit exactly one screen (no scroll), title + track + section + remaining + 5 chips present, overflow 0. Note: on 16:9 3D the track is small inside the canvas (UX Share sizing formula kept unchanged, no retuning).
- Non-simulator pages (/, /ai-history, race detail; 390 and 1440): text length, link count, overflow, errors identical to base.
- Performance (18 runners, 2x, normal and reduced, 390/1440, 2D/3D, 3 alternating runs vs base): p95 16.7-16.8ms everywhere; isolated single 33ms frames occur on base and candidate alike; no sustained regression.

## CLS: correction to the Visual UX report
The earlier "CLS 0.03" was page-load only (candidate load CLS: 0.03, unchanged). Measured during playback at 390px, CLS is 0.35 (2D) / 0.47 (3D) (0.59-0.75 reduced) because the status strip's first row wraps when the section name and remaining distance are long (e.g. 1〜2コーナー + 残り 約1400m), pushing the leaders and playback controls down ~28px. The **identical** value is measured on the Visual UX READY build (14aa7f0a), so the package introduces no regression, but it is a real shared defect (controls move under the finger during playback). Per the no-retuning rule it is NOT fixed here. Suggested follow-up (separate approval): reserve the strip's first-row height.

## Decisions
- PRE-RACE card block below the simulator (layout C): kept as the Visual UX READY default (reason: it is what moves the track card from ~1400px to ~600px at 390). Content unchanged; returning to the old order is a separate decision (`?uxl=B` shows it, DEFAULT_LAYOUT constant).
- Human 3-second test: NOT run. Seven 390x844 screens, a blank response sheet and a separate answer key are in `scratchpad/simulator/human_3sec_test/`. Do not count any model-read result as PASS.

## Rollback (verified on throwaway branches)
Revert Visual UX alone: clean, tree == Polish-only commit. Revert Polish alone while UX is present: CONFLICT (trace.css, SimulatorShell.tsx). Revert UX then Polish (LIFO): clean, tree == origin/main. Runbook: `scratchpad/simulator/SIMULATOR_V3_FINAL_PROMOTION_RUNBOOK.md`.
