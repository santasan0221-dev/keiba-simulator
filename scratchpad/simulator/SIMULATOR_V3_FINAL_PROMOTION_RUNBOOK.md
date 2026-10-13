# Simulator V3 final promotion runbook (do NOT run without approval; this audit pushed nothing)
1. `git fetch --all --prune`; confirm `git rev-parse origin/main` is still 5e9bda1f38588397e5cfbf6a6dff08c8a87bd8ac (if moved: STOP, re-audit; the branch must be re-based and re-verified).
2. Production checkout clean (`git status`), on main, no unexpected HEAD movement.
3. Check out `feat/simulator-v3-final-promotion-package`; confirm `git log --oneline origin/main..HEAD` is exactly the 3 commits (Polish, Visual UX, docs).
4. `pnpm check`; `pnpm exec vite build --base=/keiba-simulator/`; `pnpm exec vitest run` -> expect the 4 known failures only (resultOps x2, base-URL env x2).
5. Merge fast-forward only (`git merge --ff-only`) — user performs it.
6. Push main (user; the Claude git hook blocks push).
7. Watch workflow "Deploy simulator to GitHub Pages" (push to main triggers; build -> dist/public artifact -> deploy). Asset names are content-hashed; no cache purge step exists.
8. Production smoke: /simulator on 390px and desktop: strip shows section + remaining + 5 chips; play ~100px below track; 2D/3D toggle; Share View 16:9/1:1/9:16; other pages (/, /ai-history, race detail) unchanged.
9. Rollback triggers: console/page error on /simulator, overflow, missing GOAL, Share not fitting, or any ranking/analytics anomaly.
10. Rollback: revert in LIFO order: `git revert <UX 4a5b232>` then `git revert <Polish f9d4502>` (verified on a throwaway branch: both clean, tree == 5e9bda1). Reverting Polish alone while UX is present CONFLICTS (trace.css / SimulatorShell.tsx): revert UX first. Fast alternative without a revert: `?uxl=B` or `?uxl=A` per URL is a comparison aid only, not a production switch.
