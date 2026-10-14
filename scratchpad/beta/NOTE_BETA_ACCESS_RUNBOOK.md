# UI companion runbook

Keep public UI flag OFF. Do not deploy or push main. Use backend companion NOTE_BETA_ACCESS_RUNBOOK.md for offline fixture DB setup and home verification.

Verification commands (Cloud fixtures): node_modules/.bin/tsc --noEmit; VITE_SINGLE_PICK_AI_BASE=https://api.keibalab.net SINGLE_PICK_AI_BASE_URL=https://api.keibalab.net node_modules/.bin/vitest run; VITE_SINGLE_PICK_AI_BASE=https://api.keibalab.net node_modules/.bin/vite build.

Browser harness requires isolated /tmp/note-beta-ui-on fixture build, Playwright under /workspace/.onboarding-tools/node_modules, Chromium /usr/bin/chromium. Harness API/credentials are ephemeral and never printed. External requests stubbed. Do not substitute production note codes. Screenshot data are synthetic. Local production smoke/CDN bypass still required.
