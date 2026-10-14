# Note beta frontend prep

Status: KEIBA_TRACE_NOTE_BETA_ACCESS_LOCAL_VERIFY_REQUIRED. Branch starts directly at origin/main f1f795aeb883df3f70b2dd940b644f3ebcccc61f. Repackaged approved card UI from bbcb7f6 plus beta access UI/session client. Backend architecture/runbook/security are in single_pick_ai branch feat/note-beta-access-prep.

No production flags, deploy, billing, or main push. Existing VITE_PREDICTION_CARD_PUBLIC_ENABLED remains default OFF; ON builds ONLY in isolated /tmp fixture outputs. OFF normal UI sends no beta access/session request and renders no beta/card DOM.

Token memory/sessionStorage, expiry + visibility/pageshow server revalidation, epoch guards on request sharing, exact trusted API origin only, redirect:error. Requests to user-selected alternative API get NO Authorization. No browser tier authorization. Logout server revoke plus immediate browser clear. Current-day cards only; no paid history. Share capture remains Simulator-only and consumes no card DTO.

Typecheck/default-OFF build/full tests and isolated 390/667x375/1440 browser checks recorded in scratchpad/beta/note_beta_access_evidence. External resources stubbed due proxy; production API/CDN/note/Windows service-account behavior NOT certified. Browser reports contain no credentials; images contain synthetic card data only. API fixture is copied approved synthetic source, not canonical production data.

Real API auth/expiry/cache/revocation and note operations require local verification before activation. GitHub Pages origin shared across repo paths; no path-based security isolation. Separate domain advisable before expansion. No Simulator logic/camera/geometry/analytics changes.
