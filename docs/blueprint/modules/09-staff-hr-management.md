# 09 Staff & HR Management

Build order: 3rd (Stage 1). Needs Settings (roles, logins) and Academic Management (classes and subjects for step 3 of Add Staff). The Time Table and class teachers need staff.

## 1. Purpose

Teachers and staff: their records, leave and documents, from joining to leaving.

Used by: the School Admin and, when the school switches them on, the HR and Office Staff role templates (staff records, documents, leave), the Principal (approves leave, sees everything), the head of each department (set in HR Settings; approves leave for their team, inferred), and every staff member (own profile, own leave, own documents).

## 2. Pages

### Staff List

**Purpose:** all teachers and staff, with search by name and designation.

**What the person sees**

- List or cards: photo, name, staff ID, designation, department, phone, status, and "on leave today" when true.
- Filters: designation, department, status (default Active), employment type, campus.
- Count "Showing 1 to 24 of 43".
- **Group view (optional, school groups):** central HR, staff across schools with their school.

**Actions**

- Add staff (opens Add Staff).
- **Bulk import** from a spreadsheet, with validation (P10): name, phone, designation, department, joining date and the other fields of step 1; logins created after import with an invite (inferred).
- View, message, edit (each card).
- Export (P8).
- Bulk actions: send message, print ID cards, change department (P11).

**Form fields:** none (filters only).

### Staff Profile

**Purpose:** one screen per staff member: details, classes, Time Table, attendance, leave, workload and documents.

**What the person sees**

- **Header:** photo, name, staff ID, designation, department, status, phone, and actions (message, edit, apply leave on their behalf, print ID card, experience letter).
- **Tabs (Teacher 360):**
  - Overview: personal details, employment details, emergency contacts.
  - Classes and subjects (from Teacher Allocation), class teacher of.
  - Time Table (the teacher's week).
  - Attendance (monthly calendar, late marks).
  - Leave (balance by type, history).
  - Workload (periods per week against the limit, substitutions taken).
  - Performance (appraisals, optional; results of their classes, inferred).
  - Documents (with expiry dates).
  - Salary (only for people allowed to see salary; links to Salary Management).

**Actions**

- Edit details (each section saves on its own).
- Change status: active, on leave, suspended, resigned, retired, terminated (with date and reason). Resigned, retired and terminated go through Staff Exit (inferred).
- Upload documents.

**Form fields: Edit details** (sections)

| Section | Fields |
|---|---|
| Personal | Full name, photo, date of birth, gender, blood group, Aadhaar (restricted), current and permanent address, qualifications, experience |
| Contact | Phone, email, verified flags |
| Employment | Staff ID (unique, auto), department, designation, joining date, employment type (permanent, contract, temporary, part-time; inferred list), reporting manager, campus |
| Emergency contacts | Name, relation, phone, in priority order |
| Extra fields | Fields added in Settings, Forms & Approvals |

### Add Staff

**Purpose:** three steps: details, what they can open in the software, and their classes and subjects.

**Step 1: Details**

| Field | Required | Default | Notes |
|---|---|---|---|
| Full name | Yes | | |
| Phone | Yes | +91 | 10 digits for India (inferred); duplicate check against staff and logins |
| Designation | Yes | Teacher (inferred) | From HR Settings (for example Teacher, Lecturer, Coordinator, Vice Principal, Academic Head, HR Manager, Accountant, Cashier-cum-Accountant, Driver, Security, Housekeeping, Support Staff). A designation is not a role: what the person can open is chosen in step 2 |
| Department | No | From the designation (inferred) | |
| Joining date | Yes | Today | |
| Gender | No | | |
| Email | No | | Needed for an email invite |
| Photo | No | | JPG or PNG, up to 2 MB, compressed (as in the old software) |
| More details | No | | Date of birth, blood group, Aadhaar (restricted), addresses, qualifications, experience, employment type, reporting manager |
| Mark as verified | No | Not verified | Phone verified and email verified flags |

**Step 2: What they can open**

- Pick one or more **roles** (for example Teacher, Class Teacher, Accountant, Librarian), from the ten ready roles and the role templates the school has switched on (for example HR, Office Staff, Exam In-charge, Gate Security, Driver). A driver hired only for Transport can instead get a login linked to their Driver record (see module 12). The role's permissions are shown in plain words ("Can take attendance for their classes", "Can collect fees").
- For each role, the **scope**: campuses, and for teachers, the classes they cover (filled from step 3).
- "Adjust permissions" (advanced, collapsed): tick or untick single permissions grouped by module, starting from the role. Changes make a personal exception, shown on the profile (inferred).
- **Login:** username made automatically from the school's format (or typed), and either an invite by SMS, WhatsApp or email with a link to set a password, or a temporary password the person must change at first login. "Reset password" later from the profile.

**Step 3: Classes and subjects** (teaching staff only; "Skip" for others)

- Pick classes (searchable list with "select all of a class"), then tick the subjects taught in each class. Subjects not set up for a class show "No subjects set for this class" with a link to Subjects.
- Saved as Teacher Allocation (the same data as Academic Management, Teacher Allocation). These stay from year to year until changed.

**Finish:** "Create staff" shows a summary: staff ID, login, roles, classes; and offers "Print ID card" and "Add another".

### Staff Leave

**Purpose:** apply, approve and cancel leave, with leave balance and a leave calendar.

**What the person sees**

- **My leave** (every staff member): balance by type (allocated, used, remaining), my requests and their status.
- **Requests** (approvers): waiting requests with name, type, dates, days, reason, balance after, and the periods affected for teachers ("8 periods need substitutes").
- **Leave calendar:** who is on leave, by day, filtered by team or department. Leave types marked sensitive in HR Settings (for example medical) show only "On leave" to colleagues; the staff member, their approvers, HR and the Principal see the type.
- **Balances** (HR): every staff member's balances, with manual adjustments. Each balance is its own Leave Balance record (one per staff member, leave type and leave year), not a field on the staff record (decided 9 October 2026, C5).

**Actions**

- **Apply for leave** (own, or on behalf of someone by HR).
- **Approve** or **Reject** with a reason (also from Approvals). Approval runs automation A5.
- **Cancel or withdraw** leave: before it starts, the staff member can withdraw; after approval, cancelling restores the balance and removes the substitutions not yet taken (inferred).
- Adjust a balance (HR only, with a reason).

**Form fields: Apply for leave**

| Field | Required | Default | Notes |
|---|---|---|---|
| Leave type | Yes | Casual | From HR Settings; balance shown next to each |
| From date | Yes | Tomorrow (inferred) | |
| To date | Yes | Same as from | Holidays and weekends inside the range are not counted (inferred) |
| Half day | No | Off | Only for types that allow half days; first or second half |
| Reason | Yes | | |
| Document | No (Yes for some types, for example maternity, inferred) | | |

### Documents & ID Cards

**Purpose:** certificates, ID proof and contracts with expiry reminders, experience letters and staff ID cards.

**What the person sees**

- Documents per staff member: type, number (masked for ID proof), issue and expiry date, status (**Valid**, **Expiring soon**, **Expired**, **Missing**; inferred).
- Expiring this month across all staff.
- ID card printing by designation.

**Actions**

- Upload a document with its expiry date. Reminders go to HR and the staff member before expiry (automation A15; default 30 and 7 days before, inferred).
- **Experience letter:** generate from the template in Settings, Document Designs, filled from the staff record (joining date, last date, designation), and issue (inferred: needs approval if set in Forms & Approvals).
- **Staff ID cards:** choose designation(s) or staff, preview, print in batches (P9), using the shared ID card designer in Settings, Document Designs. Reprint with a reason.

**Form fields: Upload document**

| Field | Required | Default | Notes |
|---|---|---|---|
| Document type | Yes | | Certificate, ID proof, contract, police verification, other (inferred list) |
| File | Yes | | |
| Number | No | | Restricted for ID proofs |
| Expiry date | No | | Needed for reminders |

### Recruitment & Appraisal

*Optional page: for schools hiring, appraising or training through the system. Each part can be switched on separately in HR Settings.*

**Purpose:** vacancies, interviews and offers, yearly appraisal, training and promotions.

**What the person sees**

- **Recruitment:** vacancies (post, department, openings, status), applications per vacancy, interview schedule, offers.
- **Appraisal:** the year's appraisal cycle, each staff member's status (self review, manager review, done), ratings.
- **Training:** training records per staff member (course, dates, hours, certificate).
- **Promotions:** history of designation changes.

**Actions**

- Open a vacancy; record applications; schedule interviews (no double booking of interviewers, inferred); record outcome; make an offer (offer letter from Document Designs). An accepted offer becomes a new staff member through Add Staff with the details filled in (inferred).
- Start an appraisal cycle with a form (from Settings, Forms & Approvals); staff and managers fill it; HR closes the cycle.
- Record training.
- Record a promotion: new designation, from date, reason; salary change goes to Salary Structures (inferred link).

**Form fields: Vacancy**

| Field | Required | Default | Notes |
|---|---|---|---|
| Post (designation) | Yes | | |
| Department | No | From the designation | |
| Openings | Yes | 1 | |
| Closing date | No | | |
| Details | No | | |

### Staff Exit

**Purpose:** resignation, handover, clearance and final settlement.

**What the person sees**

- Staff leaving: name, type (resignation, retirement, termination), last working day, handover status, clearance status, settlement status.

**Actions**

- Record a resignation (date received, last working day, reason) or start a retirement or termination (with approval).
- **Handover:** list the classes, class-teacher duty, subjects, assets and stock items, library books and documents to hand over (pulled from those modules), with who takes each over. Classes and subjects are re-allocated in Teacher Allocation (inferred link).
- **Clearance:** checks across modules: assets and items returned (Inventory), library books returned, advances and loans recovered (Salary), ID card returned (inferred: the check list).
- **Final settlement:** sent to Salary Management for the last month's pay, leave encashment if the school uses it, and recoveries (inferred).
- On the last working day the login is disabled automatically and the status changes (inferred).
- Issue the experience letter.

**Form fields: Record resignation**

| Field | Required | Default | Notes |
|---|---|---|---|
| Staff member | Yes | | |
| Type | Yes | Resignation | Resignation, retirement, termination |
| Last working day | Yes | Today plus the notice period in HR Settings (inferred) | |
| Reason | Yes | | |
| Letter | No | | File |

### HR Settings

**Purpose:** departments, designations, leave types and yearly leave quota. See section 6.

## 3. All features

32 features are mapped to this module: 27 Core and 5 Optional. Tick each one when it is built and tested.

### Staff List (3)

- [ ] Staff list with search (Core)
- [ ] Bulk staff import from a spreadsheet, with validation (Core)
- [ ] Central HR for the group (Optional: school groups) · group view

### Staff Profile (5)

- [ ] Staff profile: name, contact, address, qualifications, experience, photo (staff ID unique) (Core)
- [ ] Employment details: department, designation, joining date, employment type, reporting manager (Core)
- [ ] Staff emergency contacts (Core)
- [ ] Staff status: active, on leave, suspended, resigned, retired, terminated (Core)
- [ ] Teacher 360: classes, subjects, timetable, attendance, leave, workload, performance, documents (Core)

### Add Staff (6)

- [ ] Add staff in three steps: details, permissions, classes and subjects (Core)
- [ ] Step 1 details: name, email, phone, gender, date of birth, address, designation, joining date, photo (Core)
- [ ] Mark staff as verified (Core)
- [ ] Step 2: choose module permissions for the new staff member (Core)
- [ ] Give staff one or more roles, with the classes / campuses they cover (Core)
- [ ] Create the staff login (unique username, invite or temporary password, reset) (Core)

### Staff Leave (6)

- [ ] Apply for leave (dates, type, reason; no overlaps) (Core)
- [ ] Approve / reject leave with a reason (Core)
- [ ] Leave balance as its own Leave Balance record, updated on approval or cancellation (Core)
- [ ] Cancel or withdraw leave (Core)
- [ ] Leave calendar by team or department (Core)
- [ ] Sensitive leave types (e.g. medical) shown only as "On leave" on the shared leave calendar (Core)

### Documents & ID Cards (3)

- [ ] Staff documents: certificates, ID proof, contracts, with expiry dates and expiry alerts (Core)
- [ ] Experience letter (Core)
- [ ] Staff ID cards from the shared ID-card designer (Core)

### Recruitment & Appraisal (4)

- [ ] Recruitment: vacancies, applications, interviews, offers (Optional: schools hiring through the system)
- [ ] Staff appraisal / performance review cycle (Optional: schools running appraisals)
- [ ] Staff training records (Optional: schools tracking training)
- [ ] Staff promotions (Optional: schools tracking promotions)

### Staff Exit (1)

- [ ] Staff exit: resignation, handover, clearance, final settlement (Core)

### HR Settings (4)

- [ ] Departments (Core)
- [ ] Head of each department (Core)
- [ ] Designations (Core)
- [ ] Leave types and rules: casual, sick, earned, maternity, special; yearly quota, carry-forward, half-day (Core)

## 4. Connections

**Receives**

| From | What |
|---|---|
| 20 Settings | Roles, permissions, login rules, document designs (ID card, experience letter), approval rules |
| 04 Academic | Classes and subjects for step 3; workload and Time Table for the profile |
| 05 Attendance | Staff attendance and late marks for the profile |
| 10 Salary | Salary history for the profile (restricted) |
| 13, 14 | Books and assets held, for exit clearance |

**Sends**

| To | What |
|---|---|
| 20 Settings | User Login and Role assignments for each staff member |
| 04 Academic | Teacher Allocation from step 3; approved leave raises substitutions (A5) |
| 05 Attendance | Staff list; approved leave marks "On leave" |
| 10 Salary | New staff for salary structures; approved leave and loss-of-pay days for payroll (A5); final settlement on exit |
| 01 Dashboard | Leave requests waiting, staff counts, birthdays, expiring documents |
| 11 Communication | Staff as message recipients; invites with login links |
| Top bar Approvals | Leave requests, exit approvals, experience letters (if set) |
| Notifications | Leave decisions, expiry reminders (A15), substitutions to arrange |

**Automations:** owns **A5 Teacher leave approved** (balance drops, substitutions suggested in Academic Management, leave reaches the salary) and the staff document part of **A15**.

## 5. Rules and mistake-proofing

| Rule | How it is prevented | What the person is told | How they recover |
|---|---|---|---|
| Staff ID unique | Generated automatically; typed IDs checked | "Staff ID T-042 is used by Meena Rao" | Use the next free ID |
| Same person added twice | Duplicate check on phone and email | "This phone belongs to Arun Kumar (Driver)" | Open existing |
| Phone number wrong | 10-digit check for India (inferred) | "Phone has 11 digits" | Correct it |
| Too much access given by mistake | Start from a role; personal exceptions shown on the profile and in the audit log | "2 extra permissions beyond the Teacher role" | Remove the exception |
| Overlapping leave | Blocked | "You already have leave on 14-10-2026" | Edit the existing leave |
| Leave beyond balance | Blocked, or saved as loss of pay if the leave type allows (inferred) | "Casual leave left: 1 day. You asked for 3." | Choose another type or fewer days |
| Approving own leave | Not allowed (see 00-global.md, section 3) | Not shown | Next approver decides |
| Cancelling leave already taken | Only before the leave ends; after, HR adjusts the balance with a reason (inferred) | "This leave has ended. Ask HR to adjust." | HR adjustment |
| Document expiring unnoticed | Expiry reminders (A15) and the "Expiring this month" list | Reminder notification | Upload the renewed document |
| Staff who left still logging in | Login disabled on the last working day | Sign-in refused: "Your account is closed" | Re-enable by an admin with a reason |
| Teacher removed with classes still allocated | Exit handover lists every class and subject to re-allocate | "8 classes need a new teacher" | Re-allocate |

## 6. Settings

The **HR Settings** page holds:

- **Departments** (add, rename, archive), each with a **head of department** (a staff member). The head is the default first leave approver for the department's staff, and sees the department's leave calendar (inferred).
- **Designations** (the old software's list as defaults, plus the school's own), each linked to a default department and a default role (inferred: default role).
- **Leave types and rules:** casual, sick, earned, maternity, special, plus the school's own; for each: yearly quota, carry-forward (yes or no, maximum), half days allowed, document required, counts weekends and holidays or not (inferred), loss of pay when balance runs out (inferred), and **sensitive** (shown only as "On leave" on the shared leave calendar; default on for sick and maternity leave, inferred).
- **Yearly leave quota** per type, by designation or employment type (inferred: by group).
- **Leave approvers:** shown here, stored in Settings, Forms & Approvals (for example head of department, then Principal).
- **Staff form:** required fields and extra fields for staff (as Student Settings does for students).
- **Staff ID format** and **username format** (inferred; the password rules live in Settings, Users & Permissions).
- **Document types** and reminder days before expiry (inferred).
- **Notice period** for exits (inferred).
- **Recruitment, appraisal and training** on or off (optional page).

## 7. Reports

- Staff directory by department and designation (with export).
- Staff strength and joiners and leavers by month.
- Leave report: taken by type, by staff, by month; balances.
- Leave calendar print.
- Documents expiring and missing.
- Staff attendance and late coming (from Attendance).
- Appraisal and training summary (optional).
- HR analytics appear in Reports & Analytics, Analytics.

## 8. Records used

| Record | Creates | Reads | Updates |
|---|---|---|---|
| Staff | Yes | Yes | Yes |
| User Login | Yes | Yes | Yes (enable, disable, reset) |
| Role | | Yes | Yes (assigns roles to the staff login) |
| Teacher Allocation | Yes (step 3) | Yes | Yes (handover) |
| Leave Request | Yes (staff leave) | Yes | Yes (decision, cancel) |
| Leave Balance | Yes (per staff member, leave type and leave year) | Yes | Yes (approval, cancellation, adjustment, carry-forward) |
| Class, Subject, Section, Timetable Period | | Yes | |
| Attendance Mark | | Yes | |
| Approval, Notification, Message | Yes | Yes | |
| Audit Log Entry | Yes | | |

Other records (inferred): **Department** (with head of department), **Designation**, **Leave Type**, **Leave Balance Adjustment**, **Staff Document**, **Staff ID Card Print**, **Emergency Contact**, **Vacancy**, **Job Application**, **Interview**, **Offer**, **Appraisal Cycle** and **Appraisal**, **Training Record**, **Promotion Record**, **Exit Case** with **Handover Item** and **Clearance Check**.

## 9. Done when

1. HR adds a teacher in three steps in under 3 minutes: details, the Teacher role, and classes with subjects; the teacher receives an invite and can log in.
2. The new teacher appears in Teacher Allocation for the classes and subjects chosen in step 3.
3. Adding a second staff member with the same phone shows the duplicate warning.
4. A teacher applies for 2 days of casual leave on a phone; the principal approves it from Approvals; the balance drops by 2; the teacher's periods appear in Substitutions; the leave shows in Staff Attendance and reaches Generate Salary.
5. Applying for leave that overlaps an existing leave is blocked.
6. A document with an expiry date 30 days away sends a reminder to HR and the staff member.
7. Staff ID cards for all teachers print in one batch from the shared designer.
8. On a leaving staff member's last day, their login stops working and the exit shows the handover and clearance list.
9. A teacher can see only their own salary and leave, not other staff members'.
10. A teacher on sick leave shows as "On leave" on the shared leave calendar; the Principal sees "Sick leave".
11. Setting a head for the Science department sends Science teachers' leave requests to that head first.

## 10. Open questions

- Should leave that exceeds the balance be refused, or allowed as loss of pay? The inputs do not say. Assumed: per leave type setting.
- Who approves leave by default: the head of department, the Principal, or both in turn? Assumed: Principal, until the school sets a chain.
- Should the username follow a fixed school format (as in the old software) or be the phone number? Assumed: school format, editable.
- Does the school pay leave encashment in the final settlement? Not stated.
