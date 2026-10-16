# 03 Student Management

Build order: 4th (Stage 1). Needs Settings and Academic Management (year, classes, sections). Fees, attendance and exams all build on the records made here.

## 1. Purpose

Every student's full record, from admission to leaving, in one place.

Used by: the School Admin and, when the school switches on the Office Staff role template, office staff (records, imports, certificates, ID cards, recording a student leaving), class teachers and subject teachers (their own students' profiles, behaviour incidents), the Principal (everything, promotion, TC approval), the Counsellor role template (private counselling notes, only when switched on), and the Accountant (fee tab and clearance only).

## 2. Pages

### Student List

**Purpose:** all students by class and section, with search, Excel import, bulk changes and export.

**What the person sees**

- List columns: photo, name, admission number, class and section, roll number, father's or guardian's name, phone, status, fee status chip (Paid, Due, Overdue; only for people allowed to see fees).
- Class tiles at the top with the number of students in each class and section; tapping a tile filters the list (this answers "what is our strength by class?").
- Quick filters: class, section, status (default: Active). More filters: gender, category, new this year, transport user, hostel resident, missing documents, missing photo (inferred: the extra filters).
- A teacher sees only the students of the sections they teach.

**Actions**

- **Add student:** for students who did not come through Admission Management (for example when moving from the old software, see workflow 15, "Switching to School OS", in 02-workflows.md).
- **Import:** three choices, all using the shared importer (P10):
  - **CSV import:** download the sample, choose the class, upload. Option "Apply the class fee plan" (on by default). Option "Link siblings": a column with an enrolled sibling's admission number links the same parents (inferred: admission number instead of the old username).
  - **Smart Import (AI, optional):** upload any spreadsheet; AI suggests which column is which and points out likely fixes (for example a date in the wrong format). A person confirms every column match and every fix. Empty cells stay empty; AI never fills them with guesses.
  - **UDISE import (India):** import students from the UDISE+ government format (66 columns).
- **Bulk field update:** choose a field (roll number, admission number, phone, address and others), choose the students, enter or upload the new values, see a before-and-after preview, confirm, see the summary, undo if needed.
- **Bulk profile photos:** upload many photos at once, each named by admission number or another chosen identifier. Before saving, the screen lists matches, files with no matching student, and clashes (two files for one student, or one student already with a photo) for the person to resolve.
- **Student logins (optional):** generate or regenerate logins for selected students, and share them by CSV, WhatsApp, SMS or email.
- **Bulk actions on selected students:** send message, print ID cards, print certificates, change section, update a field, export (P11).
- **Export:** choose the fields, then CSV, Excel or PDF (P8).

**Form fields: Add student** (quick add; the rest is filled later on the profile)

| Field | Required | Default | Notes |
|---|---|---|---|
| Full name | Yes | | |
| Class and section | Yes | The class filtered on the list | Shows seats left |
| Date of birth | Yes | | |
| Gender | Yes | | |
| Parent's or guardian's name | Yes | | |
| Parent's phone | Yes | +91 | Matching phone offers to link the existing parent (sibling) |
| Admission number | Auto | Next number in the Student Settings format | Can be typed when moving old records; must be unique |
| Roll number | Auto | Next free number in the section (inferred) | |
| Admission date | Yes | Today | |
| Apply class fee plan | Yes | On | |
| More details | No | | Photo, blood group, address, category, previous school, identifiers and the school's extra fields |

Duplicate check on create and import: same name and date of birth, or same name with the same guardian or phone. The match is shown with **Open existing** and **Save anyway** (with a reason, inferred).

### Student Profile

**Purpose:** one screen per student: details, parents, attendance, fees, marks, homework, bus, library, behaviour and documents.

**What the person sees**

- **Header:** photo, name, class and section, roll number, admission number, status, and the actions allowed for this person (Collect fee, Mark attendance, Send message, Print TC, Print ID card, Edit).
- **Summary strip:** attendance %, academic average, fee status, behaviour, transport route, library books out, activities, documents complete (for example 5 of 6).
- **Today panel:** today's attendance, homework due, fees due today, today's timetable.
- **Tabs** (each tab follows the person's permissions; tabs for switched-off modules are hidden):

| Tab | Shows | Comes from |
|---|---|---|
| Overview | Personal and enrolment details, parents, emergency contacts, identifiers (restricted), notes, timeline | This module |
| Academics | Class history for every year, subjects and electives, previous school and marks | 03, 04 |
| Attendance | Monthly calendar, %, leave taken | 05 |
| Fees | Ledger summary, dues, receipts; button to Collect Fee | 06 |
| Exams | Marks, results, report cards | 08 |
| Homework | Homework given, submitted, scores | 17 |
| Transport | Route, stop, bus pass | 12 |
| Library | Books out, history, fines | 13 |
| Activities | Achievements, houses, clubs, events, PTM notes | 18 |
| Behaviour | Behaviour timeline (incidents, warnings, rewards, points) | This module |
| Documents | Student and parent documents: upload, preview, download | This module |
| Communication | Messages sent to the parents, queries raised | 11 |

- **Student timeline:** one list of everything that happened to the student, newest first (admission, section changes, promotion, leave, incidents, certificates, payments).
- **AI insights (optional):** a "Suggestions" card with strengths and weaknesses, risk factors, subject trends and suggested next steps for the teacher. Every point shows the numbers it is based on and is labelled "Suggestion". The teacher can mark a point "Not useful" (inferred). Nothing changes on the record.
- **APAAR and PEN (India):** IDs, consent status and APAAR status, in a restricted box. They are exported from Reports & Analytics, Government Reports.

**Actions**

- Edit details (each section edits separately; no giant form).
- Upload or replace photo (camera or file).
- Change status (only allowed changes, see below), with an effective date and a reason.
- Change section within the same class (keeps history) (inferred: section change action).
- Add note; mark it private to chosen roles.
- Add emergency contacts and order them by priority.
- Upload, preview and download documents.

**Form fields: Edit details** (sections, each saved on its own)

| Section | Fields |
|---|---|
| Personal | Full name, photo, date of birth, gender, blood group, category, religion and mother tongue (inferred), Aadhaar-related fields (restricted) |
| Contact | Address (current and permanent), student phone and email (optional) |
| Enrolment | Admission number (unique; change audited), admission date, class, section, roll number, house (when houses are on) |
| Previous school | School name, board, last class, year, marks or %; locked once the record is closed |
| Identifiers | National and academic identifiers of the types set in Student Settings (for example APAAR, PEN), restricted |
| Emergency contacts | Name, relation, phone, in priority order |
| Extra fields | Fields the school added in Settings, Forms & Approvals |

**Student status and allowed changes** (status list kept in Student Settings; default changes, inferred):

| From | Can change to | How |
|---|---|---|
| Lead, Applicant | Admitted | Admission Management only |
| Admitted | Active | Automatically on the admission date |
| Active | Promoted, Transferred, Withdrawn, Graduated, Inactive | Promotion page or Leaving & Alumni page only (Inactive here, with reason) |
| Promoted | Active (in the new year) | Automatically when the new year starts |
| Inactive | Active | Here, with reason |
| Graduated | Alumni | Leaving & Alumni |
| Transferred, Withdrawn | Active (re-admission) | Here, with reason and approval (inferred) |

One lifelong record per student: each year's class is kept, and nothing is overwritten or deleted.

### Parents & Guardians

**Purpose:** parents' details and phone numbers, linked to all their children in the school.

**What the person sees**

- List columns: name, relation (father, mother, guardian), phone, children (with classes), occupation, opted out of messages (yes or no), data consent (Given, Not given, Withdrawn), Parent Link (Active, Not sent, Revoked) (decided 9 October 2026).
- Quick filters: consent not given, consent withdrawn, photo consent not given, Parent Link not opened yet (inferred).
- **Parent page (Parent 360):** children, fees and payments for all children, attendance of each child, messages sent, PTMs, transport, documents, requests and complaints, consent records (each consent type with the text version agreed to, date, and how it was given: application form or Parent Link), and Parent Link status with the last time it was opened.

**Actions**

- Add or edit a parent or guardian.
- Link a guardian to a student with a relation; link one guardian to several children (siblings).
- Set the **primary contact** for messages for each child (inferred: which number gets WhatsApp and SMS).
- **Custody / access restriction flag** on a guardian link, with a note. A flagged guardian is not on the authorised pickup list and is shown with a red mark in Front Office, Student Pickup (inferred link).
- Merge two parent records that are the same person (inferred: needed after imports; keeps all links and history).
- **Resend / revoke Parent Link** on a guardian: resend the guardian's personal link by WhatsApp or SMS, or revoke it (for example a lost phone) and issue a new one. The Parent Link page itself is owned by Communication (decided 9 October 2026, D4).
- **Send consent request:** for one guardian or many selected (for example all guardians of existing students after switching to School OS), sends a consent request through Parent Link; the guardian agrees with a one-time code to their registered mobile (decided 9 October 2026, D8a).
- **Record consent withdrawal:** when a guardian withdraws consent (in Parent Link or by asking the office), the Consent Record shows Withdrawn with the date; photo consent can be withdrawn on its own. A withdrawn photo consent hides the child's photo from the gallery and social posts (inferred).

**Form fields: Add parent or guardian**

| Field | Required | Default | Notes |
|---|---|---|---|
| Relation | Yes | Father | Father, mother, guardian, other |
| Full name | Yes | | |
| Phone | Yes | +91 | If the phone exists, offers to link the existing parent |
| Email | No | | |
| Occupation | No | | |
| Date of birth | No | | Used for parents' birthdays on the Dashboard (inferred) |
| Emergency contact | No | Off | Adds them to the student's emergency contacts |
| Custody / access restriction | No | Off | With a note; restricted field |

### Behaviour & Counselling

**Purpose:** discipline incidents, warnings and rewards, plus private counsellor notes seen only by allowed staff (the Counsellor role template, when switched on).

**What the person sees**

- Tabs: **Incidents & rewards**, **Counselling** (optional), **Career guidance** (optional, secondary schools).
- Incidents list: date, student(s), type (incident, warning, suspension, reward or recognition), short description, reported by, action taken, status (Open, Closed, inferred).
- Behaviour points total per student (optional).
- Counselling list (only for allowed staff): case, student, counsellor, status, next session.

**Actions**

- **Report an incident** (from a phone in three taps: student, type, short note). Optional photo (inferred).
- Record a warning, a suspension (from and to dates, reason, approved by), or a reward or recognition.
- Add or remove behaviour points (optional), with a reason.
- Refer to counselling (creates a counselling case and tells the counsellor).
- **Counselling (optional, schools with a counsellor):** open a case, record sessions, write confidential notes (highly restricted), set follow-ups and action plans, record outside referrals.
- **Career guidance (optional, secondary schools):** career counselling notes, entrance-exam guidance, college application tracking (college, course, status, deadline), scholarship information for higher studies, interest and aptitude records, alumni mentors linked to students.

**Form fields: Report incident**

| Field | Required | Default | Notes |
|---|---|---|---|
| Student(s) | Yes | | One or more from the teacher's classes |
| Type | Yes | Incident | Incident, warning, suspension, reward or recognition |
| What happened | Yes | | Short text |
| Date | Yes | Today | |
| Action taken | No | | |
| Inform parent | No | Off (inferred) | Sends a message using the school's template |
| Points | No | From the type's default (optional) | |

### Promotion

**Purpose:** move a whole class to the next class at year end, after checking results and the list.

**What the person sees**

- A guided page in three steps (inferred: the steps):
  1. **Choose:** from year and class (and section), and the target year, class and section. Default target: the next class in order, same section name, next academic year.
  2. **Review the batch:** every student with their final result (from Examination & Results), attendance %, fee dues (shown as a warning only), and a suggested decision from the promotion policy: **Promote**, **Detain** (repeat the class) or **Leaving**. The person can change any row; changes from the suggestion need a reason.
  3. **Confirm:** summary ("38 promoted to 6 A, 1 detained, 1 leaving"), then save.
- Promotion history: past batches with who confirmed them.

**Actions**

- Promote a class in bulk; change individual decisions; split promoted students across sections (inferred).
- Save the batch: runs automation A13. Students move to the new class in the new year with the new year's fee plan; last year's record stays unchanged; "Leaving" students go to the Leaving & Alumni list.
- Undo a batch while nothing has been recorded for those students in the new year (no attendance, no payment) (inferred).

**Form fields:** from year, class, section (default: the selected list); target year (default next), class (default next class), section (default same name).

### Leaving & Alumni

**Purpose:** transfer or withdrawal with fee and library clearance, and records of past students.

**What the person sees**

- Tabs: **Leaving** (students in the leaving process), **Left**, **Alumni**.
- Leaving list: student, reason, last date, clearance status (Fees, Library, Hostel, Inventory; only modules switched on), TC status.

**Actions**

- **Start leaving:** transfer or withdrawal with reason, last date, destination school, and documents.
- **Clearance (automation A14):** the system checks fee dues (Fee Management) and books not returned (Library), plus hostel bed and items issued when those modules are on (inferred). Each check shows Clear or the amount or items pending, with a button to settle it (Collect Fee, Return book). A pending check can be waived only by someone allowed to approve it, with a reason, through Approvals (inferred).
- When all checks are clear, the TC can be issued (Certificates & ID Cards). The student's status changes to Transferred or Withdrawn on the last date.
- Mark graduated students as alumni at year end (inferred: from the Promotion "Leaving" or final-class step).
- **Alumni (optional):** alumni records with graduation year, contact, career, higher education and achievements. Alumni donations (amount, date, purpose; receipt through Finance, Income, inferred link), alumni mentorship (alumni linked to current students), and an alumni job board (job posts shared with alumni).

**Form fields: Start leaving**

| Field | Required | Default | Notes |
|---|---|---|---|
| Type | Yes | Transfer | Transfer or withdrawal |
| Reason | Yes | | From a list plus "Other" (inferred list) |
| Last date | Yes | Today | |
| Destination school | No (Yes for transfer, inferred) | | |
| Documents | No | | For example parent's letter |

### Certificates & ID Cards

**Purpose:** print TC, bonafide, study and character certificates, and student ID cards class by class.

**What the person sees**

- **Certificates tab:** list of certificates issued and requested: number, type, student, date, status (Requested, Approved, Issued, Cancelled, inferred).
- **ID cards tab:** class tiles with the number of students; "Preview & print" per class.

**Actions: certificates**

- Issue a **bonafide**, **study**, or **conduct / character** certificate: choose the student and type; the certificate fills from the record and the design in Settings, Document Designs; preview; issue. Conduct and character certificates are signed by an authorised signatory.
- **Transfer certificate (TC):** only after clearance (A14) and approval. One original TC per student; a second copy is printed as "Duplicate" with a reason (inferred).
- **Migration-related documents** (optional) for students moving between boards or states.
- **QR verification** (optional): each certificate carries a QR code that opens a verification page showing only the certificate number, type, issue date and "Valid"; no personal data is in the code.
- **DigiLocker-ready records** (optional): certificates prepared in a format ready for DigiLocker upload.
- Certificates that need approval (TC always; others as set in Forms & Approvals) appear in Approvals.

**Actions: ID cards**

- Pick a class; see the total students and the batch size (maximum 50 per batch); preview a single card; print batch by batch as a print-ready PDF (page size and cards per page from the design).
- Card fields: photo, name, class, QR code and barcode, plus the fields ticked in the ID card settings (Settings, Document Designs). Academic year and valid-until date print on every card.
- RFID-enabled cards (optional): record the RFID number on the student for attendance devices.
- **Reprint** a replacement card with a reason (lost, damaged, details changed). The old card is kept on record as replaced.
- Students missing a photo are listed before printing, with "Print anyway" or "Upload photos" (inferred).

**Form fields: Issue certificate**

| Field | Required | Default | Notes |
|---|---|---|---|
| Student | Yes | The student open on screen | |
| Certificate type | Yes | | Bonafide, study, conduct / character, TC, migration |
| Purpose | No (Yes for bonafide, inferred) | | For example "bank account opening" |
| Date of issue | Yes | Today | |
| Signatory | Yes | Default signatory for the type | |
| Certificate number | Auto | Next in the series for that type and year (inferred) | |

### Student Settings

**Purpose:** the rules for student records in this school. See section 6.

## 3. All features

83 features are mapped to this module: 56 Core and 27 Optional. Tick each one when it is built and tested.

### Student List (10)

- [ ] Student list with search and class filter (Core)
- [ ] Duplicate check on create and import (name, date of birth, guardian, phone) (Core)
- [ ] Bulk actions on selected students (Core)
- [ ] Student CSV import: download sample, choose class, upload (Core)
- [ ] Import checks: column mapping, row errors, preview, confirm, summary, history; good rows can import while bad rows are rejected (Core)
- [ ] Smart Import (AI): reads any spreadsheet, maps columns, validates, suggests fixes (Optional: schools moving messy data from old systems)
- [ ] UDISE import (Core, India)
- [ ] Bulk field update (phone, address and other fields) (Core)
- [ ] Bulk profile photos matched by name or ID, with clash handling (Core)
- [ ] Generate / regenerate student login credentials (Optional: schools giving students logins)

### Student Profile (22)

- [ ] Add / edit student profile: student ID, admission no., roll no., name, photo, date of birth, gender, blood group, address, contact, category (Core)
- [ ] Admission number unique within the school; profile changes audited (Core)
- [ ] Enrolment details: class, section, admission details (Core)
- [ ] Previous school and academic history (class, year, marks), locked once closed (Core)
- [ ] National / academic identifiers (types set by the school; restricted access) (Core) · identifier types kept in Student Settings
- [ ] Emergency contacts in priority order (Core)
- [ ] Upload or replace student photo (Core)
- [ ] Student status and lifecycle: lead, applicant, admitted, active, promoted, transferred, withdrawn, graduated, alumni (plus inactive); effective date, reason, allowed changes; one lifelong record (Core) · status list kept in Student Settings
- [ ] Each year's class history kept; nothing overwritten or deleted (Core)
- [ ] Student notes, including private notes visible only to chosen roles (Core)
- [ ] Student timeline (Core)
- [ ] One screen per student with tabs: overview, academics, attendance, fees, exams, homework, transport, library, activities, documents, communication (each tab follows permissions) (Core)
- [ ] Summary strip: attendance %, academic average, fee status, behaviour, transport route, library books, activities, documents complete (Core)
- [ ] "Today" panel: attendance, homework, fees, timetable (Core)
- [ ] Student and parent documents: upload, preview, download (Core)
- [ ] Behaviour timeline in Student 360 (Core)
- [ ] Student insights engine (Optional: schools using AI)
- [ ] Strengths and weaknesses per student (Optional: schools using AI)
- [ ] Risk factors per student (Optional: schools using AI)
- [ ] Subject trends per student (Optional: schools using AI)
- [ ] Suggested next steps for the teacher (Optional: schools using AI)
- [ ] APAAR / PEN IDs, consent and status (Core, India) · exported from Government Reports

### Parents & Guardians (8)

- [ ] Parent / guardian profiles: father, mother, guardian, occupation, contacts, emergency contact (Core)
- [ ] Link one or more guardians to a student, with relationship (Core)
- [ ] One parent linked to several children (siblings) (Core)
- [ ] Custody / access restriction flag on a guardian link (Core)
- [ ] Parent 360: children, fees, payments, attendance, messages, PTMs, transport, documents, requests, complaints (Core)
- [ ] Consent status per guardian (data and photo consent), with the text version agreed to and withdrawal (Core) · DPDP, decided 9 October 2026
- [ ] Send consent requests to one or many guardians through Parent Link (Core)
- [ ] Parent Link status on each guardian, with Resend / revoke Parent Link (Core) · the page is owned by 11 Communication

### Behaviour & Counselling (18)

- [ ] Discipline incidents (Core)
- [ ] Warnings (Core)
- [ ] Referral to counselling (Core)
- [ ] Suspension record (Core)
- [ ] Recognition and rewards (Core)
- [ ] Behaviour points (Optional: schools using points)
- [ ] Teachers report incidents from mobile (Core)
- [ ] Counselling cases (Optional: schools with a counsellor)
- [ ] Counselling sessions (Optional: schools with a counsellor)
- [ ] Confidential counselling notes (Optional: schools with a counsellor)
- [ ] Counselling follow-ups and action plans (Optional: schools with a counsellor)
- [ ] Outside referrals (Optional: schools with a counsellor)
- [ ] Career counselling (Optional: secondary schools)
- [ ] Entrance-exam guidance (Optional: secondary schools)
- [ ] College application tracking (Optional: secondary schools)
- [ ] Scholarship information for higher studies (Optional: secondary schools)
- [ ] Interest and aptitude records (Optional: secondary schools)
- [ ] Alumni mentoring for students (Optional: secondary schools)

### Promotion (3)

- [ ] Promote students to the next class / year in bulk (Core)
- [ ] Review the promotion batch before it is saved (Core)
- [ ] Promotion decided from results / eligibility (Core)

### Leaving & Alumni (6)

- [ ] Transfer or withdrawal: reason, date, destination school, documents (Core)
- [ ] Fee and document clearance holds before leaving (Core)
- [ ] Alumni records: graduation year, contact, career, higher education, achievements (Optional: schools tracking alumni)
- [ ] Alumni donations (Optional: schools tracking alumni)
- [ ] Alumni mentorship (Optional: schools tracking alumni)
- [ ] Alumni job board (Optional: schools tracking alumni)

### Certificates & ID Cards (14)

- [ ] Bonafide certificate (Core)
- [ ] Study certificate (Core)
- [ ] Transfer certificate (TC) with approval and clearance (Core)
- [ ] Conduct / character certificate signed by an authorised signatory (Core)
- [ ] Migration-related documents (Optional: students moving between boards or states)
- [ ] QR code to verify a certificate (no personal data in the code) (Optional: schools issuing verifiable certificates)
- [ ] Card fields: photo, name, class, QR code, barcode (Core)
- [ ] RFID-enabled cards (Optional: schools using RFID)
- [ ] Preview a single card (Core)
- [ ] Batch print by class, showing total students and maximum batch size (Core)
- [ ] Academic year and valid-until date on cards (Core)
- [ ] Reprint a replacement card with reason (old card kept on record) (Core)
- [ ] Print-ready PDF (page size, cards per page) (Core)
- [ ] DigiLocker-ready records (Optional: schools issuing digital records)

### Student Settings (2)

- [ ] Promotion policy: criteria, minimums, approvals; versioned per year (Core)
- [ ] Required fields and list display settings for user forms (Core) · staff form fields in HR Settings

## 4. Connections

**Receives**

| From | What |
|---|---|
| 02 Admission | New students and parents with documents and the consent given on the application (A2) |
| 11 Communication | Consent given or withdrawn through Parent Link; Parent Link status and last opened |
| 04 Academic | Years, classes, sections, seats, subjects and electives |
| 05 Attendance | Attendance % and calendar for the profile |
| 06 Fee Management | Fee status, dues and receipts for the profile; fee clearance for leaving (A14) |
| 08 Examination & Results | Results for promotion; marks for the profile and AI insights |
| 13 Library | Books not returned for clearance (A14); library tab |
| 12, 15, 17, 18 | Transport, hostel, homework and activities tabs |
| 19 Reports & Analytics | Early-warning flags shown on the profile (inferred) |
| 20 Settings | Document designs, extra fields, roles and restricted fields |

**Sends**

| To | What |
|---|---|
| Every module | The Student and Guardian records everyone uses |
| 06 Fee Management | Fee plan on import and on promotion (A13); clearance requests |
| 16 Front Office | Authorised pickup list and custody flags |
| 05 Attendance | RFID card numbers for devices (optional) |
| 11 Communication | Parent phone numbers, primary contacts, opt-outs; incident messages to parents; Resend / revoke Parent Link and consent requests |
| 19 Reports & Analytics | Student reports; APAAR and PEN data for Government Reports |
| Top bar Approvals | TC and certificate approvals, clearance waivers, re-admissions |

**Automations:** owns **A13 Year-end promotion** and **A14 Student leaving**. Receives the results of **A2**.

## 5. Rules and mistake-proofing

| Rule | How it is prevented | What the person is told | How they recover |
|---|---|---|---|
| Admission number unique in the school | Checked while typing and on the server | "Admission number 2026/0145 already belongs to Arjun Rao, 4 B" | Use the next free number shown |
| Duplicate student | Duplicate check on create and import (name, date of birth, guardian, phone) | Shows the match with Open existing or Save anyway | Save anyway needs a reason; merge later if needed |
| Import with bad rows | Shared importer preview (P10); good rows import, bad rows go to an error file | "212 ready, 3 have problems: row 14 date of birth 31-02-2015 is not a real date" | Fix the error file and import it again; undo the whole import |
| Smart Import guesses | AI suggests only; a person confirms each column match and fix | Suggestions labelled "Suggestion" | Change any match before importing |
| Bulk change by mistake | Before-and-after preview, then summary | "Update phone for 40 students?" | Undo the bulk update from its history (inferred) |
| Photo clash in bulk photos | Clashes listed before saving | "2 files match Ravi Kumar" | Choose one, skip the other |
| Status changed the wrong way | Only allowed changes offered; promotion and leaving only on their pages | Disallowed statuses are not shown | Change back with reason, or undo the batch |
| Closed history edited | Previous school and past years locked once closed | "Locked: 2025-26 is closed" | Authorised correction with reason (Academic Settings) |
| Private notes seen by the wrong person | Notes marked private are visible only to chosen roles; counselling notes highly restricted; checked on the server | The note is not shown at all | Ask an admin for the permission |
| Promotion of the wrong class | Review step shows every student with result and suggestion | "Promote 40 students from 5 A (2025-26) to 6 A (2026-27)?" | Undo the batch while nothing is recorded in the new year |
| Promotion with no new year | Target year must exist and be open | "2026-27 is not set up yet. Open it in Academic Settings." | Open the year, then return |
| TC before clearance | TC button disabled until A14 checks are clear or waived | "TC blocked: ₹4,500 fees due and 1 library book not returned" | Collect fee, return book, or request a waiver |
| Second original TC | Only one original; later copies print "Duplicate" with a reason | "An original TC was issued on 12-04-2026. Print a duplicate?" | Not needed |
| Lost ID card reprinted | Reason required; old card marked replaced | "Reason for reprint" | Not needed |
| Custody-restricted guardian | Flag shown in red wherever pickup or contact happens | "Do not release to this person. See note." | Only an admin can change the flag, with a reason |
| Parent Link reaches the wrong person | Link opens on a new phone only after a one-time code to the guardian's registered mobile; a custody-flagged guardian does not see that child in Parent Link (inferred) | "Parent Link revoked. A new link was sent to 98xxxxxx10." | Revoke and resend the link |
| Using a child's data without consent | Guardians without data consent are listed in Needs Attention; consent is never ticked by staff, only given by the guardian with a one-time code | "Consent not given. Send a consent request?" | Send the consent request through Parent Link |

## 6. Settings

The **Student Settings** page holds:

- **Admission number format:** prefix, year, running number and padding (for example 2026/0001), and whether numbers restart each year (inferred: format parts).
- **Required fields** on the student form, and which fields show in the student list (list display settings). Staff form fields are set in HR Settings.
- **Extra fields:** links to Settings, Forms & Approvals, where custom fields are added for students.
- **Student status list:** the default list (lead, applicant, admitted, active, promoted, transferred, withdrawn, graduated, alumni, inactive) and any school statuses, with the allowed changes between them.
- **Identifier types:** for example APAAR ID, PEN, Aadhaar, board registration number; each marked restricted or highly restricted.
- **Promotion policy:** criteria (pass required, minimum attendance %, fee dues allowed or not), minimums and who approves exceptions. Versioned per year, so changing it never changes past promotions.
- **Leaving reasons** list (inferred).
- **Certificate settings:** which certificates need approval (also in Forms & Approvals), certificate numbering (inferred), default signatories. Designs are in Settings, Document Designs.
- **ID card settings:** opened from Certificates & ID Cards, stored in Settings, Document Designs (fields to show, school details, colour, card size, academic year, valid until, cards per row, QR code, library barcode).
- **Behaviour settings:** incident types, behaviour points on or off and points per type (optional), who can see counselling notes (inferred).
- **Student logins** on or off (optional).

## 7. Reports

Student reports appear in Reports & Analytics, All Reports (the feature is mapped there), using data from this module:

- Student master list, demographics (gender, category, age), lifecycle (status counts and changes), transfers and withdrawals, document status (missing documents by class).

This module also provides (inferred, from its own pages):

- Class strength by class and section, with seats left.
- Behaviour incidents and rewards by class and month.
- Promotion summary per class (promoted, detained, leaving).
- Certificates issued by type and month; ID cards printed and reprinted.
- Alumni list by graduation year (optional).

## 8. Records used

| Record | Creates | Reads | Updates |
|---|---|---|---|
| Student | Yes | Yes | Yes (details, status, class history) |
| Guardian | Yes | Yes | Yes |
| Consent Record | Yes (consent requests; withdrawal recorded by the office) | Yes | Yes (withdrawn) |
| User Login | Yes (optional student logins) | | Yes (regenerate) |
| Class, Section, Academic Year, Subject | | Yes | |
| Student Fee Due | Yes (fee plan on import and promotion) | Yes | |
| Payment, Receipt | | Yes (fee tab, clearance) | |
| Attendance Mark, Marks, Report Card, Homework, Submission | | Yes (profile tabs) | |
| Transport Assignment, Book Issue, Bed Allocation, Event | | Yes (profile tabs, clearance) | |
| Message, Template | Yes (incident messages, login sharing) | Yes | |
| Approval | Yes | Yes | |
| Notification | Yes | | |
| Audit Log Entry | Yes | | |

Other records (inferred): **Student Class History** (one row per student per year), **Student Document**, **Student Note**, **Emergency Contact**, **Student Identifier**, **Behaviour Incident**, **Counselling Case** and **Counselling Session**, **Career Record**, **Promotion Batch**, **Leaving Request** with **Clearance Check**, **Certificate** (number, type, status), **ID Card Print** (including replacements), **Alumni Record**, **Alumni Donation**, **Job Post**, **Import Batch**.

## 9. Done when

1. A class of 40 students imports from the sample CSV; a row with a wrong date is rejected with a plain message while the other 39 import; the import can be undone.
2. Adding a student whose name and date of birth match an existing student shows the duplicate warning.
3. Two children with the same parent phone share one parent record, and the parent page shows both children.
4. A teacher opening a student outside their classes sees nothing; opening their own student shows only the tabs their role allows, and never the counselling notes.
5. The profile's fee tab and attendance tab show the same numbers as Fee Management and the Attendance Register.
6. Promoting class 5 A moves every promoted student to 6 A in the new year with the new fee plan, while 5 A in the old year still shows the same students and marks.
7. A student with fees due cannot get a TC until the fee is paid or a waiver is approved; the block message names the amount.
8. ID cards for a class of 35 print in one batch with the academic year and valid-until date; a reprint asks for a reason and keeps the old card on record.
9. A custody-flagged guardian appears in red in Front Office, Student Pickup and is not on the authorised list.
10. Changing an admission number writes the old and new value to the history.
11. A bulk consent request to the parents of class 5 A reaches each guardian's Parent Link; a guardian who agrees shows Given with the text version, and one who withdraws photo consent shows Withdrawn for photos only.
12. Revoking a guardian's Parent Link stops the old link from opening, and Resend sends a new one.

## 10. Open questions

- The old software used usernames to link siblings during import. The new import uses the sibling's admission number (inferred). Is that acceptable?
- Should a student's status change to Transferred or Withdrawn on the day the leaving process starts, or on the last date? Assumed: on the last date.
- Should "Save anyway" on a duplicate student need approval, or only a reason? Assumed: only a reason.
- Which certificates other than TC need approval by default? The inputs say certificates go to Approvals but do not say which ones.
- D3 (decided): Transport is not in the first version, so the Transport tab and transport filters stay hidden until Transport is built.
- D4 (decided 9 October 2026): there is still no parent app or password login; each guardian has a Parent Link, whose status and Resend / revoke action sit on the guardian here.
- D8a (decided 9 October 2026): data consent and photo consent are kept as Consent Records per guardian, with the text version agreed to; existing students' guardians get a bulk consent request through Parent Link.
