# Scenario calibration tuning experiment

Baseline `dea52323` → adopted: going term (A) + jump-race neutral (C) + compatibility cap 0.985–1.015 (D).
Same 100 real JRA races, same seed sets (200 full / 100 / 40 per pace), same diagnostic script (`scripts/scenario_calibration_audit.ts`).
Nothing was fitted to official results, AI TOP, ◎, MARKET TOP, ROI or hit rate. The acceptance targets were fixed before the runs.

## Experiments

| | mean max first | median | max | HIGH+ | VERY_HIGH | distinct first | entropy | derived strongest horse | AI / ◎ / MARKET first-rate |
|---|---|---|---|---|---|---|---|---|---|
| BASE | 0.264 | 0.205 | 0.70 | 15% | 4 | 11.85 | 0.823 | 87.5% | .087 / .087 / .115 |
| A going term | 0.205 | 0.18 | 0.48 | 1% | 0 | 12.92 | 0.904 | 70.5% | .092 / .094 / .107 |
| B style schedule (pack position) | 0.302 | 0.27 | 0.77 | 21% | 5 | 11.51 | 0.768 | 87.5% | .114 / .103 / .128 |
| B recalibrated on neutral fields | 0.295 | 0.26 | 0.75 | 15% | 3 | 11.65 | 0.781 | 87.0% | .112 / .098 / .124 |
| C jump neutral | 0.224 | 0.165 | 0.655 | 9% | 2 | 12.23 | 0.866 | 87.5% | .087 / .094 / .098 |
| A+B+C | 0.226 | 0.195 | 0.64 | 8% | 1 | 12.80 | 0.873 | 70.5% | .119 / .108 / .111 |
| A+C | 0.180 | 0.165 | 0.435 | 0% | 0 | 13.01 | 0.926 | 70.5% | .091 / .095 / .097 |
| **A+C+D (adopted)** | **0.178** | 0.165 | 0.405 | **0%** | **0** | **13.02** | **0.927** | **56.5%** | .091 / .095 / .097 |
| A+B+C+D | 0.224 | 0.195 | 0.64 | 7% | 1 | 12.82 | 0.874 | 56.0% | .119 / .109 / .111 |

"Derived strongest horse": a 12-runner same-style field where horse 1 gets its profile through `buildHorseProfiles` from record data (best stamina, going 100% vs 20%, 10 starts). The hand-set all-HIGH profile (not touched by A or C) fell from 79% to 61% with D.

- **A** is the main cause fix: the saturated going term (edge Δ/30, 10 starts counted as HIGH) was what made single horses win 65–70% of runs. Δ/50 and half the assumed sample size remove every VERY_HIGH race.
- **C** removes the jump-race outlier (50% HIGH+, mean max 0.47 → 0.14, entropy 0.63 → 0.99).
- **B rejected.** Making the style gaps follow the pack's lap position does not meet its own target: at the average pace CLOSER stays 0.58–0.61 (target 0.45–0.55) even after calibrating the residuals on neutral synthetic fields (shifts of ±0.1–0.2% only), it raises concentration (HIGH+ 21%/15% alone) and the AI/◎ first-rate (0.087 → 0.11–0.12). The terrain/style interaction found in the audit is therefore **not fixed** (see risks).
- **D** was triggered because A+B+C still left the strongest horse at 70.5% (> 65%); it brings it to 56.5% without changing anything else (HIGH+ stays 0%).

## Acceptance targets (adopted A+C+D)

| target | result |
|---|---|
| HIGH+ < 10%, VERY_HIGH ≤ 1–2% | 0%, 0 |
| mean max first ≤ 0.23 | 0.178 |
| strongest synthetic 50–65%, never 100% | 56.5% (derived), 61% (hand-set) |
| distinct first horses ≥ 8 | 13.0 |
| normalised entropy ≥ 0.80 | 0.927 |
| neutral benchmark entropy ≥ 0.98, no horse-number bias | 0.986–0.998; Spearman −0.29…+0.16 |
| AI / ◎ / MARKET not unnaturally stronger | .091 / .095 / .097 vs baseline .087 / .087 / .115 (MARKET tilt 1.44× → 1.22×) |
| style at the average pace | 0.47–0.52 for every group |
| variants neither identical nor random | exact match 0%, Spearman 0.076 (usable 0.10), same first 11.7% (uniform ≈ 8%) |

Profile structure is kept: Spearman of the noise-free profile order vs the mean rank with noise is 0.85 on profile-usable races (baseline 0.90). Variants became more independent (Spearman 0.19 → 0.076): with the going term damped there is less shared structure between runs.

## Performance

Serial audit of the adopted code: 60,730 runs in 768 s = 79.1 scenarios/s, peak RSS 242 MB. Baseline serial audit: 87.4 scenarios/s, 239 MB (−9.5%, within run-to-run variation; the code change adds one comparison per runner). The parallel experiment batches ran 61–73 scenarios/s because five processes shared the CPU.

## Runtime check of the adopted build (real API, GET only)

Tokyo turf 2000, Kyoto dirt 1800, Nakayama turf 2500, Niigata turf 1000 and the Kokura fixture, STANDARD / ALT A / ALT B, 1440 and 390: 60 fps, p95 16.8 ms, 0 frames over 50 ms; runners outside the frame 0; camera jump violations 0; goal line out of frame 0 frames; every row crossed at the end; runners keep moving through the run-out; no console errors, no 4xx/5xx, 3 distinct crossing orders per race, no overflow, 0 obscured or under-44px targets, no forbidden wording. COURSE FIT still differentiates horses (Nakayama: 距離 ◎ / 直線 ◎ for the strongest-stamina horse, 馬場 ○ at low confidence).

## Remaining risks

- **Style / terrain interaction is unresolved.** Without noise the style order still depends on the course (base-only FRONT 0.06 … CLOSER 0.87; with terrain CLOSER 0.23 … FRONT 0.65). Noise dilutes it to a ±0.1 course tilt. A proper fix needs a different style model, not a schedule re-anchor.
- Variants are only weakly correlated (0.08); if "same horse tends to be strong across variants" is desired, noise would have to shrink (separate experiment).
- The data limits from the audit still apply (only stamina, going, start and starts exist in the public API).
- MARKET TOP still has a mild tilt (1.22× uniform) through data coverage.
- Real phone and a real Kokura sample were not measured.
