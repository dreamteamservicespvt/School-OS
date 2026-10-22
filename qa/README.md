# Browser QA scripts

Real-school QA for School OS, driven in Chromium with Playwright against the running app.
Everything here is SYNTHETIC DEMO DATA except the public facts about Chaitanya EM School
listed in `seed-chaitanya.ts`.

```bash
npm run build && npx next start -p 3000            # the app
npx tsx --conditions=react-server --env-file=.env qa/seed-chaitanya.ts   # QA tenant + School B
node qa/make-students-xlsx.mjs qa-students.xlsx     # synthetic students file
node qa/import-students.mjs qa-students.xlsx go     # imported through the real screen
node qa/explore.mjs cems.principal /dashboard       # print any screen as a role
```

Logins (password DEMO_PASSWORD): `cems.principal`, `cems.admin`, `cems.accountant`,
`cems.classteacher` (Grade 5 A), `cems.teacher`, `cems.reception`, `cems.transport`,
`cems.librarian`, `cems.warden`, `cems.store`, `cems.viceprincipal`, `cems.academichead`,
`cems.hr`, `cems.office`, `cems.exam`, `cems.admissions`, `cems.counsellor`, `cems.gate`,
`cems.driver`; School B: `qab.admin`.

Results are written to `qa-output/` (screenshots, results.jsonl).

One-time codes (two-step and sign-in, Parent Link, admission consent, pickup,
console) are written to the server log, one line each, when the app runs on this
computer (`next dev`, or `next start` with `APP_URL=http://localhost:...`) and the
school's messages are in Test mode:
`[dev] one-time code for xxxxxx3210 (sign-in): 123456`. Parent Links, invites and
survey links that Test mode did not send are there too (`[dev] Parent Link for ...`).
Start the app with its output in a file (`npx next start -p 3000 > app.log 2>&1`) and
set `QA_SERVER_LOG` to it; `signIn()` in `lib.mjs` then types the two-step code
itself. A live server (APP_URL a real address) never writes codes or links.
