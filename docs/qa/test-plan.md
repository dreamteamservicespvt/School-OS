# School OS: real-school test plan (for the owner and the team)

Goal: find mistakes before a real school depends on the software, by having the team run a pretend school for a pretend year, each person in one role.
You do not need to know how to code. Everything below is clicking, typing and writing down what looks wrong.

## 0. Rules (read once)

1. **Use a separate "Test School", never a real school's data.** The earlier tests on school "chaitanya chekkapalli" left test records on a live school. Create a new school for testing in the Super Admin area (blueprint 07). Make a second one, "Test School B", only for the privacy test (section 6).
2. **One person = one role = one login.** No one shares a login, because the point is to see what each role can and cannot do.
3. **Use fake but realistic data.** 3 classes (for example 1, 5, 9), 2 sections each, about 20 students per section, 8 teachers, parents with Indian names and phone numbers you control. Use real-looking fees (for example Tuition 15,000 per term, Admission 5,000, Bus 6,000).
4. **Use the real Razorpay in TEST mode only** (test keys, test cards). No real money moves. Ask the developer to confirm test keys are set before the fee week.
5. **Write down every problem the moment you see it** (section 4). Do not fix, do not argue, do not wait.

## 1. Who plays whom

| Team member | Role to play | Main modules |
|---|---|---|
| You | Principal | Dashboard, Approvals, Reports |
| Person 2 | School Admin | Settings, Users, Admission, Students |
| Person 3 | Accountant | Fee, Finance, Salary |
| Person 4 | Class Teacher (Class 5 A) | Attendance, Marks, Homework, Students |
| Person 5 | Teacher (subject only) | Same, but only their classes |
| Person 6 | Receptionist | Front Office, Enquiries, Visitors |
| Person 7 | Transport / Librarian / Warden / Store (switch hats) | The optional modules |
| Anyone free | Parent (phone) | Parent Link, receipts, report card |

Fewer people than this? One person can play two roles, but log in and out between them (never test two roles in one browser session).

## 2. The pretend school year (7 test days, 2 to 3 hours each)

Each day has a goal, who works, and "what good looks like". Follow the real order a school works (docs/blueprint/06-build-order.md).

| Day | Goal | Who | Do this | Good looks like |
|---|---|---|---|---|
| 1 | **Set up the school** | Admin, Principal | Create the school year, classes, sections, subjects, fee heads, roles; add all staff as users; give each a role | Each person can log in and sees only their menu |
| 2 | **Admissions and students** | Receptionist, Admin | Take 10 enquiries, convert 6 to admissions, approve, admit; add the other students in bulk; add parents; try wrong data (letters in phone, duplicate student, no name) | Clear error messages; no duplicates; student numbers sensible |
| 3 | **Fees: the money day** | Accountant, Principal | Fee structure per class; collect cash, UPI and online; part payments; discount over the limit (needs Principal); advance payment; refund; cancel a receipt; print/share receipt; reminders | Totals match by hand (use a calculator or sheet); receipt amounts never wrong; nothing is deleted, only cancelled with a reason |
| 4 | **A normal school week** | Class teacher, Teacher | Time table, attendance for 5 days (including late, leave, half day, mistake and correction), homework, announcements to parents | Attendance counts match what you entered; teacher cannot touch another class |
| 5 | **Exams and report cards** | Teachers, Class teacher, Principal | Create exam, enter marks (including absent, wrong marks, correction), publish results, print report cards, promotion list | Percent, grade and rank right when you check 5 students by hand |
| 6 | **Staff, salary, accounts** | Admin, Accountant, Principal | Staff leave and approval, salary month run, payslips, expenses, vendor bill, day book, month-end totals | Salary matches the hand calculation; Finance totals agree with Fee collections |
| 7 | **Optional modules and break it** | Everyone | Transport, Library, Hostel, Inventory, Events; then the "break it" list in section 5 | No role sees what it should not; no crash screens |

After each day: the developer fixes the Blocker and High problems, then the team re-tests those items the next morning before moving on.

## 3. What to check on EVERY screen (the 8 questions)

Use this as a card next to the keyboard.

1. Does it do what its button/label says?
2. Is the message clear when something is wrong? (not blank, not "error")
3. After saving, is the number/name right when I come back later and when I refresh?
4. Can I fix a mistake later (edit, cancel, correct)?
5. Is it correct on a **phone** (390 px wide) as well as a laptop?
6. Is it fast? (more than 3 seconds to open = write it down)
7. Is there anything I do not understand in the words used? (a school clerk must understand it without training)
8. Did the right person (and only the right person) see it?

## 4. How to report a problem (same format for everyone)

Keep one shared sheet (Google Sheet) or add to `docs/qa/testing-issues.md`. One row per problem:

| Column | Example |
|---|---|
| # | 14 |
| Who / role | Aksha, Accountant |
| Day and screen | Day 3, Fee Management → Collect |
| What I did | Typed discount 500, pressed Collect |
| What I expected | Receipt for 14,500 |
| What happened | Receipt for 15,000, 500 shown as advance |
| Screenshot / phone video | link |
| Severity | Blocker / High / Medium / Small |
| Status | Open / Fixed / Re-tested OK |

Severity:
- **Blocker:** wrong money, lost data, one school sees another's data, cannot log in, cannot finish a daily job.
- **High:** a daily job works but is confusing or error-prone (an accountant could make a mistake).
- **Medium:** annoying, has a workaround.
- **Small:** spelling, spacing, looks.

## 5. "Break it" list (Day 7, and any spare time)

Real staff make these mistakes on day one, so test them on purpose.
- Press Save twice quickly. Press Back after saving. Refresh in the middle of a form.
- Open the same student in two browsers and edit both.
- Leave required boxes empty; type letters in money boxes; type a very long name; use Telugu/Hindi text; use an emoji.
- Enter a past date, a future date, 31 February.
- Collect a fee twice for the same student and term.
- Log in as a Teacher and type the web address of a Principal-only page by hand: must be refused.
- Log out in one tab, keep working in another.
- Use a bad network: switch the phone to 2G/airplane mode in the middle of a payment, then come back. Check that no half-saved receipt exists.
- Open on an old phone and on a different browser (Chrome, Edge, Safari).
- Upload a huge photo, a wrong file type.
- Download/print every report and receipt; compare against your hand total.

## 6. School privacy test (most important for selling to many schools)

Done by one careful person, with the developer.
1. In Test School A and Test School B create a student with the same name and phone number.
2. Log in to A. Search for the B student by name, phone, receipt number, and in reports, exports and Parent Link. **Nothing from B may ever appear.**
3. Copy a record's web address from A, log in to B, paste it: must be refused or empty.
4. Switch a feature on for A only; check that B does not get it.
Any failure here is a Blocker; stop the plan until it is fixed.

## 7. Pilot week (after the 7 days are clean)

One friendly real school (or a relative's small school) for 1 to 2 weeks, running **in parallel with their paper register**: staff enter the same attendance and fees in both, and on Friday you compare totals. Keep a person from your team at the school for the first 2 days. Collect their problems in the same sheet. Do not use real online payment until the fee totals match for the whole week.

## 8. Before this counts as "ready for real schools"

Tick all:
- [ ] All 7 days done; zero open Blocker or High items.
- [ ] Fee totals, salary and report-card figures matched hand calculation on at least 5 samples each.
- [ ] Privacy test passed (section 6).
- [ ] Every role tried the phone view.
- [ ] Backup and restore tried once by the developer (delete a record in test, restore it).
- [ ] Pilot school ran a full week with matching totals.
- [ ] The developer ran `npm test` and the security audit after the last fix (see CLAUDE.md and docs/DEPLOYMENT.md).
- [ ] A support plan exists: who answers a school when something breaks, and how fast.

## 9. Timeline

- Day 0 (half day): create Test Schools, logins, shared sheet, brief the team (30 minutes: sections 0, 3, 4).
- Days 1 to 7: one test day per day, fixes overnight. Realistic total: 2 weeks including fixes and re-tests.
- Then the pilot week.
