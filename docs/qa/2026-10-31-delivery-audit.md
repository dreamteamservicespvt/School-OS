# School OS final delivery audit, 2026-10-31 (local demo only)

Run by Claude alone overnight (owner asleep, no questions asked) on http://localhost:3000, served from the
SSD copy C:\Users\chala\sos-build with the local PostgreSQL 16 demo database. Brief:
docs/qa/MISSION-delivery-audit.md. Round 1 (docs/qa/2026-10-30-full-test.md) was not redone; this round
went deeper on money, server-side permissions, downloads, demo data and widths round 1 skipped.
Nothing was pushed, deployed or sent; no external account, webhook or paid API was touched.

Statuses: PASS · FAIL · BLOCKED · NOT IMPLEMENTED · NEEDS EXTERNAL SERVICE · NEEDS PRODUCT DECISION.

**Gate: YELLOW, READY WITH KNOWN LIMITATIONS** (reasons at the end). Bugs found 16, fixed 16, 0 known FAIL left.

## Platform status
| Check | Result |
|---|---|
| Build (SSD copy) and start | PASS (rebuilt 02:10 with every fix; one earlier rebuild failed on a test type error, fixed in 8c29e1cf) |
| Lint | PASS: 0 errors, 172 warnings (same count as round 1; none new) |
| Typecheck | PASS: 0 errors (`NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit`) |
| Full test suite (after all fixes, 02:18) | 2,324 of 2,326 PASS; 2 FAIL by timeout only, both PASS when rerun alone: tests/platform/restore-test.test.ts (pg_restore of the test database into a scratch copy on the D: hard disk waits on disk sync, 300 s limit; alone it took 336 s with setup and passed) and tests/job-times.test.ts (walks every source file, 20 s limit). An earlier full run (01:16, overlapping a build) also showed tests/communication/never-lost.test.ts failing once on database order: a real bug, fixed (bug 16). Logs: qa-output/full/npm-test-audit*.log |
| Browser re-check of the fixes after the rebuild | PASS 11/11 (qa/full/recheck-audit.mjs: 7 pages at 320/1024 px without sideways scroll; automation log download 403 for Teacher, Receptionist, Transport, 200 for Principal) + Collect Fee replay still refused for every role; menu pages of School Admin, Accountant, Teacher, Receptionist at 1440 px: 0 problems |

## What was tested (and how)
| Area | Status | Evidence |
|---|---|---|
| Collect Fee called directly by Teacher, Subject Teacher, Librarian, Receptionist, Vice Principal, Driver, no session | PASS | qa/full/probe-collect.mjs: the Accountant's real request replayed with each session: all refused on the server ("Your role does not allow this in Fee Management"), no session sent to sign-in |
| Collect Fee double submit: same request twice in a row, three at the same moment | PASS | 2nd: "₹1,000 cash for … was collected at … Collect again?"; 3 at once (probe-collect-race.mjs): exactly 1 payment + 1 receipt in the database |
| Counter payment for a student who owes nothing (advance), two at once | FAIL → FIXED | bug 1 |
| Cancel payment, refund request, "Mark refunded" sent twice at once | FAIL → FIXED | bugs 2-4 |
| Application fee and library fine taken twice at once | FAIL → FIXED | bugs 5, 6 |
| Razorpay webhook / checkout replayed | PASS (code + existing tests) | confirmGatewayPayment locks the link, posts once per gateway payment id (tests/fees/webhook-race.test.ts, gateway-reconcile.test.ts pass); a real Razorpay call: NEEDS EXTERNAL SERVICE (no keys locally) |
| Totals agree: ledger, receipt, Day Book, Fee Dashboard, Principal Dashboard, Ask, Parent Link | PASS | SQL checks on all 348 payments: every posted payment has exactly 1 receipt, allocations + advance = amount, every due's balance = amount − concession + adjustment − paid, paid = posted allocations, Day Book net for payments = posted total (₹48,10,750), 348 unique receipt numbers. Screens on 30-10: Fee Dashboard "Collected today ₹54,000, 34 payments" = Principal Dashboard ₹54k = Ask "fees collected" ₹54,000 = SQL; Day Book ₹63,750 = ₹54,000 fees + ₹9,750 application fees (17). Parent Link (Krishna Mehta): total ₹46,010, paid ₹16,500, balance ₹29,510 = SQL |
| Attendance correction with another class's ids swapped in (teacher Ravi Teja: 5 A, 5 B, 6 A) | PASS | qa/full/probe-idor.mjs: 6 B section → "You can only work with your own classes"; 6 B student in 5 A → "One of the students is not in this class"; Librarian → refused. A class he does not teach opened by address shows his own class |
| Every download route (165 route.ts; 64 without an id × csv/xlsx/pdf) as Teacher, Librarian, Receptionist, Transport, Store, Warden | FAIL → FIXED (1) | qa/full/probe-routes.mjs (1,920 requests) + probe-export-vs-page.mjs: bug 7 (automation log). Staff list export to every role holds only the person's own row (= "Own") |
| Id routes (receipts, ledger, staff files, report-card PDFs, exit/offer letters, data exports, report runs) | PASS (code review) | each checks the role's reach and the record's owner/campus |
| Signed links: receipt link /r/…, file links, calendar feed | PASS | receipt link opens the PDF; the school id swapped or one character changed → 404; file and feed links are HMAC-signed |
| Ask (AI) | PASS | teacher/librarian/reception asking fee or staff questions by address: "This question is about a list your role does not open"; accountant's "fees collected" = ₹54,000. AI wording help is off locally (no ANTHROPIC_API_KEY): word matching only, NEEDS EXTERNAL SERVICE for the AI part |
| Server actions without a guard (static scan of 1,028 exported actions) | PASS | every one goes through requireAction / a module helper (actSimple, inFrontOffice, run, hr …) or is public by design (Parent Link, pay page, sign-in) |
| Open redirect | FAIL → FIXED | bug 8 |
| Widths 320 and 1024 on every page round 1 crawled (Principal 302, Accountant 99, Teacher 95, Receptionist 46 pages) + menu pages at 320/768/1024/1920 for Principal and Accountant | FAIL → FIXED (6) | qa/full/widths.mjs, about 1,250 page loads: no broken page, no browser error, no 5xx; 6 sideways-scroll bugs (9-14) |
| Demo data (leftovers the client would see) | FAIL → FIXED | bug 15; no other test/QA/asdf/dummy/lorem text in any text column of the demo database (regex scan of every table) |
| TODO/FIXME/lorem/console.log text reaching a screen | PASS | none in src (only code identifiers and masked "XXXX" account numbers) |
| First-time speed | PASS (looked at) | Principal dashboard leads with what needs them (approvals 22, collected today, absent); Accountant: "fee <name>" in Search offers Collect Fee, collect page opens with the amount filled; Teacher: Attendance opens straight on Take Attendance for their class; Parent Link opens on fees due with the balance. Timed tests (parent < 60 s on a slow phone, 40 students < 60 s): BLOCKED, not run (no throttled device) |

## Bugs found 16, fixed 16, remaining 0 known FAIL
| # | Severity | Commit | What | Test |
|---|---|---|---|---|
| 1 | High (money) | 2150019b | Two identical counter payments sent at the same moment for a student who owes nothing (advance) both posted: no fee row to lock | tests/fees/counter-race.test.ts |
| 2 | High (money) | 459207d7 | "Cancel payment" sent twice at once took the payment off the student's dues twice (balance went up by double) | counter-race.test.ts |
| 3 | High (money) | 459207d7 | Two refund requests at once could both take the same refundable amount (more than paid) | counter-race.test.ts |
| 4 | High (money) | 459207d7 | "Mark refunded" twice at once took the refund off the dues twice | counter-race.test.ts |
| 5 | High (money) | 828a8d7e | Application fee taken twice at once: two receipts, two Day Book entries | tests/admission/application-fee.test.ts |
| 6 | High (money) | 9eb94d67 | Library fine "Collect" twice at once: two income receipts, two Day Book entries | tests/library/salary.test.ts |
| 7 | Medium (privacy) | 48b7c256, dff46e44 | Teacher, Receptionist, Transport In-charge could not open Message Settings' automation log but downloaded it (every parent messaged, every receipt number) at /communication/settings/log/export | tests/communication/office-exports.test.ts |
| 8 | Low (security) | fbc7af71 | Switch school / open notification redirected to "/\host" (browsers read it as another site) | — |
| 9 | Medium (layout) | ebf8ad07 | Admissions dashboard filters pushed the page 112 px sideways at 1024 px (a common laptop/tablet width) | widths.mjs |
| 10-14 | Low (layout, 320 px) | ebf8ad07 | Settings rows (Transport, Fee Settings) with a long value; Fee Settings approval pills; view tabs on Custom & Scheduled Reports; hidden labels in Library Settings' table; Take Attendance save button | widths.mjs |
| 15 | Medium (demo) | scripts/demo-cleanup.sql | Round 1 left a homework "Self-test: Exercise 5.1 …" and a notice "Self-test: Parent-teacher meeting …" (plus 17 notifications, 14 parent messages, 1 approval quoting them) in Sunrise's demo data | re-scanned: 0 left |
| 16 | Low (messages) | 0b397fe7 | Two guardians on one phone, message to all guardians: which name was greeted depended on database order (the first full test run failed once on it) | tests/communication (218 pass) |

Hardening (no bug reproduced): PF/ESI/PT/TDS "Record paid" now locks its salary month too (828a8d7e, test added).
Every money fix locks the record first with FOR NO KEY UPDATE, so records that only point at it are never blocked (no new deadlock).

## Decisions made (no questions asked)
1. Probe payments and corrections were made on the demo database; afterwards it was restored (twice, the last
   at 02:15 after the final re-check) from a snapshot taken right after the cleanup (C:\Users\chala\sos-snap\school_os-2026-10-30-clean.dump), so the client sees
   no audit leftovers. The cleanup only changed words; the Audit Log keeps its history (it cannot be changed).
2. Not reseeded at 01:30: the demo data is dated 30-10-2026, so on 31-10 "today" cards start empty
   (collected today ₹0, attendance not taken yet). A seed at 01:30 would put today's 9:00 attendance in the
   future. See client risk 1 for the morning step.
3. Message Templates export kept open to everyone who may open Communication: its page is read-only for them
   (commPage), so it is not a leak (first fix reverted in dff46e44).
4. Inspection as the local superuser `postgres` (trust, localhost only) in read-only transactions, instead of
   switching row-level security off (that took table locks and deadlocked with the running app once).

## Blocked / not tested
- Online payment through Razorpay, WhatsApp/SMS/email delivery: NEEDS EXTERNAL SERVICE (no keys or provider locally; messages are logged only).
- AI wording help in Ask, AI import columns: NEEDS EXTERNAL SERVICE (no ANTHROPIC_API_KEY locally).
- Timed tests (parent pays on a slow phone < 60 s; teacher marks 40 students < 60 s): BLOCKED (no throttled device run).
- "Record income" / "Record expense" pressed twice: two drafts are possible (no record to lock before the first is saved; the button disables while saving): NEEDS PRODUCT DECISION (a duplicate warning like Collect Fee's).

## Client risks (top first)
1. Dates: the demo data was seeded on 30-10. For a fresh "today" on 31-10, reseed in the morning after
   about 9:30 AM IST (handoff "How to run things locally"); otherwise show "today" by collecting a fee and taking attendance live.
2. Live deployment secrets: the app log warns `FILE_LINK_SECRET` is not set (FIELD_ENCRYPTION_KEY signs links instead). Set it on the live site before the first real school goes live.
3. Online payments and WhatsApp were never exercised end to end with real accounts (first real school will be the first test).
4. The owner's own uncommitted edits (.vscode/settings.json, CLAUDE.md, next.config.ts, public/push-sw.js) are in the build copy; they were not reviewed or committed.

## Gate
**YELLOW: READY WITH KNOWN LIMITATIONS** for the 31-10 demo and delivery.

Why not RED: no known FAIL is left; every money path checked (counter, cancel, refund, application fee,
library fine, gateway replay) posts once with one receipt, and ledger, receipts, Day Book, dashboards, Ask and
Parent Link agree; server-side permissions held for every replayed action; one privacy leak (automation log
download) and 15 other bugs were fixed with tests; build, lint and typecheck pass.

Why not GREEN: online payments (Razorpay) and WhatsApp/SMS delivery were never exercised end to end
(NEEDS EXTERNAL SERVICE); the live site was not audited (local demo only, by rule); the timed tests were not
run; two slow-disk test timeouts remain (environment); the demo data is dated 30-10 unless reseeded in the
morning; FILE_LINK_SECRET must be set on the live site.
