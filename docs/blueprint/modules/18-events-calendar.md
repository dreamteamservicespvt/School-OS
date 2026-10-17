# 18 Events & Calendar

Build order: 15th (Stage 3). PTMs need results and teacher slots; event payments use Fee Management. **Exception:** the School Calendar page (holidays) is built earlier, together with Attendance Management (9th), because attendance needs the holiday list.

## 1. Purpose

The school calendar, events, PTMs, activities and photos.

Used by: the Principal and office (calendar, holidays, events), teachers and class teachers (PTM slots and notes, activities, achievements), the sports, house and club in-charges (co-curricular and sports), pre-primary teachers (daily activities), and anyone allowed to upload photos (gallery).

## 2. Pages

### School Calendar

**Purpose:** one calendar for the year: holidays, vacations, exams, events and PTMs.

**What the person sees**

- Month view (and a year list view, inferred), with "Jump to month" and arrows.
- Each day shows its entries as coloured chips: **Weekend** (grey), **Holiday** (red), **Vacation** (red band), **Exam day** (from published datesheets), **Event** (green), **PTM**, **Admission test**. These are the Calendar Entry types: holiday, vacation, exam day, event, PTM, admission test (decided 9 October 2026); weekends come from Events Settings.
- Legend: Holiday means attendance is off that day; Event means it shows on the calendar and attendance can still be taken.
- Today highlighted. Filters: entry type, class (exams and PTMs for one class), campus.
- The year's holiday list as a table (date, name, type).

**Actions**

- **Add a holiday or event** for one date (name, date, "allow attendance on this date"). Adding a holiday runs automation A11.
- **Add a vacation** (a date range, for example summer vacation).
- **Remove** an entry (with Undo; removing a holiday switches attendance back on for that day after confirmation).
- Import the holiday list from a spreadsheet, or copy last year's with dates to check (inferred).
- Exams appear automatically from published datesheets (A10); events and PTMs from their pages; admission test dates are added here or from Admission Management (inferred).

**Form fields: Add to calendar**

| Field | Required | Default | Notes |
|---|---|---|---|
| Name | Yes | | For example "Republic Day", "Annual Function" |
| Type | Yes | Holiday | Holiday, vacation, exam day, event, PTM, admission test (decided 9 October 2026) |
| Date (or from and to for a vacation) | Yes | | |
| Allow attendance on this date | Yes | Off for holidays and vacations, On for events | |
| Applies to | No | Whole school | Classes or campuses (inferred) |
| More details | No | | Description, notify parents (inferred) |

### Events

**Purpose:** plan an event with date, venue and audience; registration, payments and reminders where needed.

**What the person sees**

- Events list: name, type, date and time, venue, audience, registrations (optional), status (**Planned**, **Open for registration**, **Done**, **Cancelled**; inferred).
- One event: details, audience, registrations, attendance, seating, payments, volunteers, reminders sent.

**Actions**

- **Create an event** with type, date, venue and audience; it appears in the School Calendar.
- **Registration (optional):** open registration for students (staff record it, or students with logins sign up); limit seats.
- **Attendance (optional):** mark who attended.
- **Seating (optional, large events):** assign seats or rows.
- **Payments (optional):** set a fee; the charge is added to the registered students' fees and collected through Fee Management (inferred: as a fee row), or by payment link.
- **Volunteers (optional):** list staff, students or parents helping, with their duties.
- **Reminders:** send reminders to the audience before the event (through Communication).
- **Alumni events (optional):** invite the alumni group.
- Cancel an event (audience told, payments refunded through Fee Management, inferred).

**Form fields: Create event**

| Field | Required | Default | Notes |
|---|---|---|---|
| Name | Yes | | |
| Type | Yes | | From Events Settings |
| Date and time | Yes | | |
| Venue | No | | |
| Audience | Yes | Whole school | Classes, staff, parents, alumni |
| Campus | No | All campuses | Only for a school with more than one campus. An event of one campus uses that campus's year and classes; it shows on Parent Link (with its consent form) and its messages go only to that campus, as a notice for one campus does. Holidays of one campus show on Parent Link for that campus's children only (added 18 October 2026). |
| Registration | No | Off | Seats limit when on |
| Fee | No | None | |
| Reminder | No | 1 day before (inferred) | |

### PTM

**Purpose:** parent-teacher meeting slots, booking by staff, notes and parent feedback.

**What the person sees**

- PTM calendar: PTM days with classes and times.
- For a PTM day: teacher time slots, booked and free, by teacher.
- **Waiting queue (optional, large schools):** on the day, parents waiting per teacher, in order.
- For one meeting: the student's performance view (latest marks, attendance %, homework completion, behaviour notes) on one screen.

**Actions**

- **Plan a PTM:** date, classes, time window, slot length; teachers' slots are created from their classes (inferred).
- **Book slots for parents** (done by school staff, since parents have no password login and Parent Link is read-only): pick the student, the teacher and a free slot; the parent gets a confirmation and a reminder message (automatic message rule).
- On the day: mark parent arrived, manage the queue (optional), open the student's performance view.
- **Record meeting notes, teacher remarks and parent feedback.** Notes appear on the student profile (Activities tab).
- Send a "PTM summary" message to parents who did not attend (inferred).

**Form fields: Plan PTM**

| Field | Required | Default | Notes |
|---|---|---|---|
| Date | Yes | | Must be a working day |
| Classes | Yes | | |
| Time window | Yes | School hours (inferred) | |
| Slot length | Yes | 10 minutes (inferred) | |
| Teachers | Yes | Class teachers of the chosen classes (inferred) | Add subject teachers |

**Form fields: PTM notes**

| Field | Required | Default | Notes |
|---|---|---|---|
| Teacher remarks | No | | |
| Parent feedback | No | | |
| Follow-up actions | No | | (inferred) |

### Co-curricular & Sports

**Purpose:** activities, competitions, achievements, certificates, houses, clubs and sports teams.

**What the person sees**

- Tabs: **Activities and achievements**, **Houses** (optional), **Clubs** (optional), **Sports** (optional).
- Activities: music, dance, debate, art, public speaking, olympiads, competitions, projects, volunteering, with participants.
- Achievements: student, activity or competition, level (school, district, state, national; inferred), position, date. These also show on the student profile.
- Competition results (optional).
- Houses: house names, students in each, house points and the leaderboard.
- **Activity credits (optional):** points a student earns for taking part in or winning activities, with each student's total for the year. The total also shows on the student profile.
- Clubs: clubs with members and in-charge.
- Sports: teams with coaches, training sessions and attendance, fixtures and competitions, sports achievements, fitness records.

**Actions**

- Record participation and achievements (bulk for a whole team or class). With activity credits on, the credits set for that activity and level are added to each student's total; credits can be corrected with a reason (inferred).
- Issue **participation and achievement certificates** (design from Settings, Document Designs), printed or sent.
- Houses: assign students to houses (automatically in turn by class and roll, or by hand; inferred), add or remove house points with a reason.
- Clubs: add members; record meetings (inferred).
- Sports: create teams; record training sessions and attendance; record fixtures and results; record fitness test results.

**Form fields: Achievement**

| Field | Required | Default | Notes |
|---|---|---|---|
| Student(s) | Yes | | |
| Activity or competition | Yes | | |
| Level | No | School | |
| Position or result | No | | |
| Date | Yes | Today | |
| Certificate | No | Off | Issue now |
| Activity credits | No | From Events Settings for this activity and level | Shown only when activity credits are on |

### Gallery

**Purpose:** photo and video albums of school events.

**What the person sees**

- Albums: cover photo, name, event, date, audience, status (**Draft**, **Published**, **Archived**).
- One album: photos and videos, each with the students tagged in it and a photo consent mark: **All consented**, **Some without consent** (amber), **Not tagged** (grey).

**Photo consent (decided 9 October 2026):** photo consent is one of the consent types guardians give on the admission form or through Parent Link (Settings, Data Backup & Security). Before a photo is shown in the gallery or shared (by message link or on social media), the photo consent of every student tagged in it is checked. Only students whose guardians gave photo consent are shown; the others are blurred or the photo is left out. A consent withdrawn later applies to photos already published: they are blurred or hidden from then on (inferred).

**Actions**

- Create an album (link it to an event).
- Upload photos and videos (many at once, from a phone).
- **Tag students** in each photo or video by picking them from the event's or class's list (inferred: tagging by hand). A photo with no students in it is marked "No students".
- Choose, for photos with students who have no photo consent, whether to **blur** those students or **leave the photo out** (default: leave out, inferred).
- Set who can see the album (staff only, chosen classes, everyone; parents through a shared link in a message, inferred).
- Publish or archive an album. Photos still marked "Not tagged" stay visible to staff only until they are tagged (inferred).

**Form fields: Album**

| Field | Required | Default | Notes |
|---|---|---|---|
| Name | Yes | The event's name | |
| Event | No | | |
| Date | Yes | The event date or today | |
| Visible to | Yes | Staff only (inferred safe default) | |
| Students without photo consent | Yes | Leave the photo out (inferred) | Blur them, or leave the photo out |

### Daily Activities

*Optional page: for play group, pre-primary and activity-based schools.*

**Purpose:** daily log for play group and pre-primary children: meals, nap, play and activities.

**What the person sees**

- For a class and day: each child with today's entries (meals, nap, play, water intake, activities), filled or not.
- Activity types and activities assigned to the class for the day.

**Actions**

- Assign activities to classes for a day or week.
- Log each child's day quickly: tap the activity, tick the children (bulk), add a note (for example "ate half", "slept 1 hour").
- Mark participation and completion.
- Send the day's log to parents as a message (inferred: using a template; there is no parent app).
- Activity reports (see section 7).

**Form fields: Log entry**

| Field | Required | Default | Notes |
|---|---|---|---|
| Class | Yes | The teacher's class | |
| Activity type | Yes | | Meal, nap, play, water, learning activity and the school's own |
| Children | Yes | All present today | |
| Time | Yes | Now | |
| Note | No | | |

### Events Settings

**Purpose:** event types, weekends, house names and calendar sharing to Google or Outlook. See section 6.

## 3. All features

46 features are mapped to this module: 21 Core and 25 Optional. Tick each one when it is built and tested.

### School Calendar (3)

- [ ] One school calendar: academic dates, exams, events, holidays (Core)
- [ ] Holiday list per year (Core)
- [ ] Calendar entry types: holiday, vacation, exam day, event, PTM, admission test (Core) (decided 9 October 2026)

### Events (8)

- [ ] Create events with type, date, venue, audience (Core)
- [ ] Event registration (Optional: schools with sign-up events)
- [ ] Event attendance (Optional: schools with sign-up events)
- [ ] Event seating (Optional: schools with large events)
- [ ] Event payments (Optional: schools charging for events)
- [ ] Event volunteers (Optional: schools with large events)
- [ ] Event reminders (Core)
- [ ] Alumni events (Optional: schools tracking alumni)

### PTM (9)

- [ ] PTM calendar (Core)
- [ ] Teacher time slots for PTM (Core)
- [ ] Book PTM appointments for parents (done by school staff) (Core)
- [ ] PTM waiting queue on the day (Optional: large schools)
- [ ] PTM meeting notes (Core)
- [ ] Student performance view for the PTM (Core)
- [ ] Teacher remarks at the PTM (Core)
- [ ] Parent feedback recorded at the PTM (Core)
- [ ] PTM reminder messages (Core) · automatic message

### Co-curricular & Sports (15)

- [ ] Competition results (Optional: schools running competitions)
- [ ] Student achievements record (Core) · also on Student Profile
- [ ] Participation and achievement certificates (Core)
- [ ] Co-curricular activity tracking: music, dance, debate, art, public speaking, olympiads, competitions, projects, volunteering (Core)
- [ ] Houses (Optional: schools with a house system)
- [ ] Assign students to houses (Optional: schools with a house system)
- [ ] House points (Optional: schools with a house system)
- [ ] House leaderboard (Optional: schools with a house system)
- [ ] Activity credits: points a student earns for activities, with the total on the profile (Optional: schools giving activity credits)
- [ ] Clubs and memberships (Optional: schools with clubs)
- [ ] Sports teams and coaches (Optional: sports-focused schools)
- [ ] Training sessions and attendance (Optional: sports-focused schools)
- [ ] Fixtures and competitions (Optional: sports-focused schools)
- [ ] Sports achievements (Optional: sports-focused schools)
- [ ] Fitness records (Optional: sports-focused schools)

### Gallery (5)

- [ ] Photo / video albums by event (Core)
- [ ] Upload photos and videos (Core)
- [ ] Album visibility by audience (Core)
- [ ] Publish or archive an album (Core)
- [ ] Photo consent checked before a photo is shown or shared; students without consent blurred or left out (Core) (decided 9 October 2026)

### Daily Activities (5)

- [ ] Daily activity log (Optional: pre-primary and activity-based schools)
- [ ] Assign activities to classes (Optional: pre-primary and activity-based schools)
- [ ] Activity participation (Optional: pre-primary and activity-based schools)
- [ ] Activity completion (Optional: pre-primary and activity-based schools)
- [ ] Activity reports (Optional: pre-primary and activity-based schools)

### Events Settings (1)

- [ ] Calendar feed to Google / Outlook calendars (Optional: schools syncing calendars)

## 4. Connections

**Receives**

| From | What |
|---|---|
| 08 Examination & Results | Published datesheets as exam entries (A10); results for the PTM performance view |
| 05 Attendance | Attendance % for the PTM view |
| 17 Homework & Learning | Homework completion for the PTM view |
| 03 Student Management | Students, behaviour notes, alumni group |
| 04 Academic | Teachers per class (PTM slots) |
| 06 Fee Management | Event payment status |
| 20 Settings | Document designs (certificates), Google and Outlook connection |
| 03 Student Management | Photo consent (Consent Records on each student's guardian, given on the admission form or through Parent Link) |
| 02 Admission | Admission test dates (inferred) |

**Sends**

| To | What |
|---|---|
| 05 Attendance | Holidays and "allow attendance" switches (A11) |
| 04 Academic | Events and holidays to adjust the Time Table |
| 19 Reports & Analytics | Attendance reports leave holidays out (A11) |
| 11 Communication | Event and PTM reminders, daily activity logs, gallery links |
| 06 Fee Management | Event fees (optional) |
| 03 Student Management | Achievements, houses, clubs, activity credit totals (optional), PTM notes on the profile |
| 08 Examination & Results | Co-curricular grades and achievements for report cards (inferred) |
| 01 Dashboard | Today's and upcoming events and PTMs |
| Google or Outlook (optional) | A read-only calendar feed |

**Automations:** owns **A11 Holiday added**: attendance is switched off for that day and reports leave it out.

## 5. Rules and mistake-proofing

| Rule | How it is prevented | What the person is told | How they recover |
|---|---|---|---|
| Holiday added on a day with attendance already taken | Warning before saving | "Attendance was taken for 3 classes on 14-11-2026. Make it a holiday anyway? Those marks will not count." | Cancel, or keep with "allow attendance" on |
| Holiday removed | Confirmation; attendance switches back on | "Attendance will be needed for 14-11-2026" | Undo |
| PTM on a holiday | Only working days allowed | "14-11-2026 is a holiday" | Pick another date |
| Double-booked PTM slot | One parent per slot; server check | "Slot taken by Ravi's parent" | Pick another slot |
| Event fee charged twice | One fee row per student per event | Not needed | Not needed |
| Album visible to the wrong people | Default visibility "staff only" until set (inferred) | "Visible to staff only. Change before publishing?" | Change visibility |
| Photo of a child without photo consent shown or shared | Photo consent of every tagged student checked before showing or sharing; others blurred or the photo left out; untagged photos stay staff only (inferred) | "3 students in this album have no photo consent. They will be blurred." | Ask the guardians for photo consent through Parent Link |
| Activity credits changed silently | Reason required; history kept (inferred) | "Give a reason" | Reverse with a reason |
| House points changed silently | Reason required; history kept | "Give a reason" | Reverse with a reason |
| Two events in one venue at once | Warning (inferred) | "Auditorium booked for the Science Fair" | Change venue or time |

## 6. Settings

The **Events Settings** page holds:

- **Event types** (for example annual day, sports day, cultural, competition, trip; inferred defaults).
- **Weekends:** which days are weekends (for example Sunday; second and fourth Saturday, inferred option). These show on the calendar and switch attendance off.
- **House names** and colours (optional).
- **Calendar sharing** to Google or Outlook (optional): a read-only feed for staff, or by class (inferred).
- **Activity types** for Daily Activities (optional) (meals, nap, play, water intake and the school's own).
- **Clubs and sports** lists (optional) (inferred).
- **PTM defaults:** slot length, reminder timing (inferred).
- **Achievement levels** (inferred).
- **Activity credits** on or off (optional), and the credits given per activity and level (for example 5 for taking part, 10 for a school-level win; inferred defaults).
- **Gallery photo consent:** blur students without photo consent, or leave the photo out (default leave out, inferred). The consent texts themselves are in Settings, Data Backup & Security.

## 7. Reports

- Calendar and holiday list for the year (print).
- Events: participation, attendance, payments, by event.
- PTM: attendance of parents, meetings held per teacher, feedback summary.
- Co-curricular: achievements by student, class and level; participation by activity.
- House points and leaderboard (optional).
- Activity credits by student and class (optional).
- Gallery photos waiting for tagging, and students left out or blurred for lack of photo consent.
- Sports: teams, fixtures, results, fitness records (optional).
- Daily activity reports by class and child (optional).

All follow P8 and appear in Reports & Analytics.

## 8. Records used

| Record | Creates | Reads | Updates |
|---|---|---|---|
| Calendar Entry | Yes (types: holiday, vacation, exam day, event, PTM, admission test) | Yes | Yes |
| Event | Yes | Yes | Yes |
| Consent Record | | Yes (photo consent, before a photo is shown or shared) | |
| Student, Guardian, Staff, Class, Section | | Yes | |
| Marks, Attendance Mark, Submission | | Yes (PTM view) | |
| Exam, Datesheet Entry | | Yes | |
| Student Fee Due | Yes (event fees, optional) | | |
| Message, Notification | Yes | | |
| Audit Log Entry | Yes | | |

Other records (inferred): **Event Registration**, **Event Attendance**, **Event Seat**, **Event Volunteer**, **PTM** (day), **PTM Slot**, **PTM Meeting Note**, **Activity**, **Achievement**, **Certificate** (shared with Student Management), **House** and **House Points Entry**, **Club** and **Club Member**, **Sports Team**, **Training Session**, **Fixture**, **Fitness Record**, **Album** and **Media Item** (with **Media Tag**, one per student in a photo), **Activity Credit Entry**, **Daily Activity Log**.

## 9. Done when

1. Adding a holiday switches attendance off for that date, and the monthly attendance % no longer counts that day.
2. A date marked as an event with "allow attendance" on still allows attendance.
3. Published exams appear on the calendar on the right dates without being typed.
4. Staff book a PTM slot for a parent; the slot can't be booked twice; the parent gets a confirmation and a reminder.
5. During the PTM the teacher sees the student's marks, attendance and homework on one screen and records notes and parent feedback.
6. Recording an achievement shows it on the student's profile and can issue a certificate.
7. An album stays visible to staff only until its visibility is changed and it is published.
8. With Daily Activities on, a teacher logs a meal for the whole class in one bulk action.
9. In a published album, a student whose guardian has not given photo consent is blurred or the photo is left out, and the same happens when the album link is shared.
10. An admission test can be added to the calendar as its own entry type.
11. With activity credits on, recording a student's participation adds the credits to the total on the student's profile.

## 10. Open questions

- Should parents see the gallery through a shared link sent by message, given there is no parent password login and Parent Link does not show the gallery? Assumed: optional link per album, with the photo consent check applied.
- C6 (decided 9 October 2026): Calendar Entry types are holiday, vacation, exam day, event, PTM and admission test. D8a (decided 9 October 2026): photo consent is a consent type and is checked before a photo is shown or shared.
- Should the daily activity log be sent to parents every day by message? The inputs say only "daily log"; sending is assumed as an option.
- Should event fees be added to the student's fees (collected with fees) or paid only by link? Assumed: added as a fee row.
