# 05 Attendance Management

Build order: 9th (Stage 2). Needs students, staff, the Time Table periods and the holiday list. The School Calendar page (module 18, Events & Calendar) is built at the same time, because attendance needs holidays.

## 1. Purpose

Daily attendance of students and staff, and student leave.

Used by: teachers (Take Attendance for their classes, student leave for their sections), the Office Staff role template (recording student leave) and the HR role template (staff attendance) when the school switches them on, the Principal (register, corrections, reports), and the School Admin (devices, QR, settings).

## 2. Pages

### Take Attendance

**Purpose:** mark a whole class present in one tap, then change only the absent and late students.

**What the person sees**

- Opens on the person's current class: for a class teacher, their section for today; for period-wise schools, the period happening now from the Time Table (inferred: the default). A teacher's home screen also has a Take Attendance button for each class today.
- Class, section, date (default today) and period (only for period-wise attendance) at the top.
- Student list in roll-number order: photo, roll number, name, and status buttons.
- Every student starts as **Present** (or "not marked" if the school prefers, inferred setting). Students on approved leave are already marked **Leave** and greyed.
- A count bar: present, absent, late, leave, not marked.
- A banner when the day is a holiday: "Holiday: Gandhi Jayanti. Attendance is off for 02-10-2026."

**Actions**

- **Mark all present** (one tap), then tap the exceptions: each tap cycles Present, Absent, Late; a long press or "More" opens the full status list (half-day, excused, leave, medical and the school's own statuses) (inferred: the tap behaviour).
- Add a note to one student's entry (for example "came at 10:15, doctor's visit").
- **Absence reason** (optional; when the school switches absence reasons on, see "Absence reasons" below): an absent student's row shows "Reason: Not known yet"; tapping it, or the long press, picks Sick, Family function, Travel, Fees dispute (only for people who see the school's fees), Not known yet or Other (with a short note). Saving without choosing keeps "Not known yet", so the one-tap register is as fast as before.
- **Save** (one fixed button at the bottom: "Save attendance: 38 present, 2 absent"). Saving runs automation A4.
- Change a saved entry before the lock time; after it, request a correction (see Attendance Register).
- Offline (optional, schools with poor internet): saved on the phone and sent when online.

**Form fields:** class and section (default: own class), date (default today), period (period-wise only; default: current period), status per student (default Present), note (optional).

### Attendance Register

**Purpose:** monthly register for each class and student, with corrections and export.

**What the person sees**

- **Class register:** month grid, students down the side, dates across, each cell a colour and letter (P present, A absent, L late, H half-day, LV leave, and so on). Standard colour legend at the top. Holidays and weekends shaded and not counted. Totals per student: days present, days counted, %.
- **Student calendar:** one student's month as a calendar with the same colours, plus the year's %, and the month's absences with their reasons (when absence reasons are on).
- **Absent list** (when absence reasons are on): the students absent on a date (default today) in the person's classes, with the mark, the reason, its note and where it came from, and any leave for the day. Filters: date, class and section, reason. The class teacher, the Office Staff template and whole-school roles set or change a reason here later, for example after the parent calls back. Only the reason changes, never the mark or the %, so it works after the lock too; each change goes into the audit log.
- In the class register, an absent cell's label says its reason, and a small dot marks "Not known yet".
- Filters: class, section, month (default this month), status.

**Actions**

- View and update attendance (within the lock time, or by people with correction rights).
- **Request a correction** after the lock: pick the date and student, the new status and a reason. The request goes to Approvals. When approved, the entry changes and the original stays in the audit log.
- Export the register (Excel, CSV, PDF) (P8).
- Print the monthly register (P9).
- Parents see each child's attendance for this month on Parent Link (the page is owned by Communication; read-only, decided 9 October 2026). It shows the same marks and % as this register, and nothing before the lock time is final (inferred).

**Form fields: Correction request**

| Field | Required | Default | Notes |
|---|---|---|---|
| Student(s) | Yes | The cell clicked | |
| Date (and period) | Yes | The cell clicked | |
| New status | Yes | | |
| Reason | Yes | | |

### Student Leave

**Purpose:** leave requests for students, approved or rejected with a reason.

**What the person sees**

- List: student, class, leave type, from and to dates, days, reason, document, status (Waiting, Approved, Rejected, Cancelled), recorded by, decided by.
- Filters: status (default Waiting), class, type, month.

**Actions**

- **Record a leave request** for a student. Requests are recorded by school staff (for example when a parent calls, writes or messages), since there is no parent login and Parent Link is read-only apart from paying and giving consent.
- Attach a document (for example a doctor's note).
- **Approve** or **Reject** with a reason (also from Approvals). Class teachers can decide for their own sections up to the limit set in Forms & Approvals.
- Cancel a leave (with a reason).
- When approved, the days are marked **Leave** in Take Attendance in advance, and no absence message is sent for those days (inferred).
- When absence reasons are on, approved leave also gives a reason to days already marked absent that have none or only "Not known yet": Medical is Sick, Holiday is Travel, any other type is Other with the leave type and reason as the note. A reason a person chose stays. Cancelling the leave puts those days back to "Not known yet".
- **Leave balances and quotas (optional, switched on per school in Attendance Settings):** a limit per leave type for a term or year (for example 6 medical days per term), as in the old software. Each student then has a Leave Balance record per leave type, shown while recording leave ("Medical: 2 of 6 days left this term"). Leave beyond the quota shows a warning and goes to Approvals even when it is within the class teacher's limit (inferred).

**Form fields: Record student leave**

| Field | Required | Default | Notes |
|---|---|---|---|
| Student | Yes | | Search |
| Leave type | Yes | Medical | Medical, emergency, holiday (and the school's own) |
| From date | Yes | Today | |
| To date | Yes | Same as from | Holidays inside the range are not counted |
| Half day | No | Off | (inferred) |
| Reason | Yes | | |
| Document | No | | Photo or file |

### Staff Attendance

**Purpose:** daily attendance, late coming, shifts and overtime of teachers and staff.

**What the person sees**

- Today's list: staff name, department, designation, shift (optional), in time, out time, status (Present, Absent, Late, Half-day, On leave), source (device, QR, mobile, manual).
- Staff on approved leave are already marked On leave. A day already marked absent becomes On leave when full-day leave for it is approved (recorded in the audit log), and stays On leave if it is marked absent again.
- Late arrivals highlighted, with minutes late.
- Monthly view per staff member (the same register as students).

**Actions**

- Mark staff attendance by hand (mark all present, then exceptions), or let devices and QR fill it.
- Edit an entry within the lock rules; later, request a correction (Approvals).
- Record overtime hours (optional) with a note.
- Assign shifts (optional).
- Export (P8).
- Staff mark their own attendance by QR or mobile check-in when those are on (Devices & QR).

**Form fields:** date (default today), status per staff member (default Present), in and out time (default from the device; manual entry optional), overtime hours (optional), note (optional).

### Attendance Reports

**Purpose:** daily and monthly attendance, percentages and students who are often absent.

See section 7 for the list. All reports leave out holidays, weekends and other non-working days.

### Devices & QR

*Optional page: shown only when the school switches on attendance devices, QR check-in or mobile check-in.*

**Purpose:** biometric machines (face, fingerprint, RFID card), QR posters and the campus area for mobile check-in.

**What the person sees**

- **Devices list:** device name, type, location, campus, allowed users (students, staff or both), status (**Active**, **Never connected**, **Offline**, **Inactive**), last punch received.
- **QR check-in:** on or off for students and for staff separately, rotation mode, poster.
- **Campus area (geo-fence):** a map with the campus point and the allowed circle.

**Actions**

- **Add device** (see fields). On save the device gets its own API key, shown once with a Copy button; "Regenerate key" replaces it (P4 confirmation: the old key stops working at once).
- Edit, deactivate or archive a device.
- **User mapping:** match device user numbers to students and staff (auto-match by ID card or RFID number; manual for the rest).
- **Sync and health check:** see the last sync, punches received today, punches rejected and why.
- A setup guide for common devices (for example ZKTeco) and for a generic API.
- **Punch validation:** a punch counts only if the device is active, the person is allowed on that device, the time is within the school's attendance window, and it is not a repeat within a few minutes (inferred: the checks). Rejected punches are listed with the reason.
- **QR attendance:** switch on for students and staff separately; set expiry and scope (whole school or campus); choose a fixed or changing QR (rotating daily by default). When a QR is scanned, the app checks the school, the session, the location (when the campus area is on), and blocks duplicate or invalid scans.
- **QR poster:** school logo and name, the QR code and short instructions (no personal data). Themes Ocean Blue, Royal Purple and Forest Green, live preview, print as PDF.
- **Campus area (geo-fencing):** "Use my current location" fills latitude and longitude; set the radius (minimum 25 m, default 50 m); on or off for students and for staff separately.

**Form fields: Add device**

| Field | Required | Default | Notes |
|---|---|---|---|
| Device name | Yes | | For example "Main gate scanner" |
| Device ID or serial number | Yes | | Unique |
| Location | No | | For example "Main entrance" |
| Campus | Yes | The person's campus | |
| Device type | Yes | | Face recognition, RFID card, fingerprint, iris |
| Allowed users | Yes | Both students and staff | Students only, staff only, or both |
| Connection | No (under "More details") | | IP address or API settings |

### Attendance Settings

**Purpose:** attendance types, late rules, the time after which attendance is locked, and alerts to parents. See section 6.

### Absence reasons

*Added 17 October 2026 (gap list P1.8). Optional: switched on per school in Attendance Settings, Punch methods, More options ("Absence reasons").*

**Purpose:** know why a student was absent, so the school acts on the right thing (a call to the family, a fee conversation, nothing for a sick day), and Early Warnings can tell an unexplained absence from a sick day.

- **Reasons:** Sick, Family function, Travel, Fees dispute, Not known yet, Other (with a short note, up to 100 characters). Only marks whose status counts as absent have a reason. Marks from before have none ("Not recorded").
- **Where a reason comes from:** Take Attendance (optional, "Not known yet" by default), approved Student Leave for that day (see Student Leave), or set later from the Absent list in the Attendance Register by the class teacher or the office. Parent Link stays read-only: a parent who explains an absence by phone or WhatsApp is recorded by staff on the Absent list.
- **Who sees "Fees dispute":** only people who see the whole school's fees (Fee Management, Full or View). Everyone else sees "Other" without its note, cannot choose it, and keeps it unchanged when they leave the "Other" they see.
- **Where reasons are used:** the class register and student calendar, the Student Profile's Attendance tab ("Absences and reasons"), the Date range report, the Absence reasons report (section 7), and Early Warnings (19 Reports & Analytics): an attendance flag's basis shows the reason mix ("6 not known yet, 2 sick"); when most absences are "Not known yet" a Watch becomes Act now; when most were sick days or approved leave an Act now above the threshold becomes a Watch. "Fees dispute" absences raise a fee flag, seen only by fee roles. In Looking ahead, many "Not known yet" absences count towards "may be thinking of leaving", absences that were mostly sick days or leave do not, and a "Fees dispute" counts as fees.

## 3. All features

37 features are mapped to this module: 24 Core and 13 Optional. Tick each one when it is built and tested.

### Take Attendance (5)

- [ ] Mark daily attendance for a class / section and date (Core)
- [ ] Period-wise / subject-wise attendance (Optional: schools taking attendance every period)
- [ ] Statuses: present, absent, late, half-day, excused, leave, medical, plus school-defined ones (Core)
- [ ] Note on an attendance entry (Core)
- [ ] Quick mobile attendance: mark all, change the exceptions, done in two taps (Core)

### Attendance Register (5)

- [ ] View and update attendance (Core)
- [ ] Export attendance (Core)
- [ ] Monthly attendance calendar per student / class with a standard colour legend (Core)
- [ ] Request and approve attendance corrections; the original stays in the audit log (Core)
- [ ] This month's attendance of each child shown to parents on Parent Link (Core) · page owned by 11 Communication

### Student Leave (4)

- [ ] Record a student leave request (dates, reason, document; no overlaps) (Core)
- [ ] Approve / reject student leave with a reason (Core)
- [ ] Student leave types: medical, emergency, holiday (Core)
- [ ] Student leave balances and quotas per leave type, e.g. limits per term (Optional: schools limiting student leave)

### Staff Attendance (4)

- [ ] Mark, view, update and export staff attendance (Core)
- [ ] Staff late-coming tracking (Core)
- [ ] Staff shifts (Optional: schools with staff shifts)
- [ ] Overtime recording (Optional: schools paying overtime)

### Attendance Reports (2)

- [ ] Attendance reports by student, class, section, staff member and date; daily and monthly (Core)
- [ ] Attendance % and trends, including chronic absence (non-working days left out) (Core)

### Devices & QR (9)

- [ ] Register biometric devices (type, IP / API, campus; unique device ID) (Optional: schools using attendance devices)
- [ ] Device types: face recognition, RFID card, fingerprint, iris (Optional: schools using attendance devices)
- [ ] Device connection settings, user mapping, sync and health check (Optional: schools using attendance devices)
- [ ] Device punches validated before they count (Optional: schools using attendance devices)
- [ ] QR attendance on / off, with expiry, scope and an optional changing QR (Optional: schools using QR check-in)
- [ ] QR scan checks school, session and location, and blocks duplicate or invalid scans (Optional: schools using QR check-in)
- [ ] QR attendance poster: school branding, QR code, instructions, entrance poster; no personal data (Optional: schools using QR check-in)
- [ ] Poster themes (Ocean Blue, Royal Purple, Forest Green), live preview, print PDF (Optional: schools using QR check-in)
- [ ] Geo-fencing: allowed zone by latitude, longitude and radius (Optional: schools using mobile check-in)

### Attendance Settings (8)

- [ ] Lock after a cut-off time; later changes need permission and are audited (Core)
- [ ] Late rules: minutes after which someone is late, same for device and manual (Core)
- [ ] Attendance rules per school (Core)
- [ ] Display settings and register options (Core)
- [ ] Absence alert to parents (no duplicate messages) (Core) · automatic, see 'Attendance marked'
- [ ] Late-arrival alert (Core)
- [ ] Attendance % threshold alert, e.g. below 75% to parent, class teacher and principal (Core) · automatic, see 'Attendance marked'
- [ ] Chronic absenteeism alert (Core)

## 4. Connections

**Receives**

| From | What |
|---|---|
| 03 Student Management | Students by section, roll numbers, RFID numbers, guardians' primary contacts |
| 09 Staff & HR | Staff list, approved staff leave (shows On leave) |
| 04 Academic | Periods and teachers for period-wise attendance; class teachers |
| 18 Events & Calendar | Holidays and "attendance allowed on this date" switches (A11) |
| Devices and QR scans | Punches, validated before they count |

**Sends**

| To | What |
|---|---|
| 11 Communication | One absence message per absent student per day to the parent (A4); late-arrival alerts; threshold alerts; this month's attendance for Parent Link |
| 01 Dashboard | Today's student and staff attendance; absent streaks; low-attendance flags |
| 03 Student Management | Attendance tab and % on the profile |
| 08 Examination & Results | Attendance for report cards |
| 10 Salary | Staff present days, leave, late marks and overtime for payroll |
| 04 Academic | Teachers absent today (to raise substitutions, inferred) |
| 19 Reports & Analytics | Attendance trends and early-warning signals |
| Top bar Approvals | Student leave, attendance corrections |
| Notifications | Class teacher and principal flagged when a student falls below the threshold (A4) |

**Automations:** owns **A4 Attendance marked**. Reacts to **A11 Holiday added**.

A4 step by step:
1. Attendance is saved for a class (or a device or QR punch completes a day's record).
2. Parents of students marked Absent get one message for the day, using the absence template, after a short wait (default 15 minutes after saving, inferred) so a teacher's quick correction does not send a wrong message. A student marked absent in several periods still gets one message for the day.
3. The register and the Dashboard update.
4. Each student's % is worked out again. Anyone falling below the threshold (default 75%) is flagged to the class teacher and the principal once, not every day (inferred: once per drop below).

## 5. Rules and mistake-proofing

| Rule | How it is prevented | What the person is told | How they recover |
|---|---|---|---|
| Attendance on a holiday or weekend | Take Attendance is switched off for that date unless "allow attendance on this date" is on in the School Calendar | "Holiday: Diwali. Attendance is off for this date." | Turn on "allow attendance" for that date in the School Calendar |
| Changes after the cut-off time | Locked after the cut-off set in Attendance Settings; later changes need permission and are audited | "Attendance for 06-10-2026 locked at 11:00 AM. Request a correction." | Correction request, approved by the principal |
| Absent message sent by mistake | Short wait before sending (inferred); one message per student per day; no message for students on approved leave | "Absence messages go at 9:45 AM" | Change the mark before then; after, the parent can be sent a correction message from Message History (inferred) |
| Double marking | One Attendance Mark per student per date (and per period if period-wise); a second save updates, never duplicates | Not needed | Not needed |
| Teacher marks a class they do not teach | Only own sections and periods offered; server check | Not shown | Ask for the class |
| Student leave dates overlap an existing leave | Blocked | "Ravi already has leave from 10-10-2026 to 12-10-2026" | Edit the existing leave |
| Device punch from an unknown user, inactive device or outside the window | Rejected and listed with the reason | "12 punches rejected today: 9 unknown users" | Map the users, then re-run the sync (inferred) |
| Duplicate QR scan or scan outside the campus area | Blocked on the phone with a message | "Already marked at 8:02 AM" or "You are 300 m from school" | Not needed |
| Device key leaked | Regenerate key; typed confirmation | "The old key stops working now" | Update the device |
| Late rule differs between device and manual marking | One late rule used for both | Not needed | Not needed |
| Percentages include holidays | Non-working days are left out of every %, report and register total | Register footer "22 working days" | Not needed |

## 6. Settings

The **Attendance Settings** page has four tabs, as in the old software:

**Punch methods**
- Attendance method: once a day or every period (period-wise, optional).
- Which methods are on for students and for staff: register (manual), mobile, QR, device, campus area (geo-fence). Details are on Devices & QR.

**Display and register**
- Status list: present, absent, late, half-day, excused, leave, medical, plus the school's own. For each status: its letter, colour, and how it counts (present, absent, half, not counted) (inferred: the counting rule).
- Default status in Take Attendance: Present (or not marked).
- Register options: roll number or name order, show photos (inferred).

**Late rules**
- Minutes after the start time after which someone is late, for students and staff (one rule used by devices and manual marking).
- Lock time: the time after which attendance for the day is locked (for example 11:00 AM), and who may change it after that.
- Half-day rule for staff, for example in after 11:00 AM (inferred).

**Notifications (alerts)**
- Absence alert to parents on or off, template, delay before sending (inferred), and channels.
- Late-arrival alert on or off.
- Attendance % threshold alert: the % (default 75), who is told (parent, class teacher, principal).
- Chronic absenteeism alert: number of days in a row (default 3) and who is told.

Student leave types, and who approves student leave, are set here (types) and in Settings, Forms & Approvals (approvers) (inferred).

**Student leave quotas (optional):** on or off; for each leave type, the number of days allowed and the period it applies to (term or year); whether going over the quota needs approval (default yes, inferred).

## 7. Reports

- Daily attendance by class and section, for students and staff.
- Monthly attendance by student, class, section and staff member.
- Attendance by date range for any student or staff member.
- Attendance % and trends by class and month.
- Chronic absence: students below the threshold or absent N days in a row.
- Late arrivals: students and staff, by month.
- Student leave by type and class.
- Staff overtime (optional) and shift attendance (optional).
- Device health: punches received and rejected by device (inferred).
- Absence reasons (when switched on): absent days by reason for each class and section, or every absent day with one chosen reason (or not recorded), for any dates. A day absent in several periods counts once. "Fees dispute" is a column only for people who see the school's fees; for others it is counted in Other.

All leave out non-working days and follow P8.

## 8. Records used

| Record | Creates | Reads | Updates |
|---|---|---|---|
| Attendance Mark | Yes (students and staff) | Yes | Yes (before lock, or through an approved correction; the absence reason at any time, audited) |
| Leave Request | Yes (student leave) | Yes (student and staff leave) | Yes (decision, cancel) |
| Leave Balance | Yes (students, when quotas are on) | Yes | Yes (approved and cancelled student leave) |
| Student, Guardian, Staff, Class, Section, Timetable Period | | Yes | |
| Calendar Entry | | Yes (holidays) | |
| Message, Template | Yes (absence and alert messages) | Yes | |
| Approval | Yes (leave, corrections) | Yes | |
| Notification | Yes | | |
| Audit Log Entry | Yes (corrections keep the original) | | |

Other records (inferred): **Attendance Status** (the school's status list), **Attendance Correction** (old value, new value, reason), **Attendance Device** (with key and health), **Device Punch** (raw punches, accepted or rejected with reason), **Device User Map**, **QR Session**, **Geo-fence**, **Staff Shift**, **Overtime Entry**.

## 9. Done when

1. A teacher on a phone opens Take Attendance from their home, taps "Mark all present", changes 2 students to Absent and saves, in under 30 seconds for a class of 40.
2. Each absent student's parent gets exactly one message that day, even when attendance is saved twice.
3. A student on approved leave is shown as Leave in advance and their parent gets no absence message.
4. After the lock time, a teacher cannot change a mark; a correction request goes to Approvals, and when approved the register changes while the audit log keeps the original.
5. On a date marked as a holiday, Take Attendance is off and the monthly % does not count that day.
6. A student falling below 75% is flagged once to the class teacher and the principal.
7. A device punch from an unmapped user is rejected and listed with the reason; a valid punch marks the staff member present with the in time.
8. A QR scan from 300 m outside the campus area is refused; a second scan the same morning is blocked as a duplicate.
9. The monthly register exports to Excel with the same totals as on screen.
10. Staff attendance for the month reaches Generate Salary with present days, leave and late marks.

## 10. Open questions

- Should Take Attendance start with everyone Present, or with nobody marked? The plan says "mark a whole class present in one tap", which works either way. Assumed: everyone Present by default, changeable in settings.
- How long should the system wait before sending absence messages? Assumed: 15 minutes after saving, changeable.
- When period-wise attendance is on, which period decides the day's status for the absence message and the %? The inputs do not say. Assumed: the first period of the day decides the message; the % counts the day as present if present in any period, unless the school chooses "most periods".
- Can parents send leave requests by replying on WhatsApp so staff only approve them? This would need the WhatsApp Inbox (optional) and is not described in the inputs.
