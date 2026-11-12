# School OS handoff

Last updated: 2026-11-12 19:10 IST (team-test readiness day). Older: docs/archive/HANDOFF-until-2026-11-11.md (and earlier archives).

## State
- DEPLOY 2 LIVE: main = 989111c5 on school-os-beta since 18:15 IST (Vercel "Deployment has completed"; /sign-in 200).
  Holds everything to 2026-11-12: refund rule 33, Transport off 34B, Adjust remove -> Approvals (migration
  20261112000000_fee_adjustment_removes ran in the Vercel build), shared campusFilter, self-test A/B fixes, B6 decoy fix.
- After deploy 2, branch only (NOT deployed): 47fc6b86 A4 fix in src/components/ui/form-problems.tsx (state was set inside
  the input event, so a box showing a server message lost its first key: "10:00 AM:00 PM"). Rechecked on the local
  rebuild: the event saves with 1:00 PM. tests/form-problems.test.ts 7/7.
- Settled: the Library campus test was a test mistake (desk shows "Neha, 5 A"), fixed in f32f46f2. Rerun of the open files:
  17 files, 165/165 (incl. restore-test). B6 recheck PASS ("4 more tries", then "3 more tries").
- Layman tests A, B, C, E DONE (docs/qa/2026-11-12-layman-A/B/C/E.md: 56 problems, 2 High). D (staff/front office/events/
  transport/hostel) still running -> docs/qa/2026-11-12-layman-D.md. Claude fixed LC1 LC4 LC5 LC6 LC24 (79813078).
  RUNNING since ~20:30: 4 fixer agents, each commits its own files: shared components (LA1 LA2 LA5 LE2 LE3 LE5/LC11 LE6
  LE7/LC13 LC22 LC23 + DB pool), money (LB1-LB11, A3, Move money, Adjust text), exams/homework/comms (rest of LC + B9),
  students/library/inventory/settings (rest of LA + LE + B10). Their final reports list fixed/not fixed per ID.
- Live receipt PDF NOT checked: Chrome "Dream Team Services" (deviceId 694c21cd) is signed out of beta (7-day timeout).
  Claude does not type passwords into the live site, so the user signs in once, then Claude checks.
- Progress page: https://claude.ai/artifact/7WSVY4hW97JfXoJkfRvNUV (docs/qa/team-ready-progress.html).

## Next steps
1. Check each fixer's commits (git log), fix D's report too; fix every confirmed problem (High first), with tests; tsc + eslint; run the touched
   test files; rebuild :3000 and recheck each fix in the browser.
2. Deploy 3: push HEAD to main and the branch; watch the GitHub commit status for Vercel; smoke /sign-in.
3. Live receipt PDF check on beta once the user has signed in (Principal) in Chrome 694c21cd.
4. Known, not fixed: A3 no warning when a bank payment takes the bank below zero; "Move money" sheet pre-filled with the
   whole cash amount; B9 exam tab shows the new section for old exams; B10 no warning when leaving a half-filled Add
   Student; Adjust sheet does not say "above the limit it waits for approval"; old register says "(left)" for a moved
   student; Meta template "Admission consent code" to submit per school.
5. Team test: docs/qa/test-plan.md + write docs/qa/2026-11-12-team-brief.md.

## How to run things locally
- DB: `powershell -c "Start-Process -WindowStyle Hidden -FilePath 'D:\all\Projects\School-OS\tools\pg16\pgsql\bin\pg_ctl.exe' -ArgumentList '-D','D:\all\Projects\School-OS\tools\pgdata','-l','D:\all\Projects\School-OS\tools\pg.log','start'"`; wait for pg_isready.
- Parallel tests: `node qa/vitest-worker.mjs <2-5> <files>` uses school_os_w<N>_test (made with psql -U postgres). Start
  vitest from `/d/...` or `D:\` (a lowercase `d:` cwd made "Vitest failed to find the current suite").
- Rebuild: stop `next start -p 3000` (find via Win32_Process CommandLine); `robocopy D:\all\Projects\School-OS C:\Users\chala\sos-build /MIR /XD .git node_modules .next tools storage qa-output .claude /XF build-and-start.sh`; `Start-Process -WindowStyle Hidden D:\Git\bin\bash.exe build-and-start.sh -WorkingDirectory C:\Users\chala\sos-build`. It runs prisma generate but NOT migrations: run `npx prisma migrate deploy` in D: first.
- Vercel build log without the CLI: Chrome "Dream Team Services" is logged in to Vercel; in a vercel.com tab run
  `fetch("/api/v3/deployments/<dpl_id>/events?builds=1&limit=-1")`.
- Demo logins local only (DEMO_PASSWORD in .env); browser scripts qa/full/*.mjs; playwright-core in C:/Users/chala/tools/school-os-probe.

## Gotchas
- Meta rejects Utility templates mentioning password/login; word them as account status.
- Never touch the Meta webhook or the gym's Vercel without permission. Never type secrets into web forms.
- .env line 26 has an unquoted space, so `bash scripts/setup-db.sh` cannot source it; run its psql steps by hand.
- Two sign-in scripts per role per 15 min at most (two-step code limit).
- Restarting :3000: a stop by CommandLine match can miss the old server. Check `Get-Process node` StartTime and that
  tools/app.log says "Ready", not EADDRINUSE (2026-11-12: a recheck ran against the old 16:42 server). Start with
  C:/Users/chala/sos-build/start-only.sh via Start-Process (bash -c through -ArgumentList never ran).
- Leave the DTS studio node processes (C:/DTS/studio) alone: another project.
