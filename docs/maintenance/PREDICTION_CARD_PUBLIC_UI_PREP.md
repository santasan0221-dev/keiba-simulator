# Prediction Card Public UI Integration Prep

Target: keiba-simulator public race detail. Base origin/main `f1f795aeb883df3f70b2dd940b644f3ebcccc61f`. Branch `feat/prediction-card-public-ui-prep`, directly on that base; no old branch merge. Final package SHA: `git rev-parse HEAD` at the documentation commit.

## Inventory and reuse

Current main uses RacePage/RaceExperience, RaceHero, PickTrio, AgreementPanel, RankingBoard, TruthPanel, LabServiceNavigation and RaceTicker. Publication ◎ is in PickTrio and the existing read-only response. Home/RealRaceLoader owns the race list; AI history, betting candidates, analysis and Simulator have independent routes. Existing fetchRace/fetchRaces loading/active-request guards remain authoritative.

The approved repackage candidate ac9d3ad contains PredictionCard, its CSS and the normalized prediction_card_v1 DTO. These assets were copied individually. The existing venue-filter primitives were reused individually too; main had not yet incorporated that venue strip. No old prototype commits, backend builder, publication code or simulator changes were merged.

## Placement comparison

A: full card after prediction/ranking panel. Full six-runner content would add substantial mobile scrolling before actions.

B: near history/navigation. Main's 18-runner ranking makes this late in the page and hard to discover.

**Selected C: collapsed section after AgreementPanel, before RankingBoard.** It sits near the existing prediction information, announces AI候補6頭 with 公開◎とは別のAI候補順位, and opens on a deliberate click/keyboard action. The existing Simulator/history/share actions are unchanged. The READY component remains inside the disclosure; screenshots labelled full show an explicitly expanded disclosure. Route/payload change resets its native open state.

## Flag, data and errors

Frontend flag: **VITE_PREDICTION_CARD_PUBLIC_ENABLED**, strict string "1", default OFF; every other/malformed value is OFF. This reuses the earlier approved frontend name. Backend PREDICTION_CARD_PUBLIC_ENABLED remains independent and untouched. No query/localStorage switch was added. ON builds exist only in isolated /tmp fixture outputs, never production configuration or deployments.

OFF: card/venue-prep controls add zero DOM, no fetch, no placeholder. Seven settled, animation-disabled main/OFF screenshots are pixel-identical, with equal DOM counts/layout and request paths. The new stylesheet selectors affect only the new card/filter classes.

ON + prediction_card missing: zero card DOM. Existing response is the sole input; no card-specific endpoint, request, adapter, builder or inferred reason. Existing DTO/endpoint contract remains unchanged; LabRace adds the known optional field in frontend typing only.

Runtime validation checks version/status, selected race_key, organization, six_marks version, unique ordinal marks/symbols, text/annotation shapes and pairwise horse references. Malformed cards are omitted. Missing optional display annotations keep marks, with no fake convergence or explanation placeholder. Three marks use AI評価上位候補; six use the approved heading. NAR always has no convergence region, even if an erroneous convergence payload is supplied. Only supplied reasons/evidence/pairwise text are rendered. Long names and reasons wrap instead of being clipped. Desktop uses focus / two-candidate / three-candidate rows.

A card-local error boundary protects the existing page; a new identity/payload resets it. Existing prediction remains independent. No new odds/popularity/result/probability/score/contribution/weight/candidate_width rendering was added to the card. Existing public ranking/data-room content is unchanged.

## Publication separation

Card ◎ is six_marks rank1, never publication ◎ or a replacement for the existing win-probability AI TOP panel. The heading, ordinal role labels, independent border/disclosure and explicit disclaimer distinguish it without relying on color. Fixture publication horse18 and card focus horse2 remain distinct; publication panel text is identical to main.

Disclaimer states pre-race evaluation, no purchase recommendation, not the public honmei, and convergence/explanation are not ◎ hit probability. No new 本命/推奨本命/買い目/勝負馬 product labels were introduced in the card.

## Race and venue behavior

The reused venue strip lives inside the card disclosure and is scoped to this UI-prep flag and the race detail's already-fetched dayRaces. It cannot insert a new row above the loaded race when its list response arrives. OFF leaves the original ticker unchanged. Selecting a venue uses normal navigation to its first race, not another card request. Controls are withheld during mismatched/loading scope; Back/Forward realigns the active venue to the newly loaded race. The pre-existing active-request cleanup rejects late responses; card race_key independently rejects stale content before the next response. Tokyo→Kyoto→Back→Forward→Tokyo without card passed.

## Evidence and performance

See scratchpad/ui/prediction_card_public_ui_prep_summary.json and prediction_card_public_ui_prep_evidence/.

- Viewports320/360/390/430/768/1024/1440. Main/OFF/ON comparisons plus390/1440 full, missing, no explanation, no selectivity, NAR, marks-only, omitted annotations, malformed, long names, three marks and details-open cases.
- 41 fixture browser cases; horizontal overflow0, ordinary console/pageerror/request failures0. Race/venue/Back/Forward stale card0. Card screenshots are expanded by keyboard, not silently assumed open.
- Article/heading/list semantics and ordinal accessible names; both disclosure targets>=44px; keyboard toggles, focus ring and forced-colors checked. accessibility-results.json includes the accessible tree and solid keyboard-focus outline; pointer-only focus in the general matrix is not a keyboard ring test.
- React SSR100-render microbenchmark and first meaningful DOM/DOM-node/layout-shift measurements are recorded. SSR timings are not client React Profiler measurements or production latency claims. Card is part of the first race-response render; there is no delayed card fetch. User-triggered expansion is distinguished from non-input CLS.
- Production OFF build/typecheck succeed. Bundle size deltas are in the summary; JS/CSS bytes are not zero despite OFF DOM0. Existing large-chunk/empty-export warnings were not suppressed.
- Simulator V3:18 sessions, six main/OFF/ON comparisons, 2D/3D, top5, remaining distance, section, playback, Share, GOAL, reduced motion and fixed completion-strip geometry remain equal. Protected simulator/publication/server sources match main.
- Full candidate suite and baseline counts, eight mutation results and candidate-only failures are in the summary. Test connection URLs use the repository's CI HTTPS values; missing environment variables were corrected without skipping or relaxing tests.

Commands (existing toolchain/dependencies; no lockfile changes):

```bash
node_modules/.bin/tsc --noEmit
VITE_SINGLE_PICK_AI_BASE=https://api.keibalab.net SINGLE_PICK_AI_BASE_URL=https://api.keibalab.net node_modules/.bin/vitest run
VITE_SINGLE_PICK_AI_BASE=https://api.keibalab.net node_modules/.bin/vite build
node_modules/.bin/esbuild server/_core/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist
/workspace/.card-venv/bin/python scripts/mutate-prediction-card-public-ui.py
node scratchpad/ui/prediction_card_public_ui_prep_evidence/browser.mjs
node scratchpad/ui/prediction_card_public_ui_prep_evidence/accessibility.mjs
node scratchpad/ui/prediction_card_public_ui_prep_evidence/regression.mjs
node scratchpad/ui/prediction_card_public_ui_prep_evidence/simulator.mjs
```

Browser runners use an archived main build and isolated candidate OFF/ON builds specified in their roots maps. Change those local paths for another workspace; fixture ON output must never be deployed. No live API production smoke is claimed.

## Rollout boundary

Frontend prep is ready when the recorded gates pass. API canonical production-data verification remains separate. The optional field is already wired; no additional frontend request or backend contract change is needed after API availability. Public activation still requires approved backend/organization rollout, explicit CI/env flag review and production smoke. Existing global-backend/JRA-only staging blocker is not implemented in this frontend task.

No main/master push, deploy, public/backend/v1.2 flag activation, scheduler, prediction/publication logic, production store change or automatic note/X posting occurred. Existing unrelated untracked simulator-audit files were preserved.

Final measured result: candidate660/660 and main647/647, candidate-only failures0; eight mutations killed. OFF JS increment8,542 bytes (gzip2,255), CSS increment2,709 bytes (gzip657). Non-input CLS after containing the venue controls: approximately0.062 at320–430,0.060 at768,0.059 at1024,0.037 at1440, equal to the main loading behavior within observed scheduling variation. Card availability and venue-list arrival do not add another row above the race. UI prep is KEIBA_TRACE_PREDICTION_CARD_PUBLIC_UI_PREP_READY; live API verification remains separate.
