# School OS handoff

Last updated: 2026-11-01 02:35 (suite 2416/2417 + hang fix 2aeabc78, SSD build passed; L1, L5 roles, L7 built; suite 2434/2434 + build passed; run-3 done, batches A-C fixed, batch D running; nothing pushed)
Older history: docs/archive/HANDOFF-until-2026-10-30.md (moves, WhatsApp templates, receipt link, Meta webhook).

## State
- SECURITY FIXES 2026-10-31 DONE: 13 of 13, test-first, one local commit each (24d258d3..65c9591e).
  Run-1 leads: 5e130a15 console invoice paid once; 76cbe0de Checkout posts only captured payments;
  71713af9 WhatsApp webhook bound to the school's number; 846b8802 support look-only checked in the app.
  Run-2 mediums: 24d258d3 Settings 'Own' reach only reads; e6cf0439 approval limits only Principal/School Admin.
  Run-2 lows (regressions in tests/campus-limits.test.ts): 166d7b3f competency levels only on the section roster;
  d7ebabeb certificate page; a2a65301 Parent Link preview; c83c0d83 government files; 8777bb36 document preview,
  person export, privacy search, deletion requests; 9ed49a23 import undo (ImportKind.campusOf; students + staff);
  65c9591e Events (src/lib/events/campus.ts: campus-limited people change only their campus's records, see
  every-campus + own; applies only in schools with 2+ campuses; actions, undo kinds, pages, new records).
  Checks: full `npm test` 2375/2376 (approval-missing-record.test.ts timed out at 20 s under load; passes alone,
  7/7); typecheck clean; lint clean on changed files; `npm run build` on the SSD copy passed.
  Live progress page: https://claude.ai/artifact/Pg7TgQ9NG3uW3GFFNM5E8K (source docs/qa/security-fixes-progress.html).
- SECURITY FOLLOW-UPS 2026-10-31 (Next step S 2), test-first, one commit each: 390f0848 Events activities keep to
  One-campus (houses, clubs, teams, fixtures = whole-school staff only; achievements, credits, fitness, members,
  diary = own campus; club/team attendance only when every member is theirs); 2eb2bf76 campusOf on 13 more import
  kinds (school-wide kinds without a campus: departments, expenses, hostel rooms, store items/assets, library
  books; a test lists them); b278abdd the campus refusal words in en/hi/te; b40e89b8 Co-curricular, Daily
  Activities and PTM use the campus's year (yearOf takes a campus: a student's own campus, a class's campus,
  every campus's open year for houses-in-turn/club-team attendance/fixtures, the giver's campus for house points;
  a PTM takes classes of one campus). tests/events-calendar/campus-year.test.ts: 6 of 7 fail on old code.
  Checks: campus-limits 34/34, activities + campus-year + campus + ptm-parent + i18n 52/52, typecheck + lint
  clean, build on the SSD copy passed (19:35). Full suite: the first run was cut off at 19:50 (chat closed;
  PostgreSQL stopped too, start it: tools/pg16/pgsql/bin/pg_ctl.exe -D tools/pgdata -l tools/pg.log start).
  Its 2 failures were 20 s time limits on this slow drive (route-links; first certificate-page open in
  campus-limits), now 120 s like the other slow tests.
  Full re-run 21:55 (tools/full-test.log): 268 of 268 files, 2394 of 2394 tests passed, 24 min. Next step S 2 is done.
  Progress page: https://claude.ai/artifact/WLFSJBnAUfaFK714chXmXP (docs/qa/security-followups-progress.html).
- SECURITY AUDITS: run-1 docs/qa/2026-10-31-security-audit.md; run-2 docs/qa/2026-10-31-security-audit-run-2.md
  (run dir ~/security-audit-skill/School-OS/run-2: findings.json, coverage-ledger.json, NEEDS-VALIDATION.md;
  validators need `node -r tools/win-nofollow-shim.cjs`). Run-2 also left 7 NEEDS VALIDATION leads and deferred
  coverage (about 27 action files, 47 of 82 id pages, print routes, fee counter collect, import undo for other
  kinds, events activity paths, optional-module actions, document-design actions, layout pages).
- Local commits on branch claude/project-thread-cesreq, NOT pushed (audit commits 2150019b..HEAD).
  The user's own uncommitted edits (.vscode/settings.json, CLAUDE.md, next.config.ts, public/push-sw.js) left alone.
- Tests: one vitest run at a time ON THE WHOLE LAPTOP (every run drops and rebuilds school_os_test; check for
  another node vitest process first, e.g. another chat); a file takes 3-7 min here; full suite ~42 min; long runs go to the background.
- Local setup: PostgreSQL 16 in tools/pg16 (data tools/pgdata; superuser `postgres` trust on localhost).
  App built and served from the SSD copy C:\Users\chala\sos-build (D: builds fail); logs tools/*.log.
- Branch note: origin still has the old commit 64f895d7 "a"; the next push needs --force-with-lease (ask first).

## Next steps
S. SECURITY follow-ups: (1) run-2's 7 NEEDS VALIDATION leads (~/security-audit-skill/School-OS/run-2/NEEDS-VALIDATION.md).
   DONE: L6 66e588c9, L3 d6631937 (tests/run2-leads.test.ts), L2 26da6612, L4 b6d2ef2a (pay-out was doubled too),
   L5 alert part 872cfc13. Full suite after them (01:03-02:07, tools/full-test.log): 269 of 270 files,
   2416 of 2417; the 1 was a hang, not a wrong result ("Mark refunded" twice in tests/fees/counter-race:
   decide() loads approval-handlers on first use inside its 15 s transaction), fixed 2aeabc78 by importing
   it first like other tests (6 of 6). SSD build after them passed (02:33); app on :3000 again.
   OWNER DECISIONS: the user said overnight "don't ask, complete everything", so Claude builds the SAFEST
   choice, own commits, for the owner to confirm or revert: L1 reduce-adjustment above the concession
   limit -> Principal approval; L5 HR without Settings rights cannot give School Admin/Principal roles,
   Settings exceptions, or sign-in links for those logins; L7 "Export all school data" whole-school only.
   BUILT: L1 89f8a363 (migration 20261101000000_fee_adjustment_approval; Adjust "remove" still immediate,
   owner to decide), L5 7323433f (src/lib/staff/login-ceiling.ts), L7 a140a880 (+ privacy "Requests to remove
   data" list kept to campus). 5 new hi/te sentences to check. After them: full suite 03:19-03:40
   272 of 272 files, 2434 of 2434 tests; SSD build passed 03:50 (the SSD copy's own Prisma client was stale
   after the new migration; build-and-start.sh now runs prisma generate first). Local demo DB migrated
   (backup C:\Users\chala\sos-snap\school_os-2026-11-01-before-l1-migration.dump).
   (3) AUDIT RUN-3 DONE 04:30 (quick, scoped, 15 agents; ~/security-audit-skill/School-OS/run-3; owner
   summary docs/qa/2026-11-01-security-audit-run-3.md): 8 confirmed (1 medium, 7 low), 5 questions.
   Batch A fixed 838fc27e..af55ae2e (tests/run3-findings.test.ts, login-ceiling, campus-limits, homework/roles).
   Batch B 30b1fe70..3a17a70b (Events actions/pages, Hostel/Library/Transport actions, past-receipts import
   undo twice at once = REAL double, now locked, guardian merge of shared parents). Batch C 817948a2,
   9e9e0be5, 566e68b7 (Hostel incidents/outings/visitors, Transport lists/pickers/roll call, event fee
   totals). Batch D (Hostel roll call/rooms/reports/widgets, Transport widget + route message to own
   campus only (safest choice), Events register year, Transport picker year) in progress; tests in
   tests/run3-campus.test.ts. DESIGN NOTE for the owner: every batch found more One-campus gaps because the
   campus is filtered by hand in each query; propose one shared campus-scoped read layer (or campus RLS)
   instead of more patches. Owner questions left: Adjust "remove" a whole fee row; bulk discount rule
   up to 50% with no approval; which campus an import batch belongs to; confirm the overnight L1/L5/L7 choices.
   (2) DONE, and its Events pages leftover too: commit 06632769 (evYears in src/lib/events/campus.ts;
   Co-curricular, Daily, Settings work in each campus's year; achievements, fitness, export and certificate
   print keep to a One-campus person's campus; tests/events-calendar/campus-pages.test.ts 5 of 5 red before).
   Full suite after it (22:51, tools/full-test.log): 269 of 269 files, 2399 of 2399 tests passed. SSD build after it passed (23:30); app served again on :3000. Leftover DONE.
   Hindi/Telugu words were written by Claude: have a native speaker check them (25 now).
   (3) Run-3 over run-2's deferred
   ledger units (treat run-2 as prior). (4) Push only when the user asks (needs --force-with-lease).
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
