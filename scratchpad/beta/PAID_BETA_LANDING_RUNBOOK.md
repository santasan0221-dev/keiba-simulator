# Landing prep runbook — no production enablement authorized

Branch feat/paid-beta-landing-prep, direct origin/main f1f795aeb883df3f70b2dd940b644f3ebcccc61f. Keep public landing/card/beta flags OFF. Do not deploy, push main, publish note/Form, recruit or collect payment.

## Verified Cloud checks

node_modules/.bin/tsc --noEmit
VITE_SINGLE_PICK_AI_BASE=https://api.keibalab.net SINGLE_PICK_AI_BASE_URL=https://api.keibalab.net node_modules/.bin/vitest run
python scripts/mutate-paid-beta-landing.py
VITE_SINGLE_PICK_AI_BASE=https://api.keibalab.net node_modules/.bin/vite build

Mutation runner needs clean passing landing tests, changes one source at a time, restores exact bytes. Do not build/preview/test concurrently with mutations.

## Isolated visual checks

Evidence preview.tsx/preview.html + vite-preview.config.ts are fixture-only, not production build inputs/routes. Fixture query state exists ONLY in screenshot driver; production state ignores query. Start Vite with evidence config, then browser.mjs and accessibility.mjs. Playwright /workspace/.onboarding-tools/node_modules, Chromium /usr/bin/chromium. Preview/test ON must stay process-local with synthetic data; never use real paid data/code/token. regression.mjs uses /tmp/note-beta-ui-main, /tmp/paid-beta-landing-off and /tmp/paid-beta-landing-on static builds. External HTTPS resources stubbed. No localhost preview published to users.

## External setup before any publication

Verify note plan/980-yen tax/autorenew/cancel/refund semantics. Create and review real interest Form/privacy consent, terms/privacy/commerce/operator/contact pages. Set only reviewed public URLs in environment configuration; no secret in VITE_*. Missing URLs are omitted, but that is NOT permission to launch without legal/support documents.

Keep purchaseApproved false. Do not wire note purchase merely by setting URL/state. Invite 20 after technical/operational gates pass, not automatic signup. Register actual JRA sample server-side and separately verify real sample route integration. Reconcile legacy MEMBER/product wording before broad rollout; do not repurpose preview membership as auth.

Review static metadata/Pages deep-link/social crawler support. Current runtime metadata does not guarantee OG crawler output. Verify actual Pages base-path and network behavior after separately authorized publication.

## Rollback future plan

Landing flag OFF and rebuild removes /beta registration and Home entry. No prediction/entitlement/store rollback required by this frontend-only change. Preserve backend/card kill switches independently. Feature revert is the three commits above main; once SHAs exist, record git log origin/main..HEAD. No rollback/main changes executed here.

Implementation SHA: c92234d898b2bffb81fcfe387ad85399aa1a32aa. Tests SHA: 401bf87e79ac88b4dfa6155d8cb1f72d3960e669. Base: f1f795aeb883df3f70b2dd940b644f3ebcccc61f. If later promoted and rollback authorized, disable/rebuild landing first; revert docs/package commit, tests commit, then implementation in reverse order. No history rewrite/main operation performed here.
