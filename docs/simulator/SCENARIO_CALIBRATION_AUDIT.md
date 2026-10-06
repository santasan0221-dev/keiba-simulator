# Scenario calibration audit (Simulator V3.1)

Candidate: `feat/simulator-v3-terrain-compat-noise` @ `dea523235424052878ac3df2a120f5abd8fdf891`
Script: `scripts/scenario_calibration_audit.ts` (diagnostic only; reads the public API with GET; changes no runtime module)
Raw output: `scenario_calibration_audit.json` (scratchpad, 425 KB) · generated 2026-10-05

The classification rules were written into the script header **before** any result existed and were not edited afterwards.

## Sample and cost

| item | value |
|---|---|
| races | 100 JRA races (stratified over venue × surface × distance band; 7 venues; 52 turf / 36 dirt / 12 jump) |
| usable horse profile | 81 races; 19 races had no usable profile (all UNKNOWN) |
| scenario runs | 60,530 (200 seeds × full condition, 100 each for E/F, 40 × 3 paces, variants, determinism, benchmarks) |
| elapsed | 692 s · 87 scenarios/s · peak RSS 239 MB |
| limit | `SAMPLE_LIMITED` does not apply (≥ 100 real races); the horse data is thin, see "Data limits" |

## What the code does (Phase 0: spec vs code)

| item | spec | code (measured) |
|---|---|---|
| compatibility | 0.97–1.03, usually 0.98–1.02 | per term ≤ 1.5%; combined clamp 0.97–1.03; observed 0.9742 – 1.0300 |
| noise | ≤ ±3%, usually ±1–2% | 7 sections, amplitude 1.5–3%; observed sd 1.29%, p95 \|dev\| 2.4%, mean 1.0001 |
| terrain | 0.94–1.06 | observed 0.94 – 1.06 (Nakayama), neutral when the Atlas is unknown |
| seed | race_key + variant + runner + section | same; neighbouring sections are correlated (carry 0.6), which the spec did not mention |
| crossing order | virtual | order of the interpolated goal-crossing times; exact ties (only possible without noise) fall back to horse number |
| full finish | all cross | run continues until the last crossing + 3 scenario seconds, smooth run-out |

## Results

### Concentration (full condition D, 200 seeds)

| | mean | p50 | p90 | max |
|---|---|---|---|---|
| highest first-cross rate | 0.264 | 0.205 | 0.505 | 0.70 |
| second-highest | 0.161 | 0.14 | 0.275 | 0.385 |
| entropy (normalised) | 0.823 | 0.922 | 0.990 | 0.997 |
| distinct first-cross horses | 11.85 | 12 | 16 | 18 |
| average rank variance | 12.1 | 11.3 | 21.1 | 26.3 |

Flags (diagnostic thresholds as given): DIVERSE 63 · MODERATE 22 · HIGH 11 · VERY_HIGH 4 → HIGH+ share 15%.
By profile coverage: usable-profile races 18.5% HIGH+ (mean max first 0.297); no-profile races 0% (0.122).
VERY_HIGH races: Nakayama 04 jump (6 runners, 0.70), Chukyo 09 jump (13 runners, 0.67), Sapporo 07 dirt (11 runners, 0.655), Sapporo 04 turf (16 runners, 0.64).

### Where concentration comes from (Phase 7 decomposition)

| condition | mean max first | rank variance | distinct orders / 100 |
|---|---|---|---|
| E base + noise | 0.135 | 15.3 | 99.9 |
| F + terrain | 0.142 | 15.1 | 99.9 |
| D + compatibility (full) | 0.264 | 12.1 | 199 / 200 |

Terrain barely changes concentration; **compatibility roughly doubles it**. Without noise (A–C) there is no distribution at all (one deterministic order), so noise is what keeps any horse from being certain.
Spearman of per-horse mean rank: C (no noise) vs D = 0.72 overall, 0.90 on profile-usable races, so noise does not erase the profile structure. E vs D = 0.13, F vs D = 0.45.

### Strongest-data horse (the earlier 77% case), 12 same-style neutral rivals, Tokyo turf 2000, 200 seeds

| profile | compat | noise | first | top3 | mean rank |
|---|---|---|---|---|---|
| all-HIGH edge 1 | on | on | 0.79 | 0.955 | 1.37 |
| all-HIGH edge 1 | off | on | 0.06 | 0.21 | 6.8 |
| all-HIGH edge 1 | on | off | 1.00 | 1.00 | 1.00 |
| moderate | on | on | 0.36 | 0.62 | 3.4 |
| moderate | off | on | 0.06 | 0.21 | 6.8 |

Main cause: **compatibility** (0.06 → 0.79 with noise held); noise is the only brake (compat on, noise off → 1.00). Compat-off/noise-off is degenerate (all runners identical).
Real-race cause: in the VERY_HIGH races the horse is the one with the strongest stamina z-score and a saturated going edge (`surfaceCompatibility` HIGH, edge 1.0); e.g. Sapporo 07 #5 has straight/distance edge ≈ 0.04 and an early-position penalty (−0.52) yet is first in 65.5% of runs, driven by the going term alone.

### Strength audits

| | min | max | mean | p95 | p99 |
|---|---|---|---|---|---|
| compatibility factor (all samples) | 0.9742 | 1.0300 | 1.0004 | 1.0139 | 1.0150 |
| HIGH confidence | 0.9742 | 1.0300 | 1.0009 | 1.0150 | 1.0192 |
| MEDIUM | 0.9884 | 1.0158 | 1.0001 | 1.0084 | 1.0090 |
| LOW | 0.9953 | 1.0072 | 1.0000 | 1.0017 | 1.0045 |
| UNKNOWN | 1 | 1 | 1 | 1 | 1 |

Within 0.97–1.03: yes. Maximum 1.03 reached by Kyoto 11 #8 (HIGH), minimum 0.9742 by Kyoto 11 #5. 38% of samples are non-neutral.
Noise by section (factor sd): START 1.39%, EARLY 1.31%, BACKSTRETCH 0.96%, TURN 1.03%, HOME STRAIGHT 1.64%; mean 1.0000–1.0002; largest per-runner-number mean bias 0.07% (no constant plus bias).
Terrain: Kyoto 0.940–1.058, Tokyo 0.940–1.044, Hanshin 0.940–1.020, Nakayama 0.940–1.060, Niigata 0.967–1.026, Chukyo 0.940–1.023, Sapporo 0.978–1.020; means 0.995–0.999.

### Correlation with AI / ◎ / market (diagnostic; none of these reach the simulation)

| group | races | first-cross rate (uniform would be ≈0.08) | top3 rate | mean normalised rank (0 = first) |
|---|---|---|---|---|
| AI TOP | 51 | 0.087 | 0.264 | 0.465 |
| publication ◎ | 79 | 0.087 | 0.243 | 0.491 |
| MARKET TOP | 99 | 0.115 | 0.291 | 0.458 |
| others | 100 | 0.079 | 0.238 | 0.502 |

Not a copy: AI/◎ are within ~10% of uniform. MARKET TOP is tilted about 1.4× (first-cross 0.115 vs 0.080). It is not an input: changing every odds / popularity / mark / AI / result / speed / form field changed 0 of 300 scenarios (10 races × 30 seeds). The likely path is indirect: favourites have more starts, so their stamina/going terms earn higher confidence.

### Running style (D)

| pace | FRONT | PACE | MID | CLOSER | UNKNOWN |
|---|---|---|---|---|---|
| slow | 0.44 | 0.43 | 0.54 | 0.57 | 0.50 |
| average | 0.53 | 0.51 | 0.49 | 0.48 | 0.50 |
| fast | 0.70 | 0.59 | 0.44 | 0.38 | 0.50 |

(mean normalised crossing rank; lower is better.) At the average pace every group is within 0.48–0.53. The pace tilt is by design but large at the fast pace (FRONT 0.70, CLOSER 0.38).
By course type at the average pace the tilt reaches ±0.1: large loop FRONT 0.396, short straight FRONT 0.59 / CLOSER 0.44, tight turns FRONT 0.56 / CLOSER 0.46.

**Fragility found (not covered by the pre-registered rules).** Without noise, the style order depends strongly on the course: base only (neutral course) gives FRONT 0.06 … CLOSER 0.87; with real terrain it flips to CLOSER 0.23 … FRONT 0.65 (C: CLOSER 0.37 … FRONT 0.61). The style gaps follow a time schedule that decays to zero at the nominal finish time, so a mean tempo of 0.997 (instead of 1) changes where the leader is when the gaps close. Noise dilutes this to the ±0.1 course tilt above, but the balance rests on a delicate cancellation.

### Course types, field size, surface (D)

| bucket | races | mean max first | HIGH+ share |
|---|---|---|---|
| long straight | 28 | 0.205 | 7% |
| short straight | 14 | 0.334 | 21% |
| tight turns | 56 | 0.242 | 9% |
| large loop | 11 | 0.234 | 9% |
| strong elevation | 37 | 0.193 | 8% |
| flat | 20 | 0.316 | 15% |
| straight course | 2 | 0.300 | 0% |
| ≤ 8 runners | 10 | 0.275 | 10% |
| 9–12 | 30 | 0.263 | 17% |
| 13–16 | 51 | 0.257 | 12% |
| ≥ 17 | 9 | 0.296 | 33% |
| jump (障害) | 12 | 0.470 | 50% |

Jump races are the clear outlier (they use a generic course and tend to have strong stamina/going data). Larger fields keep a higher max first-rate than a uniform field would (≥ 17: 0.296 vs 0.06 uniform), so the field-size effect is not simply "small fields are concentrated".

### Variant diversity (STANDARD / ALT A / ALT B and 20 extra seed pairs per race)

| | exact order match | top-3 set match | same first | Spearman |
|---|---|---|---|---|
| all 100 races | 0% | 2.3% | 17.6% | 0.19 |
| profile-usable | 0% | 2.8% | 19.8% | 0.24 |

Variants are never identical, and are fairly independent runs (not "almost the same").

### Determinism, leakage, neutral benchmark

- Determinism: 10 races × 3 variants × 100 rebuilds → 0 differences.
- Leakage sensitivity: 0 differences when odds, popularity, marks, AI fields, speed, form and the result are rewritten.
- Neutral same-style benchmark (8/12/16 runners × Tokyo/Nakayama/Niigata, 300 seeds): max first-rate 0.087–0.157 against a uniform 0.0625–0.125; normalised entropy 0.986–0.998; every runner wins at least once; Spearman(mean rank, horse number) between −0.29 and +0.16 (no consistent number bias).

## Classification (pre-registered rules)

| rule | result | verdict |
|---|---|---|
| COMPATIBILITY_TOO_STRONG (≥ 20% of races HIGH+) | 15% (18.5% of profile-usable races) | not tripped (close) |
| NOISE_TOO_WEAK (exact match > 5% or Spearman > 0.85) | 0% / 0.19 | not tripped |
| NOISE_TOO_STRONG (C-vs-D Spearman < 0.40) | 0.72 | not tripped |
| STYLE_BIAS (average pace, group outside 0.40–0.60) | 0.48–0.53 | not tripped |
| COURSE_BIAS (course-type bucket ≥ 30% HIGH+) | max 21% (jump races, a surface bucket, 50%) | not tripped by the rule |
| DATA_LIMITED (< 50 races or > 50% without profile) | 100 races; 19% without profile | not tripped |

**By the pre-registered rules: BALANCED.**

## Data limits

The public API gives only style, stamina, start, going top-3 rates and starts. Direction, same-course, slope and corner compatibilities are UNKNOWN for every horse, so the audited compatibility is effectively stamina + going + gate speed. `abilities.speed`, `form`, the AI score, odds, marks and results are not read (source scan and the mutation test above).

## Tuning proposals (not implemented; separate commit/task)

1. **Going term over-confidence.** `surfaceCompatibility` saturates (edge = Δ/30 clamps at ±1) and assumes `n = min(starts, 10)` samples for the going of the day although the per-going sample size is unpublished. Proposal: edge divisor 30 → 50 and `n_eff` halved. Expected: fewer VERY_HIGH races (the four above are driven by this term). Risk: weaker tilt for genuinely going-suited horses. Evidence: Sapporo 07 #5, Chukyo 09 #13, strongest-data table.
2. **Overall compatibility cap.** 0.97–1.03 → 0.985–1.015 (or per term 1.5% → 1.0%). Expected: strongest-data first-rate ≈ 0.62 (per-term 1.0%, earlier measurement) instead of 0.79; mean max first-rate toward ~0.2. Risk: compatibility becomes nearly invisible.
3. **Jump races.** Treat `障害` as neutral for compatibility until a course model exists. Expected: removes the 50% HIGH+ bucket. Risk: none for flat races.
4. **Style/terrain cancellation.** Make the style gap schedule follow lap position rather than scenario time, or renormalise terrain tempo to mean 1. Expected: course tilt of style groups shrinks from ±0.1 toward 0. Risk: needs re-calibration of the pace residuals (touches every course).
5. **Noise**: no change (sd 1.3%, unbiased, variants differ, profile structure survives).

## Safety checks of this audit

- GET only; no non-GET request; no write to the repo other than this document and the new script.
- The "noise off" condition mutates the exported amplitudes only inside the script process and restores them.
- Candidate SHA and origin/main unchanged before and after (see report).
