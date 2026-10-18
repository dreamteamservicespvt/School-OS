# 01 Dashboard

Build order: 11th (last module of Stage 2), because it shows numbers from Settings, Academic, Staff, Students, Communication, Admissions, Fees, Finance, Attendance and Examination & Results. Tiles for later modules (transport, library and others) are added when those modules are built.

## 1. Purpose

The first screen after login: each person sees today's numbers and the work waiting for them.

Used by everyone who logs in. Each role gets its own home: Principal, Accountant, Teacher, Class Teacher, School Admin, Librarian, the HR and Driver role templates when the school switches them on, and any custom role.

## 2. Pages

### School Today

**Purpose:** today's numbers for the person's role, each one opening the list behind it.

**What the person sees**

A role-based home. The tiles shown depend on the person's roles, their scope (campus, classes) and which modules are switched on.

| Role | What the home shows first |
|---|---|
| Principal (control centre) | Head counts (students, parents, staff, admins); today's student attendance (present, absent, late, %); today's staff attendance; today's fee collection and number of payments; fees due; expenses (today, this month, pending); income vs expense; Approvals count; alerts. Further down: budget used (optional), exam average, classes overview, pending admissions, discipline cases (optional), transport (optional), academic panel, teacher panel, operations panel (optional). |
| Teacher | Today's classes from the Time Table, each with a **Take Attendance** button; to-do counts (homework to check, assessments pending, parent messages); today's substitutions; exams and marks due; lesson plans for today; notices; own leave; meetings and PTMs. |
| Accountant | Money today: collected, pending, expenses. Buttons: **Collect Fee**, **Record Expense**, **View Payments**, **Send Fee Reminder**, **Reports**. |
| School Admin | Setup checklist (until complete), Approvals count, alerts, head counts (inferred: the admin home contents). |
| HR (role template) | Leave requests waiting, staff attendance today, documents expiring this month (inferred: the HR home contents). |
| Librarian | Books due today, overdue books, reservations waiting (inferred: the librarian home contents). |
| Driver (role template; the login belongs to the Driver record) | Today's trips with **Start trip** (only when Transport is on) (inferred: the driver home contents). |
| Receptionist / Front Office | Opens on Front Office, Reception Desk instead of the Dashboard (inferred). |

Tiles and panels (each number is a link, see Actions):

| Tile or panel | Numbers | Source module |
|---|---|---|
| Head counts | Students, parents, staff, admins | 03, 09, 20 |
| Student attendance today | Present, absent, late, % (for example "34 / 35 present, 97%") | 05 |
| Staff attendance today | Present / total, % | 05 |
| Fee collection today | Amount and number of payments | 06 |
| Fees due | Outstanding amount, overdue amount | 06 |
| Expenses | Today, this month, pending approval | 07 |
| Income vs expense | This month: income, expense, net | 07 |
| Budget (optional) | Budget used, expense as % of budget | 07 |
| Exam average | Average % of the latest published exam, by class | 08 |
| Pending admissions | Applications waiting for a decision | 02 |
| Discipline cases (optional) | Open incidents this month | 03 |
| Transport (optional) | Vehicles, routes, drivers; live fleet status and transport alerts; **Manage Transport** shortcut | 12 |
| Academic panel | Syllabus completion %, marks, weak classes | 04, 08 |
| Teacher panel | Teacher attendance, workload, teachers on leave | 05, 04, 09 |
| Operations panel (optional) | Transport, library, inventory, assets, visitors, facilities | 12, 13, 14, 16 |
| Classes overview | Students in each class and section at a glance (for example "5 A: 34"), with total per class; tap a class to open its Student List (from the old software's "Classes overview" widget) | 03, 04 |
| Principal summary (optional, AI) | A short written summary of the school's day or week, labelled "Suggestion" | 19 |

**Controls**

- Filters: date range (default today), academic year (default current), class (default all in scope), campus (default the person's campus).
- "Last refreshed 10:42 AM" on live tiles, a refresh button, and auto-refresh every 5 minutes by default. The person can change the interval (1, 5, 15 minutes or off) (inferred: the choices).
- Quick-action shortcuts for the role's common jobs (for example Collect Fee, Take Attendance, Add Enquiry, Record Expense).

**Actions**

- Tap any number to open the records behind it, already filtered. Example: "3 absent" opens Attendance Register for today filtered to Absent; "₹5,000 collected" opens Fee Dashboard, Recent Payments for today. The list always shows exactly the records counted in the tile.
- Tap a quick action to open that screen.
- Principal summary (optional): "Summarise today" or "Summarise this week" produces a short text from today's numbers. It shows the numbers it used and is labelled "Suggestion" (see 00-global.md, section 2.1).
- **Today's brief** (added 18 October 2026; the Principal summary, switched on per school in Settings, Modules On/Off, AI features): for the Principal and School Admin, at the top of the Dashboard, and sent at 7:30 AM school time on school days (never after 11 AM, never on Sundays or holidays) by the channels each person chose for it in My profile. On Monday it is the weekly brief for the week just gone. Three parts: **What happened** (attendance against the usual of the 4 weeks before, fees collected and this month against what is expected, admissions), **What may need you next** (students who need a closer look, the most important Looking ahead suggestions) and **Waiting for your decision** (approvals). Every line is from the school's own records, with the list behind it and what it is based on; forecasts are labelled "Suggestion". The words are made by rules, not by an outside AI; an AI may later only rephrase them, never add a fact. The notification and its copies carry counts and totals only, never a student's name.

**Form fields:** none. Filters only.

### Needs Attention

**Purpose:** what needs action now, in one list.

**What the person sees**

A list of cards, most urgent first. Each card says what is wrong, how many, and has one button to deal with it.

| Item | Example | Button opens |
|---|---|---|
| Students absent 3 days in a row | "4 students absent 3+ days" | Attendance Register filtered to those students |
| Overdue fees | "₹2,40,000 overdue from 61 students" | Fee Management, Defaulters |
| Staff leave requests | "3 leave requests waiting" | Approvals, filtered to leave |
| Approvals waiting (count) | "7 approvals waiting for you" | Approvals |
| Transport issues (optional) | "Bus KA01AB1234 offline 20 minutes" | Transport, Live Tracking |
| School-level risk signals | "Class 9 B attendance fell below 80% this week" | The list behind the signal |
| Alerts for critical issues and operational exceptions | "Payment gateway test failed", "SMS credits below 100" | The screen that fixes it |
| First-login setup checklist | "Setup: 6 of 10 steps done" | The next setup step |
| Guardians without consent | "42 guardians have not given data consent" (DPDP consent, decided 9 October 2026) | Student Management, Student List filtered to guardians without consent, with "Send consent request" through Parent Link |

**Rules for the list**

- Duplicate alerts about the same thing are merged into one card with a count.
- A card disappears by itself when the underlying work is done (the leave is decided, the fee is paid).
- A person can mark a card "Seen". It stays hidden for that person until its number changes (inferred).
- The "absent 3 days" rule uses the number of days set in Attendance Settings, chronic absenteeism alert (default 3, inferred link).

**Setup checklist** (shown to School Admin and Principal until complete; steps follow the build order, inferred):

1. School profile and logo (Settings, School Profile)
2. Academic year, terms and school timings (Academic Settings)
3. Classes and sections (Classes & Sections)
4. Subjects (Subjects)
5. Staff and logins (Add Staff)
6. Students and parents (Student List, Import)
7. Fee structure (Fee Structure)
8. Messaging channel connected (Settings, SMS, WhatsApp & Email)
9. Holiday list (School Calendar)
10. Payment gateway (Settings, Payment Gateways; optional)

Each step shows Done or a "Start" button. Steps for switched-off modules are hidden.

**Form fields:** none.

### My Tasks

**Purpose:** tasks given to staff, with due dates, reminders and status.

**What the person sees**

- Tabs: **My tasks** (assigned to me), **Given by me**, and **All tasks** (only for people with full task-manager access).
- List columns: task title, assigned to, given by, due date and time, status, last update. Overdue tasks are shown in red at the top.
- Filters: status, due (today, this week, overdue), assigned to, given by.

**Actions**

- Add task, edit task, change status, reassign, add a comment (inferred: comments), archive.
- Mark done from the list with one tap (with Undo, see P5).
- Task reports (see section 7).

**Form fields: Add task**

| Field | Required | Default | Notes |
|---|---|---|---|
| Task | Yes | | Short title, up to 150 characters (inferred limit) |
| Assign to | Yes | Me | Staff picker. People with "own tasks only" access can assign only to themselves (inferred). |
| Due date and time | No | None | If set, a reminder goes out (see below) |
| Details | No (under "More details") | | Free text |
| Remind | No (under "More details") | 1 day before due, and on the due morning (inferred) | Uses Notifications |

**Statuses:** To do, In progress, Done, Cancelled (inferred list). Changing status writes to the task history.

**Access levels:** "Full task manager" can see, assign and report on everyone's tasks. "Own tasks only" sees tasks given to or by them. Which roles get which level is set in Settings, Users & Permissions.

### Today & Upcoming

**Purpose:** today's agenda and what is coming soon.

**What the person sees**

- **Today:** substitutions needed (and substitutions the person must take), PTMs, exams and events today.
- **Upcoming:** exams and events in the next 7 days (inferred: 7 days), with date and class. A **+ Add event** button opens the Add Event form of Events & Calendar (shown only to people allowed to add events; before Events & Calendar is built it adds a School Calendar entry in Attendance Management, inferred).
- **Birthdays:** students, parents and staff with birthdays in the next 7 days (inferred: 7 days), as in the old software. Parents appear only when a guardian's date of birth is recorded (inferred). A teacher sees only their own students and those students' parents. Birthday wishes are sent automatically when switched on in Communication, Message Settings.

**Actions:** tap an item to open it (the substitution in Academic Management, the exam in Datesheet, the event in Events & Calendar, the student's profile). "Arrange substitute" on an unfilled substitution opens Substitutions.

**Form fields:** none.

## 3. All features

43 features are mapped to this module: 37 Core and 6 Optional. Tick each one when it is built and tested.

### School Today (28)

- [ ] Each role gets its own home screen showing only the data it is allowed to see (Core)
- [ ] Principal home (control centre): today's attendance, fees, expenses, transport, approvals and alerts on one screen (Core)
- [ ] Teacher home: today's classes with a Take Attendance button for each, timetable, homework, exams and marks, lesson plans, substitutions, notices, leave, meetings, PTMs (Core)
- [ ] Teacher to-do counts: homework to check, assessments pending, parent messages (Core)
- [ ] Accountant home: money today (collected, pending, expenses) with Collect Fee, Record Expense, View Payments, Send Fee Reminder and Reports buttons (Core)
- [ ] Homes for admin, HR, librarian and driver that open on their pending work (Core)
- [ ] Head-count tiles: students, parents, staff, admins (Core)
- [ ] Today's student attendance: present, absent, late, % (Core)
- [ ] Today's staff and teacher attendance (Core)
- [ ] Today's fee collection and number of fee payments (Core)
- [ ] Outstanding / fees-due amount (Core)
- [ ] Expense overview: today, this month, pending expenses (Core)
- [ ] Income vs expense summary (Core)
- [ ] Budget used and expense as % of budget (Optional: schools that set budgets)
- [ ] Exam average (Core)
- [ ] Classes overview: students per class and section at a glance (Core)
- [ ] Pending admissions count (Core)
- [ ] Discipline cases count (Optional: schools tracking behaviour)
- [ ] Transport tiles: vehicles, routes and drivers count, with a Manage Transport shortcut (Optional: schools running buses)
- [ ] Live fleet status and transport alerts (Optional: schools running buses)
- [ ] Academic panel: syllabus completion, marks, weak classes (Core)
- [ ] Teacher panel: teacher attendance, workload, leave (Core)
- [ ] Operations panel: transport, library, inventory, assets, visitors, facilities (Optional: schools running these services)
- [ ] Filter by date range, academic year, class and campus (Core)
- [ ] Drill down from any number to the records behind it (Core)
- [ ] Quick-action shortcuts for common jobs (Core)
- [ ] Last-refreshed time on live tiles, with adjustable auto-refresh (Core)
- [ ] Principal summaries of the school's day or week (Optional: schools using AI)

### Needs Attention (5)

- [ ] Alerts panel for critical issues and operational exceptions (duplicates merged) (Core)
- [ ] "What needs my attention" list, e.g. students absent 3+ days, overdue fees, staff leave requests, transport issues (Core)
- [ ] First-login setup checklist (Core)
- [ ] School-level risk signals (Core)
- [ ] Guardians without data consent, with a button to send the consent request through Parent Link (Core)

### My Tasks (6)

- [ ] Create, assign and update tasks for staff (Core)
- [ ] Task status tracking (Core)
- [ ] Task due dates and "task due" reminders (Core)
- [ ] My Tasks list for each staff member (Core)
- [ ] Task reports (Core)
- [ ] Task access levels: full task manager vs own tasks only (Core) · who gets full access is set in Settings, Users & Permissions

### Today & Upcoming (4)

- [ ] Today's agenda: substitutions needed, PTMs, exams and events today (Core)
- [ ] Upcoming exams and events (Core)
- [ ] "+ Add event" button on Upcoming events (Core)
- [ ] Upcoming birthdays of students, parents and staff (Core)

## 4. Connections

**Receives**

| From | What |
|---|---|
| 05 Attendance | Today's student and staff attendance; absent streaks; below-threshold flags (A4) |
| 06 Fee Management | Today's payments, fees due, overdue, failed online payments (A1, A7, A8) |
| 07 Finance | Expenses today, this month, pending; income vs expense; budget used |
| 02 Admission | Pending applications count |
| 03 Student Management | Head counts, students per class and section, discipline cases, student and parent birthdays, guardians without consent |
| 09 Staff & HR | Staff head count, leave requests, birthdays, expiring documents (A15) |
| 04 Academic | Today's timetable per teacher, substitutions, syllabus completion, workload |
| 08 Examination & Results | Exam average, upcoming exams, weak classes |
| 18 Events & Calendar | Today's and upcoming events and PTMs; the Add Event form opened from "+ Add event" |
| 12 Transport (optional) | Vehicle, route and driver counts; live fleet status; transport alerts |
| 13, 14, 16 (optional) | Operations panel numbers: library, inventory, assets, visitors, facilities |
| 19 Reports & Analytics | School-level risk signals, principal summaries |
| Top bar Approvals | Waiting count for this person |
| 20 Settings | Setup progress, modules switched on, task access levels |

**Sends**

- Task reminders and "task assigned" alerts as Notifications.
- Drill-down: opens other modules' lists with filters already applied. The Dashboard never changes another module's data itself.

**Automations:** none are triggered here. The Dashboard shows the results of A1 (fee paid) and A4 (attendance marked) as soon as they happen.

## 5. Rules and mistake-proofing

| Rule | How it is prevented | What the person is told | How they recover |
|---|---|---|---|
| A tile shows only data the person may see | Numbers are calculated on the server with the person's scope | Nothing; tiles they may not see are simply absent | Ask an admin for a wider role |
| Tile numbers must match the list behind them | Tile and drill-down list use the same query and filters (inferred) | The list header repeats the tile ("34 present today, 5 A") | Not needed |
| Stale numbers are not mistaken for live ones | Last-refreshed time on every live tile | "Last refreshed 10:42 AM" | Tap refresh |
| Past year opened from the top bar | Read-only view (P18) | Yellow strip "You are viewing 2025-26" | Switch year in the top bar |
| Task due date in the past | Warning on save (inferred) | "Due date is before today. Save anyway?" | Change the date or save |
| Assigning tasks outside one's access | Assign-to list only offers allowed staff | Not shown | Ask for full task-manager access |
| Closing a task by mistake | Undo for 10 seconds; status can be changed back | "Task marked done. Undo" | Undo or reopen |

## 6. Settings

The Dashboard has no settings page of its own (none is listed in the plan). What can be configured:

- Auto-refresh interval: per person, on School Today.
- Which tiles appear: follows the person's roles (Settings, Users & Permissions) and the modules switched on (Settings, Modules On/Off).
- Task access levels (full task manager or own tasks only): Settings, Users & Permissions.
- The "absent N days" rule and the attendance % threshold: Attendance Settings (inferred link).
- Birthday wishes on or off: Communication, Message Settings.

## 7. Reports

- **Task reports:** tasks by person, by status, overdue tasks, and average time to close (inferred: the last measure). Filters: date range, assigned to, given by.
- All other numbers on the Dashboard come from the reports of their modules and are listed in Reports & Analytics.

## 8. Records used

| Record | Creates | Reads | Updates |
|---|---|---|---|
| Task | Yes | Yes | Yes (status, reassign, archive) |
| Notification | Yes (task alerts) | Yes | Yes (read, done) |
| Attendance Mark, Student, Staff, Guardian, User Login, Consent Record | | Yes | |
| Payment, Student Fee Due, Expense, Income, Budget, Day Book Entry | | Yes | |
| Application, Exam, Marks, Event, Calendar Entry, Timetable Period, Teacher Allocation, Leave Request, Approval | | Yes | |
| Vehicle, Route, Driver, Trip, Book Issue, Item, Asset, Visitor Entry (when switched on) | | Yes | |
| Audit Log Entry | Yes (task changes) | | |

Other records (inferred): **Setup Step Status** (which setup steps are done, per school); **Task Comment**.

## 9. Done when

1. A principal, an accountant and a teacher each log in and see a different home that matches section 2, with no tiles for switched-off modules.
2. Tapping "absent" on the attendance tile opens a list with exactly that many students, for today and the same filters.
3. Collecting a fee in Fee Management raises "today's collection" on the Dashboard within one refresh, and the amount matches the Day Book for today.
4. A teacher sees each of today's classes with a Take Attendance button that opens the right class and period.
5. Needs Attention lists a student absent 3 days in a row, and the card disappears after the student is marked present.
6. A new school sees the setup checklist; finishing a step marks it Done.
7. A task given to a staff member with a due date sends a reminder on time and shows as overdue in red after the due time.
8. Changing campus or academic year in the filters changes every tile, and a past year shows the read-only strip.
9. The page works on a phone with tiles stacked in one column and the main quick action at the bottom.

## 10. Open questions

- Which homes should Receptionist, Transport in-charge and Warden open on? The inputs name homes only for principal, teacher, accountant, admin, HR, librarian and driver. (Assumed: receptionist opens Front Office, Reception Desk.)
- Should the "Exam average" tile use the latest exam or the whole year so far? The inputs do not say.
- D3 (decided): Transport is not in the first version, so the transport tiles and transport alerts are hidden until Transport is built.
