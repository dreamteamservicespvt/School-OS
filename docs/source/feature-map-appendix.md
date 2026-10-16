# School OS: feature map appendix

This appendix goes with the School OS plan. It shows where every feature now lives: a module page, the top bar, an automatic step, every screen, or "Not included".

- Part A maps all 888 features from the de-duplicated feature list, grouped by their new module and page.
- Part B maps every screen of the old software seen in the screen recording, and every detail the recording showed that the feature list did not have.
- Part C lists how the conflicts between the sources were settled.

Column "Was listed under" is the heading the feature had in the feature list. "Need" says Core (most schools) or Optional (some schools). Nothing was dropped: items the owner excluded and the Super Admin console are mapped to "Not included".

## Summary

| Home | Features |
|---|---:|
| Dashboard | 40 |
| Admission Management | 53 |
| Student Management | 80 |
| Academic Management | 43 |
| Attendance Management | 35 |
| Fee Management | 57 |
| Finance Management | 28 |
| Examination & Results | 40 |
| Staff & HR Management | 30 |
| Salary Management | 13 |
| Communication | 51 |
| Transport Management | 38 |
| Library Management | 14 |
| Inventory Management | 32 |
| Hostel Management | 15 |
| Front Office | 17 |
| Homework & Learning | 30 |
| Events & Calendar | 43 |
| Reports & Analytics | 24 |
| Settings | 79 |
| Top bar | 23 |
| Automatic work | 4 |
| Every screen | 20 |
| Not included | 79 |
| **Total** | **888** |

## Part A: every feature and its new home

### Dashboard

| Page | Feature | Need | Was listed under | Note |
|---|---|---|---|---|
| School Today | Each role gets its own home screen showing only the data it is allowed to see | Core | Dashboard > Role-based home |  |
| School Today | Principal home (control centre): today's attendance, fees, expenses, transport, approvals and alerts on one screen | Core | Dashboard > Role-based home |  |
| School Today | Teacher home: today's classes with a Take Attendance button for each, timetable, homework, exams and marks, lesson plans, substitutions, notices, leave, meetings, PTMs | Core | Dashboard > Role-based home |  |
| School Today | Teacher to-do counts: homework to check, assessments pending, parent messages | Core | Dashboard > Role-based home |  |
| School Today | Accountant home: money today (collected, pending, expenses) with Collect Fee, Record Expense, View Payments, Send Fee Reminder and Reports buttons | Core | Dashboard > Role-based home |  |
| School Today | Homes for admin, HR, librarian and driver that open on their pending work | Core | Dashboard > Role-based home |  |
| School Today | Head-count tiles: students, parents, staff, admins | Core | Dashboard > School today |  |
| School Today | Today's student attendance: present, absent, late, % | Core | Dashboard > School today |  |
| School Today | Today's staff and teacher attendance | Core | Dashboard > School today |  |
| School Today | Today's fee collection and number of fee payments | Core | Dashboard > School today |  |
| School Today | Outstanding / fees-due amount | Core | Dashboard > School today |  |
| School Today | Expense overview: today, this month, pending expenses | Core | Dashboard > School today |  |
| School Today | Income vs expense summary | Core | Dashboard > School today |  |
| School Today | Budget used and expense as % of budget | Optional (schools that set budgets) | Dashboard > School today |  |
| School Today | Exam average | Core | Dashboard > School today |  |
| School Today | Pending admissions count | Core | Dashboard > School today |  |
| School Today | Discipline cases count | Optional (schools tracking behaviour) | Dashboard > School today |  |
| School Today | Transport tiles: vehicles, routes and drivers count, with a Manage Transport shortcut | Optional (schools running buses) | Dashboard > School today |  |
| School Today | Live fleet status and transport alerts | Optional (schools running buses) | Dashboard > School today |  |
| School Today | Academic panel: syllabus completion, marks, weak classes | Core | Dashboard > School today |  |
| School Today | Teacher panel: teacher attendance, workload, leave | Core | Dashboard > School today |  |
| School Today | Operations panel: transport, library, inventory, assets, visitors, facilities | Optional (schools running these services) | Dashboard > School today |  |
| School Today | Filter by date range, academic year, class and campus | Core | Dashboard > Dashboard controls |  |
| School Today | Drill down from any number to the records behind it | Core | Dashboard > Dashboard controls |  |
| School Today | Quick-action shortcuts for common jobs | Core | Dashboard > Dashboard controls |  |
| School Today | Last-refreshed time on live tiles, with adjustable auto-refresh | Core | Dashboard > Dashboard controls |  |
| School Today | Principal summaries of the school's day or week | Optional (schools using AI) | Global (all modules) > AI assistant |  |
| Needs Attention | Alerts panel for critical issues and operational exceptions (duplicates merged) | Core | Dashboard > Needs attention |  |
| Needs Attention | "What needs my attention" list, e.g. students absent 3+ days, overdue fees, staff leave requests, transport issues | Core | Dashboard > Needs attention |  |
| Needs Attention | First-login setup checklist | Core | Settings > Getting started |  |
| Needs Attention | School-level risk signals | Core | Items that don't fit the 20 modules > Alert & risk engine |  |
| My Tasks | Create, assign and update tasks for staff | Core | Dashboard > My Work (tasks) |  |
| My Tasks | Task status tracking | Core | Dashboard > My Work (tasks) |  |
| My Tasks | Task due dates and "task due" reminders | Core | Dashboard > My Work (tasks) |  |
| My Tasks | My Tasks list for each staff member | Core | Dashboard > My Work (tasks) |  |
| My Tasks | Task reports | Core | Dashboard > My Work (tasks) |  |
| My Tasks | Task access levels: full task manager vs own tasks only | Core | Dashboard > My Work (tasks) | who gets full access is set in Settings, Users & Permissions |
| Today & Upcoming | Today's agenda: substitutions needed, PTMs, exams and events today | Core | Dashboard > Today and upcoming |  |
| Today & Upcoming | Upcoming exams and events | Core | Dashboard > Today and upcoming |  |
| Today & Upcoming | Upcoming birthdays of students and staff | Core | Dashboard > Today and upcoming |  |

### Admission Management

| Page | Feature | Need | Was listed under | Note |
|---|---|---|---|---|
| Admission Dashboard | Enquiry-to-admission funnel with stage counts and dates | Core | Admission Management > Admission dashboard |  |
| Admission Dashboard | Lead pipeline board from enquiry to admission (leads, applications, documents, tests, interviews, approvals, conversion) | Core | Admission Management > Admission dashboard |  |
| Admission Dashboard | Central admissions for the group | Optional (school groups) | Global (all modules) > Multi-school | group view |
| Enquiries | Add a lead / enquiry: child, parent, contact details | Core | Admission Management > Enquiries & leads (CRM) |  |
| Enquiries | Lead sources: walk-in, phone, website, WhatsApp, campaign, referral, plus school-defined sources | Core | Admission Management > Enquiries & leads (CRM) |  |
| Enquiries | Duplicate phone / email warning when adding a lead | Core | Admission Management > Enquiries & leads (CRM) |  |
| Enquiries | All-leads list | Core | Admission Management > Enquiries & leads (CRM) |  |
| Enquiries | Lead status, from a list of statuses the school manages | Core | Admission Management > Enquiries & leads (CRM) |  |
| Enquiries | Assign a lead to a counsellor or staff owner | Core | Admission Management > Enquiries & leads (CRM) |  |
| Enquiries | Reassign a lead, keeping reassignment history | Core | Admission Management > Enquiries & leads (CRM) |  |
| Enquiries | Next follow-up (date, time, owner, next action); overdue follow-ups highlighted | Core | Admission Management > Enquiries & leads (CRM) |  |
| Enquiries | Follow-up reminders to the lead owner | Core | Admission Management > Enquiries & leads (CRM) |  |
| Enquiries | Notes on a lead | Core | Admission Management > Enquiries & leads (CRM) |  |
| Enquiries | Call history on a lead | Core | Admission Management > Enquiries & leads (CRM) |  |
| Enquiries | Activity log: add activity, recent activity, full history kept | Core | Admission Management > Enquiries & leads (CRM) |  |
| Enquiries | Communication history with the lead | Core | Admission Management > Enquiries & leads (CRM) |  |
| Enquiries | Unified lead panel: name, phone, status, owner, campaign, follow-up, recent conversation and activity | Core | Admission Management > Enquiries & leads (CRM) |  |
| Enquiries | Close a lead with a reason for loss | Core | Admission Management > Enquiries & leads (CRM) |  |
| Enquiries | WhatsApp leads list (enquiries arriving on WhatsApp) | Optional (schools connecting WhatsApp Business) | Admission Management > Enquiries & leads (CRM) |  |
| Enquiries | WhatsApp chat with a lead: message history, composer, send | Optional (schools connecting WhatsApp Business) | Admission Management > Enquiries & leads (CRM) |  |
| Enquiries | AI auto-reply to leads, with pause / resume | Optional (schools using AI replies) | Admission Management > Enquiries & leads (CRM) | switched on in Admission Settings |
| Enquiries | Run campaigns to leads | Optional (schools running admission campaigns) | Admission Management > Enquiries & leads (CRM) |  |
| Enquiries | Campaign shown on each lead | Optional (schools running admission campaigns) | Admission Management > Enquiries & leads (CRM) |  |
| Applications | Application form filled at the school counter | Core | Admission Management > Applications |  |
| Applications | Online application and registration | Optional (schools taking applications online) | Admission Management > Applications |  |
| Applications | Unique application number | Core | Admission Management > Applications |  |
| Applications | Application details: student, parents, class applied for, preferences | Core | Admission Management > Applications |  |
| Applications | Previous school and previous marks on the application | Core | Admission Management > Applications |  |
| Applications | Application fee, with receipt only after confirmed payment | Optional (schools charging an application fee) | Admission Management > Applications |  |
| Applications | Application review | Core | Admission Management > Applications |  |
| Documents & Verification | Upload admission documents | Core | Admission Management > Documents & verification |  |
| Documents & Verification | Required-document checklist per class, with a status for each document | Core | Admission Management > Documents & verification | list per class is kept in Admission Settings |
| Documents & Verification | Document types: birth certificate, transfer certificate, previous marksheets, Aadhaar-related fields, address proof, parent ID, photos, other certificates | Core | Admission Management > Documents & verification |  |
| Documents & Verification | Document verification step | Core | Admission Management > Documents & verification |  |
| Test & Interview | Schedule an entrance test or assessment; record score and remarks | Optional (schools with entrance tests) | Admission Management > Tests & interviews |  |
| Test & Interview | Schedule an interview (slot, interviewer); record notes and outcome, keeping decision history | Optional (schools that interview) | Admission Management > Tests & interviews |  |
| Admission Decision | Approve or reject an application with remarks | Core | Admission Management > Decision |  |
| Admission Decision | Waiting list with priority ranking; manual rank changes audited | Optional (oversubscribed schools) | Admission Management > Decision |  |
| Admission Decision | Offer letter | Optional (schools issuing offer letters) | Admission Management > Decision |  |
| Admission Decision | Admission confirmation | Core | Admission Management > Decision |  |
| Admission Decision | Convert an approved applicant into a student without re-typing (once per application) | Core | Admission Management > Conversion to student | automatic, see 'Admission approved' |
| Admission Decision | Automatic student ID / admission number on conversion | Core | Admission Management > Conversion to student | automatic |
| Admission Decision | Class, section and roll number allocated on conversion | Core | Admission Management > Conversion to student | automatic |
| Admission Decision | Fee plan set up on conversion | Core | Admission Management > Conversion to student | automatic |
| Admission Decision | Parent record created and linked on conversion | Core | Admission Management > Conversion to student | automatic |
| Admission Decision | Student login created on conversion | Optional (schools giving students logins) | Admission Management > Conversion to student |  |
| Admission Decision | Transport assigned on conversion | Optional (schools running buses) | Admission Management > Conversion to student | automatic when Transport is on |
| Admission Decision | ID card issued at the end of admission | Core | Admission Management > Conversion to student |  |
| Admission Reports | Admission and CRM reports: lead pipeline, sources, conversion, pending applications | Core | Admission Management > Admission reports |  |
| Admission Reports | Conversion rate and average processing time | Core | Admission Management > Admission reports |  |
| Admission Settings | Admission stages and approvals set per school (e.g. application, interview, payment, admission) | Core | Admission Management > Decision |  |
| Admission Settings | Sibling priority rule | Optional (schools giving sibling priority) | Admission Management > Decision |  |
| Admission Settings | Quota / category seat rules | Optional (schools with quota or category rules) | Admission Management > Decision |  |

### Student Management

| Page | Feature | Need | Was listed under | Note |
|---|---|---|---|---|
| Student List | Student list with search and class filter | Core | Student Management > Student directory & profile |  |
| Student List | Duplicate check on create and import (name, date of birth, guardian, phone) | Core | Student Management > Student directory & profile |  |
| Student List | Bulk actions on selected students | Core | Student Management > Student directory & profile |  |
| Student List | Student CSV import: download sample, choose class, upload | Core | Student Management > Import & bulk tools |  |
| Student List | Import checks: column mapping, row errors, preview, confirm, summary, history; good rows can import while bad rows are rejected | Core | Student Management > Import & bulk tools |  |
| Student List | Smart Import (AI): reads any spreadsheet, maps columns, validates, suggests fixes | Optional (schools moving messy data from old systems) | Student Management > Import & bulk tools |  |
| Student List | UDISE import | Core (India) | Student Management > Import & bulk tools |  |
| Student List | Bulk field update (phone, address and other fields) | Core | Student Management > Import & bulk tools |  |
| Student List | Bulk profile photos matched by name or ID, with clash handling | Core | Student Management > Import & bulk tools |  |
| Student List | Generate / regenerate student login credentials | Optional (schools giving students logins) | Student Management > Import & bulk tools |  |
| Student Profile | Add / edit student profile: student ID, admission no., roll no., name, photo, date of birth, gender, blood group, address, contact, category | Core | Student Management > Student directory & profile |  |
| Student Profile | Admission number unique within the school; profile changes audited | Core | Student Management > Student directory & profile |  |
| Student Profile | Enrolment details: class, section, admission details | Core | Student Management > Student directory & profile |  |
| Student Profile | Previous school and academic history (class, year, marks), locked once closed | Core | Student Management > Student directory & profile |  |
| Student Profile | National / academic identifiers (types set by the school; restricted access) | Core | Student Management > Student directory & profile | identifier types kept in Student Settings |
| Student Profile | Emergency contacts in priority order | Core | Student Management > Student directory & profile |  |
| Student Profile | Upload or replace student photo | Core | Student Management > Student directory & profile |  |
| Student Profile | Student status and lifecycle: lead, applicant, admitted, active, promoted, transferred, withdrawn, graduated, alumni (plus inactive); effective date, reason, allowed changes; one lifelong record | Core | Student Management > Student directory & profile | status list kept in Student Settings |
| Student Profile | Each year's class history kept; nothing overwritten or deleted | Core | Student Management > Student directory & profile |  |
| Student Profile | Student notes, including private notes visible only to chosen roles | Core | Student Management > Student directory & profile |  |
| Student Profile | Student timeline | Core | Student Management > Student directory & profile |  |
| Student Profile | One screen per student with tabs: overview, academics, attendance, fees, exams, homework, transport, library, activities, documents, communication (each tab follows permissions) | Core | Student Management > Student 360 |  |
| Student Profile | Summary strip: attendance %, academic average, fee status, behaviour, transport route, library books, activities, documents complete | Core | Student Management > Student 360 |  |
| Student Profile | "Today" panel: attendance, homework, fees, timetable | Core | Student Management > Student 360 |  |
| Student Profile | Student and parent documents: upload, preview, download | Core | Student Management > Documents |  |
| Student Profile | Behaviour timeline in Student 360 | Core | Items that don't fit the 20 modules > Behaviour & discipline |  |
| Student Profile | Student insights engine | Optional (schools using AI) | Items that don't fit the 20 modules > AI student insights |  |
| Student Profile | Strengths and weaknesses per student | Optional (schools using AI) | Items that don't fit the 20 modules > AI student insights |  |
| Student Profile | Risk factors per student | Optional (schools using AI) | Items that don't fit the 20 modules > AI student insights |  |
| Student Profile | Subject trends per student | Optional (schools using AI) | Items that don't fit the 20 modules > AI student insights |  |
| Student Profile | Suggested next steps for the teacher | Optional (schools using AI) | Items that don't fit the 20 modules > AI student insights |  |
| Student Profile | APAAR / PEN IDs, consent and status | Core (India) | Items that don't fit the 20 modules > Government compliance | exported from Government Reports |
| Parents & Guardians | Parent / guardian profiles: father, mother, guardian, occupation, contacts, emergency contact | Core | Student Management > Parents & guardians |  |
| Parents & Guardians | Link one or more guardians to a student, with relationship | Core | Student Management > Parents & guardians |  |
| Parents & Guardians | One parent linked to several children (siblings) | Core | Student Management > Parents & guardians |  |
| Parents & Guardians | Custody / access restriction flag on a guardian link | Core | Student Management > Parents & guardians |  |
| Parents & Guardians | Parent 360: children, fees, payments, attendance, messages, PTMs, transport, documents, requests, complaints | Core | Student Management > Parents & guardians |  |
| Behaviour & Counselling | Discipline incidents | Core | Items that don't fit the 20 modules > Behaviour & discipline |  |
| Behaviour & Counselling | Warnings | Core | Items that don't fit the 20 modules > Behaviour & discipline |  |
| Behaviour & Counselling | Referral to counselling | Core | Items that don't fit the 20 modules > Behaviour & discipline |  |
| Behaviour & Counselling | Suspension record | Core | Items that don't fit the 20 modules > Behaviour & discipline |  |
| Behaviour & Counselling | Recognition and rewards | Core | Items that don't fit the 20 modules > Behaviour & discipline |  |
| Behaviour & Counselling | Behaviour points | Optional (schools using points) | Items that don't fit the 20 modules > Behaviour & discipline |  |
| Behaviour & Counselling | Teachers report incidents from mobile | Core | Items that don't fit the 20 modules > Behaviour & discipline |  |
| Behaviour & Counselling | Counselling cases | Optional (schools with a counsellor) | Items that don't fit the 20 modules > Counselling & career guidance |  |
| Behaviour & Counselling | Counselling sessions | Optional (schools with a counsellor) | Items that don't fit the 20 modules > Counselling & career guidance |  |
| Behaviour & Counselling | Confidential counselling notes | Optional (schools with a counsellor) | Items that don't fit the 20 modules > Counselling & career guidance |  |
| Behaviour & Counselling | Counselling follow-ups and action plans | Optional (schools with a counsellor) | Items that don't fit the 20 modules > Counselling & career guidance |  |
| Behaviour & Counselling | Outside referrals | Optional (schools with a counsellor) | Items that don't fit the 20 modules > Counselling & career guidance |  |
| Behaviour & Counselling | Career counselling | Optional (secondary schools) | Items that don't fit the 20 modules > Counselling & career guidance |  |
| Behaviour & Counselling | Entrance-exam guidance | Optional (secondary schools) | Items that don't fit the 20 modules > Counselling & career guidance |  |
| Behaviour & Counselling | College application tracking | Optional (secondary schools) | Items that don't fit the 20 modules > Counselling & career guidance |  |
| Behaviour & Counselling | Scholarship information for higher studies | Optional (secondary schools) | Items that don't fit the 20 modules > Counselling & career guidance |  |
| Behaviour & Counselling | Interest and aptitude records | Optional (secondary schools) | Items that don't fit the 20 modules > Counselling & career guidance |  |
| Behaviour & Counselling | Alumni mentoring for students | Optional (secondary schools) | Items that don't fit the 20 modules > Counselling & career guidance |  |
| Promotion | Promote students to the next class / year in bulk | Core | Student Management > Promotion & year end |  |
| Promotion | Review the promotion batch before it is saved | Core | Student Management > Promotion & year end |  |
| Promotion | Promotion decided from results / eligibility | Core | Student Management > Promotion & year end |  |
| Leaving & Alumni | Transfer or withdrawal: reason, date, destination school, documents | Core | Student Management > Transfer & leaving |  |
| Leaving & Alumni | Fee and document clearance holds before leaving | Core | Student Management > Transfer & leaving |  |
| Leaving & Alumni | Alumni records: graduation year, contact, career, higher education, achievements | Optional (schools tracking alumni) | Student Management > Alumni |  |
| Leaving & Alumni | Alumni donations | Optional (schools tracking alumni) | Items that don't fit the 20 modules > Alumni CRM |  |
| Leaving & Alumni | Alumni mentorship | Optional (schools tracking alumni) | Items that don't fit the 20 modules > Alumni CRM |  |
| Leaving & Alumni | Alumni job board | Optional (schools tracking alumni) | Items that don't fit the 20 modules > Alumni CRM |  |
| Certificates & ID Cards | Bonafide certificate | Core | Student Management > Certificates |  |
| Certificates & ID Cards | Study certificate | Core | Student Management > Certificates |  |
| Certificates & ID Cards | Transfer certificate (TC) with approval and clearance | Core | Student Management > Certificates |  |
| Certificates & ID Cards | Conduct / character certificate signed by an authorised signatory | Core | Student Management > Certificates |  |
| Certificates & ID Cards | Migration-related documents | Optional (students moving between boards or states) | Student Management > Certificates |  |
| Certificates & ID Cards | QR code to verify a certificate (no personal data in the code) | Optional (schools issuing verifiable certificates) | Student Management > Certificates |  |
| Certificates & ID Cards | Card fields: photo, name, class, QR code, barcode | Core | Student Management > ID cards |  |
| Certificates & ID Cards | RFID-enabled cards | Optional (schools using RFID) | Student Management > ID cards |  |
| Certificates & ID Cards | Preview a single card | Core | Student Management > ID cards |  |
| Certificates & ID Cards | Batch print by class, showing total students and maximum batch size | Core | Student Management > ID cards |  |
| Certificates & ID Cards | Academic year and valid-until date on cards | Core | Student Management > ID cards |  |
| Certificates & ID Cards | Reprint a replacement card with reason (old card kept on record) | Core | Student Management > ID cards |  |
| Certificates & ID Cards | Print-ready PDF (page size, cards per page) | Core | Student Management > ID cards |  |
| Certificates & ID Cards | DigiLocker-ready records | Optional (schools issuing digital records) | Items that don't fit the 20 modules > Government compliance |  |
| Student Settings | Promotion policy: criteria, minimums, approvals; versioned per year | Core | Student Management > Promotion & year end |  |
| Student Settings | Required fields and list display settings for user forms | Core | Settings > Users & logins | staff form fields in HR Settings |

### Academic Management

| Page | Feature | Need | Was listed under | Note |
|---|---|---|---|---|
| Classes & Sections | Classes / grades with order and level | Core | Academic Management > Classes & sections |  |
| Classes & Sections | Sections under a class, with capacity | Core | Academic Management > Classes & sections |  |
| Classes & Sections | Class teacher for each section | Core | Academic Management > Classes & sections |  |
| Classes & Sections | Streams (e.g. science, commerce) | Optional (higher-secondary schools) | Academic Management > Classes & sections |  |
| Subjects | Subject list with codes and type: core, optional, elective | Core | Academic Management > Subjects |  |
| Subjects | Map subjects to classes and sections (with effective dates) | Core | Academic Management > Subjects |  |
| Subjects | Elective and language choices per student, with seat limits and prerequisites | Optional (schools offering electives or language choices) | Academic Management > Subjects |  |
| Teacher Allocation | Assign classes and subjects to each teacher (also step 3 of Add Staff) | Core | Academic Management > Teacher allocation |  |
| Teacher Allocation | Primary and secondary subject teachers | Core | Academic Management > Teacher allocation |  |
| Time Table | Weekly class timetable grid | Core | Academic Management > Timetable |  |
| Time Table | Edit a period: start / end time, subject, teacher, room | Core | Academic Management > Timetable |  |
| Time Table | "Show all teachers" when choosing a teacher | Core | Academic Management > Timetable |  |
| Time Table | Mark a period as lunch / break | Core | Academic Management > Timetable |  |
| Time Table | Apply a change to the whole week | Core | Academic Management > Timetable |  |
| Time Table | Teacher timetable view | Core | Academic Management > Timetable |  |
| Time Table | Room and lab timetable / allocation | Optional (schools sharing rooms or labs) | Academic Management > Timetable |  |
| Time Table | Activity timetable | Optional (activity-focused schools) | Academic Management > Timetable |  |
| Time Table | Clash check before save / publish: teacher, room or lab double-booked | Core | Academic Management > Timetable |  |
| Time Table | Free periods view | Core | Academic Management > Timetable |  |
| Time Table | Copy a timetable to another week or year, listing clashes first | Core | Academic Management > Timetable |  |
| Time Table | Publish a timetable version with an effective date (only the published version is shown) | Core | Academic Management > Timetable |  |
| Time Table | Timetable adjusts for events, exams and holidays | Core | Academic Management > Timetable | automatic |
| Time Table | Timetable calendar feed (read-only) | Optional (schools syncing calendars) | Academic Management > Timetable |  |
| Time Table | Lab bookings | Optional (schools with science labs) | Items that don't fit the 20 modules > Lab management | rooms and labs |
| Substitutions | Assign a substitute for an absent teacher (no double booking) | Core | Academic Management > Substitutions |  |
| Substitutions | Approved teacher leave raises substitution needs for the affected periods | Core | Academic Management > Substitutions | automatic, see 'Teacher leave approved' |
| Substitutions | Substitute timetable | Core | Academic Management > Substitutions |  |
| Substitutions | Temporary teacher for a longer absence | Core | Academic Management > Substitutions |  |
| Syllabus & Lesson Plans | Curriculum setup per board / class | Core | Academic Management > Syllabus & lesson plans |  |
| Syllabus & Lesson Plans | Syllabus tree: units, chapters, lessons, topics | Core | Academic Management > Syllabus & lesson plans |  |
| Syllabus & Lesson Plans | Learning objectives, outcomes, competencies and skills (coded) | Optional (competency-based curricula) | Academic Management > Syllabus & lesson plans |  |
| Syllabus & Lesson Plans | Annual, term, monthly and weekly teaching plans | Optional (schools doing formal planning) | Academic Management > Syllabus & lesson plans |  |
| Syllabus & Lesson Plans | Lesson plans by topic and date (objectives, resources) | Core | Academic Management > Syllabus & lesson plans |  |
| Syllabus & Lesson Plans | Syllabus progress per subject: planned, taught, completed, pending | Core | Academic Management > Syllabus & lesson plans |  |
| Syllabus & Lesson Plans | Central curriculum for the group | Optional (school groups) | Global (all modules) > Multi-school | group view |
| Academic Settings | Open and close academic years (start / end; one active year per campus) | Core | Academic Management > Academic year & terms |  |
| Academic Settings | Closed years become read-only except for authorised corrections | Core | Academic Management > Academic year & terms |  |
| Academic Settings | Start a new academic year without overwriting the old one | Core | Academic Management > Academic year & terms |  |
| Academic Settings | Terms / semesters inside a year | Core | Academic Management > Academic year & terms |  |
| Academic Settings | Teacher workload limits | Core | Academic Management > Teacher allocation |  |
| Academic Settings | School timings and working days | Core | Academic Management > Timetable |  |
| Academic Settings | Period master: periods, breaks, lunch, start / end times per day | Core | Academic Management > Timetable |  |
| Academic Settings | Limit on consecutive periods for a teacher | Core | Academic Management > Timetable |  |

### Attendance Management

| Page | Feature | Need | Was listed under | Note |
|---|---|---|---|---|
| Take Attendance | Mark daily attendance for a class / section and date | Core | Attendance Management > Take attendance |  |
| Take Attendance | Period-wise / subject-wise attendance | Optional (schools taking attendance every period) | Attendance Management > Take attendance |  |
| Take Attendance | Statuses: present, absent, late, half-day, excused, leave, medical, plus school-defined ones | Core | Attendance Management > Take attendance |  |
| Take Attendance | Note on an attendance entry | Core | Attendance Management > Take attendance |  |
| Take Attendance | Quick mobile attendance: mark all, change the exceptions, done in two taps | Core | Attendance Management > Take attendance |  |
| Attendance Register | View and update attendance | Core | Attendance Management > Take attendance |  |
| Attendance Register | Export attendance | Core | Attendance Management > Take attendance |  |
| Attendance Register | Monthly attendance calendar per student / class with a standard colour legend | Core | Attendance Management > Calendar & corrections |  |
| Attendance Register | Request and approve attendance corrections; the original stays in the audit log | Core | Attendance Management > Calendar & corrections |  |
| Student Leave | Record a student leave request (dates, reason, document; no overlaps) | Core | Attendance Management > Student leave |  |
| Student Leave | Approve / reject student leave with a reason | Core | Attendance Management > Student leave |  |
| Student Leave | Student leave types: medical, emergency, holiday | Core | Attendance Management > Student leave |  |
| Staff Attendance | Mark, view, update and export staff attendance | Core | Attendance Management > Staff attendance |  |
| Staff Attendance | Staff late-coming tracking | Core | Attendance Management > Staff attendance |  |
| Staff Attendance | Staff shifts | Optional (schools with staff shifts) | Attendance Management > Staff attendance |  |
| Staff Attendance | Overtime recording | Optional (schools paying overtime) | Attendance Management > Staff attendance |  |
| Attendance Reports | Attendance reports by student, class, section, staff member and date; daily and monthly | Core | Attendance Management > Attendance reports |  |
| Attendance Reports | Attendance % and trends, including chronic absence (non-working days left out) | Core | Attendance Management > Attendance reports |  |
| Devices & QR | Register biometric devices (type, IP / API, campus; unique device ID) | Optional (schools using attendance devices) | Attendance Management > Devices & check-in methods |  |
| Devices & QR | Device types: face recognition, RFID card, fingerprint, iris | Optional (schools using attendance devices) | Attendance Management > Devices & check-in methods |  |
| Devices & QR | Device connection settings, user mapping, sync and health check | Optional (schools using attendance devices) | Attendance Management > Devices & check-in methods |  |
| Devices & QR | Device punches validated before they count | Optional (schools using attendance devices) | Attendance Management > Devices & check-in methods |  |
| Devices & QR | QR attendance on / off, with expiry, scope and an optional changing QR | Optional (schools using QR check-in) | Attendance Management > Devices & check-in methods |  |
| Devices & QR | QR scan checks school, session and location, and blocks duplicate or invalid scans | Optional (schools using QR check-in) | Attendance Management > Devices & check-in methods |  |
| Devices & QR | QR attendance poster: school branding, QR code, instructions, entrance poster; no personal data | Optional (schools using QR check-in) | Attendance Management > Devices & check-in methods |  |
| Devices & QR | Poster themes (Ocean Blue, Royal Purple, Forest Green), live preview, print PDF | Optional (schools using QR check-in) | Attendance Management > Devices & check-in methods |  |
| Devices & QR | Geo-fencing: allowed zone by latitude, longitude and radius | Optional (schools using mobile check-in) | Attendance Management > Devices & check-in methods |  |
| Attendance Settings | Lock after a cut-off time; later changes need permission and are audited | Core | Attendance Management > Take attendance |  |
| Attendance Settings | Late rules: minutes after which someone is late, same for device and manual | Core | Attendance Management > Attendance settings |  |
| Attendance Settings | Attendance rules per school | Core | Attendance Management > Attendance settings |  |
| Attendance Settings | Display settings and register options | Core | Attendance Management > Attendance settings |  |
| Attendance Settings | Absence alert to parents (no duplicate messages) | Core | Attendance Management > Alerts | automatic, see 'Attendance marked' |
| Attendance Settings | Late-arrival alert | Core | Attendance Management > Alerts |  |
| Attendance Settings | Attendance % threshold alert, e.g. below 75% to parent, class teacher and principal | Core | Attendance Management > Alerts | automatic, see 'Attendance marked' |
| Attendance Settings | Chronic absenteeism alert | Core | Attendance Management > Alerts |  |

### Fee Management

| Page | Feature | Need | Was listed under | Note |
|---|---|---|---|---|
| Fee Dashboard | Collected, pending and overdue totals | Core | Fee Management > Fee dashboard |  |
| Fee Dashboard | Monthly collection trend | Core | Fee Management > Fee dashboard |  |
| Fee Dashboard | Collection forecast (AI-assisted prediction) | Optional (schools wanting forecasts) | Fee Management > Fee dashboard |  |
| Fee Dashboard | Payment-method breakdown | Core | Fee Management > Fee dashboard |  |
| Fee Dashboard | Recent payments: date, student, amount, mode, receipt / reference, status | Core | Fee Management > Fee dashboard |  |
| Fee Dashboard | Payment approval step in Recent Payments | Optional (schools that verify payments before posting) | Fee Management > Fee dashboard | on or off in Fee Settings |
| Collect Fee | Find a student by name, username / admission no. or phone; filter by class; reset; export the list | Core | Fee Management > Collect fee |  |
| Collect Fee | See assigned fees and outstanding before collecting | Core | Fee Management > Collect fee |  |
| Collect Fee | Pick the fee head or installment being paid | Core | Fee Management > Collect fee |  |
| Collect Fee | Full or partial payment (never more than outstanding; original dues kept) | Core | Fee Management > Collect fee |  |
| Collect Fee | Payment modes: cash, UPI, card, net banking, bank transfer, cheque, gateway | Core | Fee Management > Collect fee |  |
| Collect Fee | Payment reference and time recorded | Core | Fee Management > Collect fee |  |
| Collect Fee | Penalty added and total payable shown | Core | Fee Management > Collect fee |  |
| Collect Fee | Discount or penalty at the counter, only if authorised | Core | Fee Management > Collect fee |  |
| Collect Fee | One-step collection: search, see the due, enter amount, choose mode, done | Core | Fee Management > Collect fee |  |
| Collect Fee | Receipt, parent message and ledger update happen automatically after payment | Core | Fee Management > Collect fee | automatic, see 'Fee paid' |
| Collect Fee | Advance payment above dues only when the school allows it | Optional (schools accepting advance fees) | Fee Management > Collect fee | allowed or not in Fee Settings |
| Collect Fee | Online fee payment through a payment gateway | Core | Fee Management > Online payments | gateway connected in Settings, Payment Gateways |
| Collect Fee | UPI and QR-code payments | Core | Fee Management > Online payments |  |
| Student Fee Ledger | Fee ledger per student: invoices, dues, paid, balance, payment history, partial payments | Core | Fee Management > Student fee ledger |  |
| Student Fee Ledger | Opening balance (dues carried in) | Core | Fee Management > Student fee ledger |  |
| Student Fee Ledger | Payments never edited silently; corrections only by reversal or adjustment with a reason | Core | Fee Management > Student fee ledger |  |
| Student Fee Ledger | Daycare charge tracking per child | Optional (schools with daycare) | Fee Management > Daycare billing |  |
| Student Fee Ledger | Receipt only after confirmed payment, with a unique receipt number (online receipts too) | Core | Fee Management > Receipts & invoices |  |
| Student Fee Ledger | Fee invoice | Core | Fee Management > Receipts & invoices |  |
| Student Fee Ledger | Fee certificate (fees paid) | Core | Fee Management > Receipts & invoices |  |
| Defaulters | Defaulters list: students with pending fees and overdue installments | Core | Fee Management > Dues & defaulters |  |
| Defaulters | Outstanding report by class and student, with ageing buckets | Core | Fee Management > Dues & defaulters |  |
| Defaulters | Reminder history per defaulter | Core | Fee Management > Dues & defaulters |  |
| Defaulters | Send a reminder to everyone on a dues list in one go | Core | Fee Management > Dues & defaulters |  |
| Defaulters | Payment links sent by message | Core | Fee Management > Online payments |  |
| Fee Structure | Fee heads / types: tuition, annual, admission, activity, transport, exam, class, monthly, hostel, lab, sports, library, miscellaneous, plus custom; taxable flag | Core | Fee Management > Fee structures |  |
| Fee Structure | Class-wise fee structure per academic year (heads and amounts), versioned | Core | Fee Management > Fee structures |  |
| Fee Structure | Edit, view and delete fees in a structure; count of fees set | Core | Fee Management > Fee structures |  |
| Fee Structure | Payment frequency: monthly, quarterly, half-yearly, term, annual | Core | Fee Management > Fee structures |  |
| Fee Structure | Installments with due dates that add up to the structure total | Core | Fee Management > Fee structures |  |
| Fee Structure | Assign a fee plan to a class or an individual student; exceptions need a reason | Core | Fee Management > Fee structures |  |
| Fee Structure | Category-wise fees | Optional (schools charging by student category) | Fee Management > Fee structures |  |
| Fee Structure | Daycare billing cycles: daily, weekly, bi-weekly | Optional (schools with daycare) | Fee Management > Daycare billing |  |
| Fee Structure | Daycare enrolment charges | Optional (schools with daycare) | Fee Management > Daycare billing |  |
| Concessions & Refunds | Concession / discount per student with reason and approver; approval needed above a set limit | Core | Fee Management > Concessions & refunds |  |
| Concessions & Refunds | Bulk fee discount | Core | Fee Management > Concessions & refunds |  |
| Concessions & Refunds | Scholarship applied as a fee reduction | Optional (schools with scholarships) | Fee Management > Concessions & refunds |  |
| Concessions & Refunds | Full or partial refund (never more than paid) with reason and mode | Core | Fee Management > Concessions & refunds |  |
| Concessions & Refunds | Scholarship applications | Optional (scholarship-heavy schools) | Items that don't fit the 20 modules > Scholarships |  |
| Concessions & Refunds | Supporting documents | Optional (scholarship-heavy schools) | Items that don't fit the 20 modules > Scholarships |  |
| Concessions & Refunds | Scholarship approval | Optional (scholarship-heavy schools) | Items that don't fit the 20 modules > Scholarships | goes to Approvals |
| Concessions & Refunds | Scholarship amount | Optional (scholarship-heavy schools) | Items that don't fit the 20 modules > Scholarships |  |
| Concessions & Refunds | Scholarship renewal | Optional (scholarship-heavy schools) | Items that don't fit the 20 modules > Scholarships |  |
| Fee Reports | Fee reports with filters, analytics and export | Core | Fee Management > Fee reports |  |
| Fee Reports | Collection, outstanding, defaulter, discount, penalty and payment-mode reports | Core | Fee Management > Fee reports |  |
| Fee Reports | Audit and tax reports | Core | Fee Management > Fee reports |  |
| Fee Settings | Fee rules: late fee by days late, with a grace period | Core | Fee Management > Fines |  |
| Fee Settings | Automatic fee reminders on a schedule (channel, template; respects opt-outs), e.g. "fee due tomorrow" | Core | Fee Management > Dues & defaulters | automatic, see 'Fee due date comes' |
| Fee Settings | Receipt settings | Core | Fee Management > Receipts & invoices |  |
| Fee Settings | Scholarship types | Optional (scholarship-heavy schools) | Items that don't fit the 20 modules > Scholarships |  |
| Fee Settings | Eligibility rules | Optional (scholarship-heavy schools) | Items that don't fit the 20 modules > Scholarships |  |

### Finance Management

| Page | Feature | Need | Was listed under | Note |
|---|---|---|---|---|
| Day Book | Day Book: all money in and out for a date, with date filter (posted entries only by default) | Core | Finance Management > Day Book |  |
| Day Book | Class filter with Apply / Reset | Core | Finance Management > Day Book |  |
| Day Book | Totals: income, expense, net balance | Core | Finance Management > Day Book |  |
| Day Book | Income grouped as online fees, full payments, partial payments, daycare, other fee types | Core | Finance Management > Day Book |  |
| Day Book | Entry details: student, class, fee type, amount, penalty, total, mode, reference, time, category, notes | Core | Finance Management > Day Book |  |
| Day Book | Export Day Book to CSV, Excel, PDF | Core | Finance Management > Day Book |  |
| Income | Record other school income (date, account, amount, source; posting status) | Core | Finance Management > Income |  |
| Expenses | Record an expense: date, vendor, account, amount, bill attachment | Core | Finance Management > Expenses |  |
| Expenses | Expense approval above set limits | Core | Finance Management > Expenses |  |
| Expenses | Pending expenses list | Core | Finance Management > Expenses |  |
| Expenses | Expense reports | Core | Finance Management > Expenses |  |
| Expenses | Vendor bills / purchase invoices, with duplicate warning | Optional (schools paying vendors through the system) | Finance Management > Accounts |  |
| Cash & Bank | Cashbook: opening, receipts, payments, closing | Core | Finance Management > Accounts |  |
| Cash & Bank | Bankbook per bank account | Core | Finance Management > Accounts |  |
| Budget | Budgets by account, department and period | Optional (schools that set budgets) | Finance Management > Budget |  |
| Budget | Budget vs actual, with variance alerts | Optional (schools that set budgets) | Finance Management > Budget |  |
| Accounts | Journal entries | Optional (schools keeping full accounts) | Finance Management > Accounts |  |
| Accounts | General ledger | Optional (schools keeping full accounts) | Finance Management > Accounts |  |
| Accounts | Payables and receivables | Optional (schools keeping full accounts) | Finance Management > Accounts |  |
| Accounts | Multi-campus accounting | Optional (multi-campus schools) | Finance Management > Accounts |  |
| Accounts | Central finance for the group | Optional (school groups) | Global (all modules) > Multi-school | group view |
| Finance Reports | Income and expense reports by category and period | Core | Finance Management > Finance reports |  |
| Finance Reports | Profit and loss | Core | Finance Management > Finance reports |  |
| Finance Reports | Expense analysis and department-wise expenses | Core | Finance Management > Finance reports |  |
| Finance Settings | Expense categories | Core | Finance Management > Expenses |  |
| Finance Settings | Cost centres | Optional (larger schools and groups) | Finance Management > Budget |  |
| Finance Settings | Chart of accounts (income and expense heads with codes) | Core | Finance Management > Accounts |  |
| Finance Settings | Accounting software (e.g. Tally) | Optional (schools using outside accounting software) | Settings > Integrations | Tally export |

### Examination & Results

| Page | Feature | Need | Was listed under | Note |
|---|---|---|---|---|
| Datesheet | Create an exam / term with name, academic year and dates | Core | Examination & Results > Exam setup | creating a datesheet creates the exam |
| Datesheet | Datesheet: title, start / end date, exam type, pattern | Core | Examination & Results > Datesheet |  |
| Datesheet | Per-subject schedule: date, start time, end time or duration, room, max marks | Core | Examination & Results > Datesheet |  |
| Datesheet | Bulk-apply start time, duration and max marks to all subjects | Core | Examination & Results > Datesheet |  |
| Datesheet | No overlapping exams for a class | Core | Examination & Results > Datesheet |  |
| Datesheet | Publish the datesheet to the exam calendar | Core | Examination & Results > Datesheet | automatic, see 'Datesheet published' |
| Datesheet | Assign exam rooms and invigilators without clashes | Core | Examination & Results > Rooms & invigilation |  |
| Datesheet | Seating arrangement | Optional (larger schools) | Examination & Results > Rooms & invigilation |  |
| Admit Cards | Generate, preview and download admit cards (photo, subjects; published schedule only) | Core | Examination & Results > Admit cards |  |
| Marks Entry | Enter marks by subject and student, with absent flag; marks between 0 and max | Core | Examination & Results > Marks entry |  |
| Marks Entry | Grade entry for grade-only subjects | Core | Examination & Results > Marks entry |  |
| Marks Entry | Fast marks grid on mobile | Core | Examination & Results > Marks entry |  |
| Marks Entry | Moderation: controlled mark change with reason, approval and change history | Core | Examination & Results > Marks entry |  |
| Results | Automatic total, average, percentage and grade using set weights | Core | Examination & Results > Results |  |
| Results | Rank with a tie rule | Optional (schools that rank students) | Examination & Results > Results |  |
| Results | Final result combining all exams | Core | Examination & Results > Results |  |
| Results | View and print results | Core | Examination & Results > Results |  |
| Results | Result history kept | Core | Examination & Results > Results |  |
| Results | Publish results on a date (drafts cannot be published) | Core | Examination & Results > Results |  |
| Results | Exam reminders and result-published messages to parents | Core | Examination & Results > Results | automatic, see 'Marks entered' |
| Report Cards | Report card from a configurable template (format per board / school), as PDF | Core | Examination & Results > Report cards |  |
| Report Cards | Report card content: grades, attendance, skills, activities, competencies | Core | Examination & Results > Report cards |  |
| Report Cards | Principal and teacher remarks | Core | Examination & Results > Report cards |  |
| Question Papers | Question bank tagged by class, subject, chapter, difficulty, marks | Optional (schools setting their own papers) | Items that don't fit the 20 modules > Question-paper bank |  |
| Question Papers | Question types: MCQ, short, long, true / false, fill in the blanks, match | Optional (schools setting their own papers) | Items that don't fit the 20 modules > Question-paper bank |  |
| Question Papers | Generate papers automatically, manually or from a blueprint | Optional (schools setting their own papers) | Items that don't fit the 20 modules > Question-paper bank |  |
| Question Papers | Teachers build papers from the bank | Optional (schools setting their own papers) | Items that don't fit the 20 modules > Question-paper bank |  |
| Question Papers | AI question and paper generation, answer key, difficulty check, duplicate check | Optional (schools using AI) | Items that don't fit the 20 modules > Question-paper bank |  |
| Exam Analysis | Results overview: performance, analytics, progress tracking | Core | Examination & Results > Exam analysis |  |
| Exam Analysis | Subject-wise and class-wise performance analysis | Core | Examination & Results > Exam analysis |  |
| Exam Settings | Exam types, e.g. unit / periodic tests, FA 1-2, SA 1-2, mid-term / half-yearly, pre-final, annual / final, practical, internal assessment, plus custom | Core | Examination & Results > Exam setup |  |
| Exam Settings | Exam pattern per exam | Core | Examination & Results > Exam setup |  |
| Exam Settings | Mark categories / components: theory, internal, practical, assignment, attendance, project | Core | Examination & Results > Exam setup |  |
| Exam Settings | Exam settings and exam rules per school | Core | Examination & Results > Exam setup |  |
| Exam Settings | Co-scholastic areas and their grading | Optional (CBSE-style report cards) | Examination & Results > Exam setup |  |
| Exam Settings | Competency-based assessment | Optional (competency-based boards) | Examination & Results > Exam setup |  |
| Exam Settings | Grade scale: ranges, grade and remark (e.g. A+ 91-100%), no overlaps or gaps | Core | Examination & Results > Grading rules |  |
| Exam Settings | Pass marks / pass rules | Core | Examination & Results > Grading rules |  |
| Exam Settings | GPA | Optional (GPA-based boards and international schools) | Examination & Results > Grading rules |  |
| Exam Settings | Changing a grade scale never changes results already published | Core | Examination & Results > Grading rules |  |

### Staff & HR Management

| Page | Feature | Need | Was listed under | Note |
|---|---|---|---|---|
| Staff List | Staff list with search | Core | Staff & HR Management > Staff directory & profile |  |
| Staff List | Bulk staff import from a spreadsheet, with validation | Core | Staff & HR Management > Add staff |  |
| Staff List | Central HR for the group | Optional (school groups) | Global (all modules) > Multi-school | group view |
| Staff Profile | Staff profile: name, contact, address, qualifications, experience, photo (staff ID unique) | Core | Staff & HR Management > Staff directory & profile |  |
| Staff Profile | Employment details: department, designation, joining date, employment type, reporting manager | Core | Staff & HR Management > Staff directory & profile |  |
| Staff Profile | Staff emergency contacts | Core | Staff & HR Management > Staff directory & profile |  |
| Staff Profile | Staff status: active, on leave, suspended, resigned, retired, terminated | Core | Staff & HR Management > Staff directory & profile |  |
| Staff Profile | Teacher 360: classes, subjects, timetable, attendance, leave, workload, performance, documents | Core | Staff & HR Management > Staff directory & profile |  |
| Add Staff | Add staff in three steps: details, permissions, classes and subjects | Core | Staff & HR Management > Add staff |  |
| Add Staff | Step 1 details: name, email, phone, gender, date of birth, address, designation, joining date, photo | Core | Staff & HR Management > Add staff |  |
| Add Staff | Mark staff as verified | Core | Staff & HR Management > Add staff |  |
| Add Staff | Step 2: choose module permissions for the new staff member | Core | Staff & HR Management > Add staff |  |
| Add Staff | Give staff one or more roles, with the classes / campuses they cover | Core | Staff & HR Management > Add staff |  |
| Add Staff | Create the staff login (unique username, invite or temporary password, reset) | Core | Staff & HR Management > Add staff |  |
| Staff Leave | Apply for leave (dates, type, reason; no overlaps) | Core | Staff & HR Management > Staff leave |  |
| Staff Leave | Approve / reject leave with a reason | Core | Staff & HR Management > Staff leave |  |
| Staff Leave | Leave balance, updated on approval or cancellation | Core | Staff & HR Management > Staff leave |  |
| Staff Leave | Cancel or withdraw leave | Core | Staff & HR Management > Staff leave |  |
| Staff Leave | Leave calendar by team or department | Core | Staff & HR Management > Staff leave |  |
| Documents & ID Cards | Staff documents: certificates, ID proof, contracts, with expiry dates and expiry alerts | Core | Staff & HR Management > Staff documents |  |
| Documents & ID Cards | Experience letter | Core | Staff & HR Management > Staff documents |  |
| Documents & ID Cards | Staff ID cards from the shared ID-card designer | Core | Staff & HR Management > Staff ID cards |  |
| Recruitment & Appraisal | Recruitment: vacancies, applications, interviews, offers | Optional (schools hiring through the system) | Staff & HR Management > HR lifecycle |  |
| Recruitment & Appraisal | Staff appraisal / performance review cycle | Optional (schools running appraisals) | Staff & HR Management > HR lifecycle |  |
| Recruitment & Appraisal | Staff training records | Optional (schools tracking training) | Staff & HR Management > HR lifecycle |  |
| Recruitment & Appraisal | Staff promotions | Optional (schools tracking promotions) | Staff & HR Management > HR lifecycle |  |
| Staff Exit | Staff exit: resignation, handover, clearance, final settlement | Core | Staff & HR Management > HR lifecycle |  |
| HR Settings | Departments | Core | Staff & HR Management > Staff directory & profile |  |
| HR Settings | Designations | Core | Staff & HR Management > Staff directory & profile |  |
| HR Settings | Leave types and rules: casual, sick, earned, maternity, special; yearly quota, carry-forward, half-day | Core | Staff & HR Management > Staff leave |  |

### Salary Management

| Page | Feature | Need | Was listed under | Note |
|---|---|---|---|---|
| Generate Salary | Open a payroll period for a month (one per month) | Core | Salary Management > Run payroll |  |
| Generate Salary | Attendance, leave and overtime inputs to payroll | Core | Salary Management > Run payroll | automatic |
| Generate Salary | Gross pay, deductions and net pay calculated from rules | Core | Salary Management > Run payroll |  |
| Generate Salary | Generate and review monthly salary | Core | Salary Management > Run payroll |  |
| Generate Salary | Payroll adjustments (bonus, arrears, deductions) with a reason | Core | Salary Management > Run payroll |  |
| Generate Salary | Approve and lock payroll; corrections only by reversal or adjustment | Core | Salary Management > Run payroll |  |
| Salary Structures | Salary structure per staff: earnings and deductions with a version history | Core | Salary Management > Salary structures |  |
| Salary Slips | Payslips generated from approved payroll | Core | Salary Management > Payslips |  |
| Salary Slips | My Salary Slips: staff view and download their own payslips | Core | Salary Management > Payslips |  |
| Advances & Loans | Salary advances and loans recovered from pay | Optional (schools giving staff advances) | Salary Management > Salary structures |  |
| Salary History | Salary history per staff member and per month | Core | Salary Management > Salary history & reports |  |
| Salary History | Salary reports | Core | Salary Management > Salary history & reports |  |
| Salary Settings | Salary settings / payroll preferences | Core | Salary Management > Salary settings |  |

### Communication

| Page | Feature | Need | Was listed under | Note |
|---|---|---|---|---|
| Send Message | Choose recipients: students, parents, staff, groups | Core | Communication > Send message |  |
| Send Message | Target by class, section, route, role or saved group | Core | Communication > Send message |  |
| Send Message | Channels: app notification, SMS, WhatsApp, email | Core | Communication > Send message |  |
| Send Message | Automated voice calls | Optional (schools using voice calls) | Communication > Send message |  |
| Send Message | Message title and body | Core | Communication > Send message |  |
| Send Message | Recipient count and message preview before sending | Core | Communication > Send message |  |
| Send Message | Message cost in credits before sending | Core | Communication > Send message |  |
| Send Message | Personalised messages to each recipient | Core | Communication > Send message |  |
| Send Message | Audience limited to what the sender is allowed to reach | Core | Communication > Send message |  |
| Send Message | Schedule a message for later; cancel before it goes | Core | Communication > Send message |  |
| Send Message | Retry failed messages with a limit | Core | Communication > Send message |  |
| Send Message | Emergency broadcast to everyone, ignoring opt-outs | Core | Communication > Automatic messages |  |
| Send Message | Transport emergency notification | Optional (schools running buses) | Transport Management > Transport alerts | emergency message to a route |
| Send Message | Alumni communication | Optional (schools tracking alumni) | Items that don't fit the 20 modules > Alumni CRM | alumni as a recipient group |
| Notice Board | Create circulars, notices and announcements with attachments | Core | Communication > Notice board |  |
| Notice Board | Target a notice to roles, classes or campuses | Core | Communication > Notice board |  |
| Notice Board | Schedule a notice | Core | Communication > Notice board |  |
| Notice Board | Notice priority, with urgent ones highlighted | Core | Communication > Notice board |  |
| Notice Board | Read acknowledgement and acknowledgement tracking | Core | Communication > Notice board |  |
| Notice Board | Notice expiry date | Core | Communication > Notice board |  |
| Notice Board | Notice archive | Core | Communication > Notice board |  |
| Notice Board | Notice approval before publishing | Core | Communication > Notice board | approval goes to Approvals |
| Notice Board | Publish a notice on several channels at once | Core | Communication > Notice board |  |
| Notice Board | Central announcements for the group | Optional (school groups) | Global (all modules) > Multi-school | group view |
| WhatsApp Inbox | View all WhatsApp conversations (WhatsApp Web) | Optional (schools using WhatsApp) | Communication > WhatsApp inbox |  |
| WhatsApp Inbox | View only conversations assigned to me | Optional (schools using WhatsApp) | Communication > WhatsApp inbox |  |
| Message History | Message history with delivery status: queued, sent, delivered, read, failed | Core | Communication > Message history |  |
| Message History | Communication history for one person across channels | Core | Communication > Message history |  |
| Feedback & Queries | Log a parent / student / staff query or complaint with a ticket number | Core | Communication > Feedback & queries |  |
| Feedback & Queries | Assign a query to a staff member | Core | Communication > Feedback & queries |  |
| Feedback & Queries | Query priority | Core | Communication > Feedback & queries |  |
| Feedback & Queries | Query status and resolution notes (open, in progress, resolved, closed) | Core | Communication > Feedback & queries |  |
| Feedback & Queries | Internal notes on a query, hidden from the requester | Core | Communication > Feedback & queries |  |
| Feedback & Queries | Collect feedback by topic | Core | Communication > Feedback & queries |  |
| Feedback & Queries | Response-time targets (SLA) per query type | Optional (larger schools) | Items that don't fit the 20 modules > Help desk extras |  |
| Feedback & Queries | Automatic escalation of overdue queries | Optional (larger schools) | Items that don't fit the 20 modules > Help desk extras |  |
| Feedback & Queries | Satisfaction rating after closing a query | Optional (larger schools) | Items that don't fit the 20 modules > Help desk extras |  |
| Feedback & Queries | Internal staff tickets: IT, facility, academic, transport, HR | Optional (larger schools) | Items that don't fit the 20 modules > Help desk extras |  |
| Surveys | Survey builder with field types (choice, rating, text, date) | Optional (schools running surveys) | Items that don't fit the 20 modules > Surveys |  |
| Surveys | Survey examples: parent satisfaction, staff feedback, event feedback | Optional (schools running surveys) | Items that don't fit the 20 modules > Surveys |  |
| Surveys | Send surveys and collect answers | Optional (schools running surveys) | Items that don't fit the 20 modules > Surveys |  |
| Message Templates | Reusable message templates by channel and language | Core | Communication > Templates |  |
| Message Templates | Template variables, e.g. student name, class, due amount | Core | Communication > Templates |  |
| Message Templates | Template checks: missing variables block sending | Core | Communication > Templates |  |
| Message Templates | Template versions | Core | Communication > Templates |  |
| Message Settings | Consent and opt-out respected (except emergency messages) | Core | Communication > Send message |  |
| Message Settings | Automatic message rules: WHEN something happens THEN send a message (absence, fee due, exam reminders, results, PTM, homework, transport) | Core | Communication > Automatic messages |  |
| Message Settings | Turn each automatic message on or off; no duplicates | Core | Communication > Automatic messages |  |
| Message Settings | Automation log of what was sent and why | Core | Communication > Automatic messages |  |
| Message Settings | Birthday wishes to students and staff | Core | Communication > Automatic messages | automatic |
| Message Settings | Pending-homework messages to parents | Core | Homework & Learning > Homework | automatic message rule |

### Transport Management

| Page | Feature | Need | Was listed under | Note |
|---|---|---|---|---|
| Live Tracking | Live map of all vehicles | Optional (schools tracking buses by GPS) | Transport Management > Live tracking |  |
| Live Tracking | Trip cards per vehicle | Optional (schools tracking buses by GPS) | Transport Management > Live tracking |  |
| Live Tracking | Vehicle status: parked, moving, stopped, offline | Optional (schools tracking buses by GPS) | Transport Management > Live tracking |  |
| Live Tracking | Speed, vehicle number and driver details on the map | Optional (schools tracking buses by GPS) | Transport Management > Live tracking |  |
| Live Tracking | ETA and next stop | Optional (schools tracking buses by GPS) | Transport Management > Live tracking |  |
| Live Tracking | Location refresh about every 30 seconds | Optional (schools tracking buses by GPS) | Transport Management > Live tracking |  |
| Live Tracking | Last-update time, with stale locations marked | Optional (schools tracking buses by GPS) | Transport Management > Live tracking |  |
| Live Tracking | Bad or out-of-order GPS points rejected | Optional (schools tracking buses by GPS) | Transport Management > Live tracking |  |
| Live Tracking | Route history playback | Optional (schools tracking buses by GPS) | Transport Management > Live tracking |  |
| Live Tracking | Modern / Classic tracking view toggle | Optional (schools tracking buses by GPS) | Transport Management > Live tracking | one simple view replaces the two views |
| Routes & Stops | Routes with ordered stops, arrival times and pickup points | Optional (schools running buses) | Transport Management > Routes & stops |  |
| Routes & Stops | Stop-wise and route-wise transport fees | Optional (schools running buses) | Transport Management > Routes & stops |  |
| Routes & Stops | Transport fee variants (e.g. one-way, two-way) | Optional (schools running buses) | Transport Management > Routes & stops |  |
| Vehicles & Drivers | Add / edit vehicles: number, type, capacity, status | Optional (schools running buses) | Transport Management > Vehicles |  |
| Vehicles & Drivers | Assign a route and driver to a vehicle | Optional (schools running buses) | Transport Management > Vehicles |  |
| Vehicles & Drivers | Fuel and maintenance expenses per vehicle | Optional (schools running buses) | Transport Management > Vehicles | costs in Transport Reports |
| Vehicles & Drivers | Drivers with licence number and licence expiry alerts | Optional (schools running buses) | Transport Management > Drivers & conductors |  |
| Vehicles & Drivers | Conductors / attendants | Optional (schools running buses) | Transport Management > Drivers & conductors |  |
| Vehicles & Drivers | Transport vendors | Optional (schools using hired buses) | Transport Management > Transport admin |  |
| Vehicles & Drivers | Vehicle insurance, fitness and pollution certificates with expiry alerts | Optional (schools running buses) | Items that don't fit the 20 modules > Transport safety documents |  |
| Vehicles & Drivers | Vehicle maintenance schedule | Optional (schools running buses) | Items that don't fit the 20 modules > Transport safety documents |  |
| Student Transport | Assign students to a route and stop | Optional (schools running buses) | Transport Management > Student transport |  |
| Student Transport | Seat capacity rules for vehicles and routes | Optional (schools running buses) | Transport Management > Student transport |  |
| Student Transport | Transport plan linked to the student's fee | Optional (schools running buses) | Transport Management > Student transport | automatic, see 'Student given a bus stop' |
| Student Transport | Check that every transport student has a transport fee | Optional (schools running buses) | Transport Management > Student transport |  |
| Student Transport | Bus pass | Optional (schools running buses) | Transport Management > Transport admin |  |
| Trips | Driver app: start / end trip, mark stops, send location | Optional (schools running buses) | Transport Management > Drivers & conductors |  |
| Trips | Trip schedule: morning / evening trips per route | Optional (schools running buses) | Transport Management > Trips |  |
| Trips | Start and complete trips, with trip history | Optional (schools running buses) | Transport Management > Trips |  |
| Trips | Track stops reached on a trip | Optional (schools running buses) | Transport Management > Trips |  |
| Trips | Student boarding / drop confirmation | Optional (schools running buses) | Transport Management > Trips |  |
| Trips | Emergency (panic) button in the bus / driver app | Optional (schools running buses) | Items that don't fit the 20 modules > Transport safety documents |  |
| Trips | Breakdown reporting | Optional (schools running buses) | Items that don't fit the 20 modules > Transport safety documents |  |
| Transport Reports | Transport reports | Optional (schools running buses) | Transport Management > Transport admin |  |
| Transport Settings | Geofences around school and stops | Optional (schools tracking buses by GPS) | Transport Management > Transport alerts |  |
| Transport Settings | Alerts for over-speed, route deviation and vehicle offline | Optional (schools tracking buses by GPS) | Transport Management > Transport alerts |  |
| Transport Settings | Pickup, drop and "bus arriving" messages to parents | Optional (schools running buses) | Transport Management > Transport alerts | automatic messages |
| Transport Settings | GPS tracking provider | Optional (schools tracking buses by GPS) | Settings > Integrations |  |

### Library Management

| Page | Feature | Need | Was listed under | Note |
|---|---|---|---|---|
| Books | Book catalogue: title, ISBN, category, subject | Optional (schools with a library) | Library Management > Catalogue |  |
| Books | Authors and publishers | Optional (schools with a library) | Library Management > Catalogue |  |
| Books | Book copies with accession numbers | Optional (schools with a library) | Library Management > Catalogue |  |
| Books | Barcode / QR / RFID labels on books | Optional (schools with a library) | Library Management > Catalogue |  |
| Issue & Return | Issue a book (within limits, available copy only) | Optional (schools with a library) | Library Management > Issue & return |  |
| Issue & Return | Return a book | Optional (schools with a library) | Library Management > Issue & return |  |
| Issue & Return | Renew a book (unless reserved) | Optional (schools with a library) | Library Management > Issue & return |  |
| Issue & Return | Reserve a book; first in queue gets it | Optional (schools with a library) | Library Management > Issue & return |  |
| Members & Cards | Library card | Optional (schools with a library) | Library Management > Members |  |
| Fines & Stock Check | Overdue fines | Optional (schools with a library) | Library Management > Fines & stock |  |
| Fines & Stock Check | Lost or damaged books with charge | Optional (schools with a library) | Library Management > Fines & stock |  |
| Fines & Stock Check | Library stock audit | Optional (schools with a library) | Library Management > Fines & stock |  |
| Library Reports | Library reports: issued, overdue, popular, fines | Optional (schools with a library) | Library Management > Fines & stock |  |
| Library Settings | Library members (students and staff) with borrowing limits | Optional (schools with a library) | Library Management > Members | borrowing limits; the member list is on Members & Cards |

### Inventory Management

| Page | Feature | Need | Was listed under | Note |
|---|---|---|---|---|
| Items & Stock | Item master: name, unit, category, reorder level | Optional (schools tracking stock) | Inventory Management > Items & stock |  |
| Items & Stock | Opening stock | Optional (schools tracking stock) | Inventory Management > Items & stock |  |
| Items & Stock | Stock in and stock out | Optional (schools tracking stock) | Inventory Management > Items & stock |  |
| Items & Stock | Transfer stock between locations | Optional (schools tracking stock) | Inventory Management > Items & stock |  |
| Items & Stock | Damaged, lost and expired stock | Optional (schools tracking stock) | Inventory Management > Items & stock |  |
| Items & Stock | Low-stock alerts at reorder level | Optional (schools tracking stock) | Inventory Management > Items & stock |  |
| Items & Stock | Stock audit with variance | Optional (schools tracking stock) | Inventory Management > Items & stock |  |
| Items & Stock | Lab equipment and chemicals stock | Optional (schools with science labs) | Items that don't fit the 20 modules > Lab management |  |
| Issue Stock | Issue stock to a department, class or staff member | Optional (schools tracking stock) | Inventory Management > Items & stock |  |
| Purchases & Vendors | Purchase request with approval | Optional (schools tracking stock) | Inventory Management > Purchases |  |
| Purchases & Vendors | Vendors / suppliers | Optional (schools tracking stock) | Inventory Management > Purchases |  |
| Purchases & Vendors | Purchase order | Optional (schools tracking stock) | Inventory Management > Purchases |  |
| Purchases & Vendors | Goods receipt against a purchase order | Optional (schools tracking stock) | Inventory Management > Purchases |  |
| Purchases & Vendors | Purchase invoice and payment | Optional (schools tracking stock) | Inventory Management > Purchases |  |
| Purchases & Vendors | Central purchasing for the group | Optional (school groups) | Global (all modules) > Multi-school | group view |
| Assets | Asset register (furniture, IT, lab, sports, vehicles, etc.) with asset tag | Optional (schools tracking assets) | Inventory Management > Assets |  |
| Assets | Assign an asset to a room, department or person | Optional (schools tracking assets) | Inventory Management > Assets |  |
| Assets | Transfer an asset | Optional (schools tracking assets) | Inventory Management > Assets |  |
| Assets | Asset maintenance and repair log | Optional (schools tracking assets) | Inventory Management > Assets |  |
| Assets | Warranty and AMC dates with alerts | Optional (schools tracking assets) | Inventory Management > Assets |  |
| Assets | Asset depreciation | Optional (schools tracking assets) | Inventory Management > Assets |  |
| Assets | Dispose of an asset with approval | Optional (schools tracking assets) | Inventory Management > Assets |  |
| Assets | Asset audit (physical check) | Optional (schools tracking assets) | Inventory Management > Assets |  |
| Assets | Link stock items to assets | Optional (schools tracking assets) | Inventory Management > Assets |  |
| Rooms, Labs & Maintenance | Facility register: rooms, labs, halls, grounds | Optional (larger campuses) | Items that don't fit the 20 modules > Facility & room management |  |
| Rooms, Labs & Maintenance | Maintenance requests with technician, priority, completion and cost | Optional (larger campuses) | Items that don't fit the 20 modules > Facility & room management |  |
| Rooms, Labs & Maintenance | Experiments list | Optional (schools with science labs) | Items that don't fit the 20 modules > Lab management |  |
| Rooms, Labs & Maintenance | Lab safety checks | Optional (schools with science labs) | Items that don't fit the 20 modules > Lab management |  |
| Rooms, Labs & Maintenance | Lab equipment maintenance | Optional (schools with science labs) | Items that don't fit the 20 modules > Lab management |  |
| Inventory Reports | Stock and asset reports | Optional (schools tracking stock) | Inventory Management > Inventory reports |  |
| Inventory Settings | Item categories | Optional (schools tracking stock) | Inventory Management > Items & stock |  |
| Inventory Settings | Store locations | Optional (schools tracking stock) | Inventory Management > Items & stock |  |

### Hostel Management

| Page | Feature | Need | Was listed under | Note |
|---|---|---|---|---|
| Rooms & Beds | Hostels (boys / girls), with warden | Optional (boarding schools) | Hostel Management > Rooms & beds |  |
| Rooms & Beds | Floors, rooms and beds | Optional (boarding schools) | Hostel Management > Rooms & beds |  |
| Rooms & Beds | Bed occupancy view | Optional (boarding schools) | Hostel Management > Rooms & beds |  |
| Allocation | Allocate a student to a bed (one active bed per student) | Optional (boarding schools) | Hostel Management > Allocation |  |
| Allocation | Hostel check-in and check-out | Optional (boarding schools) | Hostel Management > Allocation |  |
| Roll Call & Incidents | Hostel roll call (morning / night) | Optional (boarding schools) | Hostel Management > Daily hostel life |  |
| Roll Call & Incidents | Hostel incident log (discipline, medical, maintenance) | Optional (boarding schools) | Hostel Management > Daily hostel life |  |
| Outing & Visitors | Outing / leave pass with approval and return time | Optional (boarding schools) | Hostel Management > Daily hostel life |  |
| Outing & Visitors | Hostel visitor log | Optional (boarding schools) | Hostel Management > Daily hostel life |  |
| Mess | Mess menu by day and meal | Optional (boarding schools) | Hostel Management > Mess |  |
| Mess | Daily mess head count | Optional (boarding schools) | Hostel Management > Mess |  |
| Mess | Mess / hostel expenses | Optional (boarding schools) | Hostel Management > Mess | also posted to Finance, Expenses |
| Mess | Nutrition tracking | Optional (boarding schools) | Hostel Management > Mess |  |
| Hostel Reports | Hostel reports: occupancy, attendance, outings | Optional (boarding schools) | Hostel Management > Hostel reports |  |
| Hostel Settings | Hostel rules | Optional (boarding schools) | Hostel Management > Allocation |  |

### Front Office

| Page | Feature | Need | Was listed under | Note |
|---|---|---|---|---|
| Reception Desk | Reception dashboard: today's visitors, enquiries, appointments, calls | Core | Front Office > Reception desk |  |
| Reception Desk | Front-office notes | Core | Front Office > Reception desk |  |
| Reception Desk | Request desk: walk-in requests routed to the right department | Core | Front Office > Reception desk |  |
| Visitors | Register a visitor: name, phone, purpose, person to meet | Core | Front Office > Visitors |  |
| Visitors | Visitor photo | Optional (schools photographing visitors) | Front Office > Visitors |  |
| Visitors | Visitor pass / visitor ID | Core | Front Office > Visitors |  |
| Visitors | Visitor check-in and check-out times | Core | Front Office > Visitors |  |
| Visitors | Notify the staff member being visited | Core | Front Office > Visitors |  |
| Visitors | Search the visitor log | Core | Front Office > Visitors |  |
| Visitors | Gate entry and exit logs | Optional (schools with gate security) | Front Office > Visitors |  |
| Visitors | Visitor reports | Core | Front Office > Visitors |  |
| Student Pickup | Authorised pickup list; student released only to an authorised person | Core | Front Office > Gate pass & student pickup |  |
| Student Pickup | Parent / guardian verification and a release record at pickup | Core | Front Office > Gate pass & student pickup |  |
| Enquiries & Calls | Enquiry register at the front desk (hand-off to Admissions) | Core | Front Office > Reception desk | automatic hand-off, see 'Enquiry at the front desk' |
| Enquiries & Calls | Call log (incoming / outgoing, purpose, follow-up) | Core | Front Office > Reception desk |  |
| Appointments | Appointments with staff (no double booking) | Core | Front Office > Reception desk |  |
| Postal & Deliveries | Deliveries / courier register | Optional (schools logging deliveries) | Front Office > Reception desk |  |

### Homework & Learning

| Page | Feature | Need | Was listed under | Note |
|---|---|---|---|---|
| Homework | Create homework / assignment: subject, class, title, instructions, due date | Core | Homework & Learning > Homework |  |
| Homework | Homework attachments | Core | Homework & Learning > Homework |  |
| Homework | Assign homework to a class, section or chosen students | Core | Homework & Learning > Homework |  |
| Homework | Students notified when homework is set | Core | Homework & Learning > Homework | automatic |
| Homework | Homework list with filters (class, subject, date, status) | Core | Homework & Learning > Homework |  |
| Homework | Homework cards view | Core | Homework & Learning > Homework |  |
| Homework | Homework details page | Core | Homework & Learning > Homework |  |
| Homework | Set homework in three taps on mobile | Core | Homework & Learning > Homework |  |
| Homework | Teacher assistant: drafts lesson plans, worksheets, quizzes, homework, student feedback and report-card remarks | Optional (schools using AI) | Global (all modules) > AI assistant | drafts appear as suggestions in Homework, Syllabus & Lesson Plans, Question Papers and Report Cards |
| Homework | Student app / student home | Optional (schools giving students logins) | Global (all modules) > Mobile | students who have logins see their homework, quizzes and classes |
| Submissions & Grading | Student submits homework online (before due date; late marked) | Optional (schools using online submission) | Homework & Learning > Submissions & grading |  |
| Submissions & Grading | Resubmission when the teacher allows it | Optional (schools using online submission) | Homework & Learning > Submissions & grading |  |
| Submissions & Grading | Teacher reviews submissions | Core | Homework & Learning > Submissions & grading |  |
| Submissions & Grading | Grade homework: score, grade, feedback | Core | Homework & Learning > Submissions & grading |  |
| Submissions & Grading | Homework status: assigned, submitted, late, graded, missing | Core | Homework & Learning > Submissions & grading |  |
| Submissions & Grading | Student sees teacher feedback | Optional (schools using online submission) | Homework & Learning > Submissions & grading |  |
| Submissions & Grading | Homework discussion thread | Optional (schools allowing discussion) | Homework & Learning > Submissions & grading |  |
| Study Material | Course workspace per class and subject | Optional (schools using digital learning) | Homework & Learning > Courses & study material |  |
| Study Material | Lessons with notes, documents and videos (study material) | Optional (schools using digital learning) | Homework & Learning > Courses & study material |  |
| Quizzes | Quizzes with automatic marking | Optional (schools using digital learning) | Homework & Learning > Courses & study material |  |
| Discussions | Course discussions | Optional (schools using digital learning) | Homework & Learning > Courses & study material |  |
| Online Classes | Online class sessions and schedules | Optional (schools running online classes) | Homework & Learning > Online classes |  |
| Online Classes | Meeting links | Optional (schools running online classes) | Homework & Learning > Online classes |  |
| Online Classes | Online class attendance | Optional (schools running online classes) | Homework & Learning > Online classes |  |
| Online Classes | Class materials shared in the session | Optional (schools running online classes) | Homework & Learning > Online classes |  |
| Online Classes | Class recordings | Optional (schools running online classes) | Homework & Learning > Online classes |  |
| Learning Progress | Homework reports | Core | Homework & Learning > Submissions & grading |  |
| Learning Progress | Learning progress per student | Optional (schools using digital learning) | Homework & Learning > Courses & study material |  |
| Learning Progress | Learning analytics | Optional (schools using digital learning) | Homework & Learning > Courses & study material |  |
| Homework Settings | Course access rules by class and role | Optional (schools using digital learning) | Homework & Learning > Courses & study material |  |

### Events & Calendar

| Page | Feature | Need | Was listed under | Note |
|---|---|---|---|---|
| School Calendar | One school calendar: academic dates, exams, events, holidays | Core | Events & Calendar > School calendar |  |
| School Calendar | Holiday list per year | Core | Events & Calendar > School calendar |  |
| Events | Create events with type, date, venue, audience | Core | Events & Calendar > Events |  |
| Events | Event registration | Optional (schools with sign-up events) | Events & Calendar > Events |  |
| Events | Event attendance | Optional (schools with sign-up events) | Events & Calendar > Events |  |
| Events | Event seating | Optional (schools with large events) | Events & Calendar > Events |  |
| Events | Event payments | Optional (schools charging for events) | Events & Calendar > Events |  |
| Events | Event volunteers | Optional (schools with large events) | Events & Calendar > Events |  |
| Events | Event reminders | Core | Events & Calendar > Events |  |
| Events | Alumni events | Optional (schools tracking alumni) | Items that don't fit the 20 modules > Alumni CRM |  |
| PTM | PTM calendar | Core | Items that don't fit the 20 modules > Parent-teacher meetings (PTM) |  |
| PTM | Teacher time slots for PTM | Core | Items that don't fit the 20 modules > Parent-teacher meetings (PTM) |  |
| PTM | Book PTM appointments for parents (done by school staff) | Core | Items that don't fit the 20 modules > Parent-teacher meetings (PTM) |  |
| PTM | PTM waiting queue on the day | Optional (large schools) | Items that don't fit the 20 modules > Parent-teacher meetings (PTM) |  |
| PTM | PTM meeting notes | Core | Items that don't fit the 20 modules > Parent-teacher meetings (PTM) |  |
| PTM | Student performance view for the PTM | Core | Items that don't fit the 20 modules > Parent-teacher meetings (PTM) |  |
| PTM | Teacher remarks at the PTM | Core | Items that don't fit the 20 modules > Parent-teacher meetings (PTM) |  |
| PTM | Parent feedback recorded at the PTM | Core | Items that don't fit the 20 modules > Parent-teacher meetings (PTM) |  |
| PTM | PTM reminder messages | Core | Items that don't fit the 20 modules > Parent-teacher meetings (PTM) | automatic message |
| Co-curricular & Sports | Competition results | Optional (schools running competitions) | Events & Calendar > Events |  |
| Co-curricular & Sports | Student achievements record | Core | Events & Calendar > Events | also on Student Profile |
| Co-curricular & Sports | Participation and achievement certificates | Core | Events & Calendar > Events |  |
| Co-curricular & Sports | Co-curricular activity tracking: music, dance, debate, art, public speaking, olympiads, competitions, projects, volunteering | Core | Events & Calendar > Events |  |
| Co-curricular & Sports | Houses | Optional (schools with a house system) | Items that don't fit the 20 modules > Houses & clubs |  |
| Co-curricular & Sports | Assign students to houses | Optional (schools with a house system) | Items that don't fit the 20 modules > Houses & clubs |  |
| Co-curricular & Sports | House points | Optional (schools with a house system) | Items that don't fit the 20 modules > Houses & clubs |  |
| Co-curricular & Sports | House leaderboard | Optional (schools with a house system) | Items that don't fit the 20 modules > Houses & clubs |  |
| Co-curricular & Sports | Clubs and memberships | Optional (schools with clubs) | Items that don't fit the 20 modules > Houses & clubs |  |
| Co-curricular & Sports | Sports teams and coaches | Optional (sports-focused schools) | Items that don't fit the 20 modules > Sports management |  |
| Co-curricular & Sports | Training sessions and attendance | Optional (sports-focused schools) | Items that don't fit the 20 modules > Sports management |  |
| Co-curricular & Sports | Fixtures and competitions | Optional (sports-focused schools) | Items that don't fit the 20 modules > Sports management |  |
| Co-curricular & Sports | Sports achievements | Optional (sports-focused schools) | Items that don't fit the 20 modules > Sports management |  |
| Co-curricular & Sports | Fitness records | Optional (sports-focused schools) | Items that don't fit the 20 modules > Sports management |  |
| Gallery | Photo / video albums by event | Core | Events & Calendar > Gallery |  |
| Gallery | Upload photos and videos | Core | Events & Calendar > Gallery |  |
| Gallery | Album visibility by audience | Core | Events & Calendar > Gallery |  |
| Gallery | Publish or archive an album | Core | Events & Calendar > Gallery |  |
| Daily Activities | Daily activity log | Optional (pre-primary and activity-based schools) | Events & Calendar > Daily activities |  |
| Daily Activities | Assign activities to classes | Optional (pre-primary and activity-based schools) | Events & Calendar > Daily activities |  |
| Daily Activities | Activity participation | Optional (pre-primary and activity-based schools) | Events & Calendar > Daily activities |  |
| Daily Activities | Activity completion | Optional (pre-primary and activity-based schools) | Events & Calendar > Daily activities |  |
| Daily Activities | Activity reports | Optional (pre-primary and activity-based schools) | Events & Calendar > Daily activities |  |
| Events Settings | Calendar feed to Google / Outlook calendars | Optional (schools syncing calendars) | Events & Calendar > School calendar |  |

### Reports & Analytics

| Page | Feature | Need | Was listed under | Note |
|---|---|---|---|---|
| All Reports | Student reports: master list, demographics, lifecycle, transfers, withdrawals, document status | Core | Student Management > Student reports |  |
| All Reports | One report catalogue across modules, by category | Core | Reports & Analytics > Report catalogue |  |
| All Reports | Report filters (year, class, date, campus) | Core | Reports & Analytics > Report catalogue |  |
| All Reports | Sort and export to Excel, CSV, PDF | Core | Reports & Analytics > Report catalogue |  |
| All Reports | Reports show the filters used and only data the user may see | Core | Reports & Analytics > Report catalogue |  |
| All Reports | Heavy reports run in the background and notify when ready | Core | Reports & Analytics > Report catalogue | you get a notification when ready |
| Analytics | Dashboards with drill-down | Core | Reports & Analytics > Analytics |  |
| Analytics | Student analytics | Core | Reports & Analytics > Analytics |  |
| Analytics | Finance analytics: collection, dues, expenses | Core | Reports & Analytics > Analytics |  |
| Analytics | HR analytics | Core | Reports & Analytics > Analytics |  |
| Analytics | Teacher workload analysis | Core | Reports & Analytics > Analytics |  |
| Analytics | Teacher performance and syllabus completion analysis | Core | Reports & Analytics > Analytics |  |
| Analytics | Compare schools / campuses side by side | Optional (school groups) | Global (all modules) > Multi-school |  |
| Early Warnings | Student risk signals (attendance, marks, fees) for review | Core | Items that don't fit the 20 modules > Alert & risk engine | also on Dashboard, Needs Attention |
| Early Warnings | Every risk flag reviewed by a person before action | Core | Items that don't fit the 20 modules > Alert & risk engine |  |
| Early Warnings | Unusual-activity detection (e.g. odd fee or attendance changes) | Optional (schools using AI) | Items that don't fit the 20 modules > Alert & risk engine |  |
| Early Warnings | Dropout risk | Optional (schools using AI) | Items that don't fit the 20 modules > Alert & risk engine |  |
| Early Warnings | Predictions (fees, results, attendance) | Optional (schools using AI) | Items that don't fit the 20 modules > Alert & risk engine |  |
| Government Reports | UDISE export for government reporting | Core (India) | Student Management > Import & bulk tools |  |
| Government Reports | UDISE+ data structure and checks | Core (India) | Items that don't fit the 20 modules > Government compliance |  |
| Government Reports | Versioned government export formats | Core (India) | Items that don't fit the 20 modules > Government compliance |  |
| Government Reports | Government system connectors | Optional (future, where APIs exist) | Items that don't fit the 20 modules > Government compliance |  |
| Custom & Scheduled Reports | Custom report builder | Optional (schools needing their own reports) | Reports & Analytics > Custom & scheduled |  |
| Custom & Scheduled Reports | Scheduled reports sent by email | Optional (schools wanting regular reports) | Reports & Analytics > Custom & scheduled |  |

### Settings

| Page | Feature | Need | Was listed under | Note |
|---|---|---|---|---|
| School Profile | School profile: name, logo, address, contacts, affiliation number | Core | Settings > School profile & branding |  |
| School Profile | School branding (logo, colours) on screens and documents | Core | Settings > School profile & branding |  |
| School Profile | Board choice: CBSE, ICSE, state board, IB, Cambridge, custom | Core | Settings > Board & curriculum |  |
| School Profile | Settings that follow the board (grading, report format, terms) | Core | Settings > Board & curriculum |  |
| School Profile | More than one curriculum in the same school | Optional (schools running two boards) | Settings > Board & curriculum |  |
| School Profile | Language, locale, time zone and date / number formats | Core | Settings > Language & region |  |
| School Profile | Eight Indian languages: English, Telugu, Hindi, Tamil, Kannada, Malayalam, Marathi, Bengali | Core | Settings > Language & region |  |
| School Profile | Several currencies | Optional (international schools) | Settings > Language & region |  |
| School Profile | School settings override group defaults | Optional (school groups) | Global (all modules) > Multi-school |  |
| School Profile | School and compliance documents (registration, affiliation, NOCs) | Core | Items that don't fit the 20 modules > Central document vault |  |
| School Profile | Document versions | Core | Items that don't fit the 20 modules > Central document vault |  |
| School Profile | Expiry dates with renewal alerts | Core | Items that don't fit the 20 modules > Central document vault |  |
| School Profile | Document verification status | Core | Items that don't fit the 20 modules > Central document vault |  |
| School Profile | Search the vault | Core | Items that don't fit the 20 modules > Central document vault |  |
| School Profile | Access control and time-limited links | Core | Items that don't fit the 20 modules > Central document vault |  |
| School Profile | Document preview | Core | Items that don't fit the 20 modules > Central document vault |  |
| School Profile | Board compliance settings | Core | Items that don't fit the 20 modules > Government compliance |  |
| Users & Permissions | User accounts: create, enable, disable, reset password | Core | Settings > Users & logins |  |
| Users & Permissions | Admin accounts: cards, search, view, message, edit | Core | Settings > Users & logins |  |
| Users & Permissions | Password format rules | Core | Settings > Users & logins |  |
| Users & Permissions | Side menu showing only the modules the role may use | Core | Global (all modules) > Top bar & navigation | menu follows each role |
| Users & Permissions | Role list (admin, principal, teacher, accountant, etc.) plus custom roles | Core | Global (all modules) > Roles & permissions |  |
| Users & Permissions | Permissions per module and action: view, create, edit, delete, approve, export, print | Core | Global (all modules) > Roles & permissions |  |
| Users & Permissions | Scope: whole school, campus, class, own records | Core | Global (all modules) > Roles & permissions |  |
| Users & Permissions | Hide sensitive fields from roles that must not see them | Core | Global (all modules) > Roles & permissions |  |
| Users & Permissions | Sensitivity levels: normal, restricted, highly restricted | Core | Global (all modules) > Roles & permissions |  |
| Users & Permissions | Access by channel: web, mobile, API | Core | Global (all modules) > Roles & permissions |  |
| Users & Permissions | Approval rights per role and amount | Core | Global (all modules) > Roles & permissions |  |
| Users & Permissions | Two-step login (MFA) for sensitive roles | Core | Global (all modules) > Roles & permissions |  |
| Payment Gateways | Add a payment gateway: name, code, active switch, test mode | Core | Settings > Payment gateways |  |
| Payment Gateways | Gateway credentials: merchant key, salt, environment, webhook URL | Core | Settings > Payment gateways |  |
| Payment Gateways | Gateway providers: PhonePe, Razorpay, Cashfree, Easebuzz, PayU, Paytm, cash / cash deposit; more can be added | Core | Settings > Payment gateways |  |
| Payment Gateways | Gateway list with active status | Core | Settings > Payment gateways |  |
| Payment Gateways | Gateway secrets stored encrypted and never shown again | Core | Settings > Payment gateways |  |
| SMS, WhatsApp & Email | Notification settings | Core | Settings > Modules & preferences |  |
| SMS, WhatsApp & Email | Turn messaging services (SMS, WhatsApp, email) on or off | Core | Settings > Messaging channels |  |
| SMS, WhatsApp & Email | WhatsApp provider connection | Core | Settings > Messaging channels |  |
| SMS, WhatsApp & Email | SMS provider connection with sender ID | Core | Settings > Messaging channels |  |
| SMS, WhatsApp & Email | Email provider connection | Core | Settings > Messaging channels |  |
| Document Designs | ID card designer: size, orientation, background colour or image, school branding, layout | Core | Student Management > ID cards | opened from Certificates & ID Cards |
| Document Designs | ID card settings | Core | Student Management > ID cards | opened from Certificates & ID Cards |
| Document Designs | Document templates: receipts, certificates, ID cards, report cards, letters | Core | Settings > Document templates |  |
| Document Designs | Template editor with merge fields | Core | Settings > Document templates |  |
| Document Designs | Documents use the right year and branding | Core | Settings > Document templates |  |
| Document Designs | Digital signatures on documents | Optional (schools signing documents digitally) | Settings > Document templates |  |
| Forms & Approvals | Custom fields on records | Core | Settings > Custom fields, forms & workflows |  |
| Forms & Approvals | Form builder | Core | Settings > Custom fields, forms & workflows |  |
| Forms & Approvals | Conditional form fields | Optional (schools building complex forms) | Settings > Custom fields, forms & workflows |  |
| Forms & Approvals | Workflow builder (steps, approvers) | Core | Settings > Custom fields, forms & workflows |  |
| Forms & Approvals | Approval rules (limits, approvers, escalation) | Core | Settings > Custom fields, forms & workflows |  |
| Modules On/Off | Turn modules on or off per school | Core | Settings > Modules & preferences |  |
| Modules On/Off | Start from a school-type template (e.g. CBSE day school, boarding school) | Core | Settings > Modules & preferences |  |
| Modules On/Off | System preferences | Core | Settings > Modules & preferences |  |
| Modules On/Off | Integrations list | Core | Settings > Integrations |  |
| Modules On/Off | Integration health status | Core | Settings > Integrations |  |
| Modules On/Off | Google / Microsoft accounts | Optional (schools using Google or Microsoft tools) | Settings > Integrations |  |
| Modules On/Off | Printers and scanners | Optional (schools printing from the system) | Settings > Integrations |  |
| Modules On/Off | CCTV | Optional (schools with CCTV links) | Settings > Integrations |  |
| Modules On/Off | Outside learning platforms | Optional (schools using another LMS) | Settings > Integrations |  |
| Modules On/Off | IoT devices | Optional (schools with smart devices) | Settings > Integrations |  |
| Modules On/Off | Webhooks to other systems | Optional (schools connecting other software) | Settings > Integrations |  |
| Modules On/Off | AI assistant on / off, and which roles may use it | Optional (schools using AI) | Global (all modules) > AI assistant |  |
| Data Backup & Security | Integration / API call logs | Optional (schools connecting other software) | Settings > Integrations |  |
| Data Backup & Security | CSV templates for each import | Core | Settings > Data import & export | used by every Import button |
| Data Backup & Security | Column mapping | Core | Settings > Data import & export |  |
| Data Backup & Security | Import preview | Core | Settings > Data import & export |  |
| Data Backup & Security | Import error report | Core | Settings > Data import & export |  |
| Data Backup & Security | Partial import (good rows only) | Core | Settings > Data import & export |  |
| Data Backup & Security | Undo an import | Core | Settings > Data import & export |  |
| Data Backup & Security | Export all school data | Core | Settings > Data import & export |  |
| Data Backup & Security | Audit log of every change: who, what, when | Core | Settings > Audit & privacy |  |
| Data Backup & Security | Before / after values in the audit log | Core | Settings > Audit & privacy |  |
| Data Backup & Security | Login history | Core | Settings > Audit & privacy |  |
| Data Backup & Security | Export log (who exported what) | Core | Settings > Audit & privacy |  |
| Data Backup & Security | Security alerts (unusual logins, mass exports) | Core | Settings > Audit & privacy |  |
| Data Backup & Security | Data retention periods | Core | Settings > Audit & privacy |  |
| Data Backup & Security | Data deletion requests with approval | Core | Settings > Audit & privacy |  |
| Data Backup & Security | Consent records | Core | Settings > Audit & privacy |  |
| Data Backup & Security | Data export request for one person | Core | Settings > Audit & privacy |  |

### Top bar

| Page | Feature | Need | Was listed under | Note |
|---|---|---|---|---|
| Approvals | Pending approvals queue with counts (only items the user may decide) | Core | Dashboard > Needs attention | also shown as a count on Needs Attention |
| Profile | Profile menu in the top bar | Core | Global (all modules) > Top bar & navigation |  |
| Messages | Messages shortcut in the top bar | Core | Global (all modules) > Top bar & navigation |  |
| Search | Module shortcuts / quick links | Core | Global (all modules) > Top bar & navigation | replaces Quick Filter |
| Search | Global search across students, staff, parents and records | Core | Global (all modules) > Search |  |
| Search | Search by intent, e.g. "fee Ravi" opens Ravi's fee page | Core | Global (all modules) > Search |  |
| Search | Favourites | Core | Global (all modules) > Search | recent and pinned pages; replaces Favorites |
| Approvals | One approvals inbox: leave, refunds, purchases, discounts / concessions, admissions, certificates, salary adjustments, transport changes, expenses, attendance corrections | Core | Global (all modules) > Approvals |  |
| Approvals | Approval counts and "approval pending" notifications | Core | Global (all modules) > Approvals |  |
| Approvals | Approve on mobile | Core | Global (all modules) > Approvals |  |
| Approvals | User requests list | Core | Global (all modules) > Approvals |  |
| Notifications | Notification centre (bell) | Core | Global (all modules) > Notifications |  |
| Notifications | Push notifications that open the right screen | Core | Global (all modules) > Notifications |  |
| Profile | View and edit my profile | Core | Global (all modules) > My profile |  |
| Profile | Change password; see and sign out active sessions and devices | Core | Global (all modules) > My profile |  |
| Profile | My notification preferences | Core | Global (all modules) > My profile |  |
| Profile | Session and device control (time-outs, sign out everywhere) | Core | Global (all modules) > Roles & permissions | rules in Settings, Users & Permissions |
| Search (ask in plain words) | Ask questions in plain words and get answers with links to act | Optional (schools using AI) | Global (all modules) > AI assistant |  |
| Search (ask in plain words) | Give instructions in plain words, e.g. "Add Ravi to class 5" | Optional (schools using AI) | Global (all modules) > AI assistant |  |
| School switcher | School switcher for users in more than one school | Optional (school groups) | Global (all modules) > Multi-school |  |
| School switcher | Other schools list | Optional (school groups) | Global (all modules) > Multi-school |  |
| School switcher | Group-level admin across schools | Optional (school groups) | Global (all modules) > Multi-school | group view |
| School switcher | One user account working in several schools | Optional (school groups) | Global (all modules) > Multi-school |  |

### Automatic work

| Page | Feature | Need | Was listed under | Note |
|---|---|---|---|---|
| Online payment received | Payment confirmed only from the gateway's verified callback; never posted twice | Core | Fee Management > Online payments |  |
| Online payment received | Automatic reconciliation of online payments | Core | Fee Management > Online payments |  |
| Online payment received | Failed-payment handling | Core | Fee Management > Online payments | failed payments listed on Fee Dashboard |
| Fee paid / Salary approved | Fee and salary payments post to the Day Book automatically | Core | Finance Management > Day Book | shown in Day Book |

### Every screen

| Page | Feature | Need | Was listed under | Note |
|---|---|---|---|---|
| How every screen behaves | Back navigation | Core | Global (all modules) > Top bar & navigation |  |
| Lists with search and filter | Quick filter on lists | Core | Global (all modules) > Search |  |
| Actions on each record | Actions shown on each record, e.g. on a student: collect fee, mark attendance, send message, print TC | Core | Global (all modules) > Action engine |  |
| How every screen behaves | Permissions checked on the server, not just hidden on screen | Core | Global (all modules) > Roles & permissions |  |
| AI rules | AI safety: only permitted data, human confirms every change, actions logged | Core | Global (all modules) > AI assistant |  |
| Works on phone, tablet and computer | Works on phones and tablets (responsive) | Core | Global (all modules) > Mobile |  |
| Works on phone, tablet and computer | Screens designed for each role on mobile | Core | Global (all modules) > Mobile |  |
| Works on phone, tablet and computer | Teacher mobile app | Core | Global (all modules) > Mobile |  |
| Works on phone, tablet and computer | Installable web app (PWA) | Core | Global (all modules) > Mobile |  |
| Works on phone, tablet and computer | Offline mode with sync later (attendance, transport, poor-internet campuses) | Optional (schools with poor internet) | Global (all modules) > Mobile |  |
| How every screen behaves | Clear loading, empty, error and success states | Core | Global (all modules) > Common behaviour on every screen |  |
| How every screen behaves | Every entry checked on the server | Core | Global (all modules) > Common behaviour on every screen |  |
| How every screen behaves | Confirmation before risky actions, and a way to undo or recover | Core | Global (all modules) > Common behaviour on every screen |  |
| How every screen behaves | Records archived, not deleted | Core | Global (all modules) > Common behaviour on every screen |  |
| How every screen behaves | Lists with paging, search, sort and export | Core | Global (all modules) > Common behaviour on every screen |  |
| How every screen behaves | Accessible (keyboard, contrast, screen readers) | Core | Global (all modules) > Common behaviour on every screen |  |
| How every screen behaves | Plain words on screen; no internal codes or IDs shown | Core | Global (all modules) > Common behaviour on every screen |  |
| How every screen behaves | Show simple options first, more on request | Core | Global (all modules) > Common behaviour on every screen |  |
| How every screen behaves | Same words for the same thing everywhere | Core | Global (all modules) > Common behaviour on every screen |  |
| How every screen behaves | Bulk actions with preview and a result summary | Core | Global (all modules) > Common behaviour on every screen |  |

### Not included

| Page | Feature | Need | Was listed under | Note |
|---|---|---|---|---|
| Share the App link | "Share the App" link | Optional (schools promoting their app) | Global (all modules) > Top bar & navigation | removed from menu |
| Super Admin console (separate product) | Create a new school account | Core | Platform Admin (software company console, separate product) > Schools (tenants) |  |
| Super Admin console (separate product) | School account status: trial, active, suspended, closed | Core | Platform Admin (software company console, separate product) > Schools (tenants) |  |
| Super Admin console (separate product) | School list with status | Core | Platform Admin (software company console, separate product) > Schools (tenants) |  |
| Super Admin console (separate product) | Organisation / branch / campus structure | Core | Platform Admin (software company console, separate product) > Schools (tenants) |  |
| Super Admin console (separate product) | Per-school settings from the console | Core | Platform Admin (software company console, separate product) > Schools (tenants) |  |
| Super Admin console (separate product) | User lists across schools | Core | Platform Admin (software company console, separate product) > Schools (tenants) |  |
| Super Admin console (separate product) | School onboarding and onboarding campaigns | Core | Platform Admin (software company console, separate product) > Schools (tenants) |  |
| Super Admin console (separate product) | Free trials | Core | Platform Admin (software company console, separate product) > Schools (tenants) |  |
| Super Admin console (separate product) | Plans and which features each plan includes (feature flags) | Core | Platform Admin (software company console, separate product) > Plans & billing |  |
| Super Admin console (separate product) | School subscription: plan, start, renewal | Core | Platform Admin (software company console, separate product) > Plans & billing |  |
| Super Admin console (separate product) | Usage limits per plan (students, messages, storage) | Core | Platform Admin (software company console, separate product) > Plans & billing |  |
| Super Admin console (separate product) | Billing, invoices and renewals | Core | Platform Admin (software company console, separate product) > Plans & billing |  |
| Super Admin console (separate product) | Usage dashboard per school | Core | Platform Admin (software company console, separate product) > Plans & billing |  |
| Super Admin console (separate product) | Support tickets from schools | Core | Platform Admin (software company console, separate product) > Support |  |
| Super Admin console (separate product) | Incident records | Core | Platform Admin (software company console, separate product) > Support |  |
| Super Admin console (separate product) | Announcements and release notes to schools | Core | Platform Admin (software company console, separate product) > Support |  |
| Super Admin console (separate product) | App logs | Core | Platform Admin (software company console, separate product) > Monitoring |  |
| Super Admin console (separate product) | Error monitoring | Core | Platform Admin (software company console, separate product) > Monitoring |  |
| Super Admin console (separate product) | Product usage analytics | Optional (if the company tracks usage) | Platform Admin (software company console, separate product) > Monitoring |  |
| Super Admin console (separate product) | System health page | Core | Platform Admin (software company console, separate product) > Monitoring |  |
| Super Admin console (separate product) | Background job monitor | Core | Platform Admin (software company console, separate product) > Monitoring |  |
| Super Admin console (separate product) | Platform audit log | Core | Platform Admin (software company console, separate product) > Monitoring |  |
| Super Admin console (separate product) | Each school's data kept separate, with isolation tests | Core | Platform Admin (software company console, separate product) > Data safety |  |
| Super Admin console (separate product) | Automatic backups (database and files, with replication) | Core | Platform Admin (software company console, separate product) > Data safety | the school can still download its own data in Settings, Data Backup & Security |
| Super Admin console (separate product) | Point-in-time recovery and disaster recovery | Core | Platform Admin (software company console, separate product) > Data safety | the school can still download its own data in Settings, Data Backup & Security |
| Super Admin console (separate product) | Restore tests | Core | Platform Admin (software company console, separate product) > Data safety | the school can still download its own data in Settings, Data Backup & Security |
| Super Admin console (separate product) | Encryption and secret storage | Core | Platform Admin (software company console, separate product) > Data safety |  |
| Super Admin console (separate product) | Rate limits | Core | Platform Admin (software company console, separate product) > Data safety |  |
| Super Admin console (separate product) | Time-limited file links | Core | Platform Admin (software company console, separate product) > Data safety |  |
| Super Admin console (separate product) | Versioned REST API | Core | Platform Admin (software company console, separate product) > API & ecosystem |  |
| Super Admin console (separate product) | API keys / tokens with scopes | Core | Platform Admin (software company console, separate product) > API & ecosystem |  |
| Super Admin console (separate product) | Student data API | Optional (schools connecting other software) | Platform Admin (software company console, separate product) > API & ecosystem |  |
| Super Admin console (separate product) | Attendance device API | Optional (schools using attendance devices) | Platform Admin (software company console, separate product) > API & ecosystem |  |
| Super Admin console (separate product) | Payment API | Core | Platform Admin (software company console, separate product) > API & ecosystem | used inside the software for online fee payments |
| Super Admin console (separate product) | Transport / GPS API | Optional (schools tracking buses by GPS) | Platform Admin (software company console, separate product) > API & ecosystem |  |
| Super Admin console (separate product) | Open platform / app marketplace | Optional (future ecosystem) | Platform Admin (software company console, separate product) > API & ecosystem |  |
| Super Admin console (separate product) | Choice of cloud file storage | Optional (hosting choice) | Platform Admin (software company console, separate product) > API & ecosystem |  |
| Safety & Health / Medical | Student health profile: conditions, allergies, medicines | Excluded | Excluded by owner's decision > Safety & Health / Medical |  |
| Safety & Health / Medical | Health tab in Student 360 | Excluded | Excluded by owner's decision > Safety & Health / Medical |  |
| Safety & Health / Medical | Medical room visits | Excluded | Excluded by owner's decision > Safety & Health / Medical |  |
| Safety & Health / Medical | First-aid log | Excluded | Excluded by owner's decision > Safety & Health / Medical |  |
| Safety & Health / Medical | Vaccination records | Excluded | Excluded by owner's decision > Safety & Health / Medical |  |
| Safety & Health / Medical | Health screenings | Excluded | Excluded by owner's decision > Safety & Health / Medical |  |
| Safety & Health / Medical | Safety incidents | Excluded | Excluded by owner's decision > Safety & Health / Medical |  |
| Safety & Health / Medical | Emergency response workflow | Excluded | Excluded by owner's decision > Safety & Health / Medical |  |
| Safety & Health / Medical | Parent told about a safety incident | Excluded | Excluded by owner's decision > Safety & Health / Medical |  |
| Safety & Health / Medical | Nearby hospital information | Excluded | Excluded by owner's decision > Safety & Health / Medical |  |
| Safety & Health / Medical | Health records restricted to authorised staff | Excluded | Excluded by owner's decision > Safety & Health / Medical |  |
| Safety & Health / Medical | Medical information and medical documents at admission | Excluded | Excluded by owner's decision > Safety & Health / Medical |  |
| Safety & Health / Medical | "Safety Management" menu item | Excluded | Excluded by owner's decision > Safety & Health / Medical |  |
| Safety & Health / Medical | Nurse role | Excluded | Excluded by owner's decision > Safety & Health / Medical |  |
| Parent Portal / parent app | Parent account / login | Excluded | Excluded by owner's decision > Parent Portal / parent app |  |
| Parent Portal / parent app | Parent login created at admission conversion | Excluded | Excluded by owner's decision > Parent Portal / parent app |  |
| Parent Portal / parent app | One parent account for several children | Excluded | Excluded by owner's decision > Parent Portal / parent app |  |
| Parent Portal / parent app | Parent home screen | Excluded | Excluded by owner's decision > Parent Portal / parent app |  |
| Parent Portal / parent app | Parents pay fees online in the app | Excluded | Excluded by owner's decision > Parent Portal / parent app |  |
| Parent Portal / parent app | Parents download receipts | Excluded | Excluded by owner's decision > Parent Portal / parent app |  |
| Parent Portal / parent app | Parents view attendance | Excluded | Excluded by owner's decision > Parent Portal / parent app |  |
| Parent Portal / parent app | Parents view homework | Excluded | Excluded by owner's decision > Parent Portal / parent app |  |
| Parent Portal / parent app | Parents request leave | Excluded | Excluded by owner's decision > Parent Portal / parent app |  |
| Parent Portal / parent app | Parents book PTM slots | Excluded | Excluded by owner's decision > Parent Portal / parent app |  |
| Parent Portal / parent app | Parents track the bus | Excluded | Excluded by owner's decision > Parent Portal / parent app |  |
| Parent Portal / parent app | Parents raise a query | Excluded | Excluded by owner's decision > Parent Portal / parent app |  |
| Parent Portal / parent app | Parents respond to notices, give feedback, update their profile | Excluded | Excluded by owner's decision > Parent Portal / parent app |  |
| Parent Portal / parent app | Parents upload documents | Excluded | Excluded by owner's decision > Parent Portal / parent app |  |
| Parent Portal / parent app | Parent portal views of the child's records | Excluded | Excluded by owner's decision > Parent Portal / parent app |  |
| Parent Portal / parent app | Parents view performance | Excluded | Excluded by owner's decision > Parent Portal / parent app |  |
| Parent Portal / parent app | AI answers for parents | Excluded | Excluded by owner's decision > Parent Portal / parent app |  |
| Parent Portal / parent app | Parent workspace | Excluded | Excluded by owner's decision > Parent Portal / parent app |  |
| Parent Portal / parent app | Parent role and parent mobile flows | Excluded | Excluded by owner's decision > Parent Portal / parent app |  |
| School Website / CMS | Website page manager | Excluded | Excluded by owner's decision > School Website / CMS |  |
| School Website / CMS | News on the website | Excluded | Excluded by owner's decision > School Website / CMS |  |
| School Website / CMS | Events feed on the website | Excluded | Excluded by owner's decision > School Website / CMS |  |
| School Website / CMS | Admission form embedded in the website | Excluded | Excluded by owner's decision > School Website / CMS |  |
| School Website / CMS | Notice feed on the website | Excluded | Excluded by owner's decision > School Website / CMS |  |
| School Website / CMS | Gallery on the website | Excluded | Excluded by owner's decision > School Website / CMS |  |
| School Website / CMS | Results and admission status on the website | Excluded | Excluded by owner's decision > School Website / CMS |  |
| School Website / CMS | Website integration | Excluded | Excluded by owner's decision > School Website / CMS |  |

## Part B: where each old-software screen went

The recording (12 min 43 s, four parts) shows the old school app, one Super Admin screen and some outside apps. Each row is one screen or one menu item. "Recording" gives the part and screen number.

### B1. Old menu items

| Old menu item | New home |
|---|---|
| Dashboard | Dashboard (School Today, Needs Attention, My Tasks, Today & Upcoming) |
| My Profile | Top bar, Profile |
| QUICK FILTER | Top bar, Search |
| FAVORITES | Top bar, Search (recent and pinned pages) |
| Fees Management | Fee Management |
| Time Table | Academic Management, Time Table |
| Attendance | Attendance Management |
| Academic Calendar | Events & Calendar, School Calendar |
| User Management | Split: Student Management (students, parents, ID cards, imports), Staff & HR Management (employees), Settings, Users & Permissions (admins, logins) |
| Messages | Communication (Send Message, Message History); top bar Messages for own inbox |
| Admission Management | Admission Management |
| Day Book | Finance Management, Day Book |
| Tasks | Dashboard, My Tasks |
| Learning Management | Split: Academic Management (Teacher Allocation, Syllabus & Lesson Plans) and Homework & Learning (Quizzes, Discussions, Study Material, Learning Progress) |
| Expense Management | Finance Management, Expenses |
| Salary Management | Salary Management |
| Leave Management | Split: Attendance Management, Student Leave; Staff & HR Management, Staff Leave; top bar Approvals |
| Front Office | Front Office |
| Hostel Management | Hostel Management |
| Inventory Management | Inventory Management |
| CRM / Leads | Admission Management, Enquiries |
| Notice Board | Communication, Notice Board |
| Student Homework | Homework & Learning, Homework |
| Online Classes | Homework & Learning, Online Classes |
| Exams & Results ("Test & Exams") | Examination & Results |
| Transport Management | Transport Management |
| Library Management | Library Management |
| Gallery Management | Events & Calendar, Gallery |
| Daily Activities | Events & Calendar, Daily Activities |
| Settings | Settings, plus each module's own settings page |
| Other Schools | Top bar, School switcher |
| Feedback Or Query | Communication, Feedback & Queries |
| Share the App | Not included (removed from menu) |

### B2. Screens opened in the recording

| Recording | Old screen | New home | What changes |
|---|---|---|---|
| Part 1 S2, Part 3 P3-34, Part 4 S1 | Dashboard: head-count cards, Today's Attendance, Fees Collection, Expense Overview, Budget Utilization, Transport, Upcoming Events, Classes Overview, Recent Fee Payments, "2 Expenses" chip, "Data refreshes every 5 minutes" | Dashboard, School Today and Needs Attention | Numbers open the list behind them; pending expenses go to Approvals; last-refreshed time kept |
| Part 1 S2 | Dashboard widgets System Configuration (SMS, WhatsApp, Email, In-App, AI Assistant roles) | Settings, SMS, WhatsApp & Email; Settings, Modules On/Off | Moved off the Dashboard |
| Part 1 S2 | Dashboard widget Payment Gateways | Settings, Payment Gateways | Moved off the Dashboard |
| Part 1 S2 | Dashboard widget Document Themes (TC, fee invoice, bonafide, character, experience letter, admit card, result card, final result) | Settings, Document Designs | Moved off the Dashboard |
| Part 1 S3, Part 4 S4 | Fees Management hub (12 cards) | Fee Management menu pages | Cards become pages; favourite, hide and help icons dropped (Search replaces favourites) |
| Part 1 S4 | Class Fees Structure ("Default Class Fees", "N/18 set", Assign Fee) | Fee Management, Fee Structure | Assign to class from the same page |
| Part 1 S5 | Student Fees/Collection list (search by name, admission no., phone, class; New / Paid / Overdue tiles; Pay, Pay All, Edit, Assign, History, Export) | Fee Management, Collect Fee and Student Fee Ledger | One-step collection |
| Part 1 S6, S7 | Fees Details: Fees Information, Payment History, Partial Payments tabs | Fee Management, Student Fee Ledger | Delete becomes "cancel with reason" |
| Part 1 S8 | Fee receipt (print, office copy, parent copy, both copies) | Fee Management, Student Fee Ledger; design in Settings, Document Designs | Receipt made automatically after payment |
| Part 1 S11, S12 | Recent Payments, Final and Partial tabs, approve payments | Fee Management, Fee Dashboard | Approval step optional (Fee Settings) |
| Part 4 S4 | Fees card Daycare Fees | Fee Management, Fee Structure (daycare plans) and Collect Fee | |
| Part 4 S4 | Fees card Defaulters List | Fee Management, Defaulters | |
| Part 4 S4 | Fees cards Fees Reports, Audit & Tax Reports | Fee Management, Fee Reports | |
| Part 4 S4 | Fees card Fees Types | Fee Management, Fee Structure | Fee types created inside Fee Structure |
| Part 4 S4 | Fees card Bulk Fees Discount ("pay 3 months get 5% off") | Fee Management, Concessions & Refunds | |
| Part 4 S4 | Fees card Settings (display layouts, invoice options, receipt serial numbers, terms and conditions) | Fee Management, Fee Settings | |
| Part 4 S4 | Fees card Deleted Payments Log | Fee Management, Fee Reports (cancelled payments) and Settings, Data Backup & Security (change history) | Payments are cancelled with a reason, never deleted |
| Part 4 S4, S5 | Fees card Payment Gateways; Manage Payment Gateways list (name, type, provider, status, last modified, Edit, Test) | Settings, Payment Gateways | One place only |
| Part 4 S6 to S8 | Create New Payment Gateway (gateway name, gateway code Easebuzz / SabPaisa / HDFC SmartGateway / Stripe / POS, merchant key, salt, test or live, webhook address, Test Connection, typed-name confirmation) | Settings, Payment Gateways | Which class or fee type uses which gateway is set in Fee Settings |
| Part 1 S13, Part 2 S05 | User Management hub (Students, Parents / Guardians, Employees, Admins, User Requests / Alumni, User Tools, User Settings) | Split, see B1 | |
| Part 1 S14 | Employees list (search, designation filter, View, Message, Edit) | Staff & HR Management, Staff List | |
| Part 1 S15, Part 2 S01 | Add New Employee step 1 Details (photo, name, phone, designation, date of birth, blood group, Aadhaar, addresses, verified flags, username, custom password) | Staff & HR Management, Add Staff | Username and password made automatically unless typed |
| Part 1 S16, Part 2 S02, S04 | Add New Employee step 2 Permissions (15 groups, 58 ticks) | Staff & HR Management, Add Staff (pick a role); details in Settings, Users & Permissions | Start from a role such as Teacher or Accountant, then adjust |
| Part 2 S03 | Add New Employee step 3 Class & Subjects | Staff & HR Management, Add Staff; also Academic Management, Teacher Allocation | |
| Part 2 S06, S07 | All Admins list and Add Admin form | Settings, Users & Permissions | |
| Part 1 S13 | User Requests / Alumni (join requests) | Top bar, Approvals; alumni in Student Management, Leaving & Alumni | |
| Part 1 S13 | User Settings (username and password formats, required fields, list display) | Settings, Users & Permissions; Student Management, Student Settings | |
| Part 2 S09, S12 | User Tools hub | Student Management, Student List (Import, Bulk update, Export) | |
| Part 2 S10 | Student Import (CSV) with "Add Fees Structure", "Add Parent Login", "Link Sibling Parents" | Student Management, Student List (Import) | Fee plan and sibling link applied automatically; parent login not included (no parent portal) |
| Part 2 S09 | Smart Import (AI) | Student Management, Student List (Import) | AI suggests column matches; a person confirms |
| Part 2 S09 | UDISE Import | Student Management, Student List (Import) | |
| Part 2 S09 | UDISE+ Export | Reports & Analytics, Government Reports | |
| Part 2 S09 | Student Promotion | Student Management, Promotion | |
| Part 2 S09 | Bulk Field Update, Bulk Profile Photos | Student Management, Student List | |
| Part 2 S09 | Credentials Management (share logins by CSV, WhatsApp, SMS, email) | Student Management, Student List (bulk action); staff logins in Settings, Users & Permissions | |
| Part 2 S09 | Upcoming Birthdays | Dashboard, Today & Upcoming | Birthday wishes sent automatically (Message Settings) |
| Part 2 S12 | Export Student List (choose fields, CSV or PDF) | Student Management, Student List | |
| Part 2 S12 to S16 | Student ID Cards: class picker, preview, print batch (max 50), ID Card Settings (fields, school info, colour, size, year, valid until, cards per row, QR code, library barcode) | Student Management, Certificates & ID Cards; design in Settings, Document Designs | |
| Part 2 S12 | Employee ID Cards (by designation) | Staff & HR Management, Documents & ID Cards | |
| Part 2 S18 | Time Table hub | Academic Management, Time Table | |
| Part 2 S18 | View Time Table, Update Time Table | Academic Management, Time Table | |
| Part 2 S18 | Substitute Teachers | Academic Management, Substitutions | |
| Part 2 S18 | Schoolites Genie (single class, whole school) automatic timetable | Academic Management, Time Table ("Make automatically") | Result shown as a draft to check before publishing |
| Part 2 S18 | Import Complete Timetable (Excel grids) | Academic Management, Time Table | |
| Part 2 S18 | School Overview (all timetables, workload, clashes) | Academic Management, Time Table | |
| Part 2 S18 | Teacher Preferences (max periods, rest, availability), Subject Conditions (block a subject from a period) | Academic Management, Academic Settings | |
| Part 2 S19 to S21 | Select Class, Edit Class Schedule grid, period editor (time, teacher, subject, show all teachers, lunch, whole week) | Academic Management, Time Table | Teacher list narrows to assigned teachers, as before |
| Part 2 S22, S23 | Class Timetable view, Print Class Timetables (one or many classes) | Academic Management, Time Table | Printing uses the browser |
| Part 2 S24 | Attendance hub (Student Attendance, Employee Attendance, Biometric Settings, Settings) | Attendance Management | |
| Part 2 S25, S26 | Biometric Devices list and Add Biometric Device (name, serial, location, face / RFID / fingerprint / iris, allowed users, device key, ZKTeco guide) | Attendance Management, Devices & QR | |
| Part 2 S28, S32 | Attendance Settings tabs Punch Methods (geo-fence, QR, QR rotation), Display, Late Rules, Notifications | Attendance Management, Attendance Settings and Devices & QR | |
| Part 2 S29 to S31 | Attendance QR Poster (themes, live preview, print) | Attendance Management, Devices & QR | |
| Part 2 S33 | Academic Calendar (Add Event, Vacation, Remove, allow attendance on date, weekend / holiday / event legend, month view) | Events & Calendar, School Calendar | Holiday switches attendance off automatically |
| Part 2 S34, Part 3 P3-02 | Messages hub (Compose New, Message Inbox, Sent Box, Message Logs) | Communication, Send Message and Message History; top bar, Messages | Three lists become one history |
| Part 2 S35, Part 3 P3-01 | Send Message (recipient groups, class, message type In-App / SMS / Email / WhatsApp, template, locked approved template, variables, credit calculation, schedule for later, help tips) | Communication, Send Message; templates in Message Templates | Cost and count shown before sending, as before |
| Part 2 S37, Part 3 P3-03 | Day Book (date, class, income, expense, net, Full / Partial / Daycare payments, CSV / Excel / PDF) | Finance Management, Day Book | Fills itself; expenses and salary also listed |
| Part 3 P3-04 | Learning Management hub | Split, see B1 | |
| Part 3 P3-04 | LMS Teacher Assignments | Academic Management, Teacher Allocation | |
| Part 3 P3-04 | LMS Syllabus Plans, Daily Log, Delay Dashboard | Academic Management, Syllabus & Lesson Plans | |
| Part 3 P3-04 | LMS Quizzes | Homework & Learning, Quizzes | |
| Part 3 P3-04 to P3-07 | LMS Discussion Forums and Create Discussion Board (title, type, description, icon, colour, roles, visible, active) | Homework & Learning, Discussions | Technical fields such as icon class and linked ID are hidden |
| Part 3 P3-04 | LMS Learning Paths | Homework & Learning, Study Material | |
| Part 3 P3-04 | LMS Certificates | Homework & Learning, Learning Progress | |
| Part 3 P3-08 | Salary Management hub (Active Structures, Payrolls Generated, Pending Approval, Current Month Net; Payroll, Salary Structures, My Salary Slips, Reports, Settings) | Salary Management (Generate Salary, Salary Structures, Salary Slips, Salary History, Salary Settings) | Pending approval goes to Approvals |
| Part 3 P3-09 | Leave Management hub: Applications, My Leaves, Apply Leave, My Balance, Dashboard, Leave Types, Balances, Policies, Settings | Staff & HR Management, Staff Leave and HR Settings; Attendance Management, Student Leave; top bar, Approvals | |
| Part 3 P3-10 | Homework hub (Add Homework, Current Homeworks, Homework History, Settings) | Homework & Learning, Homework and Homework Settings | |
| Part 3 P3-11, P3-12 | Add Homework: Select Class, error "no students in the selected class" | Homework & Learning, Homework | Classes with no students are not offered |
| Part 3 P3-14 | Current Homeworks (filters, cards with assigned and submitted counts) | Homework & Learning, Homework | |
| Part 3 P3-15 to P3-19 | Homework group page, single student view, grade (score, grade, feedback), discussion, Update Status (Pending, Complete, Incorrect, Cancelled), bulk update | Homework & Learning, Submissions & Grading | Score is out of each homework's own maximum marks |
| Part 3 P3-20, P3-23, P3-28 | Test & Exams hub (10 cards) | Examination & Results | |
| Part 3 P3-20 | Results, Final Result | Examination & Results, Results | |
| Part 3 P3-20 | Results Overview | Examination & Results, Exam Analysis | |
| Part 3 P3-20 | Co-Scholastic, Mark Categories, Exam Types, Exam Settings | Examination & Results, Exam Settings | |
| Part 3 P3-21, P3-22 | Admit Cards list (filters, Ongoing tag, Preview, Download, Single Student) and preview (batch print, subject table, instructions, signatures) | Examination & Results, Admit Cards | |
| Part 3 P3-24 to P3-27 | Datesheets list; Add Date Sheet (single or multiple classes); form with title, dates, exam type, exam pattern (Percentage, Grading, CGPA), bulk apply, subject schedule, "Before you save" rules | Examination & Results, Datesheet | Start time and duration entered; end time shown |
| Part 3 P3-29 to P3-31 | Grade Configuration (grade bands, passing, presets CBSE 9-Point / ICSE / State Board, scale preview, Add Grade) | Examination & Results, Exam Settings | |
| Part 3 P3-32 | Transport hub (Modern / Classic toggle; Vehicles, Routes, Stops & Fees, Students, Fee Coverage, Trip Scheduler, Live Tracking, Reports, Vendors) | Transport Management | One view only |
| Part 3 P3-32 | Fee Coverage | Transport Management, Student Transport | Fee added automatically when a stop is given |
| Part 3 P3-32 | Vendors | Transport Management, Vehicles & Drivers | |
| Part 3 P3-32 | Trip Scheduler | Transport Management, Trips | |
| Part 3 P3-33 | Live Tracking (trip cards, Track Live, updates every 30 seconds) | Transport Management, Live Tracking | |
| Part 4 S16 | Super Admin, CRM / Leads, WhatsApp lead chat (AI auto-reply pause / resume, lead status, assigned to, campaign, next follow-up, recent activity) | Admission Management, Enquiries (the school's own enquiries); the company's own sales CRM stays in the Super Admin console | Not included as a school screen |
| Part 4 S16 | Super Admin menu: Schools, School Settings, Onboarding Campaigns, Admins, Employees, Students, Parent, App Logs, Support Tickets, Billing | Not included (Super Admin console, separate product) | |

### B3. Details the recording showed that the feature list did not have

| Detail seen | New home |
|---|---|
| Permission ticks: give discount, waive late fee, change invoice date, manage class fee structure, assign or unassign fees, edit student fee structure, delete own payments, view Day Book only | Settings, Users & Permissions (role choices); deleting replaced by cancel with reason |
| Permission ticks for Library, LMS (quizzes, essay grading, delete quizzes, forums, moderation, learning paths, certificates), Salary, Front Office, Hostel, Inventory, Leave, Daily Activities, Employee Tasks, WhatsApp Connect | Settings, Users & Permissions |
| Inventory permission "Issue books and uniforms to students at the store counter" | Inventory Management, Issue Stock (charge goes to the student's fees) |
| Front Office permission groups "Visitors, phone logs, postal and complaints" | Front Office, Visitors, Enquiries & Calls, Postal & Deliveries; complaints in Communication, Feedback & Queries |
| Hostel permission "requests and complaints" | Hostel Management, Outing & Visitors; complaints in Communication, Feedback & Queries |
| Daily Activities "meals, play, nap" (and in a support chat, water intake) | Events & Calendar, Daily Activities |
| Classes named B.A, B.Sc and time-slot batches such as "7:00 to 8:00" | Academic Management, Classes & Sections (any class name allowed) |
| Fee frequencies Yearly, Monthly, Quarterly; installments submitted out of total; old dues | Fee Management, Fee Structure and Student Fee Ledger (opening balance) |
| Receipt number formats (SS/..., PP/... for partial) | Fee Management, Fee Settings (receipt numbering) |
| Partial payment card fields: balance, reference, slip, recorded, settled | Fee Management, Student Fee Ledger |
| Gateway routing "by class, by class group, or by fee type" | Fee Management, Fee Settings |
| Message credits: users to notify, credit cost, available credits | Communication, Send Message; balance in Settings, SMS, WhatsApp & Email |
| Approved WhatsApp templates locked, with variable chips | Communication, Message Templates |
| In-App message channel | Communication, Send Message (app notification) |
| "HOW TO USE" help popovers | Every screen (plain help text next to fields) |
| Hub card favourite, hide and help icons; sidebar star | Top bar, Search (pinned pages); hide replaced by role-based menu |
| Validation messages ("Full Name cannot be blank", "no students in the selected class") | Every screen (clear messages that say how to fix it) |
| Calendar "Allow attendance on this date" and "Advanced features" toggles | Events & Calendar, School Calendar |
| Salary hub tiles (active structures, payrolls generated, pending approval, current month net) | Salary Management, Generate Salary (summary at top) |
| Datesheet rules: empty date skips subject; per-subject pattern; mark categories after save; locked after results | Examination & Results, Datesheet (same rules) |
| Admit card Theory / Practical / Internal Assessment split and invigilator column | Examination & Results, Admit Cards |
| Grade bands with points and remarks, passing flag | Examination & Results, Exam Settings |
| Live tracking driver and start time on each trip card | Transport Management, Live Tracking |

### B4. Outside apps in the recording (nothing to place)

| Seen | Note |
|---|---|
| Google Play listing of the old app | Outside app |
| Google Meet on PC and phone | Outside app, the recording itself |
| Easebuzz website | Outside website, looked up while adding a gateway |
| Windows Calculator | Outside app |
| WhatsApp Web (WhatsApp Business) | Outside app. Its job inside the school moves to Communication, WhatsApp Inbox. Support chats were read as information only. |
| Phone notifications | Personal, not recorded |

## Part C: how the conflicts between sources were settled

| Conflict | Decision in the plan |
|---|---|
| Payment gateway list differs | All providers kept in Settings, Payment Gateways; which to connect first is Question 1 |
| Old dashboard showed settings panels | Dashboard shows today's work; settings moved to Settings |
| CRM sat in the Super Admin console | School enquiries in Admission Management, Enquiries |
| Who turns modules on | School switches them in Settings, Modules On/Off; what a plan includes stays in the Super Admin console |
| Menu size (33, 24, 15 or 7 items) | The owner's 20 items |
| "Events & Results" vs "Examination & Results"; "Feedback / Query" vs "Complaints" | Examination & Results; Feedback & Queries |
| Datesheet end time vs duration | Enter start time and duration; end time shown |
| Homework out of 100 vs own maximum | Each homework's own maximum marks (100 by default) |
| WhatsApp Web outside vs built in | Built in as Communication, WhatsApp Inbox (optional) |
| Modern / Classic transport view | One simple view |
| Different status lists | Widest list, editable in each module's settings |
| Group, school, campus levels | Group, school, campus; school switcher in the top bar |
| Release phasing differs | Replaced by the build order in the plan, section 7 |
| Delete fee payment (old app) vs reversal only (documents) | Cancel with reason; Question 2 asks the owner to confirm |
| Excluded modules | Listed under Not included |
