# Simulator Visual UX Audit (feat/simulator-visual-ux-clarity)

Base: 5e9bda1 (TOP_3D projection-aware AABB). Fixtures only (visualPolishPreview-style mock API); no production API, no deploy, no push.
First pass label: TUNING_REQUIRED. See "Final tuning" at the end for the current state and label.

## 1. Current problems (measured before)
| | 390 2D | 390 3D | 1440 2D | 1440 3D |
|---|---|---|---|---|
| card height | 1184 | 1192 | 916 | 871 |
| track svg / card | 23.7% | 17.7% | 36.7% | 24.2% |
| svg bottom -> play button | 556px | 578px | 380px | 390px |

- Play / speed sat 550px+ below the track at 390 (camera, view, facts, notes in between): controls and track never on one screen.
- Remaining distance existed only as small on-track markers (残800...); no readout of "now". Section was a small chip in the card header.
- Top-5 order existed only in the side/lower SCENARIO ORDER panel (far below at 390).
- Label size 22-28px, font 13px, AABB overlap 0, overflow 0 (kept).

## 2. Reference principles (translated, not copied)
A hierarchy: track first, status second, controls third. B course: keep the course dominant. C order: only the top few, as small chips. D progress: section + rounded remaining in words. E controls: few, large, near the track. F mobile: one glance, no horizontal travel.
KEIBA TRACE language kept (dark green, research purple/brass, rounded), own wording and layout.

## 3-4. Implemented (Variant B)
New `RaceStatusStrip` directly under the track, then playback, then phase rail; camera/view/facts/notes moved below the controls; old broadcast overlay hidden (it repeated title/section).
- Section name: existing `sectionAt` + `SECTION_LABEL_JA`. Hidden when a closed course has no real section shares (no guessing). "3〜4コーナー" is NOT produced: the Atlas has no such section.
- Remaining distance: `distance * (1 - packLap)` (packLap = existing mean lap), rounded to 100m, "残り 約900m", "ゴール前" under 100m, hidden when distance unknown or COMPLETE.
- Status text: READY / PLAYING / PAUSED / COMPLETE (text, not colour only).
- Leader chips: first 5 rows of the existing `orderView` (no new ranking). Rank digit badge + number chip using the existing `runnerPresentation` fill (visual-only colour, same as the track labels). Rank 1 gets a ring; selection = dashed outline + aria-pressed + spoken label. Click toggles the existing `selectedNo` (UI only). Labelled "仮想順" (scenario order, never a finish prediction).
- 44px+ targets, number 20px, phase 22-24px, remaining 17px, rank badge 11px.
Variants for comparison via `?uxv=A|B|C` (default B): A = status only; B = + leaders; C = + selected-horse status line.

## 5. Chosen variant: B
Leader chips are the biggest gain; C's extra line costs ~80px at 390 (card 1354) for little; A lacks order.
Chip design: rank badge + number chosen over number-only (rank readable without colour) and over names (390px).

## 6. Metrics after (B, includes overlay removal)
| | 390 2D | 390 3D | 1440 2D | 1440 3D |
|---|---|---|---|---|
| card height | 1250 (+66) | 1258 (+66) | 981 (+65) | 936 (+65) |
| svg / card | 22.4% | 16.8% | 34.3% | 22.5% |
| svg bottom -> play | 150px | 156px | 124px | 134px |

- Overflow 0, label AABB overlap 0, 5/5 chips visible at 8 and 18 runners, normal + reduced motion, 2D/3D, Share View (strip kept; controls hidden by existing rule). JS errors 0.
- Courses (390, 0/30/60/95/100%): Tokyo 2000, Kyoto dirt 1800, Nakayama 2500, Niigata 1000 all show section + rounded remaining; Niigata always 直線; COMPLETE hides both. Nakayama shows 直線 at 30% (first pass of the home straight; true to the Atlas).
- Selection: chip -> track label/dot -> SCENARIO ORDER panel all sync; keyboard Enter toggles.
- 2D/3D parity: the strip is independent of view mode (same props).

## Performance / invariance
- Playback 2x, 18 runners: rAF mean 16.67-16.75ms, p95 16.7-16.8ms, same as base. Isolated 33-83ms single frames appear on both base and B in repeated headless runs (machine load); >33ms 0 not reproducible either way.
- DOM: <=5 chips re-rendered at the existing ~8Hz state; no per-frame layout reads; no new analytics calls; no change to scenario/logic modules (`scenarioReplay`, `scenarioOrder`, camera, terrain untouched). Existing visualInvariance + simulatorAnalytics tests pass.
- CLS (includes page load) varies run to run (0.02-0.14) for base and B alike: not conclusive.
- Tests: 599 existing + new `raceStatusView.test.ts`, `RaceStatusStrip.test.tsx` pass; tsc clean.

## Not done / residual
- Track geometry NOT enlarged (+10/20/30%): changing GEOMETRY alters the camera box (camera physics is out of scope). Track share of the card fell ~1.3-2.4pt because the strip was added.
- Rank-change animation not adopted (visual noise; reduced motion would disable). Progress bar not added (scrubber already exists). Names in chips not added.
- 3-second human test not run (needs people); only structural checks. Share View 16:9/1:1/9:16 checked only at 390 and 1440 viewports. 3D at 390 remains small (svg 319x237).
- Real-device legibility of the 11px rank badge at SNS thumbnail size unverified.


---
# Final tuning (layout B / C, Share View, proxy 3-second test)
Base for this round: aea0f690 ("A"). Presentation only: no change to TrackStage, camera, projection, geometry, scenario/order logic, analytics, server. `?uxl=A|B|C` selects a layout for comparison; default = C.

## Height budget (aea0f690, 18 runners, 60%; px)
390 2D: card 1250 = padding 20 + head 62 + notes 76 + track 299 + status 130 + playback 139 + section rail 92 + palette note 41 + camera 91 + VIEW 91 + facts 26 + course note 70 + gaps ~110. The card itself starts 1403px down the page (page chrome above it).
1440 2D: card 981 = track 352 + status 104 + playback 52 + rail 44 + camera 68 + VIEW 68 + notes/facts ~130; card starts at 890.

## Reclaimed space (no geometry change)
A padding (card 20 -> 12, stage side margin; viewBox untouched, only the CSS box widens), B duplicated label (capture title second line, old overlay), C helper text (VIEW hint, notes in the details), D camera / section-jump / facts / course note -> one closed `details` (kept, not deleted), F status-line load message reserved (no layout shift), G gaps 10 -> 6. Playback re-flowed to two rows (play / restart / speed, then scrubber).
Layout C additionally: card full-bleed at <=760px, page chrome above the stage compacted (type size / spacing only), fixed one-line capture title, PRE-RACE panel placed below the stage (content unchanged; `?uxl=B` keeps the old order).

## Result (same measurement, px)
| | A card | B card | C card | A track (area %) | C track (area %) | track->play A / C | card top A / C |
|---|---|---|---|---|---|---|---|
| 390 2D | 1250 | 809 | 829 | 336x299 (22.4) | 382x340 (40.1) | 150 / 104 | 1403 / 607 |
| 390 3D | 1258 | 799 | 817 | 319x237 (16.8) | 363x267 (30.4) | 156 / 110 | 1403 / 607 |
| 1440 2D | 981 | 724 | 724 | 748x352 (34.3) | 748x352 (46.4) | 124 / 106 | 890 / 720 |
| 1440 3D | 936 | 679 | 679 | 719x229 (22.5) | 719x229 (31.0) | 134 / 116 | 890 / 720 |
Absolute track pixels: 390 2D +29%, 390 3D +28%; 1440 unchanged (the stage column width is not changed): at 1440 only the share of the card and the distance to the controls improved. Card height at 390: -421px (budget +100px: met). 390 3D clipping 0, label overlap 0.

## Share View (B/C only; A keeps the old behaviour)
Share hides the long order list (the leaders strip carries top 5, labelled "仮想順"), camera/VIEW/playback/details; the strip is scaled up (phase 30px, remaining 22px, chips 56px, number 28px, rank badge 26px/17px); the track is capped to the viewport height without letterboxing (so 3D projection is unaffected).
| viewport | stage bottom / viewport (2D, 3D) | track (2D) |
|---|---|---|
| 16:9 1280x720 | 687 / 720, 615 / 720 | 715x336 |
| 1:1 800x800 | 721 / 800, 678 / 800 | 722x340 |
| 9:16 450x800 | 774 / 800, 761 / 800 | 414x368 |
Share-view stage + exit button fit one screen in all six cases; title, track, section, remaining distance, 5 chips present; overflow 0. A (old) stage was 1566-2144px tall in the same viewports.
SNS shrink (rank badge 13px normal / 17px share): readable at 50%. At a 320px-wide 16:9 thumbnail the chip numbers, section and remaining distance are readable, the rank digits are not (the left-to-right order and ring on #1 still convey rank); runner numbers on the track are not readable at that size.

## Matrix and invariance
100-case matrix (4 courses x 390/1440 x 2D/3D x 8/18 runners x 0/30/60/95%, reduced motion, Share): overflow 0, label overlap 0, 5/5 chips visible, targets >=44px, JS errors 0. 2D vs 3D and normal vs reduced: strip text and chips identical at 0/60/95%. 612 tests pass (incl. new layout contract); tsc clean; no protected file changed.
Performance (18 runners, 2x, 3 alternating runs vs base 5e9bda1): p95 16.7-16.8ms both; isolated 33ms frames occur on both. CLS at load (390 2D): base 0.04-0.05, C 0.03 after reserving the load-message line, a one-line capture title and a fixed header height (before that fix 0.47).

## 3-second test
Human test: NOT run. Proxy only (not a substitute): a model read 20 static 390x844 screenshots (10 cases x layouts A and C, tracks scrolled into view) and answered leader / remaining distance / section: 20/20 each (A 10/10, C 10/10). It shows legibility, not speed; the strip is identical in A and C, so the difference between them is scroll distance: first load shows the track card top at 1403px (A) vs 607px (C) at 390.
Proxy indicators (C, 390): track 382x340, status strip directly below (gap ~8px), play 104px below the track, text 22/17/20px.

## Decision
C (track focus). B is the same without the page-chrome compaction and without moving PRE-RACE.
**Product decision for the owner:** C shows the PRE-RACE card block after the simulator instead of before. Use `?uxl=B` (or change DEFAULT_LAYOUT) to keep the old order.
Final label: KEIBA_TRACE_SIMULATOR_VISUAL_UX_READY on machine-checkable criteria; the human 3-second test is still open.
