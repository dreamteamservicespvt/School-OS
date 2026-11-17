# School OS final audit, 17 Nov 2026 (final push to 21:30 IST)

Progress page: https://claude.ai/artifact/YJSTyNarrnjwtfW9R1zbJW. Every agent adds its findings under its own heading:
role, page, what is wrong, severity, fix commit.

## Pending list at 19:15 (lead)

Order: broken on live, then security, then money, then everything else.

### Broken on live
- P1 Assistant AI answers fail at busy times: Gemini 429 free-tier quota + 503 overload; one shared 20 s timer leaves the fallback model no time (fix in progress, branch fix/ai-live). Owner: billing for the key.
- P2 Assistant replies: stray ": ." and today's date as a date (fixed 4934d1d0, merged 2b032eb8, not live).
- P3 Robot button covers the right end of bottom Save bars on phones (fix in progress, branch fix/robot-save-bar).
- P4 Staff List > Change post on live: Saiveni -> School Administrator, anjali -> Principal, harikaa -> Receptionist.
- P5 Receipt PDF check on live.

### Security
- P6 Next.js 16.4.2 build shows a "SecurityFatalError" upgrade notice; 16.4.6 (patch) exists.
- P7 Full security audit (agent G): everything since docs/qa/2026-11-01-security-audit-run-3.md + sign-in codes, Parent Link, Razorpay webhooks, uploads, Assistant, withSchool/RLS, campusFilter, requireAction.
- P8 Owner-decision list items 2-5 (layman-loop.md): one-time-code wording tells strangers which logins exist; changing own mobile/email or switching off two-step asks no password and the old contact is not told; a School Admin resets a shared login's two-step for all schools; TRUSTED_PROXY_HOPS=0 on live makes every visitor share one rate-limit bucket.

### Money (verify each against the current code; many may be fixed already; mark Fixed with the commit)
- testing-issues.md 1, 3, 4, 5, 12, 15, 16, 29, 30, 31, 32, 33 (fee structure row, fee settings switches, discount maths and form, new students shown overdue, dashboard fee numbers, concession reasons, refund form, refund "paid back" maths).
- layman-loop.md decision 19: salary labels say which subset (payroll vs on roll).

### Everything else
- P9 Record name in the browser tab (<RecordTitle>) on the remaining record pages (enquiry, route, quiz, survey and others).
- P10 tests/class-name.test.ts "NEW-01" times out alone (33 s): fix the test itself.
- P11 testing-issues.md non-money items 2, 7-11, 13, 14, 17-22, 24-28 (verify, fix what is still open).
- P12 layman-loop.md decision 16: settings say "DREAM TEAM"; use the wording schools should see.
- P13 76 forms with side-by-side pairs: stack where text is cut at 390 px (crawlers report).
- P14 Every role, page, button and form at 390/1440, light/dark (crawlers E/F, Chrome tester D).

## D. Chrome tester (live)

Live site https://school-os-beta.vercel.app (deploy 25), test school "chaitanya chekkapalli". Times IST.

**Change post (task 1), checked 20:32 as Principal (anjali):** the live Staff List already shows Saiveni = School Administrator, anjali = Principal, harikaa = Receptionist, and no "post does not match the role" warning is on the page. Nothing was changed by me. The Principal has no "Change post" action (profile "More" menu only has "Record exit").

| Role | Page | What is wrong | Severity | How to see it |
|---|---|---|---|---|
| (machine, not the site) | every School OS page in the role Chromes | The laptop is overloaded (CPU 100 %, 0.4 GB RAM free at 20:18; three ffmpeg jobs + a `find` process with 2.6 h CPU). A School OS page needs about 35 s to finish loading and the Chrome tabs freeze or get thrown out of memory, so live clicking is very slow. | High (blocks testing, not a site bug) | Task Manager; `Get-Process ffmpeg, find` |
| Principal | Staff & HR > Staff List > pencil on a row | The pencil ("Edit <name>") jumps to the Staff Profile and opens "Personal details". After Cancel the address still ends with `?edit=personal`, so a refresh (F5) opens the edit form again. | Low | Staff List > pencil on Saiveni > Cancel > F5 |
| Principal | Settings > Users & Permissions (cross-check of task 1, 21:01) | No problem: Saiveni = staff post "School Administrator" + role School Admin; anjali = "Principal" + Principal; harikaa = "Receptionist" + Receptionist / Front Office. All three already match on live. | (info) | Settings > Users & Permissions > Users |
| Principal | Fee receipt PDF (task 2, receipt C-CHE-001/2026-27/00001, harika, Class 1 A) | PDF is correct and readable: 2 pages (OFFICE COPY, PARENT COPY), school name + logo + phone/email/website, student, admission no., class, father's name, receipt no., date 03-11-2026 3:17 PM, mode Cash, 20,000, "Rupees Twenty Thousand Only". Nothing cut off or garbled (checked at 100 % and 125 %). No Telugu on this receipt. | (info, pass) | Fees > Student Fee Ledger > harika > Payments > row > Print / PDF |
| Principal | Fee receipt PDF | The amount has no rupee sign or "Rs." ("20,000", "Total received 20,000"). | Low | same receipt |
| Principal | Fee receipt PDF | Each copy is half a page but sits on its own A4 sheet, so one receipt prints 2 sheets with the lower half empty. No balance left and no "collected by" line (both are in the on-screen receipt). Contact line ends with a hanging "·" before the website. | Low | same receipt |
| Principal | Fee receipt (Print link, first request after idle) | The first request to `/fee-management/payments/<id>/receipt` came back as an HTML page (text/html, 160 KB, 6 s) instead of a PDF; the next requests gave a real PDF after 8-9 s. Looks like the printable fallback when the PDF maker is cold. A parent or accountant opening the first receipt of the day may get a page, not a PDF, and waits 6-9 s. | Medium | Open a receipt after the site was idle; watch the first Print/PDF |
| Principal | Fees > Fee Reports > Collection details | Receipt numbers jump (…00002, 00004 … 00006, 00008): 00003 and 00007 are not in the list and nothing says why (cancelled?). An accountant will think receipts are missing. | Medium | Fee Reports > Collection details, 2026-27 so far |
| Principal | Fees > Fee Reports > Collection details | Receipt number and student name are plain text; clicking them does nothing. A first-time user expects the receipt to open from here. | Low | click a receipt number |
| Principal | Fees > Student Fee Ledger (start list "MOST OVERDUE") | First row is ₹12,000, the next ₹30,000, ₹20,000: the order is not by amount and the page does not say what "most overdue" means (days?). | Low | Fees > Student Fee Ledger |
| Principal | Fees > Student Fee Ledger > student > Statement | Dates are "10 Jun", "3 Nov" in the Date column but "Due 10-06-2026" in the same row. Two date styles in one table. | Low | harika > Statement |
| Principal | Dashboard vs Admissions | Dashboard card "New enquiries 4 · This week · 1 follow-up today". Admission Dashboard says "Follow-ups due 4 · 4 overdue · 0 today" and shows "Loop Six Test: Follow-up overdue, was due 17-11-2026" on 17-11-2026. A follow-up due today is called overdue on one page and "today" on the other. | Medium | Dashboard, then Admissions |
| Principal | Dashboard "Staff present" card | Shows "0 / 6 · 0 on leave · 6 not in yet" although staff attendance was not taken (Staff & HR shows "–  Once staff attendance is taken"). The students card says "Not taken"; the staff card should too. Reads as "all staff absent". | Medium | Dashboard at any time before staff attendance is marked |
| Principal | Homework | Top card "Current · this month: 0 · 0 students given homework in 0 classes", but "By teacher · Homework given · this month" lists KUSUMA 3 given and aswini 1 given. Looks like a contradiction; "Current" is not explained. | Medium | Homework |
| Principal | Salary > Generate Salary | "Salary structures 2 of 11 · 9 missing · aswintha, aksha and 7 more" but Staff & HR says 6 staff on roll. The 11 counts the 5 disabled / left people too (Users list: 6 active, 5 disabled). | Medium | Salary, compare with Staff & HR |
| Principal | Salary > Generate Salary | The Assistant (robot) button sits on top of the "Net pay ₹43,950" figure in the Totals card (last digits hidden) at the normal scroll position on a 1536 x 720 screen. | Low | Salary > Generate Salary, do not scroll |
| Principal | Front Office > Visitors | Filter chips say "All 0 · In the building 0 · Out 0 · Expired 6" for Today, while the red line says "6 visitors not checked out". "All 0" next to "Expired 6" contradicts itself. | Medium | Front Office > Visitors |
| Principal | Attendance > Attendance Register | At 8:50 PM the "Remind" button is still offered for Class 1 A although the page says "locked at 11:00 AM". Reminding after the lock makes no sense to a first-time user. | Low | Attendance after 11 AM with an unmarked class |
| Principal | Settings > Users & Permissions | Every user shows "Two-step login: On, but not working: no code can reach them". Alarming and no next step is offered (verify phone / email?). The text is also cut off at the right edge of the table at 1536 px and the Last sign-in date wraps onto 3 lines. | Medium | Settings > Users & Permissions |
| Principal | Students list vs other modules | Class is written "class 1 A" in Students and Academics, "Class 1 A" in Attendance and Fees. | Low | Students list, Fee Dashboard |
| Principal | Assistant (deploy 25): "Today's collection?" | Answer: "No fee was collected today (17-11-2026 to 17-11-2026): ." The answer ends with a stray ": ." and gives a one-day date range. Matches Fee Dashboard (₹0). | Low (fix said to be in the next deploy) | Robot > type the question |
| Principal | Assistant (deploy 25): "Who is absent today?" | Answer: "Attendance for 17-11-2026 has not been taken yet, so nobody can be counted absent. You can check the Attendance Register for updates." Correct and clear. It is labelled "Suggestion: written by the AI assistant from these records" and offers the follow-up "When will attendance be taken?", which it cannot know. | Low | Robot > type the question |

## G. Security

**Fix commits for the lead: none.** No Critical, High or Medium problem was proven in this pass, so no code was changed.
Branch `sec/final-2026-11-17` (from `claude/project-thread-cesreq` at 1547c370). Checked 19:10 to 20:10 IST, 17 Nov 2026.

How it was checked: source review of the changes since the 1 November audit (314 commits) plus the standing areas below,
black-box requests to the local app only (http://localhost:3000, demo data, nothing live), and the security test files run
on worker 3. Partial pass in one hour: see "Not covered" at the end.

### Findings

| Role / area | Page / route | What is wrong | Severity | Proof | Fix commit or "not fixed: why" |
|---|---|---|---|---|---|
| Anyone (no sign-in) / background jobs | `GET or POST /api/v1/jobs/tick` | Anyone can start a background-job burst (reminders, queued messages). It takes no input, returns no school data, and runs at most once every 15 s. | Low | Local: an unsigned `POST /api/v1/jobs/tick` gave no answer within 10 s (curl timeout), because the route runs `tickJobs()` with no key check (`src/app/api/v1/jobs/tick/route.ts`: only `hitLimit("job-tick:http", 1, 15)`). | Not fixed: by design (the route says so), the external scheduler calls it. Owner choice: add a scheduler secret (for example Vercel's `CRON_SECRET` bearer check) when the scheduler is set up again. |
| Parent / Parent Link "confirm this phone" by tap | `/p/<token>.<secret>` | A tap link that a parent forwards confirms whichever browser opens it. The page warns when it is not the browser that asked, and names that phone and time. | Low | Source: `src/lib/parent-link/tap.ts` (`sameBrowser` warning only). Known since the 16 Nov review. | Not fixed: owner decision (WhatsApp cannot deliver codes to +91 numbers, so the tap replaced the code). |
| DREAM TEAM / console WhatsApp webhook | `POST /api/v1/console/whatsapp` | Every POST body is passed on to the gym's webhook before School OS checks the Meta signature. The gym checks its own signature, so nothing new is reachable. | Info | Source only: `passOn(raw, req.headers)` runs before `handleConsoleWhatsappWebhook`. Not sent: the gym's setup is off limits. | Not fixed: no boundary crossed; leave the gym relay as it is. |
| Assistant voice | `POST /api/v1/assistant/speak` | A request with no `Origin` header passes the same-site check. It still needs a JSON body (a cross-site page cannot send one without the browser's preflight), the person's own session, and it only speaks a reply stored in their own conversation. | Info | Source: `sameSite()` returns true when `origin` is missing. Local: signed out gives 401 `{"problem":"Sign in first."}`. | Not fixed: no harm reachable. |

### Checked and found clean

- **New tables since 1 Nov:** only `assistant_conversation`. Row-level security is on and forced, the policy is same-school, and delete works only for the owner purge. `tests/isolation.test.ts` covers it ("Assistant Conversations stay in their school"). The other 10 migrations add columns to tables that are already covered.
- **AI Assistant** (including 1547c370):
  - The speak route speaks only a reply that exactly matches one stored in the person's own fresh conversation. The text sent in the request is never spoken, and the delivery note is cut to 60 letters.
  - Support access and paused schools are refused, and requests are limited to 30 a minute.
  - Each tool checks `offered()` again on the server for every call and uses the module's own reach: `studentScope`, `mayViewStudent`, `homeworkScope`, `approvalsFor` (campus), and `calendarItems` with the person's campus. Arguments are cleaned.
  - A conversation loads only by `userLoginId`. The enquiry card takes the plan from the server-stored conversation, and "Yes" runs `inSchool("create")`.
  - Replies show as plain text, and links are built by the code only. So a student name, note or message that holds instructions can at most change words on the person's own screen.
  - Logs never carry the person's words or the AI key (the key goes in a header).
- **Sign-in and two-step codes:**
  - Codes are stored as hashes and compared with `timingSafeEqual`.
  - Each try is counted in one statement before the comparison: 5 tries per code, 20 checks per login per 15 min, 5 sends per 15 min.
  - A code works once (a conditional update).
  - Every sign-in gets a new random session token, stored as a hash, so session fixation is not possible.
  - Changing a contact (phone or email) has the same checks.
- **Parent Link:**
  - The token is worked out from the link id with HMAC, and its format is checked before a timing-safe compare. A random token shows the not-found page (local).
  - Tap secrets are 144 bits, stored as a hash, work once and expire.
  - "Messages from the school" shows only the guardian's own rows, and only on a confirmed phone. It hides any row that names a child the guardian may not see now. The staff preview needs school-wide Communication access and the campus filter.
  - Link codes typed into a message are removed (`stripTypedLinkCodes`). When a message goes out, any Parent Link or receipt code that does not belong to that recipient is also removed (`ownCodesOnly`), and this covers template text too.
- **Payments / Razorpay:**
  - The webhook needs the school and gateway ids and a valid signature over the raw body with that school's secret. A refused signature is written to the audit log.
  - Local: a POST without the school and gateway ids gives 404 "Unknown webhook address", with or without a fake signature. Source: a wrong signature gives 400 and an audit line, and an amount that differs from the order is audited (`src/lib/fees/online.ts`).
  - The parent receipt PDF (`/p/.../fees/<id>`, `/r/<key>`) checks the guardian's child or an HMAC key, and it is rate limited.
- **Files:**
  - Links are signed and expire: a forged link gives 403 (local).
  - Files are served with `nosniff`, and every type except PDF gets a CSP `sandbox`. A document that has been withdrawn stops its sharing link.
- **Pickup tap to approve:**
  - The ask, check and release actions pass the person's campus (`limit: w.current`).
  - At most 3 requests per guardian and child in 10 minutes. An approval is used once, and a "No" blocks the release.
- **Unauthenticated endpoints (local):**
  - The messaging webhook without a signature gives 401. The attendance punches, transport driver and `/api/v1/me` routes give 401.
  - The push open route sends a signed-out person to sign-in, and its link goes through `safeLink`.
- **Headers on the local app:** HSTS (preload), `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `nosniff` and `Referrer-Policy` are all set.

### Tests run (worker 3, related files only)

`node qa/vitest-worker.mjs 3 tests/isolation.test.ts tests/campus-guard.test.ts tests/permissions.test.ts tests/assistant/speak.test.ts tests/assistant/tools.test.ts tests/parent-link/tap-confirm.test.ts tests/front-office/pickup-tap.test.ts tests/auth-races.test.ts`
was started at 19:27 on a laptop shared by 8 agents. At 20:08 it had finished only two files:
- `tests/campus-guard.test.ts`: 3 passed, 3 skipped, none failed.
- `tests/auth-races.test.ts`: **1 of its 6 tests failed.** Which one and why was not yet printed (the run was still going). This file was not changed today. It runs 8 to 12 sign-ins or code checks at the same moment against the database, and the shared machine was heavily loaded (55.8 s for the file), so load is a possible cause. It is NOT proven to be load: the lead must re-run `node qa/vitest-worker.mjs 3 tests/auth-races.test.ts` on a quiet machine before the deploy. If it fails again, it is a sign-in lock or code-try race, and that blocks the release.
- `tests/assistant/speak.test.ts` (finished by 20:23): **all 8 tests were skipped, none ran.** A whole file skipped usually means its setup failed, and with the auth-races failure the test environment itself may be broken (perhaps the 19:32 `next` upgrade in the shared node_modules, or the overloaded database). So neither result says anything yet about the code. Re-run both files on a quiet machine.
- `tests/assistant/tools.test.ts`: **1 of 9 failed** (108.8 s).
- The run ended at about 20:26 with exit code 1 and no summary line, so it was cut short. `tests/isolation.test.ts`, `tests/permissions.test.ts`, `tests/parent-link/tap-confirm.test.ts` and `tests/front-office/pickup-tap.test.ts` printed no result: **they are unverified in this pass.**
- In short: this run under load proves nothing either way. Before the deploy, the lead's full run (or a quiet re-run of these 8 files) must show isolation, permissions, auth-races, assistant speak and assistant tools passing.

### Not covered in this one-hour pass

- A full sweep of the 115 changed `actions.ts` and route files for `requireAction()` and the campus filter. The static guards (`tests/campus-guard.test.ts`, `tests/permissions.test.ts`) were run; there was no time to read each file by hand.
- Run-3's "not checked yet" areas: import file actions on another campus's file, the Events list and day pages, the Settings audit, login and export logs for one-campus people, Finance for one-campus people, salary advance recovery after a cash repayment, and Settings invites for a login shared by two schools.
- Run-3's 5 open questions (bulk discount rule, removing a whole unpaid fee row, double undo of a past-receipts import, which campus an import batch belongs to, Staff & HR "Reset password" reach) still need the owner's answers if they are not answered yet.

## Lead: checks for the deploy (commit c4026ca8)

- Production build on the SSD copy: PASSED 20:43 (Next.js 16.4.6, Turbopack).
- Type check (tsc --noEmit): 0 errors, 20:51.
- Lint: 0 errors, 78 warnings (unchanged), 20:58.
- Robot button against the bottom Save bar on Take Attendance, new local build: no overlap at 280, 390 and 1440 px, light and dark (qa-output/final/robot/robot-*.png).
- Local crawl before the pause: School Admin 50 screens, 0 problems; Accountant 99 screens, 3 rows to re-check (HTTP 500 on /dashboard and /salary-management/structures during the overload, React error 441 on Day Book close).
| Principal | Assistant (deploy 25): "Explain me about the software how to use it in Telugu" | Answer: "నమస్తే అండి! Attendance, fees, homework, calendar, approvals గురించి ఏదైనా అడగండి." Only a greeting; it does not explain how to use the software. The panel itself switches to Telugu (title, status, Ask button, suggestion chips in Telugu-English mix). | Medium (fix said to be in the next deploy) | Robot > type the question |
| Principal | Assistant panel | Right after that answer the robot picture was gone for a moment (only two eyes and a smile on the purple panel, status "సంతోషంగా!"); it came back about 3 s later. Seen once, on a very slow laptop. | Low | Ask a question, watch the robot while the answer arrives |
| Accountant | Reception Desk (Front Office) at 9:04 PM | Card "Appointments today 1 · Next: 10:00 AM, Venkatesh". At 9 PM a 10:00 AM appointment is not "next"; it was missed or is waiting to be closed. | Low | Front Office > Reception Desk in the evening |
| Accountant | Fees > Defaulters | The Assistant (robot) button covers the "Collect" button of a defaulter row at the bottom right (only "Colle" is visible) at the normal scroll position, 1536 x 720. | Low | Fees > Defaulters, do not scroll |
| Accountant | Fees > Collect Fee vs Student Fee Ledger | The same starting list is headed "OVERDUE THE LONGEST, OLDEST DUE FIRST" on Collect Fee (clear) and "MOST OVERDUE" on Student Fee Ledger (unclear). | Low | compare the two tabs |
| Accountant | Reports > All Reports | Blue line says "Money reports only. Fees, Finance and Salary", but the list also has Students 6, Inventory 14, Front Office 1, Events 1 (50 reports from 7 modules). | Low | Reports as Accountant |
| Accountant | Fees > Concessions & Refunds > New concession | After closing the dialog with X the address still ends with `?do=new`; a refresh opens the dialog again (same as `?edit=personal` on Staff Profile). | Low | New concession > X > F5 |
| Accountant | Dashboard "Needs your attention" vs Salary | Dashboard: "4 staff members have no salary structure … Also 5 people who left this month." Salary page: "2 of 11 · 9 missing". The dashboard explains the 9 (4 + 5 who left); the Salary page does not. | Low (same root as the Salary row above) | Accountant Dashboard, then Salary |
| Class Teacher | Dashboard "Needs your attention" | "Attendance for Class 1 A was not taken. It locked at 11:00 AM. Ask for a correction." but the button says "Take attendance". The button should say what it does now ("Request a correction"). | Low | Class Teacher Dashboard after 11 AM with attendance not marked |
| Class Teacher | Events > School Calendar | The "Only yours" tag sits next to the line "The whole school's calendar". The two contradict each other. | Low | Events as Class Teacher |
| Class Teacher | My salary slips | Top line says "total earnings ₹52,500, deductions ₹8,550"; the Tax summary beside it says "Gross paid ₹50,750" (and the salary run shows deductions ₹6,800). Both are right (1 unpaid day = ₹1,750) but nothing says so; a teacher sees two different gross figures. Robot button also covers the end of the Form 16 note at the bottom right. | Low | My salary slips as KUSUMA |
