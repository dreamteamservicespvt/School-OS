# School OS handoff

Last updated: 2026-11-13 02:00 IST (round 2 done, deploy 3).

## State
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
- Progress page: https://claude.ai/artifact/7WSVY4hW97JfXoJkfRvNUV (docs/qa/team-ready-progress.html).

## Next steps
1. Live receipt PDF check on beta once the user has signed in (Principal) in Chrome 694c21cd.
2. Team test brief docs/qa/2026-11-12-team-brief.md. Test data left by testers: names start with LA-, LB-, LC-, LD-, LE-.
3. Small leftovers (not tester problems): staff leave save still names one problem at a time (LE6 note); LD5 refuses an age
   under 18 / over 80 instead of a soft warning; generic page titles ("Book") in the browser tab on record pages.

## How to run things locally
- DB: `powershell -c "Start-Process -WindowStyle Hidden -FilePath 'D:\all\Projects\School-OS\tools\pg16\pgsql\bin\pg_ctl.exe' -ArgumentList '-D','D:\all\Projects\School-OS\tools\pgdata','-l','D:\all\Projects\School-OS\tools\pg.log','start'"`; wait for pg_isready.
- Parallel tests: `node qa/vitest-worker.mjs <2-5> <files>` uses school_os_w<N>_test (made with psql -U postgres). Start
  vitest from `/d/...` or `D:\` (a lowercase `d:` cwd made "Vitest failed to find the current suite").
- Rebuild: stop `next start -p 3000` (find via Win32_Process CommandLine); `robocopy D:\all\Projects\School-OS C:\Users\chala\sos-build /MIR /XD .git node_modules .next tools storage qa-output .claude /XF build-and-start.sh`; `Start-Process -WindowStyle Hidden D:\Git\bin\bash.exe build-and-start.sh -WorkingDirectory C:\Users\chala\sos-build`. It runs prisma generate but NOT migrations: run `npx prisma migrate deploy` in D: first.
- Vercel build log without the CLI: Chrome "Dream Team Services" is logged in to Vercel; in a vercel.com tab run
  `fetch("/api/v3/deployments/<dpl_id>/events?builds=1&limit=-1")`.
- Demo logins local only (DEMO_PASSWORD in .env); browser scripts qa/full/*.mjs; playwright-core in C:/Users/chala/tools/school-os-probe.

## Gotchas
- Run vitest from PowerShell in D:ll\Projects\School-OS (Git Bash now fails at startup: "reading 'config'").
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
