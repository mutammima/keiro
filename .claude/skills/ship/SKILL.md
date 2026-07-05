---
name: ship
description: Ship the current work end-to-end — commit, push, PR, merge on approval, watch the Vercel deploy, and verify the new version is actually live. Use when the user says "ship", "merge", "push and merge", "is it live?", "is everything merged?", or any variant of wanting work landed and deployed.
---

# Ship

Take the current branch from working tree to **verified live in production**, and end with a state table so the user never has to ask "is everything merged?".

## Steps

1. **Preflight** — `npm run build` must pass with zero errors (hard project rule). Refuse to continue if it fails; report the errors instead.
2. **Commit & push** — commit any uncommitted work on the feature branch (never on `main`), then `git push -u origin <branch>`.
3. **PR** — `gh pr create` against `main` if none exists; otherwise reuse the open PR.
4. **Merge** — if the user already said merge (e.g. invoked this as "ship it" / "merge"), merge with `gh pr merge --merge`. If they only asked to push/PR, stop after step 3 and say the PR is ready.
5. **Watch the deploy** — after merge, poll until the deployment for the merge commit is live:
   ```bash
   # merged commit short hash:
   HASH=$(git rev-parse --short origin/main)   # after git fetch origin main
   # poll (Vercel usually deploys main in 1-3 min); every ~20s, up to ~5 min:
   curl -s https://keiro-mutammimas-projects.vercel.app/version.json
   ```
   Done when `version.json` returns `{"version":"<HASH>"}`.
6. **Report** — always end with this exact table, filled truthfully:

   | Step | State |
   |---|---|
   | Branch | `<name>`, pushed ✅/❌ |
   | PR | #N, merged ✅ / open / — |
   | Build | passed ✅/❌ |
   | Deploy | live ✅ (version `<hash>`) / pending / failed |
   | Phone note | "On your phone: reopen the app; if the update banner doesn't appear within ~30s, close and reopen once more (service worker swap)." |

## Facts

- **Production URL: `https://keiro-mutammimas-projects.vercel.app`** — this is the URL that serves the app. `keiro.vercel.app` and `delivery-invoice.vercel.app` do NOT serve it (Vercel NOT_FOUND as of Jul 2026).
- `public/version.json` is written at build time by `vite.config.js` with the git hash — it is the ground truth for "is my change live".
- The PWA on the user's phone updates via `useVersionCheck` polling `/version.json` every 30s → UpdateBanner. A freshly merged change is NOT visible on the phone until that banner is accepted or the service worker swaps.
- Never merge unrelated open PRs without being asked; report them in the table's PR row instead.
