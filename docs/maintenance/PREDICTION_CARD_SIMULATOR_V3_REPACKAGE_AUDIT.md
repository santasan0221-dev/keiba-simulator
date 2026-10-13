# Prediction Card × Simulator V3 — final UI repackage audit

Label: KEIBA_TRACE_PREDICTION_CARD_SIMULATOR_V3_REPACKAGE_READY.
Feature: feat/prediction-card-simulator-v3-repackage. Latest main fetched and
measured `f1f795aeb883df3f70b2dd940b644f3ebcccc61f`. Old card source `c2a90445ff8daa5d56fc3796625c06435a2b459d`, old base5e9bda1. Canonical card
contract single_pick_ai966d1185. No old branch merge/cherry-pick stack.

## Necessary differences and protection

Latest V3 changed14 client paths; selected old UI delta14 paths; intersection0,
no duplicate/conflicting file. Venue filter is the explicit required integration
prerequisite, not a hidden parent branch. Copy only client consumer/filter/tests,
exclude old docs/screenshots, all old history and unrelated features. Source
bytes equal the reviewed old card files; canonical DTO/renderer parity verified.
New branch is directly on current main, one reviewed commit. All292 protected
client/server/shared/scripts/config source files remain byte-identical to main,
including simulation, ranking, analytics, camera, course geometry, Terrain
Tempo, ViewSelector, TrackStage, annotation admission/projection, status strip,
SimulatorShell, trace.css and CLS fix. No Visual UX/Polish retuning.

Selected source/test paths:
- `client/src/components/RealRaceLoader.test.tsx`
- `client/src/components/RealRaceLoader.tsx`
- `client/src/components/VenueFilter.test.tsx`
- `client/src/components/VenueFilter.tsx`
- `client/src/components/prediction/PredictionCard.tsx`
- `client/src/components/prediction/ProductionPredictionCard.test.tsx`
- `client/src/components/prediction/ProductionPredictionCard.tsx`
- `client/src/components/prediction/prediction-card.css`
- `client/src/components/venueFilter.css`
- `client/src/lib/predictionCardContract.ts`
- `client/src/lib/singlePickAi.ts`
- `client/src/lib/venueFilter.test.ts`
- `client/src/lib/venueFilter.ts`
- `client/src/pages/RacePage.tsx`

The only existing source edits: optional LabRace prediction_card type, card
import/render below RankingBoard using **requested route** identity, loader's
venue query/filter logic, and useSearch mock in existing SSR test. All new CSS
is card/venue scoped; no global V3 CSS changes. The venue bar intentionally
adds list DOM relative to main; the claim OFF DOM0 refers to the card, not
removal of the required venue feature. Race detail OFF geometry equals main.

## Fresh machine verification

- Main647/647 and candidate654/654 tests PASS; candidate-only failures0.
- tsc / production OFF build / isolated ON Vite build PASS. Current/public build
  remains OFF; ON output only /tmp/card-v3-on. No dependency/lock changes.
- single_pick_ai card API17/17 PASS rerun against966d118 source, including OFF
  resolver bypass and identical OFF/ON SQL statement sequence. No real production
  service contacted. Simulator server292-file protection confirms no SQL/worker
  implementation introduced; UI requests do not increase.
- Card browser:24 main/OFF/ON comparisons at8 widths, JRA/NAR, venue switch,
  forced-colors keyboard,6 displayed marks, OFF DOM0, wrong-race guard retained.
  390x844 /667x375 /1440 included; overflow/console/pageerror/failed requests0.
  Representative detail requests2/2/2; venue filtering adds0 and Kyoto card
  matches selected Kyoto race. Publication honmei independent from card rank1;
  visible label explicitly says公開本命ではありません.
- V3 runtime:18 sessions,180 measured states,6 exact main/OFF/ON comparisons
  across390x844,667x375,1440x900 and normal/reduced motion. Both2D/3D, five leader
  chips, section/remaining updates at0/35/70/90/100%, GOAL, play/pause, Share exit
  preserved. Reduced3D uses LITE while normal uses FULL. Card never renders on
  Simulator stage itself; it is the existing race-detail consumer placement.
- Mobile CLS: status height / playback document position fixed through sampled
  phase/remaining transitions and COMPLETE. Document coordinates exclude browser
  scroll anchoring. Entry animation settles before measurement. No whole-page
  CLS0 claim: existing COMPLETE notice below controls remains.
-1440 normal2D COMPLETE: main itself changes status94.1875->87.59375px and
  controls y1272.765625->1264.5625 (~8.2px). Candidate OFF/ON exactly match main;
  this is preserved existing desktop behavior, not a new regression or retuned.
- No new raw leakage. Browser candidate_width/contribution/private audit/
  reference_sha256/top6 tokens0. raw_score appears once in pre-existing
  ResearchWorkbench import alias on main/OFF/ON; do not claim whole-app absence
  or remove existing analytics. Card source has no such raw fields/builder.
- git diff --check PASS. Old untracked simulator audit files preserved and
  excluded from staged changes. Human3-second gate not executed or fabricated;
  human answer key never opened. Current main is accepted as the user-reported
  deployed baseline; this task measures candidate regressions only.

Evidence/commands: manifest references SHA256-sealed browser JSON, main/candidate
Vitest JSON, protected-source hashes and build logs at `/workspace/scratch/prediction_card_simulator_v3_repackage`. Runtime helper
and fixture consumer are saved alongside evidence. Synthetic API data comes
from existing single_pick_ai producer fixture export, never production stores.
Unit commands use VITE_SINGLE_PICK_AI_BASE=https://api.keibalab.net and
SINGLE_PICK_AI_BASE_URL=https://api.keibalab.net; no public network requests in
browser probes (API intercepted). Runtime helper compares baseline build,
candidateOFF and isolatedON; card helper uses the same three built artifacts.

## Rollback and remaining ON prerequisites

See separate runbook. Candidate code can be promoted after review while OFF.
No new code-integration blocker found. Public ON still requires separate paired
repo promotion/build/deploy approval, actual deployed artifact smoke and any
outstanding Windows service-account Node verification. User-reported local
production READY is carry-over, not new Cloud evidence. Backend flag is GLOBAL,
not JRA-scoped; JRA defaultv1.1, approved gate onlyv1.2, NARv1.1 only. Existing
small-landscape lab focus issue and desktop COMPLETE movement are documented
baseline limitations, not silently fixed/waived.

最新Simulator V3は292source不変と実測比較で維持。Prediction Cardは新branchに
安全に載せられる。公開ONは今回許可しておらず、実デプロイ版の両repo整合・
smokeと残るWindows実行条件の確認が必要。本番変更・main push・deployなし。
