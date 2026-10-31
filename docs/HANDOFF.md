# School OS handoff

Last updated: 2026-10-31 15:10 (security fixes 6 of 13 committed; nothing pushed)
Older history: docs/archive/HANDOFF-until-2026-10-30.md (moves, WhatsApp templates, receipt link, Meta webhook).

## State
- SECURITY FIXES 2026-10-31 (Next step S), test-first, one local commit each. DONE (6):
  24d258d3 Settings 'Own' reach only reads (run-2 medium; page-access.ts, settings/undo.ts, profile colour).
  e6cf0439 approval limits only Principal/School Admin (run-2 medium; requireLimitsOwner in fees/settings-save.ts:
  Payments + Counter cards, fee-verification switch, Finance bills limits; screens read-only; hi/te words).
  5e130a15 console invoice paid once (run-1; applyPayment claims UNPAID row; race test proved the bug).
  76cbe0de Checkout posts only captured payments (run-1; isCaptured in payments/razorpay.ts, fees + admission).
  71713af9 WhatsApp webhook bound to the school's phone_number_id (run-1; sandbox unchanged).
  846b8802 support look-only also checked in the app (run-1; proxy stamps support requests, src/lib/support-stamp.ts,
  getCurrent refuses support without the stamp). Not yet run: full `npm test` and `npm run build` (do after fix 13).
  Live progress page: https://claude.ai/artifact/Pg7TgQ9NG3uW3GFFNM5E8K (source docs/qa/security-fixes-progress.html).
- SECURITY AUDIT run-1 (quick): docs/qa/2026-10-31-security-audit.md, ~/security-audit-skill/School-OS/run-1.
  All 4 leads now fixed (above).
- SECURITY AUDIT run-2 (standard, scoped to run-1's 9 deferred units, 15 agents, source-only):
  docs/qa/2026-10-31-security-audit-run-2.md; run ~/security-audit-skill/School-OS/run-2 (findings.json,
  coverage-ledger.json, NEEDS-VALIDATION.md, FINDINGS-DETAIL.md; tools/run2*.cjs rebuild prompts/reports;
  validators need `node -r tools/win-nofollow-shim.cjs`). 16 records, all passed Phase 3 + Phase 5:
  9 CONFIRMED (2 mediums FIXED above, 7 lows open): medium x2 = Settings 'Own' reach acts as full Settings change, can make itself
  School Admin (src/lib/settings/page-access.ts); Accountant can edit the approval limits that restrain it
  (fee/finance settings actions). Low x7 = One-campus limit ignored (events, certificate detail page, Parent
  Link preview, government return files, document-design preview + privacy person export, student import
  undo) and competency levels not bound to the section roster. 7 NEEDS VALIDATION (Staff & HR login grant of
  any role, concession revoke race, salary advance cash double post, fee adjustment bypasses concession limit,
  legacy import-errors route, layout-only page gates, data-security campus scope).
  Coverage still partial: critic deferred 8 in-scope gaps (about 27 action files, 47 of 82 id pages, print
  routes, fee counter collect, import undo for all kinds, events activity paths, optional-module actions)
  and 3 out-of-scope gaps (document-design actions, non-id layout pages, forms-approvals etc. actions).
- Local commits on branch claude/project-thread-cesreq, NOT pushed (audit commits 2150019b..HEAD).
  The user's own uncommitted edits (.vscode/settings.json, CLAUDE.md, next.config.ts, public/push-sw.js) left alone.
- Tests: one vitest run at a time; a file takes 3-7 min here; long runs go to the background.
- Local setup: PostgreSQL 16 in tools/pg16 (data tools/pgdata; superuser `postgres` trust on localhost).
  App built and served from the SSD copy C:\Users\chala\sos-build (D: builds fail); logs tools/*.log.
- Branch note: origin still has the old commit 64f895d7 "a"; the next push needs --force-with-lease (ask first).

## Next steps
S. SECURITY: (1) DONE. (2) mediums DONE; 7 lows left, one commit each, test-first, smallest fix per
   docs/qa/2026-10-31-security-audit-run-2.md section 4. Reuse src/lib/campus.ts (campusAllows, assertCampus,
   inCampus, OtherCampusError). Order: competency levels roster (report-cards.ts saveCompetencyLevels), certificate
   detail page, Parent Link preview, government files (pastExports + file route), document preview + person export,
   student import undo, then Events (biggest: carry current.campusId into EvWork, events.ts/calendar.ts lookups).
   Then run full `npm test` once and `npm run build` on the SSD copy. (3) Owner/local checks for run-2's 7 leads
   (run-2/NEEDS-VALIDATION.md). (4) Later: run-3 over run-2's deferred ledger units (treat run-2 as prior).
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
      Brainstorm findings 2026-10-26 + open GPG-key question: docs/archive/HANDOFF-until-2026-10-30.md ("Backups brainstorm").
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
