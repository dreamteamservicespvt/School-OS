# 02 Admission Management

Build order: 6th (Stage 2). Needs Settings, Academic Management (classes, sections, seats), Student Management (the student record it creates) and Communication (messages to parents).

## 1. Purpose

Where the school handles every new admission, from the first enquiry to the day the child joins.

Used by: the Admission Counsellor and Office Staff role templates, when the school switches them on (enquiries, applications, documents), Receptionist / Front Office (new enquiries only), the Principal (decisions), and the Accountant (application fee, through Fee Management).

## 2. Pages

### Admission Dashboard

**Purpose:** how many enquiries, applications and admissions are at each step this year.

**What the person sees**

- **Funnel:** counts at each stage set in Admission Settings, for the chosen admission year (default: the year admissions are open for, inferred). Default stages: Enquiry, Application, Documents, Test, Interview, Decision, Admitted (test and interview only if switched on).
- Each stage shows its count, the change since last week (inferred), and the oldest item's date.
- **Pipeline board:** cards in columns by stage (enquiries, applications, documents, tests, interviews, approvals, conversion). Drag a card to the next column to move it on, subject to the same checks as the buttons (inferred: drag to move).
- Today's follow-ups: overdue (red), due today, due tomorrow.
- **Group view (optional, school groups):** central admissions across schools, with the same funnel per school and in total.

**Filters:** admission year, class applied for, source, owner, campus.

**Actions:** tap a count to open the list behind it; Add enquiry; New application.

**Form fields:** none.

### Enquiries

**Purpose:** every enquiry from walk-in, phone, WhatsApp or referral, with follow-up dates, notes and the staff member in charge.

**What the person sees**

- **All enquiries list.** Columns: child's name, parent's name, phone, class wanted, source, status, owner, next follow-up (red when overdue), campaign (optional), created date.
- Quick filters: My enquiries, Follow-up today, Overdue, New this week, Lost. More filters: source, status, class, owner, campaign, date range.
- **WhatsApp enquiries tab (optional):** enquiries that arrived on WhatsApp, with the last message preview.
- **Enquiry panel** (opens beside the list on a computer, full screen on a phone). One place with: name, phone, status, owner, campaign, next follow-up, the recent conversation and recent activity. Below: the full activity log (notes, calls, follow-ups, reassignment, status changes, messages), never deleted.
- **WhatsApp chat (optional):** message history with this enquiry and a box to send a reply. When AI auto-reply is on, a strip shows "AI auto-reply on" with **Pause** and **Resume** for this enquiry.

**Actions**

- Add enquiry. Edit enquiry.
- **Import enquiries:** bring in open enquiries from the old software or a spreadsheet with the shared importer (P10): child's name, parent's name, phone, class wanted, source, status, owner, next follow-up and notes. The duplicate check runs on every row. This is one step of workflow 15, "Switching to School OS" (see 02-workflows.md) (decided 9 October 2026).
- Change status (from the school's status list).
- Change source: only for people with the admission permission, and only with a reason. The first recorded source stays in the activity log and in the source reports (decided 9 October 2026).
- Assign owner; reassign (the old and new owner and the reason are kept in the history).
- Set next follow-up (date, time, owner, next action). The owner gets a reminder at that time.
- Add note. Log a call (incoming or outgoing, outcome, note).
- Send a message (WhatsApp, SMS or email) using a template; it is saved in this enquiry's communication history.
- Convert to application: opens a new application with everything already known filled in.
- Close as lost: needs a reason from the school's list of loss reasons.
- **Campaigns (optional):** select enquiries (for example class 1 enquiries not yet applied) and "Run campaign": a message sent through Communication with the normal preview, count and cost. Each enquiry then shows the campaign name.

**Form fields: Add enquiry**

| Field | Required | Default | Notes |
|---|---|---|---|
| Child's name | Yes | | |
| Parent's name | Yes | | |
| Phone | Yes | +91 | 10 digits for India (inferred). Duplicate check on leaving the field. |
| Class wanted | No | | From the classes of the admission year |
| Source | Yes | Walk-in (Front Office), WhatsApp (WhatsApp enquiries), Phone (call log) | School's source list: walk-in, phone, website, WhatsApp, campaign, referral, plus their own. Kept as first recorded: changing it later needs the admission permission and a reason, and the first value stays in the activity log (decided 9 October 2026) |
| Owner | Yes | Set by "Who gets new enquiries" in Admission Settings: the default owner, the next staff member in turn, or the staff member for the class wanted (decided 9 October 2026); otherwise the person adding it (inferred) | Can still be changed by hand; every change is kept in the history |
| Next follow-up | Yes | Next working day, 11:00 AM (inferred) | Date and time |
| More details | No | | Email, child's date of birth, current school, referred by, notes |

Duplicate warning: if the phone or email matches an open enquiry, application or current parent, a box shows the match ("This phone belongs to Sunita Rao, parent of Arjun, 4 B") with **Open existing**, **Add as sibling enquiry** and **Cancel** (inferred: the three choices).

**Status list** (school can change it in Admission Settings; default list, inferred): New, Contacted, Visit scheduled, Visited, Application given, Applied, Admitted, Lost. "Applied" and "Admitted" are set by the system when an application is made or the admission is confirmed.

### Applications

**Purpose:** admission forms filled at the counter or online, with previous school, marks and application fee.

**What the person sees**

- List columns: application number, child's name, class applied for, parent's phone, stage, documents (for example 4 of 6), test or interview date, fee paid (Yes / No / Not needed), submitted date.
- Filters: stage, class, admission year, documents complete or not, fee paid or not.

**Actions**

- New application (at the counter). Opened from an enquiry, it is filled from the enquiry.
- **Online application (optional):** a link the school shares by WhatsApp, SMS or email. Parents fill the form on their phone without a login; it arrives here with stage "Submitted online". The link can be shared per class or for all classes (inferred: the link mechanism; there is no school website or parent login).
- Review: mark "Reviewed" with a note, or send back to the parent for missing details by message.
- Collect application fee (optional): opens Fee Management, Collect Fee for this applicant with the application fee head. The receipt is made only after the payment is confirmed.
- Move to Documents, Test & Interview or Decision.
- Withdraw (parent no longer interested), with a reason.

**Form fields: New application** (fields already known from the enquiry are filled and not asked again)

| Field | Required | Default | Notes |
|---|---|---|---|
| Application number | Auto | Next number in the school's format | Unique, never reused |
| Admission year | Yes | The year admissions are open for | |
| Class applied for | Yes | From the enquiry | Shows seats left in that class |
| Child's full name | Yes | From the enquiry | |
| Date of birth | Yes | | Age check against the class age rule, if the school sets one (inferred) |
| Gender | Yes | | |
| Father's, mother's or guardian's name | At least one | From the enquiry | |
| Parent's phone | Yes | From the enquiry | |
| Address | Yes | | |
| Previous school, last class, marks or % | No (Yes for class 2 and above, inferred) | | Previous marks as % or grade |
| Preferences | No | | For example second language, transport needed and stop, hostel needed (when those modules are on) |
| Sibling in this school | No | Detected automatically from the parent's phone | Links the sibling for sibling priority |
| Category | No | | Only when quota or category seats are on |
| More details | No | | Email, occupation, Aadhaar-related fields (restricted), religion, mother tongue and any extra fields the school adds in Settings, Forms & Approvals |
| Data consent (DPDP Act 2023) | Yes | Not given | The guardian agrees to the school's consent text for the child's data. At the counter or online, a one-time code goes to the guardian's mobile to confirm it. The Consent Record keeps the version of the text agreed to (decided 9 October 2026) |
| Photo consent | No | Not given | A separate consent type: may the child's photo be used in the gallery and on social media. Same one-time code (decided 9 October 2026) |

Consent texts and their versions are kept in Settings, Data Backup & Security, Privacy (inferred: where they live). An application cannot be confirmed as an admission until data consent is given (inferred).

### Documents & Verification

**Purpose:** birth certificate, TC, marksheets and other papers for each applicant, checked against a list per class.

**What the person sees**

- List of applicants with a document progress bar ("4 of 6 verified") and the missing papers.
- Per applicant: the required-document checklist for the class applied for (from Admission Settings), each with status: **Not received**, **Received**, **Verified**, **Rejected** (needs a new copy) (inferred: statuses).
- Document types: birth certificate, transfer certificate, previous marksheets, Aadhaar-related documents, address proof, parent ID, photos, other certificates.

**Actions**

- Upload a document (file or phone camera; PDF, JPG or PNG, up to 5 MB each, inferred limit). Preview in the browser.
- Verify: marks the document Verified with the verifier's name and time.
- Reject: needs a reason ("Photo not clear"); the parent can be messaged with the reason.
- Mark "Original seen at counter" (inferred).
- Send a reminder to the parent listing the missing papers.

**Form fields: Upload document**

| Field | Required | Default | Notes |
|---|---|---|---|
| Document type | Yes | The next missing type in the checklist | |
| File | Yes | | Camera or file |
| Note | No | | |

### Test & Interview

*Optional page: shown only when the school switches on entrance tests or interviews in Admission Settings.*

**Purpose:** entrance test and interview dates, scores and remarks.

**What the person sees**

- Tabs: Tests, Interviews.
- Test list: date, time, venue, class, applicants booked, scores entered.
- Interview list: slot, interviewer, applicant, outcome.

**Actions**

- Schedule a test for one or many applicants (date, time, venue, maximum marks). Parents get a message with the details.
- Record test score and remarks.
- Schedule an interview: pick a slot and an interviewer. An interviewer cannot be booked twice for the same time (inferred, same rule as Front Office appointments).
- Record interview notes and outcome (Recommended, Not recommended, Hold, inferred list). Every change of outcome is kept in the decision history.

**Form fields: Schedule test**

| Field | Required | Default | Notes |
|---|---|---|---|
| Applicants | Yes | Those selected on the list | |
| Date and time | Yes | | |
| Venue | No | | |
| Maximum marks | No | 100 (inferred) | |

**Form fields: Schedule interview**

| Field | Required | Default | Notes |
|---|---|---|---|
| Applicant | Yes | | |
| Interviewer | Yes | Principal (inferred) | Staff picker, shows free slots |
| Slot | Yes | Next free slot | 15-minute slots by default (inferred) |

### Admission Decision

**Purpose:** approve or reject with remarks, keep a waiting list, give the offer letter and confirm the admission.

**What the person sees**

- Applications ready for a decision, with everything needed on one screen: documents status, test score, interview outcome, sibling in school, category, seats left in the class.
- Waiting list (optional) per class, in priority order, with the reason for each position (sibling, category, test score, date applied).

**Actions**

- **Approve** or **Reject**, each with remarks. Admission decisions also appear in Approvals for the people who decide them (rules in Settings, Forms & Approvals).
- **Waiting list (optional):** add to the waiting list; the system ranks by the school's rules (sibling priority, quota, score, date). Moving someone up or down by hand needs a reason and is written to the history.
- **Offer letter (optional):** generate from the offer-letter design (Settings, Document Designs), send by WhatsApp or email, and record when it was sent and accepted.
- **Confirm admission:** the final step. If the school's stages include a payment step, the admission fee must be paid first (inferred: tied to the stage list).
- On confirmation the applicant becomes a student automatically (automation A2), once per application:
  - Student record created with an automatic admission number (format from Student Settings).
  - Class and section allocated: the section with most free seats, unless the person picks one (inferred rule). Roll number: next free number in the section (inferred).
  - Parent records created, or linked to existing parents when the phone matches (siblings). The consent given on the application moves to each guardian's Consent Records.
  - Parent Link created for each guardian (when the school has Parent Link on; the page is owned by Communication) and sent with the welcome message, so the parent can see fees due, pay and download receipts from the first day (decided 9 October 2026).
  - Fee plan set up from the class Fee Structure for the year, including any approved concession.
  - Student login created (optional, schools giving students logins).
  - Transport assigned (optional, when Transport is on and a stop was chosen in preferences); this triggers A12.
  - ID card queued for printing in Certificates & ID Cards.
  - Parent gets a welcome message with the admission number (inferred: uses the "admission confirmed" template).
- The result screen lists everything created, each with a link, and "Undo admission" for 10 minutes if nothing else has happened to the student yet (no payment, no attendance) (inferred).

**Form fields: Confirm admission**

| Field | Required | Default | Notes |
|---|---|---|---|
| Class | Yes | Class applied for | |
| Section | Yes | Section with most free seats (inferred) | Shows seats left per section |
| Admission date | Yes | Today | |
| Fee plan | Yes | Class fee plan for the year | Change only with the fee-plan exception permission and a reason |
| Concession | No | None | Sends to Approvals if above the limit |
| Transport stop | No | From preferences | Only when Transport is on |

### Admission Reports

**Purpose:** where enquiries come from, how many join, and applications still pending.

See section 7 for the reports. The page shows them as cards with the latest numbers; each opens the full report.

### Admission Settings

**Purpose:** the rules for admissions in this school. See section 6.

## 3. All features

58 features are mapped to this module: 42 Core and 16 Optional. Tick each one when it is built and tested.

### Admission Dashboard (3)

- [ ] Enquiry-to-admission funnel with stage counts and dates (Core)
- [ ] Lead pipeline board from enquiry to admission (leads, applications, documents, tests, interviews, approvals, conversion) (Core)
- [ ] Central admissions for the group (Optional: school groups) · group view

### Enquiries (22)

- [ ] Add a lead / enquiry: child, parent, contact details (Core)
- [ ] Lead sources: walk-in, phone, website, WhatsApp, campaign, referral, plus school-defined sources (Core)
- [ ] Duplicate phone / email warning when adding a lead (Core)
- [ ] All-leads list (Core)
- [ ] Lead status, from a list of statuses the school manages (Core)
- [ ] Assign a lead to an Admission Counsellor or other staff owner (Core)
- [ ] Reassign a lead, keeping reassignment history (Core)
- [ ] Next follow-up (date, time, owner, next action); overdue follow-ups highlighted (Core)
- [ ] Follow-up reminders to the lead owner (Core)
- [ ] Notes on a lead (Core)
- [ ] Call history on a lead (Core)
- [ ] Activity log: add activity, recent activity, full history kept (Core)
- [ ] Communication history with the lead (Core)
- [ ] Unified lead panel: name, phone, status, owner, campaign, follow-up, recent conversation and activity (Core)
- [ ] Close a lead with a reason for loss (Core)
- [ ] Enquiry source kept as first recorded; a later change needs the admission permission and a reason, and the first value stays in the activity log (Core) (decided 9 October 2026)
- [ ] Import enquiries from the old software or a spreadsheet, with duplicate check (Core) · workflow 15, Switching to School OS
- [ ] WhatsApp leads list (enquiries arriving on WhatsApp) (Optional: schools connecting WhatsApp Business)
- [ ] WhatsApp chat with a lead: message history, composer, send (Optional: schools connecting WhatsApp Business)
- [ ] AI auto-reply to leads, with pause / resume (Optional: schools using AI replies) · switched on in Admission Settings
- [ ] Run campaigns to leads (Optional: schools running admission campaigns)
- [ ] Campaign shown on each lead (Optional: schools running admission campaigns)

### Applications (8)

- [ ] Application form filled at the school counter (Core)
- [ ] Online application and registration (Optional: schools taking applications online)
- [ ] Unique application number (Core)
- [ ] Application details: student, parents, class applied for, preferences (Core)
- [ ] Previous school and previous marks on the application (Core)
- [ ] Application fee, with receipt only after confirmed payment (Optional: schools charging an application fee)
- [ ] Application review (Core)
- [ ] Guardian data consent (DPDP) on the application form, confirmed by a one-time code, with photo consent as a separate consent type (Core)

### Documents & Verification (4)

- [ ] Upload admission documents (Core)
- [ ] Required-document checklist per class, with a status for each document (Core) · list per class is kept in Admission Settings
- [ ] Document types: birth certificate, transfer certificate, previous marksheets, Aadhaar-related fields, address proof, parent ID, photos, other certificates (Core)
- [ ] Document verification step (Core)

### Test & Interview (2)

- [ ] Schedule an entrance test or assessment; record score and remarks (Optional: schools with entrance tests)
- [ ] Schedule an interview (slot, interviewer); record notes and outcome, keeping decision history (Optional: schools that interview)

### Admission Decision (13)

- [ ] Approve or reject an application with remarks (Core)
- [ ] Waiting list with priority ranking; manual rank changes audited (Optional: oversubscribed schools)
- [ ] Offer letter (Optional: schools issuing offer letters)
- [ ] Admission confirmation (Core)
- [ ] Convert an approved applicant into a student without re-typing (once per application) (Core) · automatic, see 'Admission approved'
- [ ] Automatic student ID / admission number on conversion (Core) · automatic
- [ ] Class, section and roll number allocated on conversion (Core) · automatic
- [ ] Fee plan set up on conversion (Core) · automatic
- [ ] Parent record created and linked on conversion (Core) · automatic
- [ ] Parent Link created for each parent on conversion (Core) · automatic when Parent Link is on
- [ ] Student login created on conversion (Optional: schools giving students logins)
- [ ] Transport assigned on conversion (Optional: schools running buses) · automatic when Transport is on
- [ ] ID card issued at the end of admission (Core)

### Admission Reports (2)

- [ ] Admission and CRM reports: lead pipeline, sources, conversion, pending applications (Core)
- [ ] Conversion rate and average processing time (Core)

### Admission Settings (4)

- [ ] Admission stages and approvals set per school (e.g. application, interview, payment, admission) (Core)
- [ ] Sibling priority rule (Optional: schools giving sibling priority)
- [ ] Quota / category seat rules (Optional: schools with quota or category rules)
- [ ] Who gets new enquiries: one default owner, in turn among chosen staff, or by class wanted (Core) (decided 9 October 2026)

## 4. Connections

**Receives**

| From | What |
|---|---|
| 16 Front Office | Walk-in and phone enquiries (A3): appear in Enquiries with an owner and a follow-up reminder |
| 11 Communication | Incoming WhatsApp messages for WhatsApp enquiries; message delivery status |
| 04 Academic | Classes, sections and seats per section for the admission year |
| 06 Fee Management | Application fee and admission fee payments and receipts; fee structure for the fee plan |
| 03 Student Management | Existing students and parents (sibling and duplicate checks); admission number format |
| 20 Settings | Approval rules, extra form fields, document designs (offer letter), WhatsApp connection, AI on or off |

**Sends**

| To | What |
|---|---|
| 03 Student Management | New Student and Guardian records, class history, admission documents, consent given on the application (A2) |
| 06 Fee Management | Student Fee Due rows from the class fee plan; concession requests |
| 12 Transport (optional) | Transport Assignment for the chosen stop (triggers A12) |
| 11 Communication | Follow-up and campaign messages, test and interview details, offer letters, welcome message; new guardians for Parent Link (one link per guardian) |
| Top bar Approvals | Admission decisions, waiting-list overrides, concessions at admission |
| 01 Dashboard | Pending admissions count |
| Notifications | Follow-up reminders to the enquiry owner; "new enquiry assigned to you" |

**Automations:** owns **A2 Admission approved**. Receives **A3 Enquiry at the front desk**. Triggers **A12** (when a stop is given) and sends the parent message through Communication.

## 5. Rules and mistake-proofing

| Rule | How it is prevented | What the person is told | How they recover |
|---|---|---|---|
| Same family entered twice | Duplicate phone and email check while typing | "This phone already has an open enquiry for Arjun (class 2). Open it?" | Open existing, or save as a sibling enquiry |
| Follow-up forgotten | Next follow-up is required on every open enquiry; overdue ones turn red and remind the owner | "3 follow-ups overdue" on the Admission Dashboard | Set a new follow-up or close as lost |
| Enquiry lost with no reason | Close as lost needs a reason | "Choose why this enquiry was lost" | Reopen the enquiry later (inferred) |
| Owner changed silently | Reassignment always kept in the history | History line "Reassigned from Meena to Ravi" | Reassign back |
| Source changed to make a campaign look better | Source is kept as first recorded; changing it needs the admission permission and a reason; the first value stays in the activity log and source reports count it (decided 9 October 2026) | "Give a reason for changing the source from Walk-in to Campaign" | Change it back, with a reason |
| One person gets every new enquiry in admission season | "Who gets new enquiries" can share them in turn or by class wanted (decided 9 October 2026) | The owner is shown on each new enquiry | Reassign by hand; the history keeps it |
| Applying to a full class | Seats left shown; approval blocked when no seat is free unless the person has "admit over capacity" permission (inferred) | "Class 1 A and B are full (40 of 40). Put on the waiting list or choose another section?" | Waiting list, or increase seats in Classes & Sections |
| Missing papers at decision | Decision screen shows missing required documents; confirm is blocked while a required document is not Verified, unless the school allows "admit with papers pending" (inferred) | "Birth certificate not verified" | Verify or upload; or record an exception with a reason |
| Application fee receipt before payment | Receipt only after confirmed payment (A8 rules for online) | "Waiting for payment confirmation" | Retry payment or collect at the counter |
| Converted twice | Conversion runs once per application; a second attempt opens the existing student (inferred) | "This application is already admitted as Arjun Rao, admission no. 2026/0145" | None needed |
| Wrong conversion | Undo admission within 10 minutes if nothing else is linked (inferred); later, use Leaving & Alumni (withdrawal) | "Undo admission? The student, the new parent records, their Parent Links and the fees created will be removed." | Undo, or withdraw the student |
| Waiting-list order changed by hand | Reason required; written to history | "Give a reason for moving Ananya above Kiran" | Move back |
| AI auto-reply says something wrong | AI replies only with facts stored in Admission Settings (dates, fees, documents, contact) and hands over to a person when unsure; replies are labelled as automatic; staff can pause per enquiry | "AI auto-reply paused for this enquiry" | Pause, reply in person |
| Restricted fields | Aadhaar-related fields visible only to allowed roles (see 00-global.md, section 5) | Field is hidden | Ask an admin |

## 6. Settings

The **Admission Settings** page holds:

- **Admission stages and approvals** set per school, in order (for example application, interview, payment, admission). Each stage can be on or off and can need an approval.
- **Enquiry statuses** list (add, rename, reorder, archive).
- **Enquiry sources** list (walk-in, phone, website, WhatsApp, campaign, referral, plus the school's own).
- **Loss reasons** list (inferred).
- **Who gets new enquiries** (decided 9 October 2026): one of
  - **One default owner** (today's rule; default),
  - **In turn among chosen staff** (each new enquiry goes to the next person on the list; staff on approved leave that day are skipped, inferred),
  - **By class wanted** (a staff member for each class; enquiries with no class wanted go to the default owner).
  The owner can still be changed by hand on any enquiry, and the history keeps every change.
- **Papers needed per class:** the required-document checklist for each class, marking which are required and which are optional.
- **Seat rules:** seats per class come from Classes & Sections; here the school sets whether admissions may exceed seats (inferred).
- **Sibling priority rule** (optional): on or off, and how much it counts in waiting-list ranking.
- **Quota / category seat rules** (optional): categories and the share of seats for each.
- **Entrance test and interview** on or off (shows the Test & Interview page).
- **Online application** on or off, and which classes take online applications.
- **Application fee** on or off and amount per class (the fee head lives in Fee Structure).
- **Application number format** (for example APP/2026/0001) (inferred).
- **WhatsApp auto-reply:** on or off, office hours, and the facts the AI may use in replies (inferred: the facts list).
- Approval limits are shown here but stored in Settings, Forms & Approvals.

## 7. Reports

- **Lead pipeline:** enquiries at each stage, by class and owner.
- **Sources:** enquiries and admissions by source, and the conversion rate of each source.
- **Conversion:** enquiry to application, application to admission, overall conversion rate, by class and month.
- **Average processing time:** days from enquiry to admission and from application to decision.
- **Pending applications:** applications not yet decided, with age in days and what is missing.
- **Follow-up report:** follow-ups done, overdue, by owner (inferred: part of the CRM reports).
- **Loss reasons:** lost enquiries by reason (inferred: part of the CRM reports).

All follow P8 (export) and appear in Reports & Analytics.

## 8. Records used

| Record | Creates | Reads | Updates |
|---|---|---|---|
| Enquiry | Yes | Yes | Yes (status, owner, follow-up, lost) |
| Application | Yes | Yes | Yes (stage, decision) |
| Student | Yes (on conversion) | Yes (sibling and duplicate checks) | |
| Guardian | Yes (on conversion, or links existing) | Yes | Yes (adds the new child link) |
| User Login | Yes (optional student login) | | |
| Student Fee Due | Yes (fee plan on conversion) | | |
| Fee Structure, Fee Head, Installment | | Yes | |
| Concession | Yes (request at admission) | | |
| Payment, Receipt | | Yes (application and admission fee status) | |
| Transport Assignment | Yes (optional) | | |
| Class, Section, Academic Year | | Yes | |
| Message, Template | Yes (messages) | Yes | |
| Approval | Yes | Yes | |
| Notification, Task | Yes (follow-up reminders) | | |
| Calendar Entry | Yes (admission test dates, type "admission test") | | |
| Consent Record | Yes (data and photo consent from the application) | Yes | |
| Audit Log Entry | Yes | | |

Other records (inferred): **Enquiry Activity** (note, call, follow-up, reassignment, status change), **Campaign**, **Admission Document** (type, file, status, verified by), **Admission Test** and **Interview Slot** (score, outcome, history), **Waiting List Entry** (rank, reason, overrides), **Offer Letter**.

## 9. Done when

1. A receptionist adds a walk-in enquiry in under 30 seconds with 5 fields, and it appears in Enquiries with an owner and a follow-up reminder.
2. Typing a phone number that already belongs to a current parent shows the duplicate box before saving.
3. An overdue follow-up shows red in the list and sends a reminder to its owner.
4. Converting an enquiry to an application fills every known field; nothing is typed twice.
5. A class's required-document checklist appears on each applicant of that class, and Confirm admission is blocked while a required document is not Verified.
6. Confirming an admission creates the student with admission number, class, section, roll number, linked parents (reusing an existing parent for a sibling), fee plan and a queued ID card, exactly once.
7. Rejecting an application without remarks is not possible.
8. Moving a waiting-list applicant by hand asks for a reason and the change appears in the history.
9. The conversion report shows the same number of admissions as students created from applications this year.
10. With Test & Interview switched off, the page and its stage are hidden everywhere.
11. A guardian gives data consent on the application with a one-time code; after confirmation the Consent Record shows the text version agreed to, and the guardian receives a working Parent Link.
12. Importing a spreadsheet of 200 old enquiries adds them with owners and follow-ups, and rows matching an existing phone are flagged, not added twice.

## 10. Open questions

- How should parents reach the online application form, since there is no school website or parent login in scope? Assumed: a shareable link sent by WhatsApp, SMS or email. The parent's phone is checked with a one-time code when they give data consent on the form (decided 9 October 2026, D8a). Parent Link starts only after admission, so applicants do not get one.
- Should the AI auto-reply answer only fixed facts entered in Admission Settings, or may it also read the published fee structure? The safety rules allow either.
- Must the application fee be paid before an application can be reviewed, or only before a decision? (Configurable via stages; the default is not stated.)
- D1 (decided): online payment of the application fee uses Razorpay, the first gateway.
- D3 (decided): Transport is not in the first version, so transport assignment on conversion works only once Transport is built.
- D4 (decided 9 October 2026): no parent app or password login, but each guardian gets a Parent Link when the admission is confirmed.
- D7 (decided 9 October 2026): open enquiries can be imported when a school switches from old software (workflow 15).
- D8a (decided 9 October 2026): data consent, with photo consent as its own type, is given on the application form and confirmed by a one-time code.
