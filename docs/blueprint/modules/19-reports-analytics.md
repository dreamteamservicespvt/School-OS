# 19 Reports & Analytics

Build order: 16th (end of Stage 3). Brings together the reports of every module built so far. Reports of later modules (Transport, Library, Inventory, Hostel) are added to the catalogue as those modules are built.

## 1. Purpose

Every report from every module in one place, plus the school's overall picture.

Used by: the Principal and management (analytics, early warnings), the Accountant (money reports only), the office (student and government reports), class teachers (early warnings for their students), and anyone else for the reports their role allows.

## 2. Pages

### All Reports

**Purpose:** find any report by name or module, filter by year, class or date, and download in Excel or PDF.

**What the person sees**

- **Report catalogue:** every report from every module, grouped by category (Students, Admissions, Attendance, Fees, Finance, Exams, Staff and HR, Salary, Communication, Transport, Library, Inventory, Hostel, Front Office, Homework, Events, Tasks), with a search box. Each report shows its name, one line on what it answers, and the module it comes from.
- **Money reports** (Fees, Finance and Salary) include, among the others each module registers (decided 9 October 2026):
  - **GST report:** taxable fee heads, tax invoices issued, taxable amount and GST collected by rate and month, with the school's GSTIN (from Fee Management).
  - **PF and ESI statements:** the monthly statements exported in the formats the government portals accept (from Salary Management).
- **Financial year:** Finance reports, the Day Book, cash and bank books, the GST report and the PF and ESI statements are filtered by **financial year** (default April to March, set in Finance Management), kept apart from the academic year. Other reports use the academic year (decided 9 October 2026).
- Only reports the person may see are listed. Pinned and recently used reports at the top (inferred).
- **Student reports** live here: master list, demographics, lifecycle (status counts and changes), transfers, withdrawals, document status.

**Actions**

- Open a report: set filters (academic year or, for money reports, financial year; class, date range, campus, and the report's own filters); see the result on screen; sort by any column.
- Export to Excel, CSV or PDF (P8). Every report and every file shows the filters used and contains only data the person may see.
- **Heavy reports run in the background:** the screen says "This report is being prepared. We will notify you." and a notification with the download link arrives when ready.
- Print (P9).

**Form fields:** report filters only (defaults: current academic year, or the current financial year for money reports; the person's campus, all classes in their scope, this month for date-based reports).

### Analytics

**Purpose:** trends in students, results, fees, expenses, staff and teacher workload, with numbers you can open.

**What the person sees**

- Dashboards, each a set of charts and numbers; every number and chart point opens the records behind it (drill-down).
  - **Students:** strength by class over years, admissions and leavers, attendance trends, gender and category mix.
  - **Results:** pass % and averages by exam, class and subject over time.
  - **Finance:** collection against dues by month, outstanding, expenses by head, income against expense.
  - **HR:** staff strength, joiners and leavers, leave taken, staff attendance.
  - **Teacher workload:** periods per teacher against limits, substitutions taken.
  - **Teacher performance and syllabus completion:** syllabus % completed against planned, results of each teacher's classes (shown as facts, not ratings, inferred).
- **Compare schools or campuses (optional, school groups):** the same numbers side by side.
- Filters: academic year (and compare with last year, inferred), campus, class, date range.

**Actions:** drill down; change filters; export a chart's data (P8); pin a chart to the Dashboard (inferred).

**Form fields:** filters only.

### Early Warnings

**Purpose:** students who may need help, based on attendance, marks and fees, for a person to review.

**What the person sees**

- A list of students with **risk signals**, each showing the reason in plain words and the numbers behind it: for example "Attendance 68% this term (threshold 75%)", "Marks fell 18% from FA 1 to FA 2 in Maths and Science", "Fees overdue 95 days".
- Signal strength: **Watch** or **Act now** (inferred labels), from simple rules set by the school (inferred: rule thresholds come from Attendance Settings, Exam pass rules and Fee overdue days). **Act now is kept for strong evidence** (added 18 October 2026, so a school where most families owe fees does not see nearly every child as Act now): attendance below the threshold that is falling (the last 30 days lower than the year so far) or more than 10 points below it; below the pass mark in two or more subjects of the latest exam; or concerns in two areas at once (attendance and marks; an open Attendance Flag counts as the attendance one). One subject below the pass mark, a marks drop, or attendance just under the threshold and steady, is Watch. **Fee flags are always Watch**: overdue fees are an accounts matter, followed up from Fee Defaulters, and never make a student Act now on their own.
- Status of each flag: **New**, **Reviewed**, **Action planned**, **Closed** (with who reviewed it and the note).
- **AI signals (optional, schools using AI):** dropout risk, predictions (fees, results, attendance), and unusual activity (for example odd fee changes or many attendance edits by one person). Each is labelled "Suggestion", shows what it is based on, and never changes anything by itself.
- **Looking ahead** (added 18 October 2026): the AI signals in **one view**, most important first (how much it matters, how soon, how sure), never more than two of one area among the first five; then every area with its count (Attendance, Marks, Fees, Students, Admissions, Syllabus, Messages, Staff, Finance, Unusual activity); everything else behind **See all**, each area showing its first three and "and N more". Each suggestion says how sure it is (Fairly sure, Likely, Early sign) and what it is based on.
  - **May be thinking of leaving** needs combined evidence: attendance falling three months in a row, or many absences with no reason known yet, together with marks or fees; or a family that paid on time before and has stopped paying. A low mark with some fees due is not enough. Signs that count fees are shown only to people with the school's fees.
  - **A class may do worse** only when its pass % fell 10 points or more between two exams (complete results only), saying how sure it is ("based on only 2 tests").
  - **Seats next year** count the class below moving up at the school's own continuation rate (last year's students on this year's roll), with approved admissions and open enquiries at the school's own joining rate. Without an earlier year it says so, and warns only if seats would stay empty even if everyone moved up. A class filled only by new admissions is forecast from 120 days before the year starts.
  - **Cash for the next 8 weeks**, with salary on pay day, only when the cash and bank books can be trusted. Without opening balances, or with the books below zero, one item asks for them instead of predicting a shortfall. Money in the words is in whole rupees.
  - **Marks needed**: the % a student needs in the exams still to come (by their weight in the final result) to reach the pass mark in each subject.
  - **Syllabus**: the date a section would finish a subject at the pace taught so far, against the last planned date or the end of the year.
  - **Message credits**: the day credits run out at the use of the last 30 days, with the messages already scheduled. **Guardians who cannot be reached**: every message to them failed in the last 60 days.
  - **Unusual activity** (with Student insights on): attendance changes and fee changes (cancelled payments, removed or adjusted dues, refunds, concessions and counter discounts) by one person in two weeks, against that person's own usual over the 8 weeks before, with the usual number shown. One closed as not a concern stays quiet until the number doubles.
- A class teacher sees only their students; the Principal sees all. Of the AI signals, a class teacher sees the predictions ("Looking ahead") about the students of the sections they are class teacher of, never the fee or cash ones.
- The same signals appear on the Dashboard (Needs Attention) and on the student's profile. The Dashboard card says what it counts, for example "12 students need a closer look: 5 attendance, 4 marks, 3 in two areas" (students with an Act now flag, once each, never fee defaulters), and opens that list.

**Actions**

- **Review a flag** (required before any action): mark Reviewed with a note; plan an action (for example call parent, refer to counsellor, fee follow-up) which creates a Task or a counselling referral (inferred links); or close as "not a concern" with a reason. The Task goes to the person who should act: an accountant for a fee follow-up, the class teacher for the others (the reviewer keeps it when they may give tasks only to themselves).
- Nothing happens to a student from a flag alone: every flag is reviewed by a person before action.

**Form fields: Review**

| Field | Required | Default | Notes |
|---|---|---|---|
| Decision | Yes | Reviewed | Reviewed, action planned, not a concern |
| Note | Yes | | |
| Action | No | | Creates a task or referral |

### Government Reports

**Purpose:** UDISE+ export, APAAR and PEN details, and board returns in the latest format.

**What the person sees**

- Available exports: **UDISE+** (school, students, staff and facilities data in the government's structure), **APAAR and PEN** details (with consent status), and board returns (inferred: per board).
- A **data check** before each export: missing or invalid fields listed per student or staff member in plain words ("12 students have no APAAR consent recorded", "Date of birth missing for 3 students").
- Each export shows the format version it uses; versions change as the government changes them.
- **Government system connectors (optional, future):** direct upload where an official API exists.

**Actions**

- Run the check; open the records with problems (links to the student or staff profile).
- Export in the official format (CSV or the required file) once the check passes, or "Export anyway" with the problems listed in a separate file (inferred).
- See past exports with date, version and who exported (also in the export log).

**Form fields:** academic year, format version (default latest), campus.

### Custom & Scheduled Reports

*Optional page: for schools needing their own reports or regular emails.*

**Purpose:** build your own report and have it emailed every week or month.

**What the person sees**

- My custom reports and schedules: name, data area, filters, schedule, recipients, last sent.

**Actions**

- **Build a report:** choose a data area (students, fees, attendance and others), pick columns, filters, grouping and totals, preview, save. Only fields the person may see are offered.
- **Schedule:** send a saved or catalogue report by email every day, week or month to chosen staff (who must be allowed to see that data; inferred).
- Pause, edit or archive a schedule.

**Form fields: Schedule**

| Field | Required | Default | Notes |
|---|---|---|---|
| Report | Yes | | Custom or catalogue |
| Filters | No | The report's defaults | Relative dates such as "last week" (inferred) |
| Frequency | Yes | Weekly, Monday 8:00 AM (inferred) | Daily, weekly, monthly |
| Format | Yes | PDF | PDF or Excel |
| Recipients | Yes | Me | Staff who may see the data |

## 3. All features

26 features are mapped to this module: 19 Core and 7 Optional. Tick each one when it is built and tested.

### All Reports (8)

- [ ] Student reports: master list, demographics, lifecycle, transfers, withdrawals, document status (Core)
- [ ] One report catalogue across modules, by category (Core)
- [ ] Report filters (year, class, date, campus) (Core)
- [ ] Sort and export to Excel, CSV, PDF (Core)
- [ ] Reports show the filters used and only data the user may see (Core)
- [ ] Heavy reports run in the background and notify when ready (Core) · you get a notification when ready
- [ ] GST report and monthly PF and ESI statements in the money reports (Core) (decided 9 October 2026)
- [ ] Money reports by financial year (default April to March), apart from the academic year (Core) (decided 9 October 2026)

### Analytics (7)

- [ ] Dashboards with drill-down (Core)
- [ ] Student analytics (Core)
- [ ] Finance analytics: collection, dues, expenses (Core)
- [ ] HR analytics (Core)
- [ ] Teacher workload analysis (Core)
- [ ] Teacher performance and syllabus completion analysis (Core)
- [ ] Compare schools / campuses side by side (Optional: school groups)

### Early Warnings (5)

- [ ] Student risk signals (attendance, marks, fees) for review (Core) · also on Dashboard, Needs Attention
- [ ] Every risk flag reviewed by a person before action (Core)
- [ ] Unusual-activity detection (e.g. odd fee or attendance changes) (Optional: schools using AI)
- [ ] Dropout risk (Optional: schools using AI)
- [ ] Predictions (fees, results, attendance) (Optional: schools using AI)

### Government Reports (4)

- [ ] UDISE export for government reporting (Core, India)
- [ ] UDISE+ data structure and checks (Core, India)
- [ ] Versioned government export formats (Core, India)
- [ ] Government system connectors (Optional: future, where APIs exist)

### Custom & Scheduled Reports (2)

- [ ] Custom report builder (Optional: schools needing their own reports)
- [ ] Scheduled reports sent by email (Optional: schools wanting regular reports)

## 4. Connections

**Receives**

| From | What |
|---|---|
| Every module | Its reports, registered in the catalogue with name, category and filters (inferred: each module registers its reports) |
| 03 Student Management | Student data; APAAR and PEN IDs and consent |
| 05, 06, 08 | Attendance, fee and marks data for early warnings |
| 06 Fee Management | GST report (taxable fee heads, tax invoices) |
| 07 Finance Management | The financial year (default April to March) for money reports |
| 10 Salary Management | Monthly PF and ESI statements |
| 09 Staff & HR | Staff data for HR analytics and UDISE+ |
| 14 Inventory | Facilities data for UDISE+ (inferred) |
| 20 Settings | Permissions, export log, email connection |

**Sends**

| To | What |
|---|---|
| 01 Dashboard | School-level risk signals; principal summaries (optional): Today's brief |
| 03 Student Management | Early-warning flags on the profile |
| Notifications | "Report ready" for background reports; new Act now flags to class teachers (inferred) |
| 11 Communication | Scheduled report emails |
| Tasks (01), 03 Counselling | Actions planned from flags (inferred) |
| 20 Settings | Export log entries |

**Automations:** none owned. Reports leave out non-working days as set by **A11**.

## 5. Rules and mistake-proofing

| Rule | How it is prevented | What the person is told | How they recover |
|---|---|---|---|
| Seeing data beyond one's role | Reports run with the person's permissions and scope on the server | Rows and fields not allowed are absent; the header says "Showing your classes only" | Ask for a wider role |
| Report taken without context | Filters printed on screen and in every file | "Class 5, 2026-27, 01-09-2026 to 30-09-2026" | Not needed |
| Slow report freezes the screen | Heavy reports run in the background with a notification | "Preparing. We will notify you." | Not needed |
| Acting on a flag without checking | Every flag must be reviewed by a person before an action is recorded | "Review this flag first" | Not needed |
| AI prediction treated as fact | Labelled "Suggestion" with its basis; no automatic action | "Suggestion: based on attendance and marks in the last 60 days" | Close as not a concern |
| Wrong government format | Version shown; data check before export | "UDISE+ format 2026-27 v2. 5 problems found." | Fix and re-check |
| Money report run for the academic year by mistake | Money reports use the financial year filter, shown in the header | "Financial year 2026-27 (01-04-2026 to 31-03-2027)" | Not needed |
| Scheduled report sent to the wrong person | Recipients must have permission for the data | "Ravi cannot see fee data" | Choose another recipient |

## 6. Settings

Reports & Analytics has no settings page in the plan. Related choices (inferred):

- **Early-warning rules** use the thresholds already set in Attendance Settings (attendance %, absent days), Exam Settings (pass marks) and Fee Settings (overdue days); a "marks drop" % is set on the Early Warnings page by the Principal (inferred).
- **AI signals** on or off: Settings, Modules On/Off.
- **Government format versions:** updated by DREAM TEAM SERVICES with each new government format; the school picks the year.
- **Email for scheduled reports:** Settings, SMS, WhatsApp & Email.

## 7. Reports

This module is the home of all reports. It owns these directly:

- Student reports: master list, demographics, lifecycle, transfers, withdrawals, document status.
- Analytics dashboards (students, results, finance, HR, workload, teacher performance and syllabus).
- Early-warning list and review history.
- Government exports: UDISE+, APAAR and PEN, board returns.
- Custom reports (optional).

## 8. Records used

| Record | Creates | Reads | Updates |
|---|---|---|---|
| Every core record | | Yes (read-only, within permissions) | |
| Task | Yes (from flag actions, inferred) | | |
| Notification | Yes | | |
| Audit Log Entry | Yes (exports, flag reviews) | | |

Other records (inferred): **Report Definition** (catalogue entry), **Report Run** (background job and file), **Custom Report**, **Report Schedule**, **Risk Flag** with **Flag Review**, **Government Export** (version, file, problems), **Forecast Signal** (one Looking ahead suggestion: area, Watch or Act now, title, the numbers in words, what it is based on, how much it matters and how sure it is, the list it opens) with **AI Signal Decision**, and **Management Brief** (added 18 October 2026: one person's brief for one morning, daily or weekly, with its lines and when it was sent).

## 9. Done when

1. Searching "defaulter" in All Reports finds the fee defaulter report; an accountant can open it, a teacher cannot see it.
2. Every exported file shows the school name, the filters used, who exported it and when.
3. A report too large to show at once runs in the background and sends a notification with the download link.
4. Tapping a number on an Analytics chart opens the list of records behind it with the same count.
5. A student below the attendance threshold appears in Early Warnings with the reason and numbers; the flag cannot be acted on until a person reviews it.
6. AI signals appear only when AI is on, and always as "Suggestion" with their basis.
7. The UDISE+ check lists students with missing required fields before export, each with a link to fix it.
8. A scheduled weekly report arrives by email on time, with the same numbers as on screen.
9. The GST report and the PF and ESI statements are in the catalogue under money reports, visible to the Accountant and not to teachers.
10. A finance report for financial year 2026-27 covers 01-04-2026 to 31-03-2027, whatever the academic year dates are.

## 10. Open questions

- Which board returns are needed, and for which boards? The inputs say "board returns in the latest format" without listing them.
- Should the early-warning "marks drop" rule be set per school or fixed? Assumed: set by the Principal, default 15% (inferred).
- Should the analytics "teacher performance" show results by teacher at all, given sensitivity? Assumed: visible only to the Principal and Academic Head.
