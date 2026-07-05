---
name: verified-fix
description: Keiro's definition-of-done for UI/behavior fixes — fresh service worker, real +tag account, 375px viewport, screenshot proof BEFORE claiming fixed. Use before declaring any visual/interactive fix done, and whenever a fix "didn't work" on the user's phone, a tutorial/overlay/auth flow changed, or preview behavior looks stale or impossible.
---

# Verified Fix

History: fixes were repeatedly declared done, then failed on the user's actual iPhone (bottom-bar saga: 6 rounds; tutorial: ~90 turns). One long debugging session chased a "bug" that was a stale service worker. Never say "fixed" without the proof below.

## Definition of done — all of these, in order

1. **Kill the stale service worker first** (the #1 false-signal source):
   - In the preview page: unregister all SWs and clear caches, then hard reload:
     ```js
     const regs = await navigator.serviceWorker.getRegistrations();
     for (const r of regs) await r.unregister();
     const keys = await caches.keys();
     for (const k of keys) await caches.delete(k);
     location.reload();
     ```
   - Verify `navigator.serviceWorker.controller === null` after reload before trusting anything you see. If a dev server was restarted, also confirm HMR is alive (edit → change visible) — a dead websocket silently serves stale bundles.
2. **Use a real account, not a bypass.** The `test/test` login is gone. A DEV-only bypass (`OnboardingFlow.jsx`, gated on `import.meta.env.DEV`) logs you in as a fake `{id:'dev'}` user — it exists only under `npm run dev`, never in a preview/prod build, and creates no real Supabase account, so it cannot verify auth, cloud sync, or cross-account behavior. For anything beyond pure local UI, sign in with a fresh `alomonds+<tag>@gmail.com` account. At the end, tell the user which throwaway accounts you created so they can be cleaned up.
3. **Verify at 375px width** (`preview_resize`) — the app is mobile-first; desktop-width rendering proves nothing.
4. **Watch live, don't read history.** Never trust the cumulative console buffer — install an in-page interceptor (wrap `console.error`/listen for events into a fresh array) and assert on that. Space synthetic clicks (~300ms+) — instant sequential clicks miss debounces and animations.
5. **Prove the change is present, then prove it behaves.** First confirm the new code is actually in the served bundle (e.g. a marker string, or the expected new DOM). Only then test behavior. "The fix didn't change anything on screen" usually means you're testing the old bundle — go back to step 1.
6. **Screenshot proof before the claim.** Attach a `preview_screenshot` of the fixed state to your "done" message. No screenshot → not done.

## Know what preview CANNOT prove

Say so explicitly instead of over-claiming, and ask for a phone check when the fix involves:
- iOS Safari bottom bar / `env(safe-area-inset-*)` / `100dvh` edge behavior
- PWA install, home-screen launch, or update-banner propagation on device
- Real OAuth redirects on mobile, or anything needing a second physical device (cross-account flows)

Template: "Verified in preview (screenshot above). Not device-provable: `<X>` — needs a 30-second check on your phone: `<exact steps>`."

## localStorage gotcha

All `inv_*` values are JSON-encoded. `localStorage.getItem('inv_user_role')` returns `"\"driver\""` — comparing raw shipped a real bug (invisible walkthrough). Always `JSON.parse` before comparing.
