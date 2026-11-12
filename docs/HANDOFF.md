# School OS handoff

Last updated: 2026-11-12 23:00 IST (round 2: finishing all 69 layman problems). Older: docs/archive/HANDOFF-until-2026-11-11.md (and earlier archives).

## State
- ROUND 2 (started 22:25 IST): d15f298c makes 8816c758 type-check clean (8 errors) + LE2. Migration
  20261112100000_appraisal_points_by_staff_type applied to the local DB. 5 helpers fixing by area (forms/date boxes;
  money LB; exams/homework/comms LC; students/staff/desks LA+LD; library/store/exports/i18n LE+LC11), test DBs w3-w6 +
  school_os_test (w6 made today). Lead: busy-DB LA5/LC3/LE9 (pool 20 / 5 serverless, busy page) + LA10/LD9 re-measure.
- DEPLOY 2 LIVE: main = 989111c5 on school-os-beta since 18:15 IST (Vercel "Deployment has completed"; /sign-in 200).
  Holds everything to 2026-11-12: refund rule 33, Transport off 34B, Adjust remove -> Approvals (migration
  20261112000000_fee_adjustment_removes ran in the Vercel build), shared campusFilter, self-test A/B fixes, B6 decoy fix.
- After deploy 2, branch only (NOT deployed): 47fc6b86 A4 fix in src/components/ui/form-problems.tsx (state was set inside
  the input event, so a box showing a server message lost its first key: "10:00 AM:00 PM"). Rechecked on the local
  rebuild: the event saves with 1:00 PM. tests/form-problems.test.ts 7/7.
- Settled: the Library campus test was a test mistake (desk shows "Neha, 5 A"), fixed in f32f46f2. Rerun of the open files:
  17 files, 165/165 (incl. restore-test). B6 recheck PASS ("4 more tries", then "3 more tries").
- Layman tests A-E ALL DONE: docs/qa/2026-11-12-layman-A.md .. -E.md (1,180 checks, 69 problems: 3 High LB1 LC1 LD1).
  Claude fixed and verified LC1 LC4 LC5 LC6 LC24 (79813078) and A4 (47fc6b86).
- 5 fixer helpers (shared components, money, exams/homework/comms, students/library/inventory/settings, staff/front
  office/events/transport/hostel) were STOPPED mid-work when the chat closed. Their partial work is ONE commit 8816c758
  "WIP: unverified ..." (152 files + new migration 20261112100000_appraisal_points_by_staff_type + new tests + qa/layman
  scripts). It is NOT type-checked or tested; which IDs it fully fixes is unknown.
- Live receipt PDF NOT checked: Chrome "Dream Team Services" (deviceId 694c21cd) is signed out of beta (7-day timeout).
  Claude does not type passwords into the live site, so the user signs in once, then Claude checks.
- Progress page: https://claude.ai/artifact/7WSVY4hW97JfXoJkfRvNUV (docs/qa/team-ready-progress.html).

## Next steps
1. Verify WIP 8816c758: `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p .`, `npx eslint src tests`, then run
   the new/changed tests (git show --stat 8816c758) and `npx prisma migrate deploy` + `npx prisma generate`. Fix what fails.
2. For every problem ID in the 5 layman reports (except those fixed above), check the code: fixed / partly / not done.
   Finish the rest. High first (LB1 concession above the fee, LD1 leave dates reset after an error), then Medium, Low.
   LA11/LD6 owner decision: make screens, badges and Settings follow docs/blueprint/05-roles.md.
3. Full suite in parallel (node qa/vitest-worker.mjs, see below), tsc 0, eslint clean.
4. Rebuild :3000 (see below) and recheck each fixed ID in the browser with the qa/layman/*.mjs scripts.
5. Deploy 3: push HEAD to main and the branch; watch the GitHub commit status (Vercel); smoke /sign-in.
6. Live receipt PDF check on beta once the user has signed in (Principal) in Chrome 694c21cd.
7. Team test brief docs/qa/2026-11-12-team-brief.md. Test data left by testers: names start with LA-, LB-, LC-, LD-, LE-.

## How to run things locally
- DB: `powershell -c "Start-Process -WindowStyle Hidden -FilePath 'D:\all\Projects\School-OS\tools\pg16\pgsql\bin\pg_ctl.exe' -ArgumentList '-D','D:\all\Projects\School-OS\tools\pgdata','-l','D:\all\Projects\School-OS\tools\pg.log','start'"`; wait for pg_isready.
- Parallel tests: `node qa/vitest-worker.mjs <2-5> <files>` uses school_os_w<N>_test (made with psql -U postgres). Start
  vitest from `/d/...` or `D:\` (a lowercase `d:` cwd made "Vitest failed to find the current suite").
- Rebuild: stop `next start -p 3000` (find via Win32_Process CommandLine); `robocopy D:\all\Projects\School-OS C:\Users\chala\sos-build /MIR /XD .git node_modules .next tools storage qa-output .claude /XF build-and-start.sh`; `Start-Process -WindowStyle Hidden D:\Git\bin\bash.exe build-and-start.sh -WorkingDirectory C:\Users\chala\sos-build`. It runs prisma generate but NOT migrations: run `npx prisma migrate deploy` in D: first.
- Vercel build log without the CLI: Chrome "Dream Team Services" is logged in to Vercel; in a vercel.com tab run
  `fetch("/api/v3/deployments/<dpl_id>/events?builds=1&limit=-1")`.
- Demo logins local only (DEMO_PASSWORD in .env); browser scripts qa/full/*.mjs; playwright-core in C:/Users/chala/tools/school-os-probe.

## Gotchas
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
