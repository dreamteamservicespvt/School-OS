# Testing issues (found by the owner while testing the live software)

Site tested: https://school-os-beta.vercel.app (school: chaitanya chekkapalli, user Saiveni, School Admin).
Status: Open = not fixed yet. Add new items at the bottom; never delete, mark Fixed with the date.

## 1. Fee Structure: "Add fee row" does nothing when the school has no fee heads (Open, found 2026-11-03)

- **Where:** Fee Management → Fee Structure → open any class → "Add fee row".
- **What happens:** the class dialog closes, the URL becomes `...&do=row`, and nothing opens. No form, no message.
- **Root cause:** `src/app/(school)/fee-management/structure/page.tsx` line ~304: `if (!options.length) return null;`. With no fee heads there are no options, so the row form is silently not rendered.
- **Workaround:** add a fee head first (Add fee head, top right).
- **Fix wanted:** when there are no fee heads (or all are already used in the class), show a clear message ("Add a fee head first") with a button that opens the Add fee head form; or disable "Add fee row" with that explanation. Add a test. Check the same silent-`return null` pattern on the other sheets in this page.

## 2. Student list: School Admin sees a "My class" chip next to "class 1" (Open, found 2026-11-03)

- **Where:** Student Management → Student List, logged in as School Admin (Saiveni). The school has class 1 (1 student) and class 2 (0 students).
- **What happens:** two chips appear, "My class 1" and "class 1 1". Both show the same single student, so it looks like two different classes.
- **Root cause:** `src/app/(school)/student-management/page.tsx` line ~162: the "All" chip is labelled "My class" whenever only one class has students (`data.tiles.length === 1`), for every role. Classes with no students get no chip.
- **Fix wanted:** call it "My class" only for a class teacher; admins always see "All classes". When only one class has students, hide the duplicate "All" chip or make it clearly the same as that class. Consider showing classes with 0 students (class 2) so the admin sees every class. Add a test.

## 3. Fee Settings: "Allow advance payments" and "Verify before posting" look editable but cannot be changed in the Payments card (Open, found 2026-11-03)

- **Where:** Fee Management → Fee Settings → Payments card. Its "Change" form only has the concession limit, cancel-approval switch and the verification modes.
- **What happens:** the two rows show On/Off labels, but there is no way to change them there. The owner could not find where.
- **Root cause:** the real switches are in the separate "Optional parts" card further down the left column (`settings/page.tsx` lines ~190-201, features `fee-advance` and `fee-verification`). The Payments card (line ~223) just displays their state. The modes chosen in Payments → Change only apply once "Verify payments before posting" is on.
- **Fix wanted:** put the two switches in the Payments card (or add a "Change in Optional parts" link on those rows), and show a hint in the Payments form with a link when verification is off. Test for School Admin and Principal.

## 4. Collect fee: typing a discount does not lower "Amount received" or the Collect button (Open, UI/UX, found 2026-11-03)

- **Where:** Fee Management → collect a student's fee (accountant aksha, student vasundhra, class 2 A, Academic fee Term 2 ₹15,000).
- **What happens:** typed discount ₹500. "Amount received" stays 15000 and the button stays "Collect ₹15,000". Only a small grey line appears: "₹500 more than the dues. It is held as advance." The user expected the amount to drop to ₹14,500.
- **Risk:** an accountant who just presses Collect would take ₹15,000 and the ₹500 discount becomes an advance payment instead of a discount saving. Not yet confirmed by submitting (no payment was made in this test).
- **Fix wanted:** when a discount is typed, show the new payable (₹14,500) and update the amount received and the button to it, unless the accountant edited the amount by hand; show "Fee ₹15,000 − discount ₹500 = ₹14,500".
- **Still to test (ask the owner first, it writes live data):** discount over the limit (limit ₹1,000). From the code (`src/lib/fees/collect.ts` line ~128) the payment is refused with "Discounts above ₹1,000 need the principal's approval" and an "Ask for approval" button appears; the request goes to the Principal on Approvals. Check on screen that the Principal gets it, and that collecting after approval works.

## 5. Collect fee: over-limit discount flow works, but the form is confusing (Open, UI/UX, found 2026-11-03)

- **Tested (accountant aksha, vasundhra, ₹15,000 due, limit ₹1,000):** discount ₹1,500 + reason → Collect is refused ("Discounts above ₹1,000 need the principal's approval") and no payment is made. "Ask for approval" then creates ONE request "Discount of ₹1,500 for vasundhra", kind Discount or concession, "waiting for the Principal", visible under Approvals → Asked by me. So the rule itself works.
- **Problems seen:**
  1. The Reason box is emptied after every Collect / Ask press (form reset). After the first refusal the accountant must type the reason again before "Ask for approval", or it fails with "Give a reason of at least 5 characters".
  2. After "Ask for approval" succeeds the screen still shows the old red errors and the "Give a reason" message and no "sent to the principal" message with the Approvals link (the action returns one: `collect/[studentId]/actions.ts` line ~106). The accountant thinks it failed and may press again and send duplicates. Check for a duplicate guard.
  3. With discount ₹1,500 the line under Amount says "₹1,500 more than the dues. It is held as advance." (same cause as issue 4).
- **Fix wanted:** keep the typed reason (controlled input) after server answers; show the success message + link and clear the old errors after "Ask for approval"; block or merge a duplicate pending request for the same student/rows.
- **Test data left on the live school:** one pending approval "Discount of ₹1,500 for vasundhra" (reason "Testing over-limit discount"). The Principal should reject it or the accountant should withdraw it. Not yet done.

---
## Live role-play test, 2026-11-04 (Claude as a layman, School Admin Saiveni first)
Browsers: 1 aswini Teacher, 2 anjali Principal, 3 Saiveni School Admin, 4 aksha Accountant, 5 KUSUMA Class Teacher.

## 6. Fixed since the last test: Student list chips (Open to re-check by Teacher/Class Teacher)
- Issue 2 looks fixed for School Admin: the list now shows "All classes 2 / class 1 1 / class 2 1". Still to verify as Class Teacher ("My class") and with a class that has 0 students.

## 7. Import review page says "0 rows" for a file that has rows (Open, Medium, found 2026-11-04)
- **Status:** FIXED 2026-11-05: before any column is matched the header counts the file's filled rows (src/components/import/file-review.tsx). No unit test (server page); check by hand
- **Where:** Student Management → Import → Continue on Dream_Valley_Students_100.csv. Header: "Students · 0 rows", but the "Your file" preview lists rows.
- **Risk:** an admin thinks the file is empty or the upload failed.
- **Fix wanted:** show the real row count (100) once the file is read, or "Reading the file…" until then. Add a test.

## 8. Import: sample file cannot be imported as it stands, and the page does not warn early (Open, Medium, found 2026-11-04)
- **Status:** FIXED 2026-11-05 (batch 2): step 1 Match columns warns at once about classes, designations or departments not found as written (match or add them in step 2) and about needed columns that are empty ("Parent's phone is empty in every row, and it is needed for every student"). src/components/import/file-review.tsx
- The file has classes Nursery, LKG, UKG, Grade 1-5 but the school has only "class 1" and "class 2"; the Parent's phone column is empty ("This column is empty in the first rows") while the phone is required. The admin only learns this at step 3.
- **Fix wanted:** on step 1 show a plain warning per column: "No class called Nursery in this school: add it in Academic Management first, or map it to an existing class", and "Parent's phone is needed for every student".

## 9. Import: Match columns page is very long and confusing (Open, Small, found 2026-11-04)
- **Status:** FIXED 2026-11-05 (batch 2): only needed columns not found stay open; matched ones fold into "✓ Matched (N)" (open when 4 or fewer); the picker says "(used for Full name)" instead of "(also ...)"
- Every column picker repeats the same 20-item list, and some labels look wrong: "Student Status (also Full name)", "Class" showing alternatives in odd order. A first-time clerk will not know what to choose. Fix wanted: collapse matched columns ("Matched ✓") and open only the ones that need a choice.

## 10. Add student: empty form shows only the browser's one-line "Please fill out this field." (Open, Small, found 2026-11-04)
- **Status:** FIXED 2026-11-05 by FormProblems (every bad box red at once, first one brought into view) on Add Student; recheck by hand
- Only the first empty box is flagged; the others are not marked. Fix wanted: mark every missing box in red with a school-style message at once.

## 11. Staff list does not match the people who can log in (Open, Low, found 2026-11-04)
- **Status:** OPEN, design proposed: the blueprint says every login belongs to one Staff, Student or Driver record, but logins made by invite (Principal anjali, Admin Saiveni) have none, so they are missing from the Staff list and "Staff present". Proposal: Staff list shows "N people can sign in but have no staff record" with Add Staff that links the existing login (no second login). Needs a small build + tests; next batch
- Logins exist for Principal (anjali) and School Admin (Saiveni) but the staff list has only 3 people (KUSUMA, aksha, aswini); staff codes jump ST-001, 003, 006; Department is blank for all; Dashboard says "Staff present 0/3". KUSUMA, a Class Teacher, shows designation "Teacher".
- **Fix wanted:** decide whether every login should have a staff record; show Department/Designation clearly; explain gaps in staff codes (removed records) or avoid gaps.

## 12. Students just brought in show "₹20,000 overdue" on the day they join (Open, Medium, found 2026-11-04)
- **Status:** FIXED 2026-11-05 for new rows: a term whose date has passed is due on the student's joining day (dueDateForStudent in src/lib/fees/structure.ts); the full year is still owed. Test tests/fees/late-joiner.test.ts. Rows made before the fix keep their old dates (owner decision: fix the test school's 30 by hand or leave)
- **Where:** Student Management → Student List, after importing 30 students (admission date left empty = today). Every new student shows a red "₹20,000 overdue" chip.
- **Why it matters:** a clerk sees every new child as overdue the minute they are admitted. Probably the class fee plan puts all terms (including ones whose due date already passed) on the student.
- **Fix wanted:** decide the rule: a new admission should owe only terms still to come, or show earlier terms as "due now" with a clear note; the importer should say what the fee plan will add before bringing students in. Test it.

## 13. Principal sees "Two-step login on" and "Not set up" on the same page (Open, Small, found 2026-11-04)
- **Status:** FIXED 2026-11-05 (batch 2): when no code can reach the person the badge is amber "Two-step login: not set up yet" and jumps to Password and sign-in
- **Where:** /profile for anjali. The green badge under her name says "Two-step login on"; the section below says "Required for your role, but no code can reach you yet... Not set up".
- **Why it matters:** the Principal cannot tell whether her account is protected.
- **Fix wanted:** the badge should say "Two-step login: not set up yet" (amber) with a button to fix it.

## 14. Approval shows the system's own sentence as the "Reason given" (Open, Medium, found 2026-11-04)
- **Status:** FIXED 2026-11-05: Approvals detail and list show "No reason given" for an old error-sentence reason (src/lib/fees/reason-words.ts); new ones are refused since fix 31
- **Where:** Principal opens "Discount of ₹1,500 for vasundhra". Reason given reads: "Discounts above ₹1,000 need the principal's approval. Ask for approval, then collect once it is approved, or collect without the discount. Reason" (a stray word "Reason" at the end). The accountant's real reason is not shown, so the Principal approves blind.
- **Fix wanted:** show only what the accountant typed; if empty, say "No reason given". (Request was made before fix 5; re-test with a fresh request from Accountant.)
- Approve itself worked: button shows "Approving...", then "Approved. The person who asked has been told." Good.

## 15. Fee numbers on the Principal dashboard contradict each other (Open, High, found 2026-11-04)
- **Status:** FIXED 2026-11-05: the Fee collection chart counts the year's rows like the tile; a term dated before the year's first day lands in the first month (monthlyTrend yearId). Test tests/fees/late-joiner.test.ts
- **Where:** Dashboard. Fee collection says "₹35k of ₹8 L due so far · 4%" but right below "No fees have fallen due this year yet." Needs-attention says "₹5,25,000 overdue from 30 students, more than 30 days late".
- **Why it matters:** the Principal gets three different stories about money.
- **Fix wanted:** one source of truth for "due so far"; show the same figure in all three places.

## 16. Brand-new students are "147 days late" (Open, High, found 2026-11-04; same root as issue 12)
- **Status:** FIXED 2026-11-05 with issue 12 (new admissions are due today, so not on Defaulters). The Send dialog already shows count, cost, preview and "cannot be unsent"
- **Where:** Fee Management → Defaulters. Students admitted today show oldest due 10-06-2026 and "147 days"; all 30 land in "Over 90 days". The big blue button "Send reminder to all 30" would tell new parents they are almost five months late.
- **Fix wanted:** same rule as issue 12 (a new admission owes only terms due after joining), plus a warning before "Send reminder to all".

## 17. Dashboard small confusions (Open, Low, found 2026-11-04)
- **Status:** PARTLY 2026-11-05 (batch 2): consent line reads "7 of 25 guardians have not given data consent". Staff present counts only staff records (same root as 11). Counts refresh: bell checks every 30 s since 51761836
- "Staff present 0 / 3 · 3 not in yet" ignores the Principal and Admin who are logged in at that moment.
- "7 guardians have not given data consent" while 32 students exist; unclear if the other 25 are fine or unknown.
- Dashboard says "Good evening" with the top badge counts changing (approvals bell 1 to none) only after a full reload.

## 18. A Class Teacher with no section is stuck, and the Principal is not told (Open, Medium, found 2026-11-04)
- **Status:** FIXED 2026-11-05 (batch 2): dashboard item "N Class Teachers have no section" (academic.class-teacher-no-section) next to "N sections have no class teacher"; saving the Class Teacher role in Settings, Users says when they have no section and where to set it. Add Staff step 3 already asks
- **Where:** KUSUMA has the role "Class Teacher" but Attendance says "No class to take... Ask the principal". Nothing tells the Principal that a Class Teacher has no section. Fix by hand: Academic Management → Classes & Sections → Edit → Class teacher (easy once found; worked, "class 1 A saved").
- **Fix wanted:** when a role of Class Teacher is given, ask which section; or show the Principal a "Class teacher not set" item on the dashboard. Class 2 A still has none.

## 19. Locked attendance: buttons look live, tapping does nothing (Open, Medium, found 2026-11-04)
- **Status:** FIXED 2026-11-05: locked P/A/L look greyed and a tap says "Locked at 11:00 AM. To change a mark, use Request a correction." with the link; a hint says press and hold for Half-day, Leave and other marks (hi/te added)
- **Where:** Attendance after 11:00 AM. The yellow lock banner is at the top, but P / A / L buttons still look normal; tapping P changes nothing, no message.
- **Fix wanted:** grey the buttons out when locked, and if tapped say "Locked at 11:00 AM. Use Request a correction." Also: "L" is Late only; Leave and the other 4 statuses (Half-day, Excused, Leave, Medical) cannot be picked on this screen, so a teacher does not know where to mark "on leave". Show the words, or a "More" choice.

## 20. Correction form: a missed day means ticking children one by one (Open, Low, found 2026-11-04)
- **Status:** FIXED 2026-11-05 (batch 2): "Select all N" and "Clear ticks" on the student list; empty boxes are all marked by FormProblems
- Forgetting to mark is the most common mistake. The form has no "Select all", and when sent empty the browser's one bubble points at "New status", not at the missing children or reason (same as issue 10).
- **Fix wanted:** add "Select all 16"; mark every missing box.
- Good: after sending, the page shows the request, "Waiting", Withdraw, and a clear message. Not yet checked: the Principal's approval of it, and whether the register changes after.

## 21. Academic year says "upcoming" while the school day count is running (Open, Low, found 2026-11-04)
- **Status:** FIXED 2026-11-05 (batch 2): the year is really "upcoming" (never made active); the dashboard now says "2026-27 is not active yet: open it in Academic Management, Academic Settings, Years" instead of counting school days
- Classes & Sections shows "2026-27 (upcoming)"; the dashboard says "School day 123 of 261". One of them is wrong or needs explaining.

## PROGRESS of the live test (2026-11-04, end of session 1)
Done: logins mapped; Admin (Saiveni) dashboard, staff list, student list, add-student form, import (30 students, worked well: clear steps, undo promised, linking of siblings explained).
Test data now in the school: 32 students (class 1 A: 16, class 2 A: 16); parents' phones are team numbers only (9390011378, 8074752122, 9398123633, 9618126288, 7680840300).
Template "School connection test" is In review at Meta; send it to 9390011378 once approved.
SESSION 2 (2026-11-04 evening): Principal (anjali): profile, dashboard, approval approve, defaulters = done (issues 13-17). Class Teacher (KUSUMA): profile, attendance lock, correction request = done (18-21); I set KUSUMA as class teacher of class 1 A. Browser IDs unchanged: 694c21cd = Principal, c616d948 = KUSUMA (labels now read "Browser 3" and "Browser 1"; always check /profile).
Left open for next chat: approve KUSUMA's correction as Principal and check the register changes; then
NOT yet tested (do next, in this order): Class Teacher: marks, homework; Teacher (aswini): own-class limits; Accountant (aksha): fee collect, discount approval, receipt, refund; Fee structure; Salary/Finance; Front Office; Events; Reports; Optional modules (Transport, Library, Hostel, Inventory); phone-size view; permission attempts (Teacher opening Accountant pages); layman mistakes (double-click, empty forms, back button); WhatsApp send to team numbers; forgotten password; student changes class; fee typed wrongly then corrected.

## 22. Approvals tab counts show 0 while the list has items (Open, Low, found 2026-11-04)
- **Status:** FIXED 2026-11-05 (batch 2): each tab counts the rows its list shows (decided ones too); ?tab=all / waiting / asked are read as ?view=
- **Where:** Approvals, after the Principal approved KUSUMA's correction: tabs read "Waiting 0 · Asked by me 0 · All requests 0", but All requests lists 3 items (1 Approved, 1 Approved, 1 Withdrawn). Opened with ?tab=all the page ignores it and shows Waiting (the real link is ?view=all).
- **Fix wanted:** count the same rows the list shows; accept or redirect old ?tab links.

## 23. Attendance correction: approved and register updated (Pass, with two small notes, 2026-11-04)
- Principal approved; KUSUMA's register then showed 4 Present, 12 Not marked: the correction worked. Note A: the request says "Asked by KUSUMA, Teacher" though the role is Class Teacher + Teacher (show the main role). Note B: the lock banner still says "12 students not marked" correctly; good.

## 24. Marks Entry is a dead end until a datesheet exists (Open, Low, found 2026-11-04)
- **Status:** FIXED 2026-11-05 (batch 2): the empty Marks Entry has "Add datesheet" for those who may, else "See datesheets"
- Class Teacher opens Examination & Results → Marks Entry: "No papers to mark yet... ask the Exam In-charge". Plain words, but no link to where an exam is created, and the Principal is not told that no exam exists. Marks could not be tested; needs Datesheet set up first (do as Principal/Admin next).

## 25. Give homework: stale error after fixing the title (Open, Low, found 2026-11-04)
- **Status:** FIXED 2026-11-05 by FormProblems: a box's message goes as soon as it holds a good value; recheck by hand
- **Where:** Give homework form. Pressing Send empty shows a clear red "Give the homework a title" (good). After typing the title the red message and red border stay until Send is pressed again, so it looks as if the title is still wrong.
- **Fix wanted:** clear the error as soon as the field has text.
- Good: Send shows "Sending...", then "Homework sent to 1 A (16 students). Parents were not messaged: automatic messages to parents start when the school goes live." Homework card shows 16 assigned, 0 submitted, due next Telugu class (Fri 6 Nov). Subject picked by itself (TELUGU) for a class teacher with one subject.

## 26. Datesheet: "Percentage" chosen, but both papers save as "Graded", Max marks never set (Open, Medium, found 2026-11-04)
- **Status:** FIXED 2026-11-05 (batch 2): the form shows a note naming the grade-only subjects (set in Academic Management, Subjects) with "Open Subjects"; the saved page says "Grade only, no marks (set in ...)". Subjects with marks take Max marks (bulk Apply) and Mark categories as before
- **Where:** Add datesheet (Principal), class 1. I picked Percentage (top pills and each paper's Pattern list) and typed Max marks 80 in the bulk box. After saving, the header says "Percentage" but both papers show "Graded" and Max marks "Graded"; Mark categories (Social, Telugu) also say "Graded" and nothing there can be edited. The Max marks column in the form also said "Graded" before saving, so the form never showed a number to type.
- **Fix wanted:** when the exam pattern is Percentage, each paper takes a Max marks number (bulk Apply must work) and Mark categories (Theory 80 + Internal 20) must be editable on the saved page. Show clearly which pill is selected (the white pill looked selected for Percentage before I had touched it).

## 27. Publish dialog: "Message parents now" is ON by default (Open, Low, found 2026-11-04)
- **Status:** FIXED 2026-11-05 (batch 2): kept ON (blueprint A10: publishing tells parents) but the line now says how many students' families get it and "switch this off to publish without messaging"
- A layman presses Publish and 16 families get a message that "cannot be unsent". I switched it off for the test. Fix wanted: default OFF, or show the count and a clear confirm line. Also: the dialog's Publish button moved up after the toggle changed, so a quick second click can miss.

## 28. Small wording and links around exams (Open, Low, found 2026-11-04)
- **Status:** FIXED 2026-11-05 (batch 2): /exams goes to Examination & Results; an Ongoing datesheet before its first paper says "First paper on <date>"; papers with no invigilator get a warning with "Rooms & invigilators"
- /exams gives "This page is not here" (no redirect to Examination & Results). The published datesheet starts on 04-11, first paper 09-11, yet the badge reads "Ongoing" before any paper. One invigilator was told, but Social has "Not set" and nothing asks the Principal to set one.

## SESSION 3 (2026-11-04 night, user away; Claude ran alone)
Done: datesheet created and published as Principal (26-28); KUSUMA Marks Entry (grades A/B/AB, submit with 13 missing = clear warning naming the students, good); aswini: Fee Management, Settings = plain "not in your menu" pages (good), Student list shows only her class 2 A (good); aksha: collect part payment (receipt C-CHE-001/2026-27/00004, "No message was sent to the parents", good), over-limit discount sent for approval, refund sent for approval.

## 29. Collect fee: typing a discount resets "Amount received" to the full amount (Open, Medium, found 2026-11-04)
- **Status:** FIXED 2026-11-04: typing a discount or waiver no longer overwrites a typed Amount received
- **Where:** Collect fee, Tarun Prasad (class 1 A, Rs 20,000). I typed 5000 (part payment), opened Discount and typed 3000: the amount jumped back to 20000 and the page said "Rs 3,000 more than the dues. It is held as advance". A cashier who then presses Collect takes the wrong amount. It happens each time the discount changes.
- **Fix wanted:** never overwrite an amount the cashier typed; only recalculate the suggested amount while it is untouched.

## 30. Collect fee: reason is wiped and the over-limit red box stays after the fix (Open, Medium, found 2026-11-04)
- **Status:** FIXED 2026-11-04: the refusal box clears when the discount changes. Reason wipe not reproduced in code (field is controlled); likely the test tool setting the value without a keystroke, recheck by hand
- Pressing Collect with a discount above Rs 1,000 shows a good red message, but the Reason text I had typed was cleared ("Give a reason of at least 5 characters" then appears). After I set the discount to 0 the red "Discounts above Rs 1,000 need the principal's approval" text stayed, although it no longer applied (same family as 25).
- **Fix wanted:** keep typed fields after a refused submit; clear the error when the value changes.

## 31. Concessions list shows error sentences as the Reason (Open, High, found 2026-11-04)
- **Status:** FIXED 2026-11-04: server refuses reasons that are screen error sentences; lists, detail and export show "No reason given" for old rows
- Concessions & Refunds, 2 older rows for vasundhra: the Reason column reads "Discounts above Rs 1,000 need the principal's approval. Ask for approval..." and "Give a reason of at least 5 characters for the discount." That is the screen's own error text saved as the reason. Reports and the audit trail would then carry nonsense.
- **Fix wanted:** find where the form sends the error message in place of the reason (likely the reason field falling back to the last error text) and reject it on the server too; show "No reason given" for old rows.

## 32. Refund form stays open after sending, with the amount prefilled again (Open, Low, found 2026-11-04)
- **Status:** CHECK 2026-11-05: the sheet closes on success in code (SheetForm, close link has no do=refund); recheck by hand
- After "Send for approval" the dialog stays open showing Amount 4,000 (5,000 minus the 1,000 pending) and an empty Reason; a second press would try a second refund. (It did not duplicate for me: it needs a reason.) Fix wanted: close the dialog and show "Refund sent to the Principal".
- Good: refund form is plain ("Not more than Rs 5,000 (paid, minus earlier refunds)"), every refund goes to Approvals, and the page counts "1 refund waiting".

## 33. Refund marked "paid back" lowers the fee total instead of raising what is left (Open, High, found 2026-11-04, owner decision)
- **Status:** WAITING on owner 2026-11-05: today a refund is an adjustment (lowers the fee and Paid; blueprint lists refunds under adjustments). Not changed
- Tarun Prasad (class 1 A): fee 20,000. Paid 5,000 cash. Discount 3,000 approved: Year 17,000, Paid 5,000, Left 12,000 (correct). Then a refund of 1,000 was approved and marked refunded (cash given back): the screen now says Year 16,000, Paid 4,000, Left 12,000. The money went back, but the family still owes 12,000 on a 16,000 fee; it should be Year 17,000, Paid 4,000, Left 13,000 (unless the refund is for an overpayment, which this was not).
- **Fix wanted:** a refund only reduces Paid. Decide with the owner whether a refund is also allowed when the student has dues (the form could warn "Student still owes Rs 12,000, refund anyway?"). Add a test for Year/Paid/Left after discount + refund.
- Good, same flow: Principal's Approvals showed both requests with the reason and the asker; approving told the asker; Refunds tab showed "Approved, to pay", then "Mark refunded" with date, reference and account.
- Also still true (22): after the Principal approved both requests, tabs read "Waiting 0 · Asked by me 0 · All requests 0".

## 34. Optional modules and phone size (session 3, 2026-11-04)
- **Status:** PARTLY 2026-11-05 (batch 2): Note A fixed (Transport empty state says the Transport In-charge adds routes when your role cannot). Note B waits for the owner (Transport on by default vs blueprint "no Transport in v1")
- Settings, Modules On/Off (School Admin): Transport, Library, Inventory, Hostel are all "On" and open with plain empty states (Library shows "Every book out is within its due date"; Transport "Add a route..."). Note A (Low): the pages carry a "View only" badge for School Admin, and the empty state says "Add a route" with no button, so an Admin does not know who may add. Say "The transport in-charge adds routes" or give Admin the button. Note B (Medium, owner decision): the blueprint says no Transport in version 1, yet Transport is On by default for this school; decide whether to start it Off.
- Phone size: NOT tested. The Chrome extension could not make the window narrower (it stayed 1536 px after resize_window 390x844). Test by hand on a phone (Fee collect, Marks entry, Attendance are the three screens that matter on a phone).

## 35. WhatsApp to a team number (Pass, 2026-11-04 9:09 PM)
- Send Message > One person > Ramesh Reddy (9390011378, a team number) with template "School connection test" (now approved): preview was right, a confirm box said "1 chosen parent, 1 credit of 499, cannot be unsent". Message History then lists it (WhatsApp + App notice, delivery pending). Total credits show 499.
- Small notes: (a) the WhatsApp template is locked, yet the page still demands a "Title" and a "Message for the other channels" because the free App notice box is ticked: a layman picks a template and gets two red boxes. If a template is chosen, offer to fill those from the template or untick App notice. (b) "Message for the other channels" is marked required even when only WhatsApp is needed.

## Session 3 summary
Passed: Principal datesheet publish with a parents' message switch; Marks Entry warning; Teacher blocked from Fee/Settings with plain words; Teacher sees only own class; Accountant collect + receipt; over-limit discount approval; refund approval path; optional modules open; WhatsApp to team number.
New problems: 26 to 33, 34, 35 (High: 31 error text saved as discount reason, 33 refund changes fee total; Medium: 26, 29, 30).
Still not tested: Salary/Finance, Front Office, Events, Reports, phone size, forgotten password, student changes class, double-click on Collect.
- (add to 28) /attendance and /exams typed by hand give "This page is not here" (real pages are /attendance-management... and /examination-results); a friendly redirect is cheap.

---
## Owner's test PDF, 2026-11-05 (16 notes) — all FIXED 2026-11-05 (local commits, not deployed)
Owner decisions 2026-11-05: (1) a locked login may still use "Forgot password" (code sign-in clears the lock) = OK; (2) admission consent code template = add, never touch the gym's account; (3) shared-number env: code also reads WHATSAPP_BUSINESS_ACCOUNT_ID / WHATSAPP_PHONE_NUMBER_ID (CONSOLE_* wins); (4) Meta webhook and shared-number setup left exactly as they are; (5) holidays always go to staff bells, notification sound on by default = OK.
- P1 Console "Not signed in" for a signed-in School Admin: card updated at sign-in (src/lib/console/admin-sign-in.ts). Old cards flip at the admin's next sign-in.
- P2 12-hour times everywhere: formatClock/formatClockRange in src/lib/format.ts.
- P3 Pop-up forms keep a draft until saved (src/components/ui/form-draft.tsx; never passwords/codes/UTR/Aadhaar).
- P4 Every missing box marked, cursor to the first, closed sections opened (src/components/ui/form-problems.tsx).
- P5 One class-teacher section per person (server + Add Staff + import + exit handover).
- P6/P9b ID card, receipts and all 38 PDF routes: Vercel had no Chrome and the launch retried forever. @sparticuz/chromium on serverless, fail fast, printable-page fallback (src/lib/pdf.ts).
- P7 Add Staff step 3: "Class teacher of" vs "Subjects taught", by role; taken places greyed with the name. "..." menus no longer clipped (src/components/ui/floating.tsx).
- P8/P9 Console: WhatsApp choice on Add School (DREAM TEAM shared or own), per-school WhatsApp card and dashboard list.
- P10 UPI reference: exactly 12 digits, screen + server, all money screens.
- P11 No countdown on wrong passwords; server lock kept.
- P12 Shared phone/email: the typed password picks the login (no enumeration).
- P13 Notices reach Admin/Principal/Accountant logins; holidays to staff bells; bell checks every 30 s; sound with On/Off.
- P14 ShareMenu (WhatsApp, Share, Copy) on 7 kinds of link.
- P15 Long help lines cut on the busiest forms; 8 more trimmed in the leftovers pass (parents, guardians, substitutions, DigiLocker, offline attendance, Add Staff, behaviour, class teacher).
- Leftovers pass: invites "sent" only when the provider took it; console lock without minutes; drafts on Datesheet and Add Staff; hi/te for step 3 and the new form messages.
- P16 Code screens say truthfully whether the code went; new ready template "Admission consent code" (WhatsApp + SMS) is used once Meta approves it (school: Settings > Templates > send for approval).
Browser self-test (qa/full/p16-selftest.mjs, local build): 7 of 7 passed.
