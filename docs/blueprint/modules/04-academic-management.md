# 04 Academic Management

Build order: 2nd (Stage 1). Needs Settings. The academic year, classes, sections and subjects must exist before anyone is placed in them.

## 1. Purpose

How teaching is organised: classes, subjects, teachers, the Time Table and the syllabus.

Used by: the Principal, Vice Principal or Academic Head and the timetable in-charge (set-up, Time Table, substitutions), the Office Staff role template when the school switches it on (classes and sections, arranging substitutions), and teachers (their own Time Table, lesson plans and syllabus progress).

## 2. Pages

### Classes & Sections

**Purpose:** classes, sections, streams, seats per section and class teachers.

**What the person sees**

- Classes in teaching order (for example Play Group, Nursery, LKG, UKG, 1 to 12, or college classes such as B.A or B.Sc). Any class name is allowed, including time-slot batches such as "7:00 to 8:00".
- Under each class: its sections with seats (capacity), students now, seats left, class teacher, and stream (optional).
- Totals: classes, sections, students, seats left.

**Actions**

- Add class; add section; edit; reorder classes by dragging (inferred: drag to reorder).
- Set or change the class teacher of a section (staff picker showing each teacher's current class-teacher duties).
- Set seats per section.
- Add streams (optional, for example Science, Commerce, Arts) and attach sections to a stream.
- **Board per class (optional, schools running two boards):** a class can follow its own board, for example State board for classes 1 to 8 and CBSE for 9 to 12. The default is the school's board from Settings, School Profile. The class's board sets the grading scale and report card format used in Examination & Results, and the curriculum in Syllabus & Lesson Plans.
- Archive a class or section that has no students this year.

**Form fields: Add class**

| Field | Required | Default | Notes |
|---|---|---|---|
| Class name | Yes | | Any text; unique in the year |
| Order | Yes | After the last class | |
| Level | No | Guessed from the name (Pre-primary, Primary, Middle, Secondary, Senior secondary), inferred | Used to group reports |
| Sections | Yes | One section "A" | Type "A, B, C" to add several at once (inferred) |
| Seats per section | No | 40 (inferred) | |
| Board | No | The school's board (Settings, School Profile) | Shown only when the school runs more than one board. Sets grading and report card format for this class |

**Form fields: Add section**

| Field | Required | Default | Notes |
|---|---|---|---|
| Section name | Yes | Next letter | |
| Seats | No | The class's default | |
| Class teacher | No | | |
| Stream | No | | Only when streams are on |
| Room | No | | Used by the Time Table room view (optional) |

### Subjects

**Purpose:** subjects for each class, including optional subjects and second languages chosen by students.

**What the person sees**

- Subject list: name, code, type (core, optional, elective), classes it is taught in.
- Per class: the subjects mapped to it, with effective dates, and for optional or elective subjects the seats and the students who chose them.

**Actions**

- Add or edit a subject.
- Map subjects to classes and sections, with a "from" date (and "to" date when a subject stops) so mid-year changes keep history.
- Copy the subject map of one class to other classes (inferred).
- **Elective and language choices (optional):** set seats and prerequisites for each choice; record each student's choice (one by one or in bulk); see who has not chosen yet.

**Form fields: Add subject**

| Field | Required | Default | Notes |
|---|---|---|---|
| Subject name | Yes | | |
| Code | No | Made from the name (inferred) | Unique |
| Type | Yes | Core | Core, optional, elective |
| Classes | No | | Can be mapped later |

### Teacher Allocation

**Purpose:** which teacher teaches which subject in which class, and each teacher's workload.

**What the person sees**

- A grid of classes and sections against subjects, with the teacher in each cell (primary teacher, plus secondary teacher where set).
- Teacher view: each teacher's classes and subjects, periods per week, and workload against their limit (for example "28 of 32 periods").
- Gaps highlighted: subjects in a class with no teacher yet.

**Actions**

- Assign a teacher to a subject in a class or section (same data as step 3 of Add Staff in Staff & HR).
- Set a primary and a secondary subject teacher.
- Change or remove an assignment, from a date (history kept).
- Assignments carry over to the next year automatically (they are "permanent", as in the old software) until changed (inferred: carried over when a new year opens).

**Form fields: Assign teacher**

| Field | Required | Default | Notes |
|---|---|---|---|
| Class and section | Yes | The cell clicked | "All sections" allowed |
| Subject | Yes | The cell clicked | |
| Teacher | Yes | | Shows each teacher's current load |
| Role | Yes | Primary | Primary or secondary |
| Periods per week | No | From the subject's period count in the Time Table (inferred) | |
| From date | Yes | Today | |

### Time Table

**Purpose:** make, check and print the class and teacher Time Table, by hand or automatically, with no clashes.

**What the person sees**

- **Class Time Table:** weekly grid, periods down the side (with times), days across (Monday to Saturday, from the school's working days). Each cell shows subject, teacher and time; breaks and lunch span the full row.
- **Teacher Time Table:** the same grid for one teacher, showing classes.
- **Free periods view:** for a day, which teachers are free in which period.
- **Room and lab Time Table (optional):** the grid for a room or lab, and lab bookings.
- **Activity Time Table (optional):** activity periods such as sports or music by group.
- **School overview:** all class Time Tables at once, teacher workload, and any clashes.
- Status of each Time Table: **Draft** or **Published** (with its effective date). Only the published version is shown to teachers and students.

**Actions**

- **Edit a period** (click an empty or filled cell): start and end time (from the period master), subject, teacher, room. After a subject is chosen, the teacher list shows only teachers assigned to that subject and class; "Show all teachers" lists everyone.
- Mark a period as lunch or break.
- Apply a change to the whole week (the same period on every day).
- Remove a period (with Undo).
- **Make automatically:** for one class or the whole school, using teacher allocations, teacher preferences and subject conditions. The result is a draft to check before publishing; it never replaces the published Time Table by itself.
- **Import a complete Time Table** from filled weekly Excel grids: match teacher and subject names, fix clashes, then replace the chosen classes' drafts.
- **Clash check** before save and publish: a teacher, room or lab booked twice at the same time. Clashes are listed with a "Go to" link each.
- **Copy** a Time Table to another week or to the next year; clashes are listed first.
- **Publish** a version with an effective date.
- **Print** one class or many classes, and teacher Time Tables (browser print, P9). Legend: teaching, lunch, fixed or assembly.
- **Calendar feed (optional):** a read-only link a teacher can add to Google or Outlook calendar.
- **Lab booking (optional):** book a lab for a period; blocked if already booked.
- Adjusts automatically for events, exams and holidays: on a holiday no periods show; on exam days the Datesheet replaces periods for the classes sitting the exam (automation A10 and A11). A teacher's day shows the papers they invigilate in place of the periods of the classes sitting them.

**Form fields: Edit period**

| Field | Required | Default | Notes |
|---|---|---|---|
| Start and end time | Yes | From the period master for that row | |
| Subject | Yes (unless lunch or break) | | Only subjects mapped to the class |
| Teacher | Yes (unless lunch or break) | The class's assigned teacher for the subject | Narrowed to assigned teachers; "Show all teachers" to widen |
| Room | No | The section's room | Optional room view |
| Lunch or break | No | Off | |
| Whole week | No | Off | Help: "Changes this period on every day of the week" |

### Substitutions

**Purpose:** arrange a substitute when a teacher is absent, without double booking anyone.

**What the person sees**

- Today (default) and a date picker: list of periods needing a substitute: date, period, class, subject, absent teacher, reason (leave or absent), substitute (or "Needed").
- Substitute Time Table: for a day, all substitutions by teacher.
- Substitution load per teacher this week and month (inferred: helps fairness).

**Actions**

- **Assign substitute:** the list of suggested substitutes shows teachers free in that period, ranked: teaches the same subject, teaches that class, fewest substitutions this week (inferred: the ranking). Teachers already booked in that period are not offered.
- Substitutions are raised automatically when a teacher's leave is approved (automation A5), or by hand when a teacher is marked absent in Staff Attendance (inferred).
- **Temporary teacher** for a longer absence: replaces the absent teacher's periods from one date to another.
- Remove or change a substitution.
- The substitute and the class teacher are notified; the substitute's home screen shows the extra period.

**Form fields: Assign substitute**

| Field | Required | Default | Notes |
|---|---|---|---|
| Period(s) | Yes | The row clicked | Can select all of a teacher's periods for the day |
| Substitute | Yes | Top suggestion | Only free teachers |
| Note | No | | |

**Form fields: Temporary teacher**

| Field | Required | Default | Notes |
|---|---|---|---|
| Absent teacher | Yes | | |
| From and to dates | Yes | | |
| Temporary teacher | Yes | | Staff picker; may be a newly added temporary staff member |

### Syllabus & Lesson Plans

**Purpose:** chapters to teach, lesson plans, daily progress and chapters running late.

**What the person sees**

- **Syllabus:** per board and class, per subject, a tree of units, chapters, lessons and topics, each with planned dates and status (Planned, Taught, Completed, Pending).
- **Progress:** per subject and section, % completed against % planned by today; chapters running late are shown in red (the old "Delay Dashboard").
- **Lesson plans:** a teacher's plans by topic and date, with objectives and resources.
- **Daily log:** what each teacher covered today.
- **Teaching plans (optional):** annual, term, monthly and weekly plans.
- **Objectives and competencies (optional):** coded learning objectives, outcomes, competencies and skills linked to topics.
- **Group view (optional):** central curriculum for a school group, which schools can copy.

**Actions**

- Set up the curriculum for a board and class (add units, chapters, lessons, topics; import from Excel (P10); copy from another class or year).
- Plan dates for chapters.
- Write a lesson plan for a topic and date. With the AI teacher assistant switched on, "Draft with AI" fills a suggested plan, labelled "Suggestion", which the teacher edits and saves (see Homework & Learning for the assistant).
- Mark progress: in the daily log, tick topics taught today (two taps from the teacher's home, inferred); mark a chapter completed.

**Form fields: Lesson plan**

| Field | Required | Default | Notes |
|---|---|---|---|
| Class, section, subject | Yes | From the teacher's allocation | |
| Topic | Yes | Next pending topic | |
| Date | Yes | Next period of that subject in the Time Table | |
| Objectives | No | | |
| Resources | No | | Links or files |
| Activities and homework | No | | Can create homework directly (inferred link to Homework) |

### Academic Settings

**Purpose:** the academic year and terms, school timings, periods and breaks, and Time Table rules for teachers and subjects. See section 6.

## 3. All features

45 features are mapped to this module: 35 Core and 10 Optional. Tick each one when it is built and tested.

### Classes & Sections (5)

- [ ] Classes / grades with order and level (Core)
- [ ] Sections under a class, with capacity (Core)
- [ ] Class teacher for each section (Core)
- [ ] Streams (e.g. science, commerce) (Optional: higher-secondary schools)
- [ ] Board per class (default the school's board), setting grading and report card format (Optional: schools running two boards in one school)

### Subjects (3)

- [ ] Subject list with codes and type: core, optional, elective (Core)
- [ ] Map subjects to classes and sections (with effective dates) (Core)
- [ ] Elective and language choices per student, with seat limits and prerequisites (Optional: schools offering electives or language choices)

### Teacher Allocation (2)

- [ ] Assign classes and subjects to each teacher (also step 3 of Add Staff) (Core)
- [ ] Primary and secondary subject teachers (Core)

### Time Table (15)

- [ ] Weekly class timetable grid (Core)
- [ ] Edit a period: start / end time, subject, teacher, room (Core)
- [ ] "Show all teachers" when choosing a teacher (Core)
- [ ] Mark a period as lunch / break (Core)
- [ ] Apply a change to the whole week (Core)
- [ ] Teacher timetable view (Core)
- [ ] Room and lab timetable / allocation (Optional: schools sharing rooms or labs)
- [ ] Activity timetable (Optional: activity-focused schools)
- [ ] Clash check before save / publish: teacher, room or lab double-booked (Core)
- [ ] Free periods view (Core)
- [ ] Copy a timetable to another week or year, listing clashes first (Core)
- [ ] Publish a timetable version with an effective date (only the published version is shown) (Core)
- [ ] Timetable adjusts for events, exams and holidays (Core) · automatic
- [ ] Timetable calendar feed (read-only) (Optional: schools syncing calendars)
- [ ] Lab bookings (Optional: schools with science labs) · rooms and labs

### Substitutions (4)

- [ ] Assign a substitute for an absent teacher (no double booking) (Core)
- [ ] Approved teacher leave raises substitution needs for the affected periods (Core) · automatic, see 'Teacher leave approved'
- [ ] Substitute timetable (Core)
- [ ] Temporary teacher for a longer absence (Core)

### Syllabus & Lesson Plans (7)

- [ ] Curriculum setup per board / class (Core)
- [ ] Syllabus tree: units, chapters, lessons, topics (Core)
- [ ] Learning objectives, outcomes, competencies and skills (coded) (Optional: competency-based curricula)
- [ ] Annual, term, monthly and weekly teaching plans (Optional: schools doing formal planning)
- [ ] Lesson plans by topic and date (objectives, resources) (Core)
- [ ] Syllabus progress per subject: planned, taught, completed, pending (Core)
- [ ] Central curriculum for the group (Optional: school groups) · group view

### Academic Settings (9)

- [ ] Open and close academic years (start / end; one active year per campus) (Core)
- [ ] Closed years become read-only except for authorised corrections (Core)
- [ ] Start a new academic year without overwriting the old one (Core)
- [ ] Remove a wrongly created academic year while nothing is recorded in it (no attendance, fees or marks); after that it can only be closed (Core) (decided 9 October 2026)
- [ ] Terms / semesters inside a year (Core)
- [ ] Teacher workload limits (Core)
- [ ] School timings and working days (Core)
- [ ] Period master: periods, breaks, lunch, start / end times per day (Core)
- [ ] Limit on consecutive periods for a teacher (Core)

## 4. Connections

**Receives**

| From | What |
|---|---|
| 09 Staff & HR | Staff list; class and subject choices made in Add Staff step 3; approved leave (A5) |
| 05 Attendance | Teachers marked absent today (for substitutions, inferred) |
| 08 Examination & Results | Published datesheets (A10) to adjust the Time Table |
| 18 Events & Calendar | Holidays (A11) and events that change the day |
| 17 Homework & Learning | AI teacher assistant drafts for lesson plans (optional) |
| 20 Settings | Board choice (sets default terms and curriculum), campuses |

**Sends**

| To | What |
|---|---|
| Every module | Academic Year, Term, Class, Section, Subject: the base every module uses |
| 03 Student Management | Seats per section; subjects and elective choices on the profile |
| 05 Attendance | Periods for period-wise attendance; teacher's classes for Take Attendance |
| 08 Examination & Results | Subjects per class; subject teachers (who enters marks); each class's board (grading scale and report card format) |
| 10 Salary | Substitution counts (if the school pays for extra periods, inferred) |
| 01 Dashboard | Teacher's classes today, substitutions needed, syllabus completion, workload |
| 19 Reports & Analytics | Teacher workload, syllabus completion |
| Notifications | Substitute assigned; Time Table published |

**Automations:** reacts to **A5** (raises substitution needs), **A10** and **A11** (adjusts the Time Table). It does not own an automation.

## 5. Rules and mistake-proofing

| Rule | How it is prevented | What the person is told | How they recover |
|---|---|---|---|
| One active year per campus | Opening a new year asks to close or keep the old one; only one is active | "2025-26 is active. Opening 2026-27 makes it the active year from 01-04-2026." | Change the start date |
| Closed year changed | Read-only, except authorised corrections with a reason, logged | "2025-26 is closed. Use Make a correction." | Correction by a permitted person |
| Academic year created by mistake | **Remove year** is offered only while nothing has been recorded in the year (no attendance, fees or marks); it needs a typed confirmation (P4, inferred) and is written to the Audit Log. Once anything is recorded, the button is gone and the year can only be closed (decided 9 October 2026) | "Remove 2027-28? Nothing has been recorded in it yet. Its classes, sections and terms will be removed too." or, once used, "Attendance is already recorded in 2026-27, so it cannot be removed. You can close it." | Create the right year; or close the wrong one |
| New year overwrites the old | Starting a new year copies classes, sections, subjects and allocations into new records; the old year's records stay untouched | "Copied 18 classes, 42 sections, 96 allocations into 2026-27" | Edit the new year freely |
| Terms overlap or leave gaps | Term dates must sit inside the year with no overlap (inferred: gaps allowed with a warning) | "Term 2 starts before Term 1 ends" | Fix the dates |
| Section seats below students | Warn when seats are set lower than students now | "5 A has 42 students. Seats set to 40." | Raise seats or move students |
| Archiving a section with students | Blocked | "Move or promote the 38 students first" | Move students |
| Teacher or room double-booked | Clash check on save and publish; clashes listed with links | "Mrs Rao is already in 7 B, period 3 on Monday" | Pick another teacher, room or period |
| Teacher over workload limit or too many periods in a row | Warning on assignment and in the clash check, from Academic Settings limits | "Mr Khan: 34 periods, limit 32" | Assign someone else, or save with a reason (inferred) |
| Automatic Time Table replaces good work | Result is always a draft; publish is a separate step | "Draft made. 2 clashes need attention." | Discard the draft |
| Publishing changes in the middle of a week | Effective date required; teachers notified | "Publish from 13-10-2026?" | Publish a new version |
| Substitute double-booked | Only free teachers offered; server check | Busy teachers not shown | Choose another |
| Class board changed after marks exist | Warning; the new board applies only to exams not yet created (inferred) | "Marks already exist for Term 1 in class 9. The new board applies from the next exam." | Change back, or keep for later exams |
| Subject removed mid-year | Removal uses a "to" date; past marks and homework stay linked | "Hindi ends for 9 C from 01-11-2026" | Extend the date |

## 6. Settings

The **Academic Settings** page holds:

- **Academic years:** open and close years (start and end date; one active year per campus). Closed years become read-only except for authorised corrections. "Start new year" copies the structure without overwriting the old one. **Remove year** (decided 9 October 2026): a wrongly created year (for example the wrong dates or a duplicate) can be removed, with its copied classes, sections and terms, while nothing has been recorded in it yet (no attendance, fees or marks). After that it can only be closed.
- **Terms or semesters** inside a year (yearly, two terms, semesters or the school's own). Default comes from the board chosen in Settings, School Profile.
- **School timings and working days:** start and end time, which days are working days (for example Monday to Saturday), and half days (inferred: half days). The working days are part of the school's one rule for a school day (04-data-model.md rule 18): a day that is not a working day of the campus has no attendance, no periods and no leave counted. On a half day the periods that start after the early end are not held.
- **Period master:** periods, breaks and lunch, with start and end times for each day of the week.
- **Teacher workload limits:** maximum periods per day and per week.
- **Limit on consecutive periods** for a teacher.
- **Teacher preferences:** maximum periods, rest times and availability for each teacher (used when making the Time Table automatically).
- **Subject conditions:** block a subject from a period (for example no Maths in period 8), for one class or all classes.
- **Substitution rules:** whether substitutions are raised automatically from leave (default on, inferred).

## 7. Reports

- Class strength and seats: students and seats left per section.
- Teacher allocation: subjects without a teacher; teachers by subject.
- Teacher workload: periods per teacher per week against the limit.
- Free periods by day.
- Substitutions: by teacher, by month, by absent teacher.
- Syllabus progress: completion % by class, subject and teacher; chapters running late.
- Time Table prints: class, teacher, room.

Teacher workload and syllabus completion analysis also appear in Reports & Analytics, Analytics.

## 8. Records used

| Record | Creates | Reads | Updates |
|---|---|---|---|
| Academic Year, Term | Yes | Yes | Yes (open, close; remove only while nothing is recorded in the year, decided 9 October 2026) |
| Class, Section | Yes | Yes | Yes |
| Subject | Yes | Yes | Yes |
| Teacher Allocation | Yes | Yes | Yes (with dates) |
| Timetable Period | Yes | Yes | Yes |
| Staff | | Yes | |
| Student | | Yes (counts, elective choices) | Yes (elective choice, optional) |
| Leave Request | | Yes (approved staff leave) | |
| Exam, Datesheet Entry, Calendar Entry | | Yes | |
| Notification | Yes | | |
| Audit Log Entry | Yes | | |

Other records (inferred): **Stream**, **Subject Class Map** (with from and to dates), **Elective Choice**, **Period Master** (period slots per day), **Timetable Version** (draft or published, effective date), **Substitution**, **Room** and **Lab Booking**, **Teacher Preference**, **Subject Condition**, **Syllabus Item** (unit, chapter, lesson, topic), **Lesson Plan**, **Teaching Plan**, **Syllabus Progress Entry** (daily log), **Learning Objective**.

## 9. Done when

1. A new school creates the year 2026-27 with two terms, 15 classes and their sections, with seats and class teachers, in under 15 minutes.
2. Starting the next year copies classes, sections, subjects and allocations, and the old year still opens read-only with its data unchanged.
3. Choosing History for a period narrows the teacher list to teachers assigned to History in that class; "Show all teachers" widens it.
4. Saving a period that books a teacher twice at the same time is blocked with a message naming the other class.
5. "Make automatically" for one class produces a draft with no clashes, and the published Time Table does not change until Publish.
6. Approving a teacher's leave for Monday lists that teacher's Monday periods in Substitutions, and the suggested substitutes are all free in those periods.
7. On a holiday added in the School Calendar, the Time Table shows no periods for that day.
8. A teacher ticks topics taught in the daily log on a phone, and syllabus progress for that subject updates.
9. Printing Time Tables for three classes gives one clean page per class with the legend and the date generated.
10. A year created with the wrong dates can be removed before any attendance, fees or marks are recorded in it; once one attendance mark exists, only Close is offered (decided 9 October 2026).

## 10. Open questions

- Does the school pay teachers for extra substitution periods? If yes, substitution counts must flow to Salary. The inputs do not say.
- When a Time Table is made automatically, which rule wins when teacher preferences and subject conditions conflict? Assumed: subject conditions first, then preferences.
- Should teacher allocations really carry over to the next year automatically? The old software said assignments are "permanent"; the plan does not say.
