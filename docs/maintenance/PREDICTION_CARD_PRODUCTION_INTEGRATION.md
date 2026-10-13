# Optional Prediction Card consumer integration

Label: `KEIBA_TRACE_PREDICTION_CARD_PRODUCTION_LOCAL_VERIFY_REQUIRED`.
Actual production data is `LOCAL_PRODUCTION_DATA_REQUIRED` per the owner.

This repository only consumes the optional normalized `prediction_card_v1`
returned by single_pick_ai's GET `/api/lab/race/{race_key}`. The canonical
builder, source/version/revision policy, API flag, manifest and full runbook
are in single_pick_ai's matching integration branch. There is no second
builder, prediction calculation, extra request or note/X publisher here.

Base: origin/main `5e9bda1f38588397e5cfbf6a6dff08c8a87bd8ac`.
Branch: `feat/prediction-card-production-integration`.
Venue filter was repackaged separately as `03c11a0…`; consumer wiring is
`4aba9c0…`, with requested-route identity guard `7cedb8f…`.

The card is below RankingBoard in RacePage. Existing publication pick,
probabilities, marks, ranking and decision components are unchanged. Card ◎
means six_marks rank 1 and is explicitly labelled as not the public honmei.
Renderer and DTO are copies verified byte-for-byte against the canonical
renderer/type, not a copied adapter/model implementation.

`VITE_PREDICTION_CARD_PUBLIC_ENABLED` defaults OFF; exact 1 is required at
build time. Missing/unknown/unavailable/mismatched API cards render nothing.
The guard uses the requested URL race identity, so a previous race's card
cannot appear during route switching. Backend omission hides the card on
fresh responses without changing the existing race page.

Cloud verification: 75 test files/631 passed, typecheck/build passed; final
route guard covered by 11 focused tests. Combined two-repo browser runner
performed 42 base/OFF/ON checks at seven widths plus NAR, venue and forced-
colors cases. Simulator requests stay 2/2/2; venue filtering adds 0; selected
京都 displays only 京都's card. 390/1440 screenshots and metrics are stored
in single_pick_ai's production evidence/manifest.

Card OFF is dimensionally identical to the **venue-filter baseline**. The
separately requested venue prerequisite itself adds the known 60px list bar
relative to origin/main; do not confuse that change with card OFF compatibility.
Old TOP_3D audit files were preserved but excluded from commits.

Do not enable a public UI build or deploy until the single_pick_ai runbook's
private real-data JRA/NAR checks, Node service-account check, version decision
and local 390/1440 publication/venue/network checks pass. API defaults to
v1.1 for both organizations; NAR v1.2 is prohibited and JRA v1.2 needs a
separately approved gate. Roll back API availability first and refresh pages;
rebuild this UI OFF if needed. Already loaded browser state requires refetch
or reload. This task did not enable public flags, push main, deploy, or post.
