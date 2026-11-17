# School OS handoff

Last updated: 2026-11-17 21:25 IST. OWNER GAVE FULL AUTONOMY; never ask, finish in this chat (owner extended the push to 22:30). DEPLOY 26 = main c4026ca8, pushed 21:17 (fast-forward 85ef19ad..c4026ca8); check `vercel ls school-os --scope dream-team-services-projects` shows it Ready and live /sign-in is 200. Deploy 26 = 4934d1d0 assistant wording (no stray ': .', today's date reads 'today') + bff1ea41 AI live fix (fallback model gets its own time, a busy model rests, 'explain ... in Telugu' answers in Telugu, safe '[ai]' logs) + 9bc2149d robot button lifts above every bottom bar (`data-action-bar`, `useLauncherLift`, guard test) + c4026ca8 Next.js 16.4.2 -> 16.4.6 (security patch). Verified on the SSD copy C:/Users/chala/sos-build2: full suite 383 files / 3,655 tests = 3,654 pass + 1 skipped (paid live eval) in 4 shards, 0 failures and 0 load timeouts; build OK; tsc 0; lint 0 errors (78 warnings). Robot vs Save bar: no overlap at 280/390/1440 light+dark (qa-output/final/robot). Local :3000 now serves this build from sos-build2. Findings of the final push: docs/qa/2026-11-17-final-audit.md (security: nothing Critical/High/Medium; live tester D: 30+ rows). NOT LIVE YET (side branches, not merged): fix/final-pending (worktree D:/all/Projects/sos-robot: money items, RecordTitle, slow class-name test, old QA items), fix/final-crawl (worktree D:/all/Projects/sos-aifix: fixes for local crawl findings), sec/final-2026-11-17 (docs only). OWNER: turn on billing for the Gemini key (live 429 free-tier quota + 503); brain PR needs the owner's GitHub login. Progress page https://claude.ai/artifact/YJSTyNarrnjwtfW9R1zbJW.

## State

- Before deploy 26 (17 Nov 17:25): OWNER GAVE FULL AUTONOMY; owner: never ask questions, finish in this chat. DEPLOY 25 LIVE 17:23 = main 85ef19ad (Vercel "Deployment has completed"; live /sign-in 200; signed-out POST /api/v1/assistant/speak 401 JSON): 25a6176e Take Attendance absent note in a solid Save bar + 85ef19ad Gemini thinking ladder/fallback + safe "[ai]" log lines (see State). Before that: main = 6b109669 = DEPLOY 24 LIVE 15:21 (Vercel "Deployment has completed"; live /sign-in 200; POST /api/v1/assistant/speak signed out = 401 JSON, was a 200 HTML page before). Deploy 24 = 49534480 Message History "How did this message do" summary (rings + one bar per channel), 6d9c84f6 Gemini as the AI service + Assistant voice route POST /api/v1/assistant/speak (no GEMINI_API_KEY = nothing changes, 204 = browser voice), 0a1b5843 speak says the stored reply only (security), 6b109669 test-runner fix. Suite 17 Nov: 381 files / 3,618 tests, 3,617 pass + 1 skipped (paid live eval) in 4 shards; 6 load timeouts (approval-unfinished, academic/years, job-times, console/delete-school) pass alone (4 files, 31 tests). tsc 0, lint 0 errors (78 warnings), SSD build passes (1117 s), local :3000 runs the new build. Shots qa-output/loop/msgsummary-{1,2}-{390,1440}-{light,dark}.png and assistant-{390,1440}-{light,dark}.png (panel opens, browser voice speaks, no errors). Local demo school Sunrise: School Feature "ai-school-assistant" switched ON (Settings > Modules, as admin) for the panel check. 17 Nov 12:59 and 13:52 PostgreSQL crashed (Windows commit limit 0xC000012D: another job's Whisper used 7-11 GB) and the laptop rebooted 14:01: start PG by hand after a reboot (command below). Progress page https://claude.ai/artifact/VZUCdToXTvu23SuEFoq5JD. OPEN (outside Claude's reach): staff 'Change post' x3 on live (School Admin Chrome 694c21cd loads no pages); brain share needs the owner's GitHub login (gh = gouthambbr-bot); AI key in Vercel (owner: GEMINI_API_KEY or ANTHROPIC_API_KEY).

- 2026-11-17 17:17: DEPLOY 25 (main 85ef19ad). (1) 25a6176e Take Attendance, phone: "Saving tells the parents of the N absent students..." sat in the Save bar's see-through top (bg-gradient from-bg via-bg to-bg/0) and was drawn over the next student's name. Bar is now solid bg-bg with a separate 16 px fade strip above; the note is its own bordered bg-surface row (data-testid save-bar / absent-note); guard tests/attendance/save-bar-note.test.ts. Shots qa-output/loop/attfix-{280,360,390,1440}-{light,dark}-a{0,1,2}.png (+ -a2-end), before: attfix-before-390-light-a2.png; 24/24 geometry checks ok. Taken as School Admin on Class 5 A (?section=47cfe8fa-...): after the 11:00 lock only Principal/School Admin can change a day; nothing saved. (2) 85ef19ad live assistant TEXT AI failed for every Gemini question (speech fine): each model now tries thinkingBudget 0 -> thinkingLevel "low" -> no thinkingConfig (only on a 400 about thinking/budget/level); fallback model for any non-key 400/404/429/5xx; console.warn "[ai] gemini failed / fallback failed / refused thinking setting N / answer not used (stage) / task failed / provider threw / schema conversion failed" with model, HTTP status, code, Google's message, zod issue PATHS only, never content or key (tested in tests/ai/gemini.test.ts). tests/ai + tests/assistant after the push: 15 files pass (219 tests, 4 skipped); switches-everywhere failed only in setup under load (Prisma transaction closed) and passes alone on worker 3 (3 tests). Owner added GEMINI_API_KEY on Vercel. Suite for 25a6176e: 4 shards 3,615 of 3,619 pass + 1 skipped; 4 load timeouts (no-lookbehind, job-times, fee-paid-senders pass alone; class-name NEW-01 times out even alone at 33 s on this busy laptop, its scan run directly: 2,113 files, 0 found). tsc 0, lint 0 on changed files, SSD build passes (needed one retry: Next 16.4.2 stops once with a "SecurityFatalError" upgrade notice; owner to decide on the Next.js upgrade). Assistant launcher (fixed right-4 bottom-24, z-40) still covers the right end of the Save button label on phones: not fixed.
- 2026-11-17 15:21: DEPLOY 24 (main 6b109669). Full suite had failed EVERY file since the morning: it was started from Git Bash, whose working folder is d:\ (lowercase), so Vitest loaded its runner twice ("reading 'config'", "failed to find the current suite/runner"). Fix: qa/vitest-worker.mjs starts vitest from D:\...; tests/global-setup.ts stops at once on a lowercase drive. Not size, not load, not vitest 5 settings.
- 2026-11-16 18:50: ASSISTANT LANGUAGE TEST DONE. Deploy 19 (a1bb534d) + deploy 20 (main 26bb0e5f) live: everyday Telugu (Telugu + English words) that mirrors the person (src/lib/assistant/te-mix.ts, language.ts teluguStyle), English words in Telugu letters understood (ask/questions.ts TE_LOANS), greetings/homework/calendar/approvals/enquiry without AI (assistant/rules.ts), happy feeling + voice tone + spoken dates (speech.ts), robot-face button. 20 of 20 findings fixed and re-checked live in 6 role Chromes: docs/qa/assistant-language-test.md. AI service still not connected on live (owner adds ANTHROPIC_API_KEY in Vercel). Branch has merge commits 62e6f4ea/cea5a7dd tying main in (the other session's b7c33564..a15b0092 Parent Link work is NOT on main yet).

- 2026-11-14: Take Attendance shows a correction's state (waiting/approved/not approved) and names parents already told the old mark, with a Send a correction message link (d392d26b). Subject teachers read the register only: no Take tab in once-a-day schools, no editing, no daily corrections; one rule `mayChangeSection`/`takesAttendance` in src/lib/attendance/access.ts (5fea18f2). Tests pass; not pushed or deployed; no screenshots yet.
- ROUND 2 DONE (13-11-2026, 02:00 IST): all 69 layman problems (docs/qa/2026-11-12-layman-A..E.md) fixed. Commits
  d15f298c..1f8ccb61 on this branch. Full suite 315 files / 2,744 tests pass; tsc 0; eslint 0 errors (1 old warning
  tests/platform/pdf.test.ts). Browser recheck on the production build: 14 of 14 (qa/layman/r2-recheck.mjs + r2-recheck2.mjs):
  LD1, LD3, LB1, LB6, LE4, LA4, LC23, LD10, LD7, LA11/LD6, LA10/LD9 (all pages under 3 s), LE2, LD13, LA8.
- DEPLOY 3: main pushed to 1f8ccb61 (from 989111c5). Includes migration 20261112100000_appraisal_points_by_staff_type
  (runs in the Vercel build). Vercel: "Deployment has completed"; live /sign-in 200 (13-11-2026 02:15 IST).
- Owner decision applied (LA11/LD6): School Admin gets Full on every module, as docs/blueprint/05-roles.md says (no more
  "View only" or desk narrowing for School Admin: Collect Fee, day close, library desk, front office, hostel, transport,
  homework). The Principal keeps the oversight view and Remind. Role tests updated to the blueprint.
- Notable: Academic Settings opened in 9-30 s (53 sequential year-usage queries per open year): now one UNION query.
  Busy database shows "School OS is busy right now" (pool 20 on one server / 5 per Vercel copy, 20 s wait).
  Shared kit labels go through tx() (Telugu/Hindi); +156 library/store words. Excel cells are real numbers; empty = blank.
- Live receipt PDF NOT checked: Chrome "Dream Team Services" (694c21cd) is signed out of beta; Claude does not type passwords.
- 13-11 morning (0811c4f5): team test brief docs/qa/2026-11-12-team-brief.md written. Leftovers fixed: staff leave form names
  every mistake at once (LeaveProblem.errors / leaveProblems()); staff age (src/lib/staff/age.ts) refuses only under 14 or
  over 100 and warns under 18 / over 80 while typing (StaffDobField); record name in the browser tab on 13 record pages
  (src/components/ui/record-title.tsx, drawn after the page's access checks). tsc 0, eslint 0, 84 affected tests pass.
- Progress page: https://claude.ai/artifact/7WSVY4hW97JfXoJkfRvNUV (docs/qa/team-ready-progress.html).

- Team Test Desk (13-11): https://claude.ai/artifact/V9TZmB75Pu1NfBLLLzZbsX (docs/qa/team-test-desk.html). Reports land in its
  db collection "reports", doubts asked in "doubts": read them with ArtifactData list to fix problems.

## Next steps
00. 2026-11-14 17:20 NOT DEPLOYED (main push was blocked by the permission check; needs the owner's OK):
   cb01d10c Employment edit saves in one-campus schools (live said "Required") + default posts for every role;
   4dd5f0a0 Structures list shows a later saved version under today's gross. After deploy, on live (Browser 4 =
   Saiveni, School Admin): Staff List > Change post: Saiveni -> School Administrator, anjali -> Principal,
   harikaa -> Receptionist (posts + 4 staff leave types already added on live 14 Nov). KUSUMA: Rs 35,000 from
   1 Dec (v3) already saved; November is approved at Rs 52,500 (overpaid Rs 17,500: owner/Accountant decide).
0. 2026-11-14 DEPLOY 5 live (main acbbab5c, Vercel ~5 min, full suite 2,759 pass in 4 workers): 196afc97 "Me > My leave / My salary slips" menu for
   own-record staff; 453b5544 DA/HRA switch per structure, removed salary item leaves structures from first open
   month, Add Staff no default post + Staff List "posts may be wrong" box. After deploy: HR fixes posts with
   "Change post"; Accountant revises the teacher's structure (DA/HRA off; old removed items drop on revise).
1. Live receipt PDF check on beta once the user has signed in (Principal) in Chrome 694c21cd.
2. Team brief is ready (docs/qa/2026-11-12-team-brief.md); the owner shares it with the testers.
3. Record name in the tab is on 13 record pages; other record pages (enquiry, route, quiz, survey...) can take
   `<RecordTitle name={...} />` the same way.

## How to run things locally
- DB: `powershell -c "Start-Process -WindowStyle Hidden -FilePath 'D:\all\Projects\School-OS\tools\pg16\pgsql\bin\pg_ctl.exe' -ArgumentList '-D','D:\all\Projects\School-OS\tools\pgdata','-l','D:\all\Projects\School-OS\tools\pg.log','start'"`; wait for pg_isready.
- Parallel tests: `node qa/vitest-worker.mjs <2-9> <files>` uses school_os_w<N>_test (made with psql -U postgres). The
  script starts vitest with a capital drive letter, so it works from Git Bash too (see Gotchas).
- Rebuild: stop `next start -p 3000` (find via Win32_Process CommandLine); `robocopy D:\all\Projects\School-OS C:\Users\chala\sos-build /MIR /XD .git node_modules .next tools storage qa-output .claude /XF build-and-start.sh`; `Start-Process -WindowStyle Hidden D:\Git\bin\bash.exe build-and-start.sh -WorkingDirectory C:\Users\chala\sos-build`. It runs prisma generate but NOT migrations: run `npx prisma migrate deploy` in D: first.
- Vercel build log without the CLI: Chrome "Dream Team Services" is logged in to Vercel; in a vercel.com tab run
  `fetch("/api/v3/deployments/<dpl_id>/events?builds=1&limit=-1")`.
- Demo logins local only (DEMO_PASSWORD in .env); browser scripts qa/full/*.mjs; playwright-core in C:/Users/chala/tools/school-os-probe.

## Gotchas
- Vitest on Windows needs a capital drive letter in the working folder. Git Bash gives `d:\...` (lowercase): Vitest
  then loads its runner twice and EVERY file fails ("reading 'config'", "failed to find the current suite/runner").
  qa/vitest-worker.mjs fixes the case itself (17 Nov); tests/global-setup.ts stops at once with a clear message on `d:`.
  So from Git Bash always use the worker script (plain `npx vitest` there stops in global setup).
- tools/pgdata/postgresql.conf max_locks_per_transaction = 256 (64 ran out when 3 test DBs reset at once).
- Memory: never run more than ONE full `tsc` (8 GB) plus vitest at once. 2026-11-12 23:16 five helpers did, Windows ran out of
  commit memory (0xC000012D) and PostgreSQL crashed into a 5+ min recovery (fsync of the data directory).
- Meta rejects Utility templates mentioning password/login; word them as account status.
- Never touch the Meta webhook or the gym's Vercel without permission. Never type secrets into web forms.
- .env line 26 has an unquoted space, so `bash scripts/setup-db.sh` cannot source it; run its psql steps by hand.
- Two sign-in scripts per role per 15 min at most (two-step code limit).
- Restarting :3000: a stop by CommandLine match can miss the old server. Check `Get-Process node` StartTime and that
  tools/app.log says "Ready", not EADDRINUSE (2026-11-12: a recheck ran against the old 16:42 server). Start with
  C:/Users/chala/sos-build/start-only.sh via Start-Process (bash -c through -ArgumentList never ran).
- Leave the DTS studio node processes (C:/DTS/studio) alone: another project.
