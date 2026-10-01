# Public Beta Analytics

The public beta uses Umami Cloud only when both
`VITE_ANALYTICS_ENDPOINT` and `VITE_ANALYTICS_WEBSITE_ID` are configured.
Without both values, analytics and the survey are disabled.

The free-plan frontend configuration is:

- `VITE_ANALYTICS_ENDPOINT=https://cloud.umami.is/script.js`
- `VITE_ANALYTICS_WEBSITE_ID=13fbca78-7546-408c-a655-aaf81a954436`

The tracker URL is the full URL supplied by Umami Cloud. The client recognizes
the `.js` suffix and uses it unchanged. No Umami API token is needed to send
frontend events.

## Privacy contract

The application sends only allowlisted event names and categorical values. It
does not send names, email addresses, free text, race keys, horse names, dates,
venues, raw URLs, or a custom persistent user ID. A send-time guard replaces the
standard tracker URL with the constant `/public-beta-event` and clears referrer
and title values. Return visits are detected in
the browser with date-only local storage and reported only as `later_day`.

Umami may process ordinary HTTP request metadata according to the deployed
Umami instance's own configuration. The application does not copy that metadata
into the two-week report. The report stores aggregate counts only and never
writes raw event responses.

Tracked events:

- `beta_page_view`: generic route category
- `beta_race_select`: JRA/NAR and catalog source
- `beta_org_switch`: JRA/NAR selection
- `beta_share`: native/clipboard and JRA/NAR/UNKNOWN
- `beta_return_visit`: later-day bucket
- `beta_member_click`: fixed UI source category
- `beta_survey_open`
- `beta_survey_submit`: three fixed-choice answers

The survey has exactly three fixed-choice questions and no free-text field.

## Growth P0 events (fixed enumerations only)

These events extend the same contract. Every property value is a member of a
fixed list defined in `client/src/lib/betaAnalytics.ts` / `campaign.ts`; any
other value is rejected and the event is discarded, and any property that is not
in the list for that event is dropped before sending. They add **no** visitor
id, session id, fingerprint, email, race key, date, venue, URL or referrer.

- `beta_page_view`: `route` now also accepts `simulator` and `rules`. (`simulator`
  was missing from the allowlist, so `/simulator` page views were silently
  discarded before this change.)
- `beta_cta_click`: `cta_id` in `hero_today`, `hero_results`, `hero_simulator`,
  `featured_race`, `featured_scenario`, `rules_link`, `value_strip`
- `beta_outbound_click`: `target` = `note` only (Bookers is intentionally not
  allowed until its terms and a link exist); `placement` in `member_gate`,
  `member_page`, `weekend_pass`, `access_code`
- `beta_campaign_visit`: `source` = `x` only; `campaign` in `morning`, `compare`,
  `agree`, `split`, `prerace`, `result`, `daily`, `weekly`, `monthly`, `research`,
  `simulator`, `edu`, `profile`, `pinned`. Read once per browser session from
  `utm_source` / `utm_campaign`; `utm_medium`, `utm_content`, `utm_term` and every
  other query parameter are ignored and never sent.
- `beta_race_detail_view`: `organization` (`JRA` / `NAR` / `UNKNOWN`) and
  `race_state` (`pre` / `pending` / `post`), sent once a race has loaded
  successfully
- `beta_simulator_open`: `entry` = `race_link` (opened with `?race=`) or `direct`
- `beta_history_view`: no properties

Returning visitors keep being reported only as `beta_return_visit` / `later_day`.
Weekly returning visitors are therefore an approximation (the analytics vendor's
visitor counts plus `later_day` events), not an exact identity-based figure.

## Canonical public URL

Source code never contains the public site URL. The canonical URL is the single
build variable `KEIBA_TRACE_BASE_URL` (exposed to the client through vite's
`envPrefix: ["VITE_", "KEIBA_TRACE_"]`; in CI it comes from the repository
variable `vars.KEIBA_TRACE_BASE_URL`). `getTraceBaseUrl()` / `buildCampaignUrl()`
in `client/src/lib/campaign.ts` return `null` when it is unset or not a plain
https URL, so a missing setting can never produce a hard-coded or malformed link.
(`client/index.html` still carries the previous canonical / `og:url` tags; moving
them to the variable is a separate, optional change.)

## GitHub configuration

Pages deployment secrets:

- `VITE_ANALYTICS_ENDPOINT`: HTTPS Umami script origin or full script URL
- `VITE_ANALYTICS_WEBSITE_ID`: Umami website ID

Optional API summary configuration:

- Repository variable `BETA_START_AT`: actual beta launch time in ISO 8601
- Secret `UMAMI_API_URL`: Umami API origin
- Secret `UMAMI_WEBSITE_ID`: website ID queried by the API
- Secret `UMAMI_API_TOKEN`: read credential for the Umami API

`.github/workflows/public-beta-summary.yml` is manual-only. It has no scheduled
trigger on the Umami Cloud free plan. If API access is added later, it can use
Umami's `event-data-pivot` endpoint for the fixed beta window and upload
`summary.json` and `REPORT.md`. Missing credentials or an unexpected response
fail closed and never affect frontend event delivery.

The summary is descriptive product research only. It does not change models,
predictions, selection, betting, or the read-only race API.
