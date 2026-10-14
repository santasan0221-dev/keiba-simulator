# Prediction Card Public UI rollout / rollback — NOT EXECUTED

Feature branch: feat/prediction-card-public-ui-prep, base f1f795aeb883df3f70b2dd940b644f3ebcccc61f. Obtain final package HEAD and commit order with git log origin/main..HEAD.

## Before any future promotion

1. Fetch main and compare topology; STOP/repackage if main advanced. Keep both public flags OFF.
2. Finish home-PC API local verification against canonical read-only snapshots: omission under OFF, JRA/NAR v1.1, identity/revision/version/freeze/source mismatches, no raw leakage and existing API compatibility. Do not modify dirty production checkout or stores.
3. Review organization-scoped backend rollout before a JRA-only public activation. This package does not implement that backend gate or approve v1.2.
4. CI production build must explicitly retain VITE_PREDICTION_CARD_PUBLIC_ENABLED="0". Backend flag remains independent/OFF. Never deploy isolated fixture-ON /tmp outputs or publish the fixture server.
5. Recheck typecheck/build/contracts, runtime card DOM0, unchanged requests/publication/Simulator and mobile navigation. No automatic note/X posting.

## After a separately approved API rollout

The existing /api/lab/race response already supplies the optional prediction_card to the renderer. API field missing means no card. No extra request, frontend explanation builder or API schema addition is required. UI disclosure starts closed and is separate from publication ◎. Activation itself is a later task requiring production smoke at390/667x375/1440, JRA/NAR organization scope and rollback readiness.

## Rollback order

Keep frontend and backend flags OFF first. If future activation fails, turn UI display OFF and rebuild using the approved deployment procedure; do not alter prediction or publication. Roll back UI promotion before backend promotion where needed. Revert this package's documentation/evidence, tests, wiring and component commits in reverse order (exact SHAs in git log). Do not delete or rewrite backend data. A production main reset/force-push is not part of rollback.

Backend actual-data checks and deployment/activation are unexecuted in this Cloud prep task.
