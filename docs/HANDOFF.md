# School OS handoff

Last updated: 2026-10-31 12:00 (security audit run-1 + 2 fixes; nothing pushed)
Older history: docs/archive/HANDOFF-until-2026-10-30.md (moves, WhatsApp templates, receipt link, Meta webhook).

## State
- SECURITY AUDIT 2026-10-31 (security-audit skill, quick profile, 8 agents, source-only): report
  docs/qa/2026-10-31-security-audit.md; full run ~/security-audit-skill/School-OS/run-1 (findings.json,
  coverage-ledger.json, NEEDS-VALIDATION.md; tools/ there rebuild prompts and validate). 2 confirmed, both FIXED:
  notice-archive Undo republished any archived notice past approval (medium; src/lib/communication/undo.ts),
  two-step sign-in skipped when a set-up SMS send failed, e.g. no credits (low; src/lib/auth/two-step*.ts).
  4 NEEDS VALIDATION, not fixed (owner facts): WhatsApp webhook not bound to the school's number (shared Meta
  app?), pay-link Checkout posts an authorized-not-captured payment (Razorpay auto-capture?), console invoice
  paid twice by overlapping confirmations (no row lock), support-cookie parse in proxy vs app (Next.js).
  Partial pass: the critic left 9 areas deferred (about 95 action files, about 140 download/print routes,
  82 id pages, users & roles editing, switched-off modules, DB definer functions, data-security actions,
  POST routes without Origin check, money actions). 27 hardening notes in the report.
- Earlier 2026-10-31: delivery audit (docs/qa/2026-10-31-delivery-audit.md, gate YELLOW, 16 fixed), morning
  clean-up (lint clean, typed-twice income/expense), light code audit (docs/qa/2026-10-31-code-audit.md: CSP,
  nodemailer). Demo reseeded 09:40; details in docs/archive/HANDOFF-until-2026-10-30.md.
- Local commits on branch claude/project-thread-cesreq, NOT pushed (audit commits 2150019b..HEAD).
  The user's own uncommitted edits (.vscode/settings.json, CLAUDE.md, next.config.ts, public/push-sw.js) left alone.
- Local setup: PostgreSQL 16 in tools/pg16 (data tools/pgdata; superuser `postgres` trust on localhost).
  App built and served from the SSD copy C:\Users\chala\sos-build (D: builds fail); logs tools/*.log.
- Branch note: origin still has the old commit 64f895d7 "a"; the next push needs --force-with-lease (ask first).

## Next steps
S. SECURITY (from the 2026-10-31 audit): (1) owner answers for the 4 NEEDS VALIDATION leads in
   ~/security-audit-skill/School-OS/run-1/NEEDS-VALIDATION.md, or say "fix them anyway" (all have small source
   fixes); (2) a standard-profile security-audit run-2 over the 9 deferred ledger units (needs ultracode;
   read run-1/coverage-ledger.json first, treat run-1 as the prior run); (3) the report's hardening notes.
0. DEMO DAY: to refresh "today" on another day, reseed after ~9:30 AM IST (earlier puts today's attendance in
   the future). Script used on 31-10 (backup, drop/recreate schema, migrate, seed, copy to SSD, build):
   docs/qa/reseed-demo.sh, then start with tools/start-only.sh. Before the live school: set FILE_LINK_SECRET.
2. Not done in the self-test: online payment through Razorpay (no keys locally); timed tests (parent pays on a
   slow phone < 60 s; teacher marks 40 students < 60 s).
3. DECIDED by the user 2026-10-23, build one at a time (brainstorm -> plan -> build); details in the archive file:
   b. Backups: nightly encrypted copy to Cloudflare R2 (user chose R2 knowing it does not promise India;
      blueprint "in India" was inferred). Adapt scripts/backup.sh (aws CLI with --endpoint-url for R2)
      and run it nightly from GitHub Actions. User must create: Cloudflare R2 bucket + S3 API token,
      a GPG key for BACKUP_GPG_RECIPIENT, a BYPASSRLS backup login on Neon; secrets go in GitHub
      Actions secrets, never in git. Also schedule scripts/restore-test.ts monthly.
      Brainstorm findings 2026-10-26: file copies already support R2 (storage.ts backupStore, BACKUP_S3_* with
      an r2.cloudflarestorage.com endpoint; worker schedule:file-backup runs via the 5-minute job tick), so
      files need only Vercel env vars on School OS's own project. Retention (nightly 30 d, monthly 1 y) can be
      R2 lifecycle rules on nightly/ and monthly/ prefixes. restore-test restores into <db>_restore_test on
      the SAME server as RESTORE_ADMIN_URL and records into the live backup_run, so a CI run needs the GPG
      private key + a Neon login with CREATEDB + BYPASSRLS. OPEN QUESTION to the user: may the GPG private
      key live in GitHub secrets (fully automatic monthly restore test), or stay offline on the user's PC
      (monthly test run by hand)?
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


## How to run things locally
- Start DB: `powershell -c "Start-Process -WindowStyle Hidden -FilePath 'D:\all\Projects\School-OS\tools\pg16\pgsql\bin\pg_ctl.exe' -ArgumentList '-D','D:\all\Projects\School-OS\tools\pgdata','-l','D:\all\Projects\School-OS\tools\pg.log','start'"`.
- Rebuild after a change: stop `next start` on :3000; `robocopy D:\all\Projects\School-OS C:\Users\chala\sos-build /MIR
  /XD .git node_modules .next tools storage qa-output .claude /XF build-and-start.sh`; then
  `Start-Process -WindowStyle Hidden D:\Git\bin\bash.exe build-and-start.sh -WorkingDirectory C:\Users\chala\sos-build` (~8 min).
- Tests: `npm test` (own database school_os_test; never two runs at once). Typecheck needs
  NODE_OPTIONS=--max-old-space-size=8192. Self-test scripts: qa/full/ (run with MSYS_NO_PATHCONV=1).
- Demo logins (local only, DEMO_PASSWORD from .env): school /sign-in principal, admin, accountant, teacher,
  subjectteacher, reception, transport, librarian, warden, store, viceprincipal, driver; console /console/sign-in
  9849012345 Owner, 9849023456 Onboarding, 9849034567 Support (code in tools/app.log). Parents: Parent Link.

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
