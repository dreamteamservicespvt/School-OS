# School OS handoff

Last updated: 2026-11-05 night (live-test fixes 7, 12, 14-16, 18, 19 + invite Test-mode words, commit after b25fcdba; 16-note leftovers done; owner's 16-note test PDF fixed; local commits 3c1ed69f..99dc4500 + security follow-up 812f292c; NOT pushed or deployed)
Older history: docs/archive/HANDOFF-until-2026-11-04.md (security fixes, audits, live role-play test) and docs/archive/HANDOFF-until-2026-10-30.md.

## State
- Branch claude/project-thread-cesreq, local commits only. origin still has old 64f895d7: the next push needs --force-with-lease (ask first).
- 2026-11-05 owner test notes 1-16: all fixed, see docs/qa/testing-issues.md "Owner's test PDF, 2026-11-05".
  Commits: 3c1ed69f PDFs on Vercel (@sparticuz/chromium 141, src/lib/pdf.ts withPdfErrors, 38 routes maxDuration 60);
  dc5e2596 sign-in/codes (no lock countdown, shared phone picks login by password, code-now.ts truthful "sent",
  ready template "admission-consent-code"); 51761836 console WhatsApp per school (provider "dream-team", migration
  20261105000000_console_school_whatsapp, usage card) + notices reach every staff login + bell-watch 30 s + sound;
  99dc4500 forms (formatClock 12-hour, form-draft, form-problems, one class-teacher section, step 3, floating menus,
  12-digit UPI, ShareMenu, shorter help).
- Checks: full suite 285/285 files, 2572/2572 tests (35 min); after the template change 35/35 files 333/333; typecheck
  clean; lint 0 errors on 187 files; SSD build passed; browser self-test qa/full/p16-selftest.mjs 7/7 on local :3000.
- Owner decisions 2026-11-05: locked login may use Forgot password = OK; admission code template = yes, never touch the
  gym's account; Vercel env already set (code falls back from CONSOLE_WHATSAPP_* to WHATSAPP_*); Meta webhook and
  shared-number setup left as is; holidays always to staff bells and sound on by default = OK.
- 812f292c security review follow-up: locked logins never tried via a shared phone; PDF/HTML fallback pages have a strict CSP (only the Print script hash may run).
- Progress page: https://claude.ai/artifact/8C7rnrMh7eYxdeLmk4RPbF (docs/qa/pdf-fixes-progress.html).

## Next steps
1. Owner: push + deploy when ready (ask; --force-with-lease). After deploy re-test on school-os-beta: ID card, receipt
   Print/PDF (Vercel function log "PDF: the browser could not start" if not), console Schools "Signed in".
2. After deploy, each school: Settings > Templates > "Admission consent code" > Send for approval (Meta).
3. DONE 2026-11-05 (leftovers of the 16): invites say "sent" only once the provider took it
   (confirmInviteSent in src/lib/settings/invite-message.ts, used by all 5 invite actions); console lock shows no
   minutes (CONSOLE_LOCKED); drafts on Datesheet (useStateDraft) and Add Staff (useFormDraft + step-3 picks); 30 hi/te
   entries for Add Staff step 3 and the new form messages (+2 patterns in src/lib/i18n/messages.ts); 8 longest help
   lines trimmed. Still English only: the invite "sent/on its way" sentence (it carries channel names). Progress
   page https://claude.ai/artifact/8NX6aS3fL5CCdWQ4VwrsTE. Not browser-tested yet: re-run qa/full/p16-selftest.mjs
   after the next local build.
3b. DONE 2026-11-05 night: SSD rebuilt; p16-selftest 8/8; browser check qa/full/leftovers-check.mjs: Add Staff and
   Datesheet drafts PASS; invite said "sent by WhatsApp" in Test mode -> FIXED (confirmInviteSent treats sandbox rows
   as "Not sent: WhatsApp is in Test mode"); needs a rebuild + re-run of leftovers-check.mjs (its check should look
   for "was sent to"). Progress page https://claude.ai/artifact/4enuz9nYz2ruJ37pDr1VqL.
4. Older open items from the 2026-11-04 live test. DONE 2026-11-05 night (see Status lines in testing-issues.md):
   7, 12, 14, 15, 16, 19; 18 partly. STILL OPEN: 8, 9, 10, 11, 13, 17, 18 (ask section with role), 20-22, 24-28,
   32, 34, 35; 33 waits for the owner (refund = adjustment today). Next do 26 (Medium) and 8 (Medium), then the Lows.
   Older open items from the 2026-11-04 live test (testing-issues.md 7-28, 32-35), e.g. 33 refund lowers fee total (High,
   owner decision), 15/16 new students "overdue" (High), 12 dashboard fee numbers.

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
- Before a rebuild, check :3000 with `netstat -ano | grep LISTENING | grep :3000` (Get-NetTCPConnection missed an old
  server on 2026-11-05, so the new build could not start). To start the server alone (no build): run
  `D:\Gitinash.exe` with a script that does `cd /c/Users/chala/sos-build && npx next start -p 3000 > tools/app.log`.
