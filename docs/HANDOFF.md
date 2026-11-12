# School OS handoff

Last updated: 2026-11-12 16:30 IST (team-test readiness day). Older: docs/archive/HANDOFF-until-2026-11-11.md (and earlier archives).

## State
- Branch claude/project-thread-cesreq (local, ahead of origin). main = 88aeaa35 = LIVE on school-os-beta since 15:54 IST:
  everything up to 6306c14d (all fixes to 2026-11-06) + two deploy fixes (next.config tracing, PDF browser fetched at run time).
- Deploy = push to main; Vercel builds with scripts/vercel-build.ts, which runs `prisma migrate deploy` on the beta DB.
  Hobby plan: max 12 server functions. Never bundle big files into every function (2026-11-12: the 68 MB Chromium did,
  two deploys failed). src/lib/pdf.ts now fetches the pinned pack (PACK_URL, v141.0.0) into /tmp on the first PDF.
  NOT yet verified live: a receipt/ID card PDF on beta (needs a signed-in browser; Chrome "Dream Team Services" was signed out).
- Today's commits on the branch, NOT yet deployed (deploy 2 waits for the full suite):
  f6d02b7e/82020db2 issue 33 refund lowers Paid only (statement shows "is to pay again"); 828e9d4a 34B no template switches
  Transport on; c216aa79 Adjust "remove" above the concession limit -> Approvals (migration 20261112000000_fee_adjustment_removes);
  23888a79/db3a9699/965de211 shared campusFilter + guard test; self-test A fixes 4f78da07 e910a2e6 b8b52e57 0d74ae01;
  self-test B fixes 9c02476d 97fd74e0 da9b1f94 7a0e3b51 641ba9dd. Findings: docs/qa/2026-11-12-selftest-A.md and -B.md.
- Owner decisions taken by Claude 2026-11-12 (user: "complete all this yourself"): 33 refund = money back, fee unchanged;
  34B Transport off by default, a school may switch it on; Adjust remove follows reduce's limit; campus filter shared layer;
  old 30 test students keep old due dates (fee rows never rewritten); forgot password same answer for unknown logins
  (except a two-step role with no phone/email, which keeps its honest message); a month paying the approver's own bonus goes
  to the School Admin.
- Progress page: https://claude.ai/artifact/7WSVY4hW97JfXoJkfRvNUV (docs/qa/team-ready-progress.html).

## Next steps
1. Full suite (`npx vitest run`, started 16:24 on the default test DB, BEFORE 0bef74f3) must pass; rerun its failures and
   the salary/front-office/collect tests on HEAD. tsc 0 errors and eslint clean on HEAD (17:00). Then `npx prisma generate`.
2. Browser recheck 17:00 on the rebuilt :3000 (docs/qa/2026-11-12-selftest-B.md "Recheck 17:00"): 31 pass, 4 fail.
   Open: B6 wrong-code message after an unknown login (fixed in 2066471a, rebuild + recheck with qa/full/selftest-B-decoy-check.mjs);
   A4 typing over a selected end time gives "10:00 AM:00 PM" (now refused, not dropped; fix the time box's typing);
   Adjust "remove" result message not seen by the script (check by eye; the row does show "Waiting for approval");
   Low: old section's register calls a moved student "(left)" (should say "moved to 5 B"). Smoke 29/29 pages open.
3. Deploy 2: `git merge origin/main` (its 2 commits only touch next.config.ts and src/lib/pdf.ts, same as the branch), push
   HEAD to main and the branch; watch Vercel (GitHub commit status); then live check a receipt PDF and sign-in.
4. Known, not fixed: A3 no warning when a bank payment takes the bank below zero; "Move money" sheet is pre-filled with the
   whole cash amount (one click = a big deposit; a layman risk); B9 exam tab shows the new section for old exams; B10 no
   warning when leaving a half-filled Add Student; Adjust sheet text does not yet say "above the limit it waits for approval";
   Meta template "Admission consent code" to submit per school after deploy.
5. Team test: docs/qa/test-plan.md + the brief docs/qa/2026-11-12-team-brief.md (to write when deploy 2 is live).

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
