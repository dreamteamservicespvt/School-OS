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
