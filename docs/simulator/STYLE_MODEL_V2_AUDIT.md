# Style Model V2 audit

Baseline: `3640075` (tuned V3.1). Adopted: **V2-A** (section curves on a physical reference runner).
Raw data (scratchpad): `style_model_audit.json` set — neutral grids (`style/neutral*.json`), real-race audits (`style/real_*.json`), final verification (`style/FINAL_V2A.json`), experiment build (`style/experiment_build/`).
Nothing was optimised against official results, hit rate, ROI, AI TOP, ◎ or MARKET TOP.

## Pre-registered criteria (fixed before any result)

- Tie rule for noise-free diagnostics: crossings within 0.002 progress (≈ 0.2 scenario seconds, ≈ 0.002 lap) tie, single-linkage, average rank. Without a tolerance, identical same-style runners order all-or-nothing and a "mean rank per style" says nothing about bias.
- Average pace, terrain on, noise off, neutral field: every style's mean normalised rank in 0.42–0.58.
- Terrain on vs off: per style ≤ 0.10. Slow pace: FRONT and PACE better than at the average pace; fast pace: MID and CLOSER better.
- Concentration not worse than the tuned model (HIGH+ 0%); entropy / distinct first horses not clearly worse.
- Reject: average-pace style > 0.65 or < 0.35; terrain flip; concentration worse; AI/◎ correlation clearly up; variant collapse; > 20% slower.

## 1. The current style model (Phase 0)

Per runner and step (du = 0.25 s / 100 s of scenario time):

```
dLap_i = (du + Δf_i(u)) · tempo(share_i) · compat_i · (1+noise_i) · (1+start_i)  +  (0.3·compress − 0.3·spread)·(mean − lap_i)·du
f_i(u) = PEAK_s·SPREAD_pace·bump(u) + RESIDUAL_pace,s·smooth((u−0.7)/0.3),   bump = smooth(u/0.3)·(1 − smooth((u−0.6)/0.4))
u = scenario time share            (not a lap, not a section)
```

FRONT/PACE/MID/CLOSER = 逃げ/先行/差し/追込, UNKNOWN = 0. Terrain tempo multiplies the whole step (including the style delta); the corner / straight "pull" moves every runner towards the pack mean. The gap schedule is anchored to time, the pack is pulled by position, the residual (≈ 0.2%) decides the order at the line. Crossing is by lap ≥ 1 with linear interpolation inside the step.

## 2. Reproduction and root cause (Phases 1–3)

Neutral field (16 runners, 4 of each style, no profiles, noise off), 14 courses, 1000 compositions per condition, average pace:

| condition (CURRENT model) | FRONT | PACE | MID | CLOSER |
|---|---|---|---|---|
| terrain off | 0.500 | 0.500 | 0.500 | 0.500 |
| **terrain on** | **0.633** | **0.633** | **0.367** | **0.367** |
| tempo off, pull on | 0.614 | 0.614 | 0.386 | 0.386 |
| **tempo on, pull off** | **0.500** | **0.500** | **0.500** | **0.500** |
| tempo normalised to mean 1 (pull on) | 0.614 | 0.614 | 0.386 | 0.386 |
| style axis = runner's own lap | 0.605 | 0.167 | 0.329 | 0.900 |
| style axis = pack mean lap | 0.405 | 0.443 | 0.576 | 0.576 |
| gap closes at 0.9 instead of 1.0 | 0.614 | 0.614 | 0.386 | 0.386 |
| residual = 0 | 0.690 | 0.690 | 0.319 | 0.300 |
| step 0.05 s (crossing detection) | 0.614 | 0.614 | 0.386 | 0.386 |

**Root cause: the corner / straight pull towards the pack mean, not the scenario-time schedule and not the terrain tempo.** The pull moves laggards forward and leaders back, which leaves a permanent offset; at the line it is the same size as the residual that decides the order, so any course with corners reorders the styles (tight turns FRONT/PACE 0.73 / MID/CLOSER 0.27, mid straight 0.77/0.23, short straight 0.66/0.34, strong elevation 0.71/0.29; wide ovals with long straights 0.50). The per-course spread of style means reaches 0.53. Terrain tempo alone is harmless (0.500). The residual in the tuned model is a compensation for the pull. Changing the axis (own lap, pack lap), the closing window, the step size or the residual does not remove it. Section-boundary timing (Atlas sections vs fixed fractions) changes nothing (0.500 both).

## 3. Style Model V2 (Phases 4–8)

```
reference runner:  ref' = du · tempo(share(ref))                       (terrain only)
runner i:          lap_i = ref + g_i(ref)·c(ref) + deviation_i          (deviation = compat · noise · start, accumulated)
g_i(ref) = PEAK_s·SPREAD_pace·through(START,EARLY,BACKSTRETCH,THIRD TURN,FINAL TURN,HOME STRAIGHT,GOAL knots)  +  PACE_TILT·smooth(...)
c(ref)   = 1 − 0.5·compress + 0.3·spread  (reversible, followed through a 0.05-lap lag; no pull towards the mean)
```

Knots come from the Course Atlas (the last BACKSTRETCH / THIRD TURN / FINAL TURN / HOME STRAIGHT of the race, found by walking the race backwards; fixed fractions 0.30 / 0.55 / 0.72 / 0.85 for the straight course and unknown sections). Every style converges with zero slope to level at the goal; only a pace tilt remains (average pace: none). No runner skill value is read.

Candidates (same seeds): **V2-A** section curves; **V2-B** section curves until 800 m to go, then remaining-distance knots (600 / 400 / 200 m / goal); **V2-C** V2-A with pack-spread damping of the gap.

## 4. Neutral field results (Phases 9–12, 21)

Noise off, ties as defined. Mean normalised rank (0 = first):

| | avg ON | avg OFF | slow ON | fast ON (F/P/M/C) | terrain Δ (avg / slow / fast) |
|---|---|---|---|---|---|
| CURRENT | .633 .633 .367 .367 | .500 ×4 | .328 .328 .672 .672 | .890 .643 .329 .138 | 0.133 / 0.095 / 0.095 |
| V2-A | .500 ×4 | .500 ×4 | .233 .233 .767 .767 | .900 .633 .272 .195 | **0.000 / 0.000 / 0.038** |
| V2-B | .500 ×4 | .500 ×4 | same as V2-A | same as V2-A | 0.000 / 0.000 / 0.038 |
| V2-C | .500 ×4 | .500 ×4 | same as V2-A | .900 .633 .252 .214 | 0.000 / 0.000 / 0.019 |

The slow / fast rows are all-or-nothing because the tilt (0.2–0.6% of a lap) is larger than the tie tolerance and noise is off; with noise on the tilt is moderate (section 5). All criteria of Phase 21 are met by every V2 variant; CURRENT fails the average-pace spread (0.633 / 0.367 against a 0.42–0.58 range) and the terrain criterion (0.133 > 0.10). By course type at the average pace V2 is 0.50 everywhere (flat, mild / strong elevation, short / mid / long straight, tight turns, large loop, straight course).

Formation (neutral, noise off, lead over the field mean in % of a lap at leader lap 0.1 / 0.25 / 0.5 / 0.7 / 0.85 / 0.95 / goal):

| | 0.1 | 0.25 | 0.5 | 0.7 | 0.85 | 0.95 | goal |
|---|---|---|---|---|---|---|---|
| CURRENT FRONT | 1.03 | 3.73 | 4.53 | 4.16 | 1.50 | 0.13 | −0.05 |
| V2-A FRONT | 2.28 | 3.69 | 4.20 | 2.46 | 0.78 | 0.20 | 0.00 |
| V2-A CLOSER | −2.14 | −3.69 | −4.51 | −2.48 | −0.64 | −0.16 | 0.00 |

V2 reaches its formation earlier (front styles lead from the start), closers close from the final turn, and the gap fades smoothly to exactly level at the line (largest gap change per 0.001 progress 0.00026, the same order as CURRENT's 0.00022): no step at GOAL.

## 5. Real races (Phase 13), 100 races × 200 seeds, same seeds and profiles

| | CURRENT | CURRENT, pull off (control) | V2-A | V2-B | V2-C |
|---|---|---|---|---|---|
| mean max first-cross | 0.178 | 0.178 | **0.170** | 0.171 | 0.170 |
| HIGH+ / VERY_HIGH races | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 |
| distinct first horses | 13.02 | 13.00 | 12.99 | 13.00 | 12.99 |
| normalised entropy | 0.927 | 0.927 | **0.934** | 0.934 | 0.934 |
| style mean rank, average pace (F/P/M/C) | .522 .522 .490 .469 | .441 .467 .522 .536 | **.488 .484 .510 .511** | .488 .483 .511 .511 | .488 .484 .510 .511 |
| slow pace F/P/M/C | .432 .435 .539 .560 | .379 .401 .559 .603 | .421 .414 .549 .583 | .421 .414 .549 .583 | .433 .424 .543 .571 |
| fast pace F/P/M/C | .709 .604 .434 .361 | .626 .536 .473 .434 | .674 .555 .460 .409 | .674 .554 .460 .409 | .652 .545 .468 .417 |
| noise off, terrain on, tie-ranked (F/P/M/C) | .614 .629 .410 .430 | .500 ×4 | **.500 ×4** | .500 ×4 | .500 ×4 |
| noise on, compat off (F/P/M/C) | .538 .540 .479 .455 | .455 .482 .512 .525 | **.504 .500 .499 .499** | .504 .500 .500 .500 | .505 .500 .499 .499 |
| AI TOP / ◎ / MARKET first-rate (others) | .091 / .095 / .097 (.079) | .101 / .107 / .106 (.077) | .099 / .103 / .101 (.078) | .099 / .103 / .101 | .099 / .103 / .101 |
| variants: Spearman / same first | 0.076 / 11.7% | 0.074 / 12.3% | 0.066 / 12.4% | 0.066 / 12.3% | 0.066 / 12.3% |
| derived strongest horse (first-rate) | 56.5% | 56.5% | 56.5% | 56.5% | 56.5% |
| determinism / leakage | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 |

- **Noise and compatibility interaction.** CURRENT depends on noise to look balanced (noise off: 0.41–0.63). V2 is balanced without noise (0.500) and with it (0.499–0.504); compatibility moves the style means by at most 0.02 (V2-A 0.484–0.511 with it) and does not change the strongest-horse result (unchanged 56.5% / 61%).
- **Prediction independence.** AI TOP / ◎ / MARKET first-rates rise 5–9% over CURRENT (AI TOP 1.15× → 1.28× the "others" rate). This is the removal of CURRENT's artificial front/pace penalty (FRONT/PACE 0.522 → 0.485), not a new input: the leakage test (every odds, popularity, mark, AI, speed, form and result field rewritten) changes 0 of 300 scenarios, and the pull-off control, which has no style change at all, shows the same rise (.101 / .107 / .106).
- **V2-B and V2-C add nothing measurable.** The remaining-distance curve and pack damping change the formation in the middle of the race but not any aggregate metric, and add inputs (distance, a feedback loop). V2-A is the simplest model that meets every criterion.

## 6. Performance (Phase 23)

Same 100-race audit, five processes in parallel: CURRENT 51.9 scenarios/s, V2-A 53.3/s (+3%); neutral grids: 27.3 s vs 24.0 s per 1000 compositions (−12%). Serial final run of the adopted code: 60,730 runs in 373 s = 163 scenarios/s, peak RSS 241 MB. No slowdown.

## 7. Decision

**STYLE_MODEL_V2_ACCEPT (V2-A).** All pre-registered criteria are met; no reject condition applies. Adopted in `scenarioSim.ts` / `styleModelV2.ts`; V2-B and V2-C are not adopted. The UI is unchanged (no component touched).

## 8. Remaining risks

- The knot values (`SHAPE`, `STYLE_PEAK`, `PACE_TILT`) are design values, not fitted to anything real; they were checked only against the neutral and real-race diagnostics above.
- The noise-free slow / fast tilt is all-or-nothing by design; with noise it is moderate (slow: FRONT/PACE 0.42, MID/CLOSER 0.55–0.58; fast: FRONT 0.67, CLOSER 0.41).
- Variants are only weakly correlated (Spearman 0.066, same first horse 12.4%); a separate noise-reduction experiment would be needed if more continuity between variants is wanted.
- AI TOP / ◎ / MARKET TOP keep a mild first-rate tilt (1.28× / 1.33× / 1.30× the others) through data coverage and the style mix.
- Straight course and unknown sections use fixed section fractions (no Atlas knots); real phone and a real Kokura race were not measured.
