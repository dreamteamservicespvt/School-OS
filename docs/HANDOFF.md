# School OS handoff

Last updated: 2026-10-23 23:59 IST

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
1. DONE 2026-10-23: console WhatsApp templates live; phone audit live on main 46a3b2e0 (report
   docs/qa/2026-10-23-phone-audit.md). Test school "DTS Test School" (DTS-HYD-001); never touch Chaitanya English.
2. Offline attendance stays opt-in (blueprint says optional). Decided, not a gap.
3. DECIDED by the user 2026-10-23 (build in this order, one at a time, brainstorm → plan → build):
   a. Receipt link: CODE DONE 2026-10-23 night (local commit, not pushed). Every posted payment (cash too)
      has a secret address /r/<key> (src/app/r/[key]/route.ts, token.ts receiptKeyFor) that opens the
      parent copy PDF. The "Fee received" WhatsApp ready text ends "Open your receipt: {receipt_link}";
      on an approved template that line becomes an "Open receipt" URL button (blanks.ts whatsappParts,
      whatsapp.ts templateComponents; deliver.ts fills the button). Schools still on the untouched old
      text, never sent to WhatsApp, get it by migration 20261024000000_fee_paid_receipt_link. Also fixed:
      WhatsApp texts that end on a blank get a full stop when sent for approval (Meta refuses them).
      Tests: tests/fees/receipt-link.test.ts, never-lost.test.ts (button filled). SMS text unchanged (DLT).
      LEFT FOR THE USER: `sos_fee_receipt` is NOT yet on Meta. The local .env no longer has
      WHATSAPP_ACCESS_TOKEN, and 6 Chrome profiles are connected (Claude may not pick one). Either put the
      token back in .env and run `python scripts/wa-templates.py create scripts/whatsapp/sos_fee_receipt.json`,
      or pick the SRINU-dts browser for Claude. Note: schools send from their OWN WhatsApp account; each
      school's "Fee received" template is sent for approval from Message Templates (it now includes the
      button). sos_fee_receipt only serves a school that sends through the shared Dream Team number.
   b. Backups: nightly encrypted copy to Cloudflare R2 (user chose R2 knowing it does not promise India;
      blueprint "in India" was inferred). Adapt scripts/backup.sh (aws CLI with --endpoint-url for R2)
      and run it nightly from GitHub Actions. User must create: Cloudflare R2 bucket + S3 API token,
      a GPG key for BACKUP_GPG_RECIPIENT, a BYPASSRLS backup login on Neon; secrets go in GitHub
      Actions secrets, never in git. Also schedule scripts/restore-test.ts monthly.
   c. Settlement matching: build now against Razorpay's documented Settlements API, shipped switched off
      per school (School Feature); unmatched lines listed. Test on a live account later, when a school
      takes online payments (user then gives read-only keys).
   d. Privacy notice: Claude drafts plain English from the DPDP Act + 08-platform-security.md consent
      rules, marked DRAFT for the user's lawyer; Telugu only from the lawyer/translator, never invented.
      Screen stays switched off until approved text is in.
   Still open: timed tests (parent pays on a slow phone < 60 s; teacher marks 40 students < 60 s).
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
