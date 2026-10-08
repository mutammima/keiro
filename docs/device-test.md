# Device test — two phones

Run after a release that touches sign-in, connections, orders, invoices or storage.
Phone A = driver, Phone B = store owner. Use real `alomonds+<tag>@gmail.com` accounts
and note which ones you created. Tick each step; write down anything that differs.

## Before you start
- [ ] Both phones have the latest app (web: hard refresh; iPhone app: open twice so the OTA update applies).
- [ ] Settings → About on both shows the same "build" code as `curl -s https://keiro-mutammimas-projects.vercel.app/version.json`.

## 1. Sign-up emails (Gmail SMTP)
1. [ ] Phone B: Sign up with email using an address that is NOT the Keiro Gmail.
   Expect: "Almost there — we sent a confirmation link… Can't find it? Check your Spam folder."
2. [ ] The email arrives within 2 minutes (check Spam). Sender: Keiro, from the Keiro Gmail.
3. [ ] Tap the link → lands on the live Keiro site, not a dead page. Log in.
4. [ ] Log out → "Forgot password" → reset email arrives → link opens "set the new password" → new password works.

## 2. Google sign-in on the iPhone app
5. [ ] Phone A (iPhone app): Continue with Google → Safari sheet → choose account → returns to Keiro signed in.

## 3. Invite → connect
6. [ ] Phone A (driver): Stores → Connect a store → share the invite link to Phone B.
7. [ ] Phone B: open the link → it connects → Drivers tab shows Phone A's business.
8. [ ] Phone A: Stores shows Phone B's store as connected.

## 4. Order → invoice → signature → receipt
9. [ ] Phone B: Orders → New request to Phone A (one product, quantity 5).
10. [ ] Phone A: the order appears in Route within a minute → Accept → Fill invoice → Generate.
11. [ ] Phone A: open the invoice → Sign → both signatures → leave the invoice → reopen: signatures still there.
12. [ ] Phone A: Download PDF / Share → the share sheet opens (iPhone app) → the PDF shows both signatures in dark ink (also with the app in dark mode).
13. [ ] Phone B: Orders shows the order delivered with the invoice number → Invoices shows the invoice → Confirm receipt.
14. [ ] Phone A: the order shows receipt confirmed.

## 5. Offline
15. [ ] Phone A: turn on Airplane Mode → New invoice → Generate. Expect: saved, an amber "saved on this phone" toast.
16. [ ] Turn Airplane Mode off → within a minute a green "Synced 1 pending change" toast; the invoice is on Phone A's other session / the web.

## 6. Crash reports
17. [ ] Phone A: Settings → Help & Tutorial → Send test report → "Sent…".
18. [ ] Sentry (sentry.io → Issues) shows "Keiro test report" tagged `source: test-report`, with no names or invite codes in it.
19. [ ] Settings → Terms & Privacy → switch "Send crash reports" off → Send test report → "Crash reports are switched off".

## Record
| Date | Build | Phones | Passed | Notes |
|---|---|---|---|---|
| | | | | |
