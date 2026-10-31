# School OS handoff

Last updated: 2026-10-30 19:00 (full self-test: journeys done, crawl next)

## State
- 2026-10-30 19:00 SELF-TEST, chat 2 stopped (chat long). DONE: roles 11/11 (0 leaks), journeys E1-E10 + B6 Parent Link
  all PASS (details, decisions 7-11, bugs 5-9 in docs/qa/2026-10-30-full-test.md). Fixed with tests, local commits:
  247b2aaf report cards printed a blank 2nd page; 1edef5e5 Parent Link "Who" listed every year's sections (0 guardians);
  f51fcf38 visitor check-out in the same minute refused. b867f867 = report + scripts. The RUNNING app on :3000 is
  the OLD build (before 7f203b97, 247b2aaf, 1edef5e5, f51fcf38): rebuild before re-checking those in the browser.
  A principal crawl was started at 18:50 (qa-output/full/crawl-principal.log); it may die with the chat, so rerun
  it. Demo data made: Kabir Sharma (Class 5 A, 89f4d170-...) paid Rs 15,000 + 1,000, marked absent 30-10; his
  father's Parent Link is in tools/app.log ("xxxxxx5414"), browser state qa-output/full/state/parent-sanjay.json;
  Diya Patel admitted (SPS/2026/0323); October salary approved; homework + PTM notice for Class 5.
- 2026-10-30 17:00 SELF-TEST continues in a new chat. Results so far + bugs + decisions:
  docs/qa/2026-10-30-full-test.md. App is served from the SSD copy C:\Users\chala\sos-build (the D: build
  always fails: Tailwind worker deadline on the HDD). Rebuild after a fix: robocopy D: -> C: (command in
  the report, decision 3) then Start-Process D:\Git\bin\bash.exe build-and-start.sh -WorkingDirectory
  C:\Users\chala\sos-build (stop the old `next start` on :3000 first; logs still go to D:\...\tools\*.log).
  Local commits this run: 12eea4d8 (build tracing), 7f203b97 (menu name + test), a3b3d5bd (ignores).
  Run scripts with `MSYS_NO_PATHCONV=1` when a path argument starts with "/". Sessions are cached in
  qa-output/full/state/<login>.json (look.mjs/peek.mjs reuse them). Demo records made: ENQ-0042 Aarav Reddy
  -> APP/2027/0019 (id 5e12364b-7b24-4a6f-af59-799825c1f6ea), fee paid, reviewed.
- 2026-10-30 14:15 SELF-TEST IN PROGRESS (Next step 0). Local PostgreSQL 16.10 now in the repo: tools/pg16
  (extracted from C:/Users/chala/tools/pg16.zip), data in tools/pgdata (fresh, superuser postgres, trust,
  localhost only), /tools/ is gitignored. db:setup + migrations + seed DONE (seed 21 min). Start DB detached:
  `powershell -c "Start-Process -WindowStyle Hidden -FilePath 'D:\all\Projects\School-OS\tools\pg16\pgsql\bin\pg_ctl.exe' -ArgumentList '-D','D:\all\Projects\School-OS\tools\pgdata','-l','D:\all\Projects\School-OS\tools\pg.log','start'"`.
  Build + serve detached: Start-Process D:\Git\bin\bash.exe tools/build-and-start.sh (logs tools/build.log,
  tools/app.log; one-time codes are in app.log). Background tasks of a Claude session die with it; use Start-Process.
  .env line 26 is a bare value, so `npm run db:setup` must be run from tools/ with DB_*_PASSWORD exported.
  Test scripts: qa/full/ (h.mjs helpers, signins.mjs, roles.mts, crawl.mjs, look.mjs). Report:
  docs/qa/2026-10-30-full-test.md (checklist written). Progress page: https://claude.ai/artifact/Af8qvniVgGnU215RNjUGHC
- 2026-10-30: the repo is now at D:\all\Projects\School-OS (moved again). tools/pg16 (local PostgreSQL)
  is NOT there and pg_ctl is not on PATH: local DB must be found or reinstalled, then
  `npm run db:setup` + seed (prisma/seed.ts) before the app or tests run. Dev server was not running.
- Demo logins (local only, all use DEMO_PASSWORD from .env): school /sign-in usernames principal, admin,
  accountant, teacher, subjectteacher, reception, transport, librarian, warden, store, viceprincipal,
  newteacher (invite link printed by the seed); console /console/sign-in mobiles 9849012345 Owner,
  9849023456 Onboarding, 9849034567 Support (code in server log). Parents: Parent Link (/p/...), no password.
- 2026-10-26: commit "a" (64f895d7) + fix 837c103a were SPLIT into 717324e7 "New date input: one
  picker for every date and time box" and c1d20cb4 "Connections move to the console"; the handoff
  commits were replayed on top (final tree identical to the old tip 30d550f2, kept as branch
  backup/before-split-a). origin still has the old 64f895d7, so the next push of this branch needs
  --force-with-lease: ask the user first. NOT pushed.
- 2026-10-26 19:30: post-move checks DONE on D: with commit "a" + fix 837c103a: typecheck 0 errors
  (needs NODE_OPTIONS=--max-old-space-size=8192, OOMs at 4 GB), lint 0 errors, npm test 2246/2246
  passed (252 files), npm run build passed. 837c103a fixed what "a" left: date-input popover lint
  (React Compiler), Settings messaging PAGE check, 3 tests updated for gateways moving to the console.
  (Since split into two named commits, see the line above.) Never run two vitest runs at once (they share the test DB and break
  each other). PostgreSQL stops when a session closes: restart with pg_ctl before tests.
- 2026-10-26 16:50: `npm run dev` WORKS on D: (http://localhost:3000 -> /sign-in, HTTP 200). D: is a spinning
  HDD (C: is the SSD), so the first compile of each page takes ~5 min, then seconds. The copied
  .next/dev cache (14.6 GB) hung the dev server forever; it was moved to .next/dev-old-broken (safe to
  delete). If dev hangs again with no "Compiling" line: stop it, move .next/dev aside, restart.
  Consider moving the repo back to the SSD (user to decide). PostgreSQL bin is tools/pg16/pgsql/bin.
- 2026-10-26: the repo MOVED to D:\Projects\School-OS (was C:\Users\chala\Desktop\School-OS);
  the outside worktree School-OS-picker moved to D:\Projects\School-OS-picker; .claude\worktrees\w*
  moved with the repo and were relinked with `git worktree repair`. Open VS Code at D:\Projects\School-OS.
  After the move: npm ci done on D: (26 min); build, tests and dev now confirmed (see above). Worktree node_modules/.next were damaged by the copy (caches):
  run npm ci inside a worktree before using it. School-OS-picker qa/e2e/teaching/21*-perms.mjs still name the old C: path.
  Commit 64f895d7 "a" (made 14:52 from VS Code, not by Claude) holds the UNFINISHED "move payment
  gateways and other connections to the console" + date-input work; finished by 837c103a, now split (see top). School-OS-picker
  still holds 43 uncommitted date-input changes.
- 2026-10-26: wording fix 37f4e39e is LIVE on main as cherry-pick 93f2b660 (user chose to push only it;
  typecheck, lint 0 errors, 67 tests passed; Vercel deploy success 07:55 UTC). Live My profile check as
  School Admin NOT done: the user skipped it (the SRINU-dts Chrome autofills srinu@gmail.com, the console
  Owner, which the school sign-in rejects; the school admin is 9652733668, one-time code). Receipt-link
  commits (103b40bd..8a9400dc) are still NOT on main; when pushing them, rebase this branch on
  origin/main (git drops 37f4e39e as already applied). gh CLI is not installed; read Vercel status with
  the GitHub API + `git credential fill` token.
- 37f4e39e - no message tells a School Admin or Principal to
  "ask the School Admin/Principal". Rule for new messages: say where it is done and who can
  ("Set it in X (the School Admin can)"), or pick the words with the reader's permissions;
  sign-in/invite words stay the same for everyone ("...or DREAM TEAM support"). SMS is set up in
  Settings, SMS, WhatsApp & Email (there is no "Settings, Communication").
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
0. IN PROGRESS (see State 19:00 and docs/qa/2026-10-30-full-test.md). Left, in order:
   (4) crawl every module: `node qa/full/crawl.mjs principal 40`, then accountant, teacher, librarian, reception,
   transport, warden, store (one at a time); F21 console pages, F22 driver page;
   (5) light/dark x 390/1440 screenshots of key screens (qa/lib.mjs VIEWPORTS, look.mjs as());
   (6) open bugs 2 (31-02 date words), 4 (consent missing from "Please fix"), 5 ("With the Principal" label),
   7 (parent listed twice in "Seen by parents"): fix with tests; then robocopy D: -> C:\Users\chala\sos-build and
   rebuild (report decision 3); re-check bugs 3, 6, 8, 9 in the browser;
   (7) lint, typecheck (NODE_OPTIONS=--max-old-space-size=8192), npm test (one run);
   (8) update report, progress page https://claude.ai/artifact/Af8qvniVgGnU215RNjUGHC, this file.
   Original brief (user, 2026-10-30): FULL SELF-TEST of everything on the LOCAL demo, by Claude alone: every login
   above, every module in docs/blueprint/06-build-order.md / BUILT_MODULES (src/lib/modules.ts), every
   page, button, form, permission (05-roles.md: each role sees only what it should, View cannot change),
   school isolation (Sunrise vs Green Valley), console, Parent Link, invite flow, light/dark, 390/1440 px.
   Write results to docs/qa/2026-10-30-full-test.md; fix confirmed bugs with tests. Never test on live.
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
      2026-10-26: sos_fee_receipt SUBMITTED via WhatsApp Manager (SRINU-dts browser), Utility, "In review".
      Meta's form refused the old words (blank at the end, even with a full stop; too many blanks for the
      length), so the ready text became "Dear {guardian_name}, {school_name} has received {paid_amount} for
      {student_name} on {payment_date}. Your receipt number is {receipt_number}. Thank you for your payment."
      (commit 4f54086f; same migration edited, it was never pushed). Check approval: WhatsApp Manager list.
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


## Moved from HANDOFF.md on 2026-10-31 (security audit day)

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
  Demo reseeded 09:40 (backup C:\Users\chala\sos-snap\school_os-2026-10-31-before-reseed.dump): today 261/271
  present, ₹36k from 30 payments; recheck-audit 11/11; app serving from the SSD copy on :3000.
- CODE AUDIT 2026-10-31 (light, one reviewer): docs/qa/2026-10-31-code-audit.md. 3 found, 3 fixed (b625e12c):
  Content-Security-Policy header (+ tests/security-headers.test.ts), nodemailer 10.3.1, re2js. Tests 2,333/2,333.
  Left: zod 3 -> 4 (own task), firebase/prisma/exceljs advisories not reachable. The full multi-agent
  `security-audit` (needs ultracode) has still never run on School OS.

1. Self-test decisions settled by Claude 2026-10-30 (user said "decide yourself"): 16 keep the owner's rule, only
   the Principal rejects an admission (approver can approve or ask for a change); 17 Visitors table fits at 1440 px
   (side panel 300 px, vehicle under the name; qa/full/visitors-fit.mjs). Push only when the user says so.
   a2. DONE 2026-10-30 (user: "complete everything"): ready WhatsApp texts reworded so none starts/ends with a
      blank, no two blanks sit with only a space between, and >= 2 words per blank + 2 (whatsappProblems in
      blanks.ts; tests/communication/whatsapp-ready.test.ts). Migration 20261030000000_whatsapp_ready_texts
      gives untouched NOT_SUBMITTED texts a new version (demo: 30 updated). Submit for approval now refuses
      such words and the template page says what to change. Not yet confirmed on Meta itself: the first real
      submission will tell whether Meta's length rule is stricter than ours. fee-paid kept its 3a words.
