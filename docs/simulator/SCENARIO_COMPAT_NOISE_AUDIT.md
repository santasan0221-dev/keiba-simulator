# Scenario: horse compatibility + seeded noise (built on the Terrain Tempo line)

Base: `17aa6a9` (Full Finish, seeded in-style order, camera fixes, Terrain Tempo). This change ports the pure parts of
the V3.1 branch (`3640075`: horse profile, compatibility, seeded noise, calibration audit) onto that line. The V3.1
simulator (a time-stepped integrator) is **not** merged; the per-runner terms are re-expressed for this line's frame engine.

## What each runner's position is made of

    progress of a runner = base (style / pace) x terrain tempo (common) x compatibility x seeded noise

- base and terrain tempo are unchanged (terrain: one factor for every runner).
- compatibility x noise is the only per-runner term. It is integrated along the front of the field into a position
  offset (`scenarioRunnerField.ts`), kept inside +-OFFSET_MAX (0.025 of the race), and frozen once the front reaches the
  line, so every runner still crosses before 100% and the crossing numbers always agree with the final frame.

## Features (fixed)

| # | feature | source (`record.*`, as-of history) | strength | missing data |
|---|---|---|---|---|
| 1 | style | published run style | existing base gap | UNKNOWN style = neutral |
| 2 | start tendency | `start_front_run_share` (JRA only, field-relative z, >= 4 published) | at most +-0.5% | 0 (NAR has none) |
| 3 | distance fit | today's distance-band top-3 rate minus the horse's own overall top-3 rate | at most +-1.0% | neutral |
| 4 | going fit | today's going top-3 rate minus the mean of its other goings | at most +-1.0%, sample share 0.25 (strong shrink) | neutral |
| 5 | starts | confidence only (<2 UNKNOWN, 2-3 LOW, 4-7 MEDIUM, >=8 HIGH) | weight 0 / 0.3 / 0.6 / 1 | UNKNOWN |

Same course, turn direction, corner, elevation and late-kick fit are **not published**, so they are always neutral.
Both fit terms compare a horse with itself, so they measure suitability, not class. The total stays in 0.985 .. 1.015.

Never read (structurally: the profile takes a minimal history record, and a source scan test checks the module text):
`abilities.*` (`abilities.speed` equals the model score exactly, correlation 1.0), `model.*`, `market.*`, `display.*`,
`honmei`, `ai_top`, `publication_marks`, `result`, `market_ev`, `bet_decision`, `form_recent3_top3`, `avg_finish`.
Changing every one of those fields changed 0 of 300 scenarios (10 races x 30 seeds).

Data checks behind this (24 races, 250 horses): `abilities.stamina/start/form` are exact copies of
`record.stamina_distance_band_top3 / start_front_run_share / form_recent3_top3` (173/173, 106/106, 219/219); all 219
history dates are before the race date (0 leaks); `distance_band` is the band of today's distance.

## Noise

Seeded from race_key + variant (STANDARD / ALT_A / ALT_B) + runner + section; no Math.random. Seven sections, amplitude
1.5 - 3%, neighbouring sections correlated (carry 0.6), smooth between sections. Observed: sd 1.29%, p95 |dev| 2.4%,
max 3.0%, mean 1.0001, largest per-horse-number mean bias 0.07%.

## Audit (`scripts/scenario_calibration_audit.ts`)

Same 100 JRA races (7 venues), conditions, metrics and pre-registered rules as the V3.1 audit; 60,730 scenario runs in 36 s.
V3.1 was re-run from its own commit on the identical race sample, so the columns compare directly.

| | V3.1 `3640075` | this change |
|---|---|---|
| races HIGH+ concentration | 0% | 0% |
| max first-cross rate mean / p90 / max | 0.178 / 0.30 / 0.405 | 0.158 / 0.225 / 0.295 |
| normalised entropy mean | 0.927 | 0.958 |
| strongest-data horse (all terms saturated), first-cross | 0.61 | 0.215 |
| strongest horse derived from record data | 0.565 | 0.13 |
| compatibility factor min / max | 0.985 / 1.015 | 0.991 / 1.008 |
| AI TOP first-cross / uniform | 1.15 | 1.00 |
| publication mark first-cross / uniform | 1.21 | 0.97 |
| MARKET TOP first-cross / uniform | 1.20 | 1.05 |
| Spearman(popularity, mean scenario rank), 19 races with popularity | 0.147 | 0.037 |
| average-pace style groups, mean normalised rank | 0.47 - 0.52 | 0.42 - 0.55 |
| neutral same-style field, max first-cross (8/12/16 runners) | 0.087 - 0.157 | 0.083 - 0.167 |
| determinism / leakage differences | 0 / 0 | 0 / 0 |
| variant diversity (exact order match; Spearman) | 0%; 0.08 | 0%; 0.08 |

Popularity and the AI / mark / market picks are **diagnostics only**; none of them reaches the simulation.

### The finding that needed a calibration

With the port alone (before the table change below) the style structure inherited from the Full Finish line leaned the
scenario towards well-known horses: average-pace style groups ended FRONT 0.30 ... CLOSER 0.64, and MARKET TOP first-cross was
1.36 x uniform (V3.1: 1.20). A decomposition on the same races located the cause:

| condition | MARKET TOP first-cross / uniform |
|---|---|
| noise only, styles kept | 1.32 |
| all styles unknown + compatibility + noise | 1.03 |
| all styles unknown + noise only (control) | 0.99 |

Compatibility adds about 4%; the rest comes from run style: well-known horses more often have a published front style, and the
old `FINISH_KEEP` table put the front-runners first and the closers last at the average pace. `FINISH_KEEP` (how much of its FINAL
gap each style keeps at the line) was therefore recalibrated so that every style group ends within 0.40 .. 0.60 at the average
pace (`平均`: 1.25 / 1 / 0.5 / 0.3 / 0.29; slow and fast paces keep their direction: a slow pace favours the front, a fast pace the closers).
Contracts are unchanged: crossing order is still style + pace + seeded order (+ the new per-runner terms); every runner still crosses
before 100%. A regression test pins the balance on a field with the style mix of the real data.

## Limits and risks

- Most horses have thin data: 41% of compatibility samples are non-neutral (40% of races have no usable profile); going cells are
  29% filled; the per-going and per-band sample sizes are not published, so confidence rests on `starts` alone.
- With all three terms saturated (a synthetic extreme) a horse still leads in 21.5% of runs against 6% without compatibility; the
  most concentrated real race reaches 0.295 (a field of 12). Compatibility is visible but never decisive.
- Slow-pace and fast-pace tilts are by design and large (slow: FRONT 0.30; fast: CLOSER 0.37).
- Variants differ strongly from each other (Spearman about 0.08): they are close to independent runs, not small perturbations.
- Jump races use no profiles (no course model).
- No Kokura race exists in the data; Kokura is only checked through a relabelled real race (see the runtime notes in the commit).
