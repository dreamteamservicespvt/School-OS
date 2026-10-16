# Academics QA defects (agent 3)

Area: Academic Management, Attendance Management, Examination & Results, Homework & Learning,
Events & Calendar, staff leave decisions and Year end. School: Chaitanya EM School (CEMS), and
Sunrise Public School for Year end (see the note at the end). Test rows: `qa/results/academics.jsonl`.
Scripts: `qa/academics/`. Fixes are on branch `worktree-agent-a5eca86a44a703077`. Each logic fix
has a vitest test. Each fix was checked again in the browser on the dev build (port 3103).

| ID | P | Module | Title | Status |
|----|---|--------|-------|--------|
| ACADEMICS-01 | P3 | Dashboard | Setup step "Holiday list" never done | fixed b3e1a1e |
| ACADEMICS-02 | P4 | Academic Management | Time Table draft claims a copy that did not happen | fixed fc7152e |
| ACADEMICS-03 | P2 | Attendance Management | Corrections accepted for future days, Sundays, holidays, other years | fixed d11b169 |
| ACADEMICS-04 | P2 | Attendance Management | Subject teacher could ask to change the class teacher's register | fixed d11b169 |
| ACADEMICS-05 | P2 | Platform (sign-in) | Sign-in rate limit keyed on a header the client writes | not fixed |
| ACADEMICS-06 | P3 | Academic Management | Closed-year correction pass could be hand-written | fixed 80150d1 |
| ACADEMICS-07 | P3 | Staff & HR Management | "Ask for a change" on staff leave is a rejection; no resubmit | NEEDS PRODUCT DECISION |
| ACADEMICS-08 | P3 | Examination & Results | Exam days on the School Calendar applied to the whole school | fixed 8da1256 |
| ACADEMICS-09 | P1 | Examination & Results | ML (medical leave) mark saved as AB (absent) | fixed 3baf281 |
| ACADEMICS-10 | P3 | Attendance Management | Save promised an absence message that is never sent | fixed fe10c8d |
| ACADEMICS-11 | P3 | Attendance Management | Two different attendance % for the same class and day | NEEDS PRODUCT DECISION |
| ACADEMICS-12 | P4 | Examination & Results | Marks change sheet named the wrong approver | fixed f8ca0e2 |
| ACADEMICS-13 | P1 | Examination & Results | Results could not be published from the screen | fixed f7d38cd |
| ACADEMICS-14 | P4 | Examination & Results | Publish button says "tell 35 parents" with no channel connected | not fixed |
| ACADEMICS-15 | P2 | Examination & Results | Report card attendance not taken from the register | fixed 81b47b1 |
| ACADEMICS-16 | P3 | Homework & Learning | Giving homework promised a WhatsApp message to parents | fixed a82b2fe + eb9a21d |
| ACADEMICS-17 | — | — | number not used | — |
| ACADEMICS-18 | P1 | Homework & Learning | A student saw classmates and parents on the homework details page | fixed a82b2fe |
| ACADEMICS-19 | P4 | Student Management | Student username repeats the school code | not fixed |
| ACADEMICS-20 | P4 | Homework & Learning | Server accepts homework already past its due date | not fixed |
| ACADEMICS-21 | P2 | Events & Calendar | With no WhatsApp/SMS, holiday "tell", event cancel and PTM cancel failed | fixed 93169a8 + 4e052f8 |

Totals: 21 defects. By priority: P1 3, P2 5, P3 8, P4 5. Fixed 15. Not fixed 6: 05, 14, 19 and 20, plus 07 and 11, which need a product decision.

---

## ACADEMICS-01 · P3 · Dashboard
- **Steps:** Sign in as cems.principal. Add holidays on the School Calendar. Open the Dashboard and look at the setup checklist.
- **Expected:** Step 10, "Holiday list", is done once this year has holidays.
- **Actual:** The step always showed as not done.
- **Root cause:** The step's check was hard-coded to `null` in the dashboard setup list.
- **Fix:** b3e1a1e. The step now counts this year's holiday and vacation Calendar Entries. A test covers it.

## ACADEMICS-02 · P4 · Academic Management (Time Table)
- **Steps:** Start a new Time Table draft for a section that has no published Time Table.
- **Expected:** The message says an empty draft was started.
- **Actual:** The message said the draft was copied from the published Time Table.
- **Fix:** fc7152e. The message now reads "Empty draft started" when there is nothing to copy.

## ACADEMICS-03 · P2 · Attendance Management (corrections)
- **Steps:** As cems.classteacher, send `requestCorrection` (crafted call) for each of these dates in Grade 5 A:
  - 01-12-2026 (in the future);
  - 11-10-2026 (a Sunday);
  - 02-10-2026 (Gandhi Jayanti);
  - 10-01-2025 (outside the year).
- **Expected:** Each one is refused in plain words, the same way Take Attendance refuses those days.
- **Actual:** Each one was created as WAITING in Approvals. If approved, it would have created attendance marks on days that are not school days.
- **Root cause:** `requestCorrection` did not check the date the way Take Attendance does.
- **Fix:** d11b169. The same date checks now apply: a school day that has come, inside an open year. Tested in tests/attendance. The Principal rejected the test requests through the screen.

## ACADEMICS-04 · P2 · Attendance Management (corrections)
- **Steps:** As cems.teacher (Science in 5 A, not the class teacher), send a correction request for Diya Patel's 13-10-2026 daily register mark (crafted call).
- **Expected:** Refused. Take Attendance already refuses this teacher for the daily register.
- **Actual:** Created as WAITING.
- **Fix:** d11b169. Only the class teacher, or someone with full access, can ask to correct the daily register. Tested.

## ACADEMICS-05 · P2 · Platform (sign-in)
- **Steps:** Send sign-in attempts with a different `X-Forwarded-For` header each time.
- **Expected:** The limit of 30 sign-ins per 10 minutes per address still applies.
- **Actual:** The limit is keyed on the leftmost `X-Forwarded-For` value, which the client writes. Changing it gets around the limit. Writing someone else's address can also use up their limit.
- **Root cause:** `deviceInfo` in src/lib/current.ts reads the leftmost value instead of the one added by the trusted proxy.
- **Not fixed:** this is platform sign-in code, outside the academics area, and the right value depends on how the app is deployed (how many proxies sit in front). Handed to the lead.

## ACADEMICS-06 · P3 · Academic Management (closed year)
- **Steps:** As the Principal, set the cookie `sos_year_correction` to `{"yearId":"<closed year>","reason":"forged","userId":"<me>","until":<tomorrow>}` by hand. Then change a record in the closed year.
- **Expected:** Refused. A closed year opens only through "Make a correction", which records the reason in the Audit Log and lasts 30 minutes.
- **Actual (base build):** The cookie was plain JSON and was trusted as it was. So the pass could be made by hand with any reason and any length of time, and "correction-started" was never written to the Audit Log.
- **Fix:** 80150d1. src/lib/academic/correction-cookie.ts signs the pass with an HMAC, using FILE_LINK_SECRET or else FIELD_ENCRYPTION_KEY. A pass that was written by hand or changed is ignored. Test: tests/academic/correction-cookie.test.ts.
- **Checked on 3103 in Sunrise:**
  - the forged cookie is refused with "2025-26 is closed. Use Make a correction.";
  - the real correction works and writes the Audit Log rows;
  - the cookie is signed and httpOnly;
  - after "Finish correction" the year refuses changes again.

## ACADEMICS-07 · P3 · Staff & HR Management (staff leave)
- **Steps:** A teacher asks for leave on 04-11-2026. The Principal chooses "Ask for a change" with a note. The teacher then opens My Leave.
- **Expected:** The teacher can change and resubmit the same request.
- **Actual:** The request shows "Not approved", and there is no way to resubmit it. "Ask for a change" is stored as a rejection.
- **Not fixed: NEEDS PRODUCT DECISION.** The shared approvals flow has no "changes requested" state. Adding one changes how every approval type works, and the blueprint does not say what a send-back should do for leave.

## ACADEMICS-08 · P3 · Examination & Results
- **Steps:** Publish a datesheet for Grade 5. Then open My Time Table as a Grade 7 teacher, and open another class's calendar.
- **Expected:** Exam days show only for the exam's classes.
- **Actual:** The Calendar Entries had no classes, which means the whole school. Every teacher's My Time Table showed the exam day.
- **Fix:** 8da1256. Exam calendar days now carry the exam's classIds. Tested.

## ACADEMICS-09 · P1 · Examination & Results (Marks Entry)
- **Steps:** As the Maths class teacher, mark Aditya Kumar ML (medical leave) and save.
- **Expected:** The mark is saved as medical leave. Per the exam rules, ML is not counted against the student.
- **Actual:** `marks.medical = false`. The mark was stored as AB, which counts as an absence in results and report cards.
- **Root cause:** The grid sends `medical: true`, but the save action's row reader dropped that field.
- **Fix:** 3baf281. The reader moved to src/lib/exams/marks.ts (`readMarkRows`) and keeps the field. Tested. After moderation, Aditya's result showed ML as not counted.

## ACADEMICS-10 · P3 · Attendance Management (Take Attendance)
- **Steps:** Mark Diya Patel absent with no WhatsApp or SMS connected, then save.
- **Expected:** The screen says honestly that no message will go.
- **Actual:** The screen said "Parents of 1 absent student get a message at 8:55 AM". The automation then skipped the message: "No messaging channel".
- **Fix:** fe10c8d. The save now says that no message goes until WhatsApp or SMS is connected. Actual delivery is marked NEEDS EXTERNAL CREDENTIAL.

## ACADEMICS-11 · P3 · Attendance Management (Attendance Reports)
- **Steps:** Open Attendance Reports, Today, for Grade 5 A. On that day there is 1 absent and 1 on medical leave, out of 19.
- **Expected:** One attendance % for the class.
- **Actual:** The top card says 17 of 19, 89.5%. The table row says 94.4%, because it leaves leave out of the base.
- **Not fixed: NEEDS PRODUCT DECISION.** Should approved leave count in the base? The blueprint does not settle it. Either choice changes the numbers reported to parents and on report cards.

## ACADEMICS-12 · P4 · Examination & Results (marks moderation)
- **Steps:** On a locked paper, use "Ask to change a mark".
- **Expected:** The sheet names the person who will decide.
- **Actual:** The sheet said it goes to the Exam In-charge or the Principal. By default it goes to the Principal only. The Exam In-charge sees 0 waiting.
- **Fix:** f8ca0e2. The sheet now reads "the Principal (or the approver your school set for marks changes)".

## ACADEMICS-13 · P1 · Examination & Results (Results)
- **Steps:** As cems.exam, open Results, then Review and publish, then Publish now.
- **Expected:** A confirm sheet opens, then the results are published.
- **Actual (base build):** The dialog and the confirm sheet both closed at once. Results could not be published from the screen at all.
- **Root cause:** The shared `Dialog` in src/components/ui/dialog.tsx passed the browser's asynchronous `close` event to `onClose`, even when the parent itself had set `open` to false. The step moved to the confirm sheet, then the late close event reset it.
- **Fix:** f7d38cd. `onClose` is only passed on when the dialog should still be open, which means the person closed it. Test: tests/dialog-close.test.ts.
- **Checked on 3103:** "Publish results for 35 students now?" opened, and Grade 5 A and 5 B were published.

## ACADEMICS-14 · P4 · Examination & Results (Results)
- **Steps:** Publish results with no WhatsApp or SMS connected.
- **Expected:** The confirm button does not promise messages that cannot go.
- **Actual:** The button reads "Publish and tell 35 parents". messages_sent stays 0. The flash after publishing is honest.
- **Not fixed:** low impact, and the wording depends on the open question of a channel-aware message (see ACADEMICS-21). Actual delivery is NEEDS EXTERNAL CREDENTIAL.

## ACADEMICS-15 · P2 · Examination & Results (Report Cards)
- **Steps:** Grade 5 A has register marks for October. Open Report Cards.
- **Expected:** Attendance is filled in from the Attendance register.
- **Actual:** Every row said "Not filled in: Attendance". Class teachers would have had to type days by hand.
- **Root cause:** Exams provides `registerAttendanceSource`, but Attendance Management never registered with it.
- **Fix:** 81b47b1. New src/lib/attendance/report-card-source.ts, which uses `attendanceSummary`. Students with no marks keep the typed days. Test in tests/exams/flow.test.ts. Checked on 3103.

## ACADEMICS-16 · P3 · Homework & Learning
- **Steps:** Give homework to Grade 5 A with no WhatsApp connected, and with the "Homework set" message off (the default).
- **Expected:** The flash says what really happened.
- **Actual:** "19 students notified; parents get it on WhatsApp."
- **Fix:** a82b2fe added `givenWords()`; eb9a21d uses it. The flash now says, for example, "Parents were not messaged: the Homework set message is off". Test: tests/homework/done-when.test.ts.

## ACADEMICS-18 · P1 · Homework & Learning (student privacy)
- **Steps:** Sign in as the student Pranav Korada and open `/homework-learning/homework/<id>`. The link is in the homework list markup.
- **Expected:** The student sees only their own homework and submission.
- **Actual (base build):** The student saw the staff page:
  - every Grade 5 A student;
  - each student's parent's name;
  - whether each parent had seen the homework;
  - submission counts.
- **Fix:** a82b2fe. Students are sent to their own view (`?open=<id>`), and `homeworkDetail` keeps only the student's own submission. Test: tests/homework/roles.test.ts. Checked on 3103.

## ACADEMICS-19 · P4 · Student Management (student logins)
- **Steps:** Turn on Student logins and make a login for Pranav Korada.
- **Expected:** A clean username.
- **Actual:** `cems-cems-2026-0180`. The school code is repeated because the admission number already starts with "CEMS/".
- **Not fixed:** this is in the Student Management area. The login works.

## ACADEMICS-20 · P4 · Homework & Learning
- **Steps:** Send `giveHomework` (crafted call) with a due date in the past.
- **Expected:** Refused, as the screen refuses it.
- **Actual:** Accepted on the server.
- **Not fixed:** the module's own tests rely on the server allowing past due dates, to set up overdue cases. The screen blocks this case. Changing it needs the module owner's view.

## ACADEMICS-21 · P2 · Events & Calendar (no messaging channel)
- **Steps:** With WhatsApp and SMS not connected:
  1. Add a holiday with "Tell parents".
  2. Cancel an event with "Tell people".
  3. Cancel a PTM that has bookings.
- **Expected:** The change is saved, and the screen says in plain words that nobody could be told.
- **Actual:** All three failed with "Give the message a title" or "Nobody would get this message", and the change was not saved. The PTM could not be cancelled at all.
- **Root cause:** `sendMessage` errors were thrown inside the same transaction. The calls also had no title, which the "app" fallback channel requires.
- **Fix:**
  - 93169a8 added src/lib/events/tell.ts. `tellSafely` saves the change and reports the problem.
  - 4e052f8 added titles to the messages. Test in tests/events-calendar/rules.test.ts.
  - Checked on 3103: "Holiday added … Nobody was told: Nobody would get this message. 351 parents have no app". The PTM was cancelled.

---

## Not defects, but noted
- A homework due date can be set inside the Dasara vacation, with no warning.
- Marks Entry turns "-5" into 5 without saying so. Marks can be entered before the paper's date.
- Opening another teacher's paper shows "This page is not here", not a plain "this is not your subject".
- The homework list has three links with no accessible name (desktop).

## Blocked / needs external credentials
- Parent Link, and any WhatsApp/SMS delivery: absence messages, homework, results, events, PTM. No channel is connected here: "Neither WhatsApp nor SMS is switched on". These rows are marked NEEDS EXTERNAL CREDENTIAL. The report cards parents would see were checked on the server with `parentReportCards`.

## Year end: done in Sunrise Public School, not CEMS
- **SQL check first.** CEMS has:
  - 2025-26 Closed, 0 students;
  - 2026-27 Active, 352 students, used by every QA agent;
  - 2027-28 Upcoming, 0 students.
- **Why not CEMS.** Opening 2027-28 there would make it the active year. Promotion would change students to PROMOTED.
- **What was done in Sunrise:**
  - the Open 2027-28 sheet was opened and cancelled;
  - the closed 2025-26 year was checked as read-only;
  - the correction flow was run, including the forged-pass check;
  - Nursery A (16 students) was promoted to LKG A 2027-28, and the promotion was then undone;
  - role refusals were checked, and every page at 375px.
- **Sunrise afterwards** is as it was: 2027-28 is still Upcoming with 2 students, no new sections, the Demo syllabus item is archived, and the batch is kept as "Undone".

## Data left in CEMS
- Student logins are turned **on** for CEMS. Pranav Korada has a login, password `DemoStudent#2026pk`, which is synthetic test data.
- Exam "Demo Unit Test 2 (QA)": results published for Grade 5 A and 5 B.
- Homework "Demo: Maths Exercise 4.3, Q1 to Q8" is active. The other Demo homework is archived.
- Archived or cancelled: Demo QA Science Fair, the Demo PTM, the album and the Demo subject.
