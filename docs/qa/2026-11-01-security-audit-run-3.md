# Security check, run-3 (1 November 2026)

A short summary for the School OS owner. The full reports stay outside the repo in the audit folder (security-audit-skill/School-OS/run-3).

## What was checked

- A quick, scoped check. It is a **partial pass, not a full audit**.
- It looked at two things: the 8 areas the last check (run-2) did not reach, and whether the fixes made after run-2 really work.
- Code at commit aad4a87f. Nothing was run. The check only read the code, because this laptop has no safe sandbox. No live site or shared service was touched.

## The short answer

- **Most of run-2's fixes work.** 12 of run-2's 16 items are closed. The other 4 are only partly fixed: the Settings import download (problem 1), the Events actions (problem 3), and the fee row and Reset password questions (questions 2 and 5).
- One school still cannot see another school's data. Every new item is inside one school.
- **8 confirmed problems:** 1 medium, 7 low.
- **5 open questions:** 4 need your decision and 1 needs a test before anyone can say whether they are problems.

## Confirmed problems (fix these)

| # | How serious | What is wrong | Smallest fix |
|---|---|---|---|
| 1 | medium | Settings import 'Rows with problems' download gives raw student and staff rows, Aadhaar included, to people with only Own reach | In src/lib/imports/places.ts, add the kinds whose module place is narrower to OWN_RULES: "students", "students-update", "students-udise" and "consent-paper-forms" -> "students"; "staff" -> "staff"; "admission-enquiries" -> "enquiries". The Settings route src/app/(school)/settings/data-security/imports/[id]/errors/route.ts (line 26) then applies placeRefusal for them, and the Settings Imports page and Switching uploads follow the same list. |
| 2 | low | Survey answers export gives a one-campus person another campus's (or a whole-school) survey answers with names | In src/app/(school)/communication/surveys/[id]/export/route.ts line 26, replace tx.survey.findFirst({ where: { id, schoolId, archivedAt: null } }) with loadSurvey(tx, current.ctx, id, current.campusId) and return 404 'Not found.' when it is null. |
| 3 | low | One-campus Events staff can see and register alumni of every campus, and tag or name any student, through Events actions | In src/app/(school)/events-calendar/actions.ts, call assertEvStudents on studentIds in registerAction and tagAction, and check the person's campus in volunteerAction (assertEvCampus for a student, a campus check for a staff member). In src/lib/events/events.ts eligible() (lines 259-262) and the register sheet in events/[id]/page.tsx (line 102), add campusId: e.campusId for the alumni audience when the event has a campus. |
| 4 | low | Event and album pages show a one-campus person other campuses' students, their fee state and consent | In src/app/(school)/events-calendar/events/[id]/page.tsx (lines 49-62) and gallery/[id]/page.tsx (lines 55-65), when evCampus(tx, p.current) returns a campus, keep only students with that campusId before loading names, classes, fee states and consent. In gallery/[id]/page.tsx line 50, replace the date-only academicYear.findFirst with evYears(tx, isoOf(a.date), p.current). |
| 5 | low | A student login can create Discussion boards, including a whole-school board that every student sees | In src/lib/homework/discussions.ts, call requireStaff(s) at the start of createBoard (line 44), as other student-refusing writes do. |
| 6 | low | Hostel, Library and Transport actions accept another campus's student or staff member from a person limited to one campus | Where the record is loaded by id, refuse it as 'not found' unless campusAllows(current, record.campusId): in allocate (src/lib/hostel/allocation.ts line 199), in memberOf / memberByKey (src/app/(school)/library-management/actions.ts lines 26-27, src/lib/library/members.ts lines 123-127) and in assignStudents and the other Transport student actions (src/lib/transport/places.ts line 99). Pass the campus limit to memberRows for the Library Members list. |
| 7 | low | Guardian merge search shows parents and children of other campuses to a one-campus student manager | In src/app/(school)/student-management/guardians/[id]/merge/page.tsx (lines 35-39), add the same student scope that visibleGuardianFor uses (src/app/(school)/student-management/guardians/load.ts lines 20-22) to the guardian.findMany where, and narrow the included children to that scope. |
| 8 | low | Staff & HR can close the School Admin's and Principal's logins at once by recording a resignation, even the last School Admin | In src/lib/staff/exit.ts: in startExit (line 55), refuse (or send to an approval decided by a School Admin) an exit whose leaving login holds a top role (isTopRole) when the recorder cannot manage users (managesUsers); in finishLastDay (lines 220-245), run the same 'at least one School Admin must remain' guard as keepOneAdmin in src/lib/settings/users.ts (lines 91-97) before disabling the login, and let the daily last-day job skip that login and alert the School Admin. |

Most of these are the same kind of slip: a person limited to one campus can reach another campus's students or parents, because one action, page or download skips the campus check that its neighbours use.

## Open questions (not confirmed problems)

1. **The Accountant can switch on a bulk discount rule of up to 50% that is applied at the counter with no concession limit or approval.** Your decision: who may create and switch on a bulk discount rule, and must a bulk discount above the concession limit wait for the Principal's approval?
2. **Removing a whole unpaid fee row still needs no approval, whatever its amount, so the L1 concession limit can be dodged.** Your decision: must removing a whole unpaid fee row (or removing it and adding a smaller charge) follow the concession limit and wait in Approvals, or is it the normal 'change the plan' step? Please also confirm the overnight L1 rule.
3. **Undoing a 'Fee past receipts' import twice at the same moment puts the paid amount back on the family's dues twice.** Needs a test, not a decision: the code path is clear, but the double-click race was not run (no sandbox). Run the race test in NEEDS-VALIDATION.md on a test database, and check that the database uses PostgreSQL's normal 'read committed' setting. Likely fix: mark the import as undone with a one-time conditional update before undoing (src/lib/importer.ts), and claim each receipt once under the lock (src/lib/fees/import.ts).
4. **A one-campus import user can see and download another campus colleague's import rows (skipped rows and rows with problems).** Your decision: which campus does an import batch and its skipped rows belong to (the importing person's campus, the rows' campus, or the whole school)?
5. **Staff & HR 'Reset password' still makes and shows a sign-in link for some logins above the HR person's own: Settings exceptions and other schools are not checked.** Your decision: may Staff & HR reset the password of a login that has a Settings exception, or that also works in a sister school? Please also confirm the overnight L5 rule.

## Not checked yet

- 5 areas were found but not checked in this run: other import file actions (fix, import, remove on another campus's file), the Events list and day pages, the import error downloads of the other modules, the Settings audit, login and export logs for one-campus people, and salary advance recovery at payroll approval after a cash repayment.
- 2 more areas are outside this run: Finance for one-campus people, and Settings invites for a login shared by two schools of a group.
- Everything else was out of scope this time.

Next step: fix the 8 confirmed problems, answer the 5 open questions, then run a run-4 on the areas not checked yet.
