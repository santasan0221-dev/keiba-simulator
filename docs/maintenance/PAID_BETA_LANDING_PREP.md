# Paid beta landing implementation prep

Final status: KEIBA_TRACE_PAID_BETA_LANDING_EXTERNAL_SETUP_REQUIRED. Frontend checks pass; external URLs, tax/billing/legal confirmation and real beta service verification remain. No main push, deployment, note/Form publication, recruitment, payment or production flag change.

## Inventory and source

Latest fetched origin/main: f1f795aeb883df3f70b2dd940b644f3ebcccc61f. Branch feat/paid-beta-landing-prep starts directly here, no feature stack or old-branch merge. Main has Home/real race finder/RacePage, SimulatorShell, AI history, performance-analysis, shared service/mobile nav and Home footer. Existing /member, /access-code and /free routes are NOT the new paid-card product. Theme uses existing dark appearance/variables; mobile navigation breakpoint 760px. Existing Pages BASE_URL router and public/404.html redirect preserved.

Prior approved card renderer/CSS/DTO and normalized synthetic demo extracted individually from 9598c76bcb9b059b89ec38d5c96846a9f62a24e4. React import added for SSR test compatibility; card rules unchanged. Demo title explicitly says fixture/imaginary race. No live paid body, odds research, results or performance numbers added to landing bundle. Evidence regression API bodies are synthetic and are NOT imported by production UI.

## Existing membership classification

REUSE: existing Link/router, appearance variables, typography, CTA conventions, Simulator/results/free routes, shared Umami initialization/privacy hook.
IGNORE for new landing: legacy MEMBER_PREPARING badge, old MemberGate/WeekendPass and placeholder access form; these are not proof of entitlement. No client preview used for authorization.
REPLACE conceptually: product description on the dedicated landing, not by editing old member page. Existing membership routes/nav remain byte-identical while landing OFF.
REMOVE: none in this task, preserving OFF behavior. A later approved navigation/product reconciliation should address legacy MEMBER wording before a broad public rollout.

## Strategy and route

Choose dedicated /beta plus one flag-guarded Home link. Avoid adding a service/mobile nav item; Simulator and race pages unchanged. /membership duplicates legacy /member; top-only pricing is too heavy; note-only does not show the card product. Hash/query routing would introduce a separate convention. /beta uses existing Pages base and 404 redirect. Lazy-load landing and CSS. No API requests in landing.

Strict VITE_PAID_BETA_LANDING_ENABLED=1, default OFF. A separate tiny flag module avoids loading marketing content through the Home entry. OFF: route absent/normal NotFound, Home link absent, no layout/API/nav changes. Isolated /tmp builds used ON; no persisted env/CI flag edits.

Operator build config states: PRELAUNCH/INVITE_OPEN/FULL/PAUSED. No query/localStorage state reads. PRELAUNCH notification form, INVITE_OPEN interest form, FULL/PAUSED no recruitment link. Unknown state -> PRELAUNCH. Form URL missing -> explanatory text, no empty/#/disabled CTA. Existing VITE_NOTE_MEMBERSHIP_URL reused, but purchaseApproved is fixed FALSE in this prep. Merely setting note URL or state cannot expose purchase link. Future purchase link requires reviewed approval, INVITE_OPEN, note URL and all terms/privacy/commerce/contact URLs.

Config URLs: VITE_PAID_BETA_INTEREST_URL (Google Forms), VITE_NOTE_MEMBERSHIP_URL (note.com), VITE_PAID_BETA_TERMS_URL, VITE_PAID_BETA_PRIVACY_URL, VITE_PAID_BETA_COMMERCE_URL, VITE_PAID_BETA_CONTACT_URL. HTTPS/credential checks; absent legal URLs omitted, no placeholder legal pages. Production publication requires actual reviewed documents, not omission alone.

## Product and sample

KEIBA TRACE 分析β, monthly 980 yen, invite-only 20, JRA only. Hero leads with six candidates + reasons, not price. Full current-day target JRA cards, short/detailed/evidence/pairwise/Selectivity. Simulator/Share/basic results/main forward results remain FREE. NAR paid, Eligibility, Market Consensus and card history excluded; diagnostic fields never supplied. No guarantees, bets, testimonials, fake capacity or results.

Primary sample CTA goes to the sample section. Real sample NOT registered in this repo: "開催日に公開予定"; no arbitrary race selection. Collapsed approved fixture demo provides UI experience with explicit labeling. /free link is labeled current free scope, not falsely a live card. When canonical server sample is available, a separately reviewed route integration is needed; this task adds no backend request or sample resolver.

## Accessibility and SEO

Native main/header/nav/footer, one h1, table/caption/row and col headers, details summaries, keyboard/skip link, scoped focus/forced-colors/reduced-motion CSS, 44px CTA, mobile fixed-width table with wrapping rather than horizontal scroll. Representative contrast >=4.5; not full WCAG certification. Seven widths measured, 390 hero under 650px.

Client title/description/canonical/OG/Twitter metadata updated on entry and restored on exit. Landing removes maximum-scale restriction while active, restores original viewport afterward; OFF document unchanged. Pages-base ON tested. This is CLIENT metadata prep: JS-disabled social crawlers may retain root metadata/404 behavior. Static OG/prerender strategy needs review before relying on social preview; no OG image invented/generated.

## Analytics

Protected betaAnalytics.ts kept byte-identical. Landing-only typed sanitizer/module uses existing window.umami and privacy hook, fixed events landing_view/sample_cta/beta_interest_cta/faq_open/note_cta/simulator_cta, state-only whitelist. No identity, URL, code/token, email or member count. Best-effort when tracker available; absent tracker skips events without network or blocking. No new analytics provider/dependency.

## Evidence

Full candidate Vitest 662 pass, 0 failures. Existing unchanged-main baseline 647 from prior verified same SHA; current 14 main/OFF browser pairs and protected-source checks supplement it. Landing tests 15; requested mutations 10/10 detected, original bytes restored. Typecheck, Pages Vite OFF and isolated ON base-path builds and server esbuild pass. Existing chunk/export warnings not suppressed.

13 viewport/state cases: widths 320/360/390/430/768/1024/1440 plus INVITE_OPEN/FULL/PAUSED at 390/1440. Screenshots include pricing/FAQ/card preview/forced colors. Keyboard, representative contrast, hero height, targets, no overflow/errors and no API calls verified in isolated fixture preview. External resources stubbed due Cloud proxy. 14 main/OFF pairs: Home/free/race/history/analysis/Simulator/beta at 390 and 1440; API calls and body DOM equal. Fresh candidate Pages-base /beta ON: client query cannot change state, no purchase links or API requests, runtime metadata/viewport and cleanup verified. These are not real production smoke.

Entry JS OFF +1239 bytes / gzip +475 against same-config main; ON lazy landing chunk 26361 bytes / gzip 7056. See performance.json; not full user network latency. No autoplay/new huge image assets. Existing Simulator logic, camera, geometry, trace, analytics, race UI and membership files unchanged.

## Remaining gates

Real Form/note URLs and privacy-consent handling, tax/autorenew/cancellation/refund conditions, actual terms/privacy/commerce/operator/contact documents, note membership behavior, home canonical API/Node/ACL/CDN beta access verification, live sample registration/integration, legacy MEMBER wording reconciliation and static social metadata review. These prevent publication/paid launch. Feature push only allowed.
