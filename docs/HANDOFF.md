# School OS handoff

Last updated: 2026-10-23 22:30 IST

## State
- Console WhatsApp delivery reports are live: `/api/v1/console/whatsapp`
  (src/lib/console/whatsapp-webhook.ts, route in src/app/api/v1/console/whatsapp/).
  Commits dbea600c, 57b93624, 98cf79b4 on main (Vercel builds main).
- The Meta app "Dream Team Posting" (id 1150664693886368, number +91 79896 17553)
  belongs to the gym (Rebuild Fitness app at dreamteamfit.vercel.app). Its webhook
  callback was changed on 2026-10-23 from `https://dreamteamfit.vercel.app/api/whatsapp/webhook`
  to School OS. School OS now passes every call to the gym first, unchanged, and
  returns the gym's answer to Meta (CONSOLE_WHATSAPP_FORWARD_URL). Gym checked
  working: messages at 15:40 and 16:09 reached its app.
- Vercel env set (school-os, Production): CONSOLE_WHATSAPP_APP_SECRET,
  CONSOLE_WHATSAPP_VERIFY_TOKEN, CONSOLE_WHATSAPP_FORWARD_URL.

- 98cf79b4 confirmed as the newest production deployment (GitHub deployments API, 10:30 UTC).
- WhatsApp templates (checked via Graph API, script scripts/wa-templates.py,
  reads .env WHATSAPP_ACCESS_TOKEN + WHATSAPP_BUSINESS_ACCOUNT_ID):
  code = `sos_console_login_code` (Authentication, APPROVED);
  reset = `sos_admin_login_reset` (Utility, APPROVED, id 1142321704985170);
  invite = `sos_admin_login_invite` (Utility, APPROVED, id 1114116428259711).
  Both use body blanks {{1}} school, {{2}} name and a URL button
  https://school-os-beta.vercel.app/i/{{1}} (if APP_URL changes, the templates must be redone).

## Next steps
1. DONE 2026-10-23 (earlier): console WhatsApp templates set on Vercel and tested (invite reached
   9652733668); test school "DTS Test School" (DTS-HYD-001) on live, never touch Chaitanya English.
   1b/1c pushed: sign-in pages fit phones (90e0bd1e); console counts 16 core modules (8ee0ad04, live
   since 13:19 UTC). "Modules on 16" not read on live (needs the owner's sign-in code).
1d. DONE and LIVE 2026-10-23 22:27 IST (main 46a3b2e0, Vercel Production success): phone audit of 890
   school + 14 console pages, 20 fixes; report docs/qa/2026-10-23-phone-audit.md; research
   docs/research/school-owner-pain-points.md. Also built: Parent Link resent on a guardian's new mobile
   (tick box), "Paid twice" online payments flagged to the fee desk. Tests 2,161/2,161, lint 0 errors.
2. Offline attendance stays opt-in (blueprint says optional). Decided, not a gap.
3. Waiting on the user (see report "Decisions taken"): Razorpay settlement matching (needs live account
   access), privacy notice text (lawyer; English + Telugu), where to store scheduled backups, receipt link
   in the fee message (Meta template re-approval on the WhatsApp account shared with the gym), timed tests.
4. Not checked on live: pages behind the owner's console sign-in code ("Modules on 16").
5. Meta webhook belongs to the gym (dreamteamfit). User's rule: never touch it or gym Vercel
   without permission. /api/v1/console/whatsapp is unused. Gym WhatsApp token left as is.

## Gotchas
- Meta rejects Utility templates that mention a password or login ("INCORRECT_CATEGORY",
  6 times); it wants Authentication, which allows only codes. Word them as account
  status: "your account is ready / was updated, tap to open it". No blank at the start or end.
- Never touch the Meta webhook or the gym's Vercel without the user's permission (user, 2026-10-23).
- Claude must not type secrets into web forms; put them on the clipboard for the user.
- Auto mode blocks `git push` to main; the user approves pushes in default mode.
- Phone probe scripts: C:/Users/chala/tools/school-os-probe (run `npm i` there for playwright-core;
  Chrome at C:/Program Files/Google/Chrome/Application/chrome.exe. Admin sign-in code is in
  C:/Users/chala/tools/app.log ("[dev] one-time code"). Wait ~2 s after load before leaving a page,
  or the app router's history update looks like "interrupted by another navigation".
- Local console login: QA Test Owner, mobile 9000000101 (local DB only); its password is not saved.
- `npm run build` locally needs NODE_OPTIONS=--max-old-space-size=6144.
