# Frontend beta security

Server API is sole authorization boundary; CSS/paid=true/localStorage flags do not grant access. Never embed live codes/tokens in bundle. Token is opaque, stored in sessionStorage/memory, validated by server. sessionStorage does not protect against XSS and tab close does not revoke server session.

Exact https://api.keibalab.net base allowlist, no token on API override, no credential-bearing redirect. Epoch discards delayed requests after logout/expiry. Revalidate on visibility/pageshow, no paid prefetch/static JSON/service-worker persistence. no-store API plus actual CDN bypass required. Share contains no paid card; source isolation test checks capture path. Manual screenshots cannot be prevented.

See backend companion security/runbook for shared-code limitations, rotation, independent DB permissions, note operation checks, and required real production verification. Tests do NOT constitute current note membership verification.
