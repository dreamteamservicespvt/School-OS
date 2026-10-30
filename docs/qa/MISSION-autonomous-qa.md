# Autonomous QA mission (from the user, 2026-10-30, while asleep)

Do not ask the user anything. Decide yourself and write each decision in the round's report.
Local demo only. Local commits only; never push, deploy, or touch the live site, the Meta webhook or the gym setup.

## Goal
Find the maximum number of real-world problems in School OS and fix every one that is safe to fix:
reproduce → root cause → fix → regression test → rerun related tests → keep searching. No risky architectural
changes; anything that needs one is reported as NEEDS PRODUCT DECISION.

## Statuses (never fake a PASS)
PASS · FAIL · BLOCKED · NOT IMPLEMENTED · NEEDS EXTERNAL SERVICE · NEEDS PRODUCT DECISION.
A page loading, a button existing or code compiling is not a PASS. It must behave correctly.

## Who to be
Principal, School Admin, Accountant, Teacher, Class Teacher, Receptionist, Admission staff, HR, Transport,
Librarian, Store Keeper, Warden, Student, Parent (Parent Link); a new, busy, careless, confused, adversarial,
repeated, interrupted, concurrent, large-data and mobile user.

## What to try
- Bad input: empty, invalid, wrong dates, duplicates, zero, negative, huge, special characters, Unicode, long names.
- Double clicks/double submit, refresh during submit, back/forward, two tabs, concurrent edits and approvals,
  expired session, network failure.
- Look for: data corruption, duplicates, wrong totals, wrong permissions, false success messages, lost data,
  wrong reports, broken notifications, cross-school leaks, inconsistent states.

## End-to-end flows (check every connected place agrees: one source of truth)
- Admission → Student → Parent → Class → Fee → Attendance → Exams → Results → Communication.
- Fee payment → Receipt → Student ledger → Finance/Day Book → Dashboard → Reports → Parent view → Notification → Audit.
- Attendance → Absence → Parent notification → Attendance report.
- Exam → Schedule → Marks → Verification → Result → Report Card → Parent.
- Staff → Attendance → Leave → Salary/Payroll → Finance.
- Student transfer → Clearance → Fees → Documents → TC → Student status.

## Security
Role escalation, direct URLs, API routes, server actions, exports, downloads, search, hidden/archived records,
sensitive fields, unauthorized edit/delete/approve, two schools fully isolated. Never trust frontend-only checks.

## UX
Do I know where I am and what to do next? Are words school words (00-global.md §9)? Are dangerous actions
protected and errors understandable and recoverable?

## AI features (Ask, translations, any Gemini use)
Wrong/missing/contradictory input, invented school facts, wrong numbers, permission bypass, data leaks,
actions without authorization.

## Responsive
320, 375, 390, 414, 768, 1024, 1280, 1440, 1920 px: overflow, tables, modals, clipped text, touch targets, keyboard.

## Final verification
Lint, typecheck, npm test, build; then a final real-school run Principal → Admin → Accountant → Teacher →
Receptionist → Parent → Student.

## Already done (do not redo)
Round 1 report: docs/qa/2026-10-30-full-test.md (about 730 pages crawled for 8 school roles + console + driver,
role menus, isolation 14/14, journeys 10/10, looks 80 screens, 14 bugs fixed). Tools in qa/full/ (h.mjs,
look.mjs, crawl.mjs, looks.mjs, recheck.mjs ...). Round 2 should go deeper where round 1 was shallow:
breaking input, double submit, concurrency, totals agreeing across places, server actions called directly,
exports/downloads per role, 320/768/1920 widths, Parent Link and student views, AI features.
