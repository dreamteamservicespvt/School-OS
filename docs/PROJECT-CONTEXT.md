# Project context: where School OS stands

This page is the handoff from the "School OS — Master Product Development" project in the
Claude app (claude.ai) to any Claude Code session working on this repository, for example in
VS Code. That project's chat history cannot be seen from here, so everything a new session
needs is written down below. Last updated 16 October 2026.

Read this page, then `CLAUDE.md`, then `docs/blueprint/README.md`, before any work.

## 1. The product

School OS is a school management system for Indian schools, sold by DREAM TEAM SERVICES
(Kakinada, Andhra Pradesh).

> Don't make people learn the software. Make the software understand people.

The goal is not the most features. It is the easiest, most intelligent school software, with
enterprise strength underneath: it should feel like an operating system for a school, not a
traditional ERP. The owner wants world-class, pixel-perfect, fully responsive UI that a
first-time user understands without training, and each role sees only what that role does in
a real school (for example, the Principal sees who has not marked attendance, rather than
marking it).

## 2. The blueprint is the source of truth

Everything is specified in `docs/blueprint/` (20 modules, workflows, data model, roles,
build order, Super Admin console, platform security). Module, page and record names must
match it exactly. `docs/source/` holds the original plan, the 888-feature map and the
decisions of 9 October 2026.

Key decisions (full list in `docs/blueprint/README.md`, "Decisions made", and
`docs/source/decisions-2026-10-09.md`):

- Razorpay is the first online payment gateway. Cash and UPI at the counter work from day one.
- Fee payments are never deleted, only cancelled with a reason.
- Transport is not in the first sellable version (it is built, and stays switched off per school).
- Report cards (Examination & Results) and Parent Link are in the first sellable version.
- Parents get a Parent Link (one secure link by WhatsApp or SMS, no password), not an app yet.
- Indian rules: DPDP consent with a one-time code, SMS DLT IDs, GST on taxable fee heads,
  an April to March financial year separate from the academic year.
- PF and ESI are calculated; TDS is typed in monthly.
- Staff use the installable web app; a small Android driver app (`apps/driver-android`) is for Transport.
- The Super Admin console (`docs/blueprint/07-super-admin.md`) is DREAM TEAM's own console,
  in this same codebase, at `/console`.

Pricing (agreed 9 October 2026, excluding 18% GST): Essential ₹120 per student per year,
Complete ₹200, minimum 100 students, half rate above 1,000 students. Transport ₹1,500 per
bus and Hostel ₹10,000 per year as add-ons. The first 20 schools get a founding offer
(Essential price, new modules free, price locked 3 years).

## 3. What is built

All 20 modules and the Super Admin console are built and merged into `main`.

| Pull request | What | State |
|---|---|---|
| #1 | School OS version 1: all 20 modules (940 tests at merge) | Merged |
| #3 | Switching to School OS: imports from old software, Excel or paper | Merged |
| #5, #6, #7 | Test copies: Vercel import and one-container (Hugging Face) copy; console code shown on screen in the test copy | Merged |
| #4 | Chaitanya QA audit fixes (~100 defects) and browser QA scripts in `qa/`; branch `claude/chaitanya-qa-audit-s5vm34` | **Open, draft. Merge next.** |
| #2 | Clickable UI design prototype (branch `claude/ui-design-kwx9ju`); the approved look the real app follows | Open, draft; reference only, not for merging into the app |

How the code is organised and the rules every change must keep: `CLAUDE.md`,
`docs/BUILDING.md` and `docs/decisions/0001-technology.md` (Next.js, PostgreSQL with
row-level security per school, Prisma, a background worker).

## 4. The test deployment

A working test copy runs at **https://school-os-beta.vercel.app** with the demo school
(Sunrise Public School), on Vercel with a free Neon database. Every push to `main` redeploys
it. How it works and its limits (no PDFs, no background worker, uploads not kept) are in
`deploy/vercel/README.md`; a one-container copy that runs everything is in `deploy/test-copy/`.

- School sign-in: usernames such as `principal`, `admin`, `accountant`, `teacher`, all with
  the `DEMO_PASSWORD` set in Vercel (the default is in `deploy/vercel/README.md`).
- Super Admin console: `/console/sign-in` with the demo mobile number in
  `deploy/vercel/README.md`. Because the test copy has no SMS or email, the code page shows
  the 6-digit code on screen (the owner chose this on 16 October 2026). Real deployments
  never show or log codes.
- It is for trying the software only. Never put a real school's data in it.

## 5. Chaitanya EM School QA audit (16 October 2026)

An end-to-end browser audit simulated CHAITANYA EM SCHOOL, Chekkapalli, using made-up demo
data only ("Chaitanya EM School — QA Demo" plus "QA School B", 350 demo students, 46 demo
staff, a login for each of the 19 roles). Report: https://claude.ai/artifact/U7FoPvwtXsXZuRghH1Bjwq

- **Verdict:** ready for a supervised pilot, not yet for a live school.
- 1,675 browser checks, 1,526 passed; about 100 defects fixed and re-tested (in PR #4).
- 1,058 automatic tests, typecheck, lint and the production build all pass on PR #4.
- School A / School B isolation held in every test.
- Defect details with steps: `qa/results/*-defects.md` on the PR #4 branch.

**Open defects (not fixed yet):**

| ID | Priority | Problem |
|---|---|---|
| PLATFORM-13 | P2 | Dashboard takes 1.4 to 3 seconds to open with 350 students |
| PLATFORM-17 | P3 | "Page not found" answers HTTP 200 instead of 404 |
| PLATFORM-08 | P3 | Search does not forgive typos or find receipts by number |
| ACADEMICS-20 | P3 | Homework after its due date is still accepted by the server |
| PEOPLE-07 | P3 | Online application form shows one problem at a time |
| Money minor | P3 | "Send by WhatsApp" offered when WhatsApp is off; one expense message repeats the typed date |
| ACADEMICS-14, 19; PEOPLE-03, 04, 09, 25; CAMPUS2-07 | P4 | Wording and small layout polish |

Not built yet: Super Admin support access and restore.

**Three product decisions waiting on the owner** (report section 9). Do not decide these
yourself; ask the owner:

1. **ACADEMICS-07:** On staff leave, "Ask for a change" is stored as a rejection and the
   teacher cannot resubmit. Should approvals get a "changes requested" state? It would change
   every approval type.
2. **ACADEMICS-11:** Attendance Reports shows two different % for the same class and day,
   because one figure counts approved leave in the base and the other does not. Which is
   right? It changes numbers shown to parents and on report cards.
3. **PEOPLE-23:** When an admission is confirmed in a school with no consent text, the
   application's consent is not moved to the guardians. Move it anyway (with what wording),
   or require the school to publish consent text first?

## 6. What blocks a real launch (the owner's to do)

None of these can be done from code:

1. Choose hosting (servers in India). `docs/DEPLOYMENT.md` lists what to run.
2. Open a WhatsApp Business (Cloud API) account.
3. Open an MSG91 account for SMS, with DLT templates registered.
4. An email sending account.
5. Open a Razorpay account.
6. Send DREAM TEAM's GST details for invoices.

After that: re-run the 21 QA checks that need these accounts, then pilot with one school.

## 7. Next steps for a coding session

1. Get PR #4 green and merged into `main` (the owner merges).
2. Fix the open P2 and P3 defects above, starting with Dashboard speed (PLATFORM-13).
3. Apply the three product decisions once the owner gives them.
4. Build Super Admin support access and restore (`docs/blueprint/07-super-admin.md`).

## 8. How the owner likes to work

- Plain, simple language. The owner is not a developer; explain results, not internals.
- A clear view of progress and what is left. The owner has said more than once that they
  lose track of status. Keep a short done / in progress / to do / waiting-on-you list, and
  update the progress page while working: **School OS Progress**,
  https://claude.ai/artifact/8KuuZ5d4HtrNEoEV7yKUbC
- Don't stop to ask on things you can decide; pick the sensible default, say which, and keep
  going. Ask only for real product decisions or things only the owner can do (accounts, money,
  merging, production).
- When told "pause" or "stop", save the work and stop. Resume only when told "continue".
- The owner watches usage. Recommended model: Opus 5.5 with **high** effort for coding.
- Show the owner real working software, not only prototypes.

## 9. Links

| What | Where |
|---|---|
| Live test copy | https://school-os-beta.vercel.app |
| QA final report | https://claude.ai/artifact/U7FoPvwtXsXZuRghH1Bjwq |
| Progress page | https://claude.ai/artifact/8KuuZ5d4HtrNEoEV7yKUbC |
| UI prototype (approved look) | https://claude.ai/artifact/AABMeM7vAaWBRSRNhfBjK7 |
| Screens of the real app | https://claude.ai/artifact/XZ9QTuA6eW6JVRWm23Zu7e |
| Pricing with calculator | https://claude.ai/artifact/JjY4U3Fdwq9je65SqvAWRK |
| Repository | https://github.com/dreamteamservicespvt/School-OS |

The Claude project also keeps files that are not in this repository (the QA test matrix,
the landing page, the pricing notes, the competitor demo study). They are in the project's
shared files in the Claude app.

Never put passwords, keys or secrets in this file or anywhere in the repository.
