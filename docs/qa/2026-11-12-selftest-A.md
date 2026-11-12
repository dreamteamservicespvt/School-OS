# Self-test A, 12 Nov 2026: Salary, Finance, Front Office, Events & Calendar, Reports

Tester: Claude (QA self-test A), 14:55-16:00 IST. Build: fresh production build on :3000 (from
C:\Users\chala\sos-build, up 14:59:55). Roles: principal, accountant (Salary and Finance only),
reception. Browser: headless Chrome 1440 x 900 via Playwright, real clicks and typing.
Scripts: `qa/full/selftest-A-*.mjs` (helper `selftest-A-h.mjs` signs in once per role and reuses the
session). Screenshots and text dumps: `qa-output/2026-11-12-A/` (168 PNG files, 1440 px).

Counts below are real check counts from the scripts. "Script" fails were my test's mistake, then
re-checked by hand; they are not app problems and are listed so the numbers add up.

## Summary

| Area | Checks | Pass | Fail (app) | Fail (script, re-checked OK) |
|---|---|---|---|---|
| Every screen opens (tour: principal 31, accountant 18, reception 6) | 55 | 55 | 0 | 0 |
| 1a Salary Management (flow + slip probe) | 23 | 20 | 1 (A5) | 2 |
| 1b Finance Management (flow) | 39 | 37 | 0 | 2 |
| 2 Front Office (two flows) | 18 | 14 | 2 (A1) | 2 |
| 3 Events & Calendar (flow + 2 probes) | 13 | 8 | 1 (A4) | 4 |
| 4 Reports & Analytics (100 reports, 32 Excel + 32 PDF, search) | 167 | 166 | 0 | 1 |

Problems: **1 High** (A2), **5 Medium** (A1, A3, A4, A5, A13), **8 Low** (A6-A12, A14).
Fixed in code (needs a rebuild to recheck): A1 (`4f78da07`), A6 (`e910a2e6`).

## 1a. Salary Management (accountant, principal)

- PASS Every Salary screen opens for principal and accountant (Generate, Structures, Slips, History, Advances, Settings, Import).
- PASS Opening October 2026 again is refused: "October 2026 salary already exists for Main Campus. Open the existing one".
- PASS Add adjustment with nothing filled is refused; with no reason it is refused (reason required).
- PASS Double click on "Add adjustment" made one adjustment (₹500 bonus, reason kept).
- PASS Totals add up: PF 56,199 + ESI 1,029 + PT 6,400 + TDS 7,400 + loans 3,000 = deductions 74,028; gross 11,18,870 - 74,028 = net 10,44,842.
- FAIL (A5) Net pay went up by ₹1,120 after a ₹500 bonus, with no note why.
- PASS Send for approval (double click) → Waiting for approval. Approve sheet shows net, gross, deductions, school's PF/ESI share in plain words.
- PASS Principal approved (status Approved, "approved by Lakshmi Rao"); approval took more than 7 s (A7).
- PASS 33 slips made. Slip for Lakshmi Rao: earnings add to ₹1,33,000 (incl. "Bonus: QA self-test A: sports day duty ₹500"), deductions ₹8,200, net ₹1,24,800, amount in words correct. Slip PDF downloads (%PDF, 76 KB).
- PASS Mark paid by bank transfer with no UTR is refused; bank transfer file (xlsx) downloads; marked Paid ("Paid Thu 12 Nov").
- PASS Day Book today shows Salary "1 entry · ₹10,44,842" = net pay, once; total expense includes it.
- PASS PF statement (text) and ESI statement (xlsx) download; month export xlsx, csv, pdf download.
- PASS Reports & Analytics "Salary register" October row = Generate Salary (gross 11,18,870, deductions 74,028, net 10,44,842, employer PF 56,199, ESI 4,446). September shows Locked after October was approved (as designed).
- Script fails, re-checked: "Principal approved" read the page while the sheet still said "Saving…" (approval did go through); "slip PDF link" looked for the wrong link (PDF is inside "Open" on each slip, checked by hand).

## 1b. Finance Management (accountant)

- PASS Day Book, Income, Expenses, Cash & Bank, Finance Reports, Finance Settings, Expenses import open for principal and accountant.
- PASS Record expense with nothing filled: "Amount is needed." and the other fields marked.
- PASS Expense ₹2,999 with no bill photo is refused: "Attach the bill for amounts over ₹2,000." (blueprint rule), and nothing was saved after a double click.
- PASS Expense ₹25,000: the form says "Goes to Principal" and the button changes to "Send to Principal".
- PASS Record income with nothing filled is refused; ₹1,234 hall rent in cash posted once after a double click.
- PASS Day Book total income moved by exactly ₹1,234 (11,000 → 12,234; "Fees ₹0 + Partial ₹11,000 + Other ₹1,234"); net balance = income - expense (−₹10,32,608).
- PASS Day Book export xlsx, csv, pdf download.
- PASS Finance Reports: 9 reports open (income-expense, profit-loss, department, expense-analysis, pending-expenses, books, day-book-summary, budget-actual, trial-balance); 7 have Excel and PDF, all download.
- FAIL (A2, High) Cash in hand and bank balance differ between Cash & Bank and the "Cash book and bank book" report.
- FAIL (A3) Bank balance is negative with no warning; salary of ₹10.44 L was marked paid from it.
- Script fails, re-checked: Day Book for 31-10-2026 used the wrong address (`?date=`; the page uses `?day=`); "Move money empty" did not find the button name. Not app problems; Move money and past dates were not tested (see Untested).

## 2. Front Office (reception)

- PASS Reception Desk, Visitors, Student Pickup, Enquiries & Calls, Appointments, Postal & Deliveries open.
- PASS New enquiry: empty form refused ("Enter the child's name."), 5-digit phone refused, saved once after a double click (ENQ-0042, owner Divya Menon, follow-up 13 Nov 11:00 AM), "Enquiries today" went to 1.
- PASS Same child and phone again warns: "This family may already be with Admissions: This phone already has an open enquiry for Qa Child 0935 (Nursery)".
- PASS Log a call: Complaint with no note refused; save button reads "Save call and enquiry" for an admission enquiry.
- FAIL (A1) Log a call with "Set a follow-up" on is refused with the defaults after 11 AM; the call and its enquiry were not saved.
- PASS Log a call without follow-up (Fee): saved once after a double click, "Calls today 1, 1 incoming".
- PASS Walk-in request: empty refused; saved once with its REQ number, shown on the desk.
- PASS Postal: empty received item refused; received item saved once after a double click ("At the desk" 3 → 4).
- PASS Book appointment: empty refused; booked 8:45 AM Fri 13 Nov with the Principal; booking again shows 8:45 AM struck out (taken), so it cannot be double-booked.
- Script fails, re-checked: postal "saved once" counted the sender name twice (notice line and table; "At the desk" went up by one); postal "hand over with no collector" — the sheet fills "Collected by" with the person it is for, so my "empty" click handed it over; a second click then said "Not at the desk: … already handed over" (correct).

## 3. Events & Calendar (principal)

- PASS School Calendar, Events, PTM, Co-curricular, Gallery, Daily Activities, Settings, Import open.
- PASS Add to calendar with no name: "Give it a name, like “Republic Day”." A wrong date shows "Type the date as DD-MM-YYYY, for example 14-05-2012."
- PASS Holiday "QA-A 0948 holiday" on 09-12-2026 added once after a double click; shows on the December calendar, the day panel ("Attendance is off") and the holiday list (Days 1).
- PASS Remove link is on the day panel (`?do=remove&entry=…`); the remove itself was not clicked (see Untested).
- PASS Create event with no name refused; end time before start refused ("The end time is before the start time.").
- PASS Create event filled correctly in one go: saved, sheet closes, shows in "Coming up" on the calendar (QA-A probe Science Fair, 2 Dec).
- FAIL (A4) Correcting the end time after that error: the new time is added to the old one in the box and the event is saved with no end time.
- Script fails, re-checked: my first two runs typed dates as YYYY-MM-DD (the app wants DD-MM-YYYY, and says so) and the event list check depended on that.

## 4. Reports & Analytics (principal)

- PASS Catalogue: "100 ready reports from 17 modules"; search "salary" narrows; search "zzqqxx" says "0 reports match … No report matches … Try a shorter word" (the script missed the text the first time).
- PASS All 100 reports open with no error, no failed request (23 show a plain empty notice, the large ones say "This is a large report … Prepare the report").
- PASS Excel (xlsx) and PDF download for every third report: 32 of 32 and 32 of 32.
- PASS Analytics, Early Warnings, Government Reports, Custom & Scheduled open.
- PASS Salary register matches Generate Salary to the rupee (see 1a); Day Book report shows the same financial-year words as Finance.
- FAIL (A6, fixed) Filter line says "All campus".

## A1. Log a call: "Set a follow-up" refused with its own defaults after 11 AM (Medium) — fixed in code, needs rebuild to recheck

Steps: reception → Front Office → Enquiries & Calls → Log a call. Phone, name, purpose "Admission enquiry", child, class, note. Switch on "Set a follow-up" and leave Date (today) and Time (11:00) as they are. Save call and enquiry. (At 3:05 PM.)
What happened: the sheet stays open: "The follow-up must be later than now." Nothing saved (no call, no enquiry). A receptionist has to notice the time box and change it.
Should happen: the default follow-up is in the future. The Follow-up sheet on an existing call already used "about an hour from now"; the call sheet had a fixed 11:00.
Fix: `followUpStart()` in src/lib/front-office/words.ts (an hour from now on the half hour, or 10:00 next day late in the evening), used by both sheets; test tests/front-office/follow-up-start.test.ts. Commit `4f78da07`.
Screenshot: qa-output/2026-11-12-A/fo-calls-after.png (call log with no call), text in fo.txt "AFTER CALL".

## A2. Cash in hand differs between Cash & Bank and Finance Reports (WITHDRAWN: not a bug, my test caused it)

**Root cause (traced 12 Nov, 16:00):** both screens read the same Day Book entries (`accountBalances` and
`accountBook` in src/lib/finance/daybook.ts) and agree. Between my two readings, my own finance script opened
Cash & Bank → "Move money", which is prefilled for a cash deposit ("Move ₹12,58,185", cash to the main bank),
and clicked the button to test an empty save. That recorded a real deposit of ₹12,58,185 at 15:15
(one cash_transfer, one OUT entry in cash, one IN entry in the bank). Rechecked at 16:00: Cash & Bank shows Cash
in hand ₹17,234 and Main bank −₹24,36,363; the "Cash book and bank book" report shows the same, ₹17,234 and
−₹24,36,363 (qa-output/2026-11-12-A/a2-recheck-cash-bank.png, a2-recheck-books-report.png). No code change.
Note: the local database now holds that ₹12,58,185 deposit dated 12-11-2026.

Original (wrong) report kept below for the record.

Steps: accountant → Finance Management → Cash & Bank; then Finance Reports → "Cash book and bank book" (2026-27 so far).
What happened: Cash & Bank: Cash in hand ₹12,70,419, Main bank account −₹36,94,548. The report: Cash in hand closing ₹12,234, Main bank account −₹24,36,363. The totals agree (−₹24,24,129) but ₹12,58,185 sits in cash on one screen and in the bank on the other. ₹12,58,185 is exactly "Cash in the box from before today" on Cash & Bank, which asks to "Record deposit"; the report shows cash payments of ₹12,89,100 (it says payments include cash moved to the bank).
Should happen: one answer for "how much cash is in the box". An accountant counting the cash box cannot tell which screen is right.
Screenshots: qa-output/2026-11-12-A/accountant-finance-management-cash-bank.png, finance-report-books.png. Not fixed (needs the cause traced: deposits or cash expenses counted in one book and not the other).

## A3. Bank balance negative with no warning; salary paid from it anyway (Medium)

Steps: Cash & Bank shows Main bank account −₹26,49,706 before the salary. Salary → Mark October paid → bank transfer from the main bank account.
What happened: no warning on the pay sheet; the bank went to −₹36,94,548. The tile shows a minus balance with no words; "Opening balances: Not set yet" is in a side card.
Should happen: as for cash (blueprint 07 §5 "Cash in hand is ₹1,200. This payment is ₹3,000."), warn when a bank payment takes the bank below zero, and on the tile say why it is negative ("Opening balance not set").
Screenshot: accountant-finance-management-cash-bank.png, salary-paid.png.

## A4. Event time box: correcting the end time after an error adds to the old text; event saved with no end time (Medium) — needs a person to recheck

Steps: Events → Create event. Name, date 03-12-2026, From 11:00, To 10:00 → Create: "The end time is before the start time." (correct). Click in To, select all (Ctrl+A), type "1:00 PM", Tab, Create event.
What happened: the To box showed "10:00 AM:00 PM"; the event was created with no end time ("QA-A retry3 Fair, Thu 3 Dec, 11:00 AM" and no end). Playwright `fill("13:00")` into the same box also left "10:00 AM", and the error stayed.
Should happen: the typed time replaces the old one, or the form refuses a time it cannot read; never save silently without the time the person typed.
Screenshots: events-create-after-retry.png. Script: qa/full/selftest-A-ev3.mjs. Ctrl+A in this custom time box may behave differently from a mouse select; please recheck by hand.

## A5. Adding a ₹500 bonus moved net pay by ₹1,120 with no explanation (Medium)

Steps: accountant → Generate Salary (October, Calculated, net ₹10,43,722) → Add adjustment, Lakshmi Rao, Bonus ₹500, reason.
What happened: net became ₹10,44,842 (+₹1,120) and gross +₹1,120. The line "Attendance and approved leave up to 31-10-2026, 9:39 AM" changed to "up to 12-11-2026, 3:09 PM": saving the adjustment also pulled in attendance and leave since then (+₹620 from other staff). The screen does not say anything changed besides the bonus.
Should happen: when an adjustment also recalculates, say so: "Recalculated with attendance up to 12-11-2026, 3:09 PM: net pay changed by ₹620 besides your ₹500 bonus", so the accountant can check before sending.
Screenshot: salary-after-adjustment.png; text in salary.txt "AFTER ADJ".

## A6. Report filter line says "All campus" (Low) — fixed in code, needs rebuild to recheck

Steps: Reports & Analytics → any report (e.g. Salary register) in a two-campus school.
What happened: "Showing: Whole school · This financial year … · All campus." The same code would print "Main Campus campus" when a campus named "Main Campus" is chosen. It is printed on the screen and on every file.
Fix: `campusWords()` in src/lib/reports/filters.ts ("All campuses", no doubled word); test tests/reports/campus-words.test.ts. Commit `e910a2e6`.
Screenshot: principal-report-sa-register.png.

## A7. Approving the month's salary takes more than 7 seconds with only "Saving…" (Low)

Steps: principal → Generate Salary → Approve salary → Approve salary for 33 staff.
What happened: the sheet showed "Saving…" for more than 7 s (33 slips made, staff told). A principal may click again or leave.
Should happen: faster, or words while it works ("Making 33 salary slips…").
Screenshot: salary-approved.png.

## A8. "Each staff member was told" but Salary Slips says "Sent 0, Not sent 33" (Low)

Steps: after approval, read the Approved banner, then open Salary Slips.
What happened: banner: "33 salary slips are made and each staff member was told." Slips page: "Sent 0 · Not sent 33 · send or print them".
Should happen: one meaning. If "told" is an app notice and "sent" is the slip itself, say "each staff member got an app notice; send the slips from Salary Slips".
Screenshot: salary-slips-after-approve.png.

## A9. Desk says "No follow-ups due today", Enquiries says "Follow-ups due today 1" (Low)

Steps: reception → Reception Desk ("Calls and enquiries 0 calls · 0 enq. · No follow-ups due today") → Enquiries & Calls ("Follow-ups due today 1 · Lakshmi Agarwal").
Should happen: same count on both, or say which follow-ups (calls vs enquiries). Also write "enquiries", not "enq.".
Screenshots: reception-front-office.png, reception-front-office-enquiries.png.

## A10. Small wording and format slips (Low)

- Front-office notes: "Suresh Kumar, 31 Oct, 7:40" has no AM/PM; the note above says "1:40 PM" (reception-front-office.png).
- The Principal is "Lakshmi Rao · Principal" in the call "Who" list but "Lakshmi Rao (Principal)" in the postal "For" list (fo.txt).
- Calendar: "Copy last year’s holidays" (curly apostrophe) and "Copy last year's holidays" (straight) on the same page (src/app/(school)/events-calendar/page.tsx lines 272 and 282).
- Salary month table: TDS shows "0" for most staff while other empty columns show "—" (salary-approved.png).

## A11. Finance "Accounts" and "Budget" addresses open the Day Book with no message (Low)

Steps: open /finance-management/accounts or /finance-management/budget (principal or accountant).
What happened: the Day Book opens; nothing says these parts are switched off for the school.
Should happen: a short notice ("Accounts is switched off in Finance Settings") like other switched-off features.
Screenshots: accountant-finance-management-accounts.png, accountant-finance-management-budget.png.

## A12. Reports search with no match still shows full category counts (Low)

Steps: Reports & Analytics → search "zzqqxx".
What happened: "0 reports match" but the category list still shows "Inventory 14, Hostel 8, Transport 7…".
Should happen: counts follow the search (all 0) or hide.
Screenshot: reports-search-nomatch.png.

## A13. "1 staff has no salary structure" while 6 have none (Medium)

Steps: Generate Salary, October.
What happened: the top card says "Salary structures 33 of 39 · 6 missing · Vani Singh, Ramesh Goud"; the "Check before sending" flag says "1 staff has no salary structure: Vani Singh". The table lists 6 people as "Not paid until a salary structure is added" (Vani Singh, art teacher, and five drivers and attendants starting with Ramesh Goud).
Should happen: the flag that the accountant reads before sending should count all 6 (blueprint 10 §5: "3 staff have no salary structure"). Otherwise 5 drivers and attendants can go unpaid unnoticed.
Screenshot: salary-approved.png (table), principal-salary-management-generate.png (flags).

## A14. The Principal approves a payroll with a bonus to herself, with no notice (Low, owner decision)

Steps: accountant adds a ₹500 bonus to Lakshmi Rao (Principal); Lakshmi Rao approves the month.
What happened: approved with no mention that the approver's own pay has an adjustment.
Should happen (suggestion): show "Includes an adjustment to your own pay" on the approve sheet, or send such a month to a second approver. Owner to decide.

## Untested and why

- Events: edit and cancel of an event, PTM, Gallery, Co-curricular, Daily Activities forms; removing the holiday (the link exists; the click was not run). Time.
- Front Office: Student Pickup release (needs a guardian code and photo check), visitor register (covered by earlier j9-visitor), postal "sent" item.
- Finance: Move money, Record deposit, opening balances, vendor bills, a paid expense with a bill photo (upload not scripted), Day Book for a past date (`?day=`), Day Book Print view.
- Salary: Structures add/revise/increment, Advances & Loans, Lock and Reverse payment, Salary Settings changes.
- Reports: Excel/PDF for 68 of the 100 reports (every third one was downloaded), scheduled and custom reports, Government reports downloads, Print views.
- Phone widths (390 px) and dark mode: not in this run (1440 px only).

## Data this test left in the local database

October 2026 salary (Main Campus) is now Approved and Paid on 12-11-2026 (₹10,44,842, UTR QAUTR20261112A, ₹500 bonus to Lakshmi Rao), so today's Day Book expense includes it. Income ₹1,234 "QA-A … hall rent" (cash). Enquiry "Qa Child 0935" (ENQ-0042), calls "QA Caller …", a walk-in request, a postal item "QA Courier Sender 0956" (handed over), appointment 8:45 AM Fri 13 Nov with the Principal, holiday "QA-A 0948 holiday" on 09-12-2026 (attendance off that day), events "QA-A probe Science Fair" (2 Dec) and "QA-A retry… Fair" (3 Dec).

Note: one `npx vitest run` of a single test file started the global test setup (it rebuilds the test
database school_os_test) and failed; if another tester's `npm test` was running at 15:22-15:25 it may
have been disturbed. The two new tests were then run with a database-free config: 7 of 7 pass.
Typecheck after fix A1: clean.

## Fixes after review (12 Nov, 15:45-16:45)

- **A2:** withdrawn, not a bug (see A2): my script recorded a ₹12,58,185 cash deposit between the two readings. Both screens now agree (₹17,234 cash, −₹24,36,363 bank).
- **A13 (fixed in code):** root cause: the pre-send check counted only the month's saved lines. Five drivers and attendants were added after October was last calculated, so they had no line yet. The top card counted them (live) and the check did not. Now `staffWithoutStructure()` (src/lib/salary/words.ts) counts the flagged lines plus staff with no structure who have no line yet. It names them, and says "N of them were added after the last calculation: Recalculate to bring them in." Test: tests/salary/self-test-a-words.test.ts.
- **A5 (fixed in code):** `addAdjustment` now works the month out first, then adds the adjustment, and returns how much net pay changed besides it. The saved message adds: "Net pay also went up by ₹620 because attendance and leave up to 12-11-2026 were brought in." Test: tests/salary/self-test-a-words.test.ts (wording).
- **A4 (fixed in code, partly):** the time box used to send an empty value when its text could not be read. An optional end time was therefore dropped silently. It now sends the text as typed (`sendUnreadable` in src/components/ui/date-input.tsx, time box only), so the server refuses it with "Enter the end time like 10:30.". Test: tests/events-calendar/self-test-a-time.test.ts covers the box and the server parsers. Not fixed or explained: why Ctrl+A then typing "1:00 PM" gave "10:00 AM:00 PM", and why Playwright `fill("13:00")` after the error left "10:00 AM". That needs a person in a browser after a rebuild.
- **A14 (owner decision, fixed in code):** `sendForApproval` passes the logins of every staff member with an adjustment in the month as `aboutUserIds`, so `requestApproval` never routes it to them. A month with a bonus for the Principal goes to the School Admin, and the Principal cannot approve it. Test: tests/salary/own-adjustment-approval.test.ts.
- All of these need a rebuild of the :3000 server before they show in the browser.
- Commits: `b8b52e57` (A13, A5, A14), `0d74ae01` (A4). Tests on worker 4 (`node qa/vitest-worker.mjs 4 …`): the 6 files `tests/salary/self-test-a-words.test.ts`, `tests/salary/own-adjustment-approval.test.ts`, `tests/salary/payroll.test.ts`, `tests/events-calendar/self-test-a-time.test.ts`, `tests/front-office/follow-up-start.test.ts` and `tests/reports/campus-words.test.ts` passed, 33 of 33 tests. Typecheck (`tsc --noEmit -p .`): clean. ESLint on the changed files: clean.
