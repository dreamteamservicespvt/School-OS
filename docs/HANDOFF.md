# School OS handoff

Last updated: 2026-10-30 21:00 (full self-test finished on the local demo)
Older history: docs/archive/HANDOFF-until-2026-10-30.md (moves, WhatsApp templates, receipt link, Meta webhook).

## State
- FULL SELF-TEST DONE 2026-10-30 (local demo only). Report: docs/qa/2026-10-30-full-test.md (results, 20 decisions,
  bugs 1-14 + contrast). Progress page: https://claude.ai/artifact/Af8qvniVgGnU215RNjUGHC
  - Sign-ins 38/38, roles 11/11 (0 leaks), isolation 14/14, journeys E1-E10 + Parent Link PASS.
  - Crawl of every menu module as 8 roles + 3 console people + driver: ~730 pages, 0 broken, no 5xx.
  - Light/dark x 390/1440 of all 20 modules: no sideways scroll, no broken page; contrast fixed (cd1d0c00).
  - 14 bugs found, all fixed with tests and re-checked in the browser after the rebuild (qa/full/recheck.mjs 13/13).
- Local commits on branch claude/project-thread-cesreq, NOT pushed: ed1887db, 8264ff1a, 9ea584ac, a23ccc43,
  72bb9446, cd1d0c00 (+ earlier 12eea4d8, 7f203b97, a3b3d5bd, 247b2aaf, 1edef5e5, f51fcf38, b867f867).
  The user's own uncommitted edits (.vscode/settings.json, CLAUDE.md, next.config.ts, public/push-sw.js) were left alone.
- Local setup: PostgreSQL 16 in tools/pg16 (data tools/pgdata). App is built and served from the SSD copy
  C:\Users\chala\sos-build (the D: build always fails: Tailwind worker deadline on the HDD); logs in tools/*.log,
  one-time codes in tools/app.log.
- Branch note: origin still has the old commit 64f895d7 "a"; the next push of this branch needs
  --force-with-lease (ask the user first).

## Next steps
1. User to decide (from the self-test report): bug 5 second half (only the Principal may reject an admission, so an
   application the Principal sent cannot be rejected by its approver); Front Office Visitors table needs a sideways
   scroll at 1440 px (decision 17). Then push when the user says so.
2. Not done in the self-test: online payment through Razorpay (no keys locally); timed tests (parent pays on a
   slow phone < 60 s; teacher marks 40 students < 60 s).
3. DECIDED by the user 2026-10-23, build one at a time (brainstorm -> plan -> build); details in the archive file:
   a2. FOUND 2026-10-26, waits on the user's OK: most of the 31 ready WhatsApp texts (templates.ts
      READY_TEMPLATES) end with "- {school_name}" and Meta's form refuses them ("Variables can't be at the
      start or end"); several short ones also get "too many variables for its length" (Arrived late, Bus x3,
      General announcement, Message to staff, Admission welcome, New notice, Telugu Absent/Fee reminder).
      blanks.ts whatsappParts' "add a full stop" fix does NOT satisfy Meta. Fix = reword so no text starts or
      ends with a blank and has enough words; migration for untouched NOT_SUBMITTED versions, like 3a.
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
