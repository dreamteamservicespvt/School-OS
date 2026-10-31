# School OS handoff

Last updated: 2026-10-31 09:05 (morning clean-up round; nothing pushed)
Older history: docs/archive/HANDOFF-until-2026-10-30.md (moves, WhatsApp templates, receipt link, Meta webhook).

## State
- FINAL DELIVERY AUDIT 2026-10-31 (local demo only): docs/qa/2026-10-31-delivery-audit.md. Gate YELLOW
  (ready with known limitations): 16 bugs found and fixed; tests 2,324/2,326 (2 slow-disk timeouts pass alone). Round 1: docs/qa/2026-10-30-full-test.md (14 bugs fixed).
  - Money: 6 "sent twice at once" races fixed with row locks (counter advance, cancel, refund request,
    mark refunded, application fee, library fine) + tests; totals agree in ledger, receipts, Day Book,
    dashboards, Ask and Parent Link (SQL + screens).
  - Security: actions replayed as other roles all refused; automation log download was open to every role
    (fixed); "/\host" redirect fixed. Layout: 6 sideways-scroll bugs at 320/1024 px fixed.
  - Demo data: round 1's "Self-test:" homework/notice cleaned (scripts/demo-cleanup.sql); DB restored from
    C:\Users\chala\sos-snap\school_os-2026-10-30-clean.dump after the probes.
- MORNING CLEAN-UP 2026-10-31: lint 0 errors 0 warnings (f0d38b44). Record income / Record expense (no
  vendor) pressed twice, at once or within 15 min, now ask first (advisory lock + check; expense needs a
  reason, income "Save it again"; other modules' own entries not asked; tests/finance/typed-twice.test.ts)
  (945e53b4). Slow-disk test limits raised. Owner's 4 uncommitted files reviewed: whitespace only.
  Demo reseed scripted for 09:32 (backup C:\Users\chala\sos-snap\school_os-2026-10-31-before-reseed.dump).
- Local commits on branch claude/project-thread-cesreq, NOT pushed (audit commits 2150019b..HEAD).
  The user's own uncommitted edits (.vscode/settings.json, CLAUDE.md, next.config.ts, public/push-sw.js) left alone.
- Local setup: PostgreSQL 16 in tools/pg16 (data tools/pgdata; superuser `postgres` trust on localhost).
  App built and served from the SSD copy C:\Users\chala\sos-build (D: builds fail); logs tools/*.log.
- Branch note: origin still has the old commit 64f895d7 "a"; the next push needs --force-with-lease (ask first).

## Next steps
0. DEMO DAY: to refresh "today" on another day, reseed after ~9:30 AM IST (earlier puts today's attendance in
   the future). Script used on 31-10 (backup, drop/recreate schema, migrate, seed, copy to SSD, build):
   docs/qa/reseed-demo.sh, then start with tools/start-only.sh. Before the live school: set FILE_LINK_SECRET.
1. Self-test decisions settled by Claude 2026-10-30 (user said "decide yourself"): 16 keep the owner's rule, only
   the Principal rejects an admission (approver can approve or ask for a change); 17 Visitors table fits at 1440 px
   (side panel 300 px, vehicle under the name; qa/full/visitors-fit.mjs). Push only when the user says so.
2. Not done in the self-test: online payment through Razorpay (no keys locally); timed tests (parent pays on a
   slow phone < 60 s; teacher marks 40 students < 60 s).
3. DECIDED by the user 2026-10-23, build one at a time (brainstorm -> plan -> build); details in the archive file:
   a2. DONE 2026-10-30 (user: "complete everything"): ready WhatsApp texts reworded so none starts/ends with a
      blank, no two blanks sit with only a space between, and >= 2 words per blank + 2 (whatsappProblems in
      blanks.ts; tests/communication/whatsapp-ready.test.ts). Migration 20261030000000_whatsapp_ready_texts
      gives untouched NOT_SUBMITTED texts a new version (demo: 30 updated). Submit for approval now refuses
      such words and the template page says what to change. Not yet confirmed on Meta itself: the first real
      submission will tell whether Meta's length rule is stricter than ours. fee-paid kept its 3a words.
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
