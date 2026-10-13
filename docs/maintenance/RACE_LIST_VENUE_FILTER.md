# Race list venue filter

Status: `KEIBA_TRACE_RACE_LIST_VENUE_FILTER_READY`.

The Home prediction list is rendered by `RealRaceLoader`, not the simulator's
`OfficialRaceCatalog`. `LabRaceListItem.venue` is the label source and
`LabRaceListItem.organization` distinguishes matching names. Keys are encoded
JSON pairs of organization and venue; race keys are never parsed for venues.

`VenueFilter` renders a horizontally scrollable button group on mobile and a
wrapping row on desktop. The first button is すべて. Each button has a count,
`aria-pressed`, a minimum 44px target, a focus ring, and active border,
background, underline, and font weight. Native buttons support Tab and
Enter/Space. Selection scrolls only the strip to reveal the active button.
The window and race-list scroll position are preserved.

The existing decision filter is applied first. Venue counts and visible cards
are calculated from that same decision-filtered array. With decision=ALL and
venue unset, the original array and order are retained. Filtered race objects
retain their identity and prediction payloads.

Wouter's `useSearch` tracks `venue` in the query string. Only that parameter is
changed; other parameters, the route, and hash are preserved. Reload and
back/forward work. After a successful date/organization load, the selection is
retained if present and otherwise removed with replaceState. Unknown queries
fall back to all. Validation waits for a resolved load scope, preventing an
initial empty list from discarding a valid URL selection. A decision change
with no remaining races in the selected venue also falls back to all.

Loading, error, and zero-race states do not render the venue strip. No fetch
effect depends on the venue selection. Prediction logic, API contracts,
backend, DB, scheduler, marks, rankings, and betting decisions are unchanged.

## Validation

- Typecheck and production build passed. Existing build chunk warnings remain.
- Full suite: 74 files, 629 passed, 0 failed, 0 skipped. Prior baseline: 72
  files, 624 passed. Candidate-only failures: 0.
- Six mutations were detected: disabled filtering, incorrect counts, missing
  invalid fallback, removed active state, removed 44px target, and venue-only
  keys that collide across organizations. Mutated sources were restored.
- Chromium fixture checks cover 320/360/390/430/768/1024/1440 widths, all and
  selected venue, reload/history, Enter activation, date retention/fallback,
  0–4 venues, long labels, loading, and error. Unit tests also cover mixed
  JRA/NAR with identical venue names and prediction object/order invariance.
- At mobile widths, page overflow is 0, targets are 44px, and the strip is
  52px tall. First-race vertical displacement is 60px including margins.
  Before position is measured by hiding the new strip in the same fixture;
  this isolates its layout contribution rather than changing upstream data.
- Switching takes one click and triggers 0 additional list requests. All
  seven viewport checks exercise filtering and verify counts.
- 768px has a measured 32px page overflow, unchanged with the strip hidden
  (baselineOverflow=32). The strip itself fits. This existing layout issue is
  outside this change.

Metrics and screenshots are under `scratchpad/ui/`. The browser runner uses
local fixture interception and `/usr/bin/chromium`; it does not call live race
APIs. Full-page screenshots show the existing Home layout including content
above the list.

## Branch and release

Branch: `feat/race-list-venue-filter`, created directly from
`5e9bda1f38588397e5cfbf6a6dff08c8a87bd8ac`. The previous TOP_3D audit documents
remain untracked and are not part of this branch's commit. No push or deploy
was performed. Review the commit and metrics before any release action.
