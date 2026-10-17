# 11 Communication

Build order: 5th (first of Stage 2). Fee, attendance and admission messages all go out through it. It needs Settings (connected SMS, WhatsApp and email channels), students, parents and staff. The Parent Link page is built in Stage 2 with this module (decided 9 October 2026).

## 1. Purpose

Messages, notices and parent queries, by WhatsApp, SMS, email or app, and the Parent Link page that lets each guardian see their children's fees, attendance, notices and results on a phone.

Used by: the Principal and office staff (messages, notices, queries, Parent Link), teachers (messages to their own classes' parents, within their scope), the Receptionist (messages to parents), the Transport in-charge (messages to a route's parents), guardians (their own Parent Link), and every module's automatic messages.

Parents have no password login and no app. Each guardian gets one personal Parent Link instead (decided 9 October 2026). A full parent app is planned after Stage 4 and is not specified yet.

## 2. Pages

### Send Message

**Purpose:** send to parents, students or staff by class, section, bus route or group, with a preview and cost before sending.

**What the person sees**

A short form in three parts: **who**, **what**, **check and send**.

- **Who:** recipient type buttons (Parents, Students, Staff, Teachers, Admins; several can be chosen), then narrowing: class, section, bus route (when Transport is on), role, or a saved group (for example "Class 10 parents", "Sports team"). Alumni appear as a group when alumni tracking is on.
- **What:** channel (app notification, SMS, WhatsApp, email; automated voice call when switched on), template (optional, but required for SMS), title, message. With an approved WhatsApp or SMS template the body is locked and only the blanks (for example student name, due amount) are filled; a note explains why. An SMS can only be sent from a template that has a DLT template ID; templates without one are not offered for SMS (decided 9 October 2026).
- **SMS backup:** for fee, attendance and result messages, a tick box "If not delivered or read, also send by SMS". When ticked, anyone whose WhatsApp or app message fails, or is not read within the wait time set in Message Settings (default 2 hours, inferred), gets the same message by SMS. The tick box starts as set for that message type in Message Settings (decided 9 October 2026).
- **Translation (optional, when AI features are on):** a typed message (not a template) can be translated into each parent's language. The sender sees each translation before sending and can edit it; the parent's message carries the label "Translated from English". Templates are never translated this way; they use their own approved language versions (decided 9 October 2026).
- **Check and send:** recipient count (for example "Users to notify: 48"), credit cost and available credits, with a clear "Sufficient credits" or "Not enough credits" line; when SMS backup is ticked, the cost also counts the SMS that may be needed (for example "Up to 48 SMS backup: 48 credits") (decided 9 October 2026); a preview of the message as one real recipient will see it, with a "Next recipient" arrow to check others (inferred); how many were left out and why (opted out, no phone number, outside your scope).

**Actions**

- **Send now** or **Schedule for later** (date and time). A scheduled message can be cancelled until it goes.
- **Emergency broadcast:** a separate red button for permitted roles; sends to everyone chosen, including those who opted out. Needs a typed confirmation (P4) (inferred: confirmation and permitted roles).
- **Transport emergency (optional):** a quick message to the parents of one route (for example "Bus delayed by 30 minutes").
- **Retry failed:** after sending, failed deliveries can be retried, up to 3 times (inferred limit).
- Save the recipient set as a group (inferred).

Each send is one Message to many people. Every person in it is one Message Recipient with their own delivery status, so one send to 450 parents is one line in Message History that opens to 450 statuses (decided 9 October 2026).

**Form fields**

| Field | Required | Default | Notes |
|---|---|---|---|
| Recipient type | Yes | Parents | Several allowed |
| Narrow by | No | The person's own scope (for a teacher: their sections) | Class, section, route, role, saved group |
| Channel | Yes | WhatsApp if connected, else SMS (inferred) | Several channels allowed |
| Template | Yes for SMS, otherwise no | | Filters to the chosen channel and language; for SMS only templates with a DLT template ID are offered (decided 9 October 2026) |
| Title | Yes for app and email | From the template | |
| Message | Yes | From the template | Up to 1,000 characters (as in the old software); SMS shows the number of SMS parts (inferred) |
| Language | No | Each parent's language, or the school's main language | Uses the template's version in that language. For a typed message with AI features on: "Translate into each parent's language" (default off); each translation is shown for checking and editing before sending, and arrives labelled "Translated from English" (decided 9 October 2026) |
| If not delivered or read, also send by SMS | No | As set for the message type in Message Settings | Fee, attendance and result messages only; needs an SMS template with a DLT template ID for the same message; the SMS cost is counted in the preview (decided 9 October 2026) |
| Attachment | No | | Email and WhatsApp only (inferred) |
| Schedule | No | Off | Date and time |

### Notice Board

**Purpose:** circulars and notices with attachments, sent to chosen classes or staff, with read tracking.

**What the person sees**

- Notices list: title, audience, priority (High in amber, Critical in red), published date, expiry date, status (**Draft**, **Waiting for approval**, **Scheduled**, **Published**, **Expired**, **Archived**; inferred), read count ("312 of 450 read").
- **Seen by parent:** for notices sent to parents, "Seen by 31 of 40", counted from Parent Link opens of the notice and WhatsApp read receipts. Opening the count lists each guardian with the date and time they first saw it, or "Not seen" (decided 9 October 2026).
- The notice board as staff and students see it: current notices, Critical first, then High, then Normal.
- **Group view (optional):** central announcements from the group office to all its schools.

**Actions**

- Create a circular or notice with attachments.
- Choose the audience: roles, classes, campuses.
- Set priority: **Normal**, **High** or **Critical** (decided 9 October 2026). Critical needs a typed confirmation (P4) and is pinned at the top of every chosen guardian's Parent Link until it expires. Schedule a publish time, set an expiry date.
- Ask for read acknowledgement: readers tap "I have read this"; the notice shows who has and has not.
- Publish on several channels at once (notice board, app notification, Parent Link, WhatsApp, SMS, email); parents, who have no password login, see it on their Parent Link and get it by message.
- **Approval before publishing:** notices go to Approvals when the school's rule says so (for example all notices to parents) (inferred default).
- Archive; expired notices move to the archive by themselves.
- Remind those who have not acknowledged (inferred).
- **Resend to parents who have not seen it:** one tap, by the same or another channel, with the usual preview of count and cost (decided 9 October 2026).

**Form fields: Notice**

| Field | Required | Default | Notes |
|---|---|---|---|
| Title | Yes | | |
| Notice | Yes | | Rich text |
| Attachments | No | | PDF, images |
| Audience | Yes | | Roles, classes, campuses; parents via Parent Link and message |
| Priority | Yes | Normal | Normal, High, Critical; Critical needs a typed confirmation |
| Channels | Yes | Notice board and app notification; also Parent Link when parents are in the audience (inferred) | |
| Publish at | No | Now | |
| Expires on | No | 30 days after publishing (inferred) | |
| Ask for acknowledgement | No | Off | |

### WhatsApp Inbox

*Optional page: for schools connecting WhatsApp Business.*

**Purpose:** all school WhatsApp chats in one place, each staff member seeing their own.

**What the person sees**

- Chat list: contact name (matched to a parent, student, staff member or enquiry when the number is known), last message, time, unread count, assigned to.
- Tabs: **Assigned to me** (default), **All chats** (only for people with "view all" permission), **Unassigned**.
- The chat: message history and a reply box. The panel at the side shows who the person is (for example "Parent of Ravi, 5 A") with links to the student or enquiry.

**Actions**

- Reply (text, document, image).
- Assign or reassign a chat to a staff member.
- Turn a chat into an enquiry (Admission Management) or a query (Feedback & Queries) (inferred).
- Mark resolved (inferred).

**Form fields:** reply text; attachment (optional).

### Message History

**Purpose:** every message sent, with delivered, read and failed status.

**What the person sees**

- One list for everything sent: by people, by automatic rules, by notices. Columns: date and time, sent by (person or rule), channel, title or template, recipients count, delivered, read, failed, cost.
- Opening a message shows each recipient's status: **Queued**, **Sent**, **Delivered**, **Read**, **Failed** (with the reason, for example "number not on WhatsApp"), or **Not sent** when no channel could carry it to them (with the reason, for example "WhatsApp has not approved the template yet; the SMS template has no DLT template ID") (added 18 October 2026).
- **Person view:** all messages to and from one parent, student or staff member across channels (also on the student and parent pages).
- The person's own received messages and replies are in the top bar Messages, not here.

- A message sent with SMS backup shows how many were also sent by SMS, and each recipient's status shows "Sent by SMS backup" with the reason (failed, or not read in time) (decided 9 October 2026).

**Actions:** filter (date, channel, sender, rule, status); retry failed (within the limit); resend to failed by another channel, for example SMS when WhatsApp failed (inferred), or by **the best channel for each person**, which is how people marked Not sent are sent once a channel can carry it; **Resend to unread** in one tap on any sent message, to everyone not yet at Read, by the same or another channel, with the usual preview of count and cost before it goes (decided 9 October 2026); export (P8).

**Form fields:** none.

### Feedback & Queries

**Purpose:** queries and complaints from parents, students and staff, each with a number, an owner and a status.

**What the person sees**

- List: ticket number, from (parent, student or staff), about (student or topic), type, priority, owner (person or department), status (**Open**, **In progress**, **Resolved**, **Closed**), age, due by (when response-time targets are on).
- Filters: status (default Open and In progress), type, priority, owner, overdue.
- One query: the request, the conversation, internal notes (hidden from the requester), the resolution, the history.

**Actions**

- **Log a query or complaint** (from a phone call, a visit, a WhatsApp message, or a staff member raising it). Gets a ticket number; the requester is sent the number (inferred).
- Assign to a staff member or to a department (for example Accounts or Transport); anyone in that department can pick it up and becomes its owner (inferred: pick up); set priority.
- Reply to the requester (by their channel); add internal notes.
- Resolve with resolution notes; close.
- **Collect feedback by topic** (for example transport, food, teaching), counted in reports.
- **Response-time targets (optional, larger schools):** per query type; overdue queries escalate automatically to the next person.
- **Satisfaction rating (optional):** after closing, the requester is sent a 1 to 5 rating request by message.
- **Internal staff tickets (optional):** IT, facility, academic, transport, HR requests from staff.

**Form fields: Log query**

| Field | Required | Default | Notes |
|---|---|---|---|
| From | Yes | | Search parent, student or staff; or type a name and phone |
| About (student) | No | The parent's child, if one | |
| Type and topic | Yes | Query | Query, complaint, suggestion, feedback; topic from the list |
| Details | Yes | | |
| Priority | Yes | Normal | Low, normal, high, urgent |
| Owner | Yes | The topic's default owner (inferred) | A staff member or a department |
| Came by | No | Phone | Phone, visit, WhatsApp, email, letter (inferred) |

### Surveys

*Optional page: for schools running surveys.*

**Purpose:** short surveys such as parent satisfaction, with the answers collected.

**What the person sees**

- Surveys: title, audience, sent date, responses ("128 of 400"), status (**Draft**, **Open**, **Closed**).
- Ready examples to start from: parent satisfaction, staff feedback, event feedback.
- Results: per question, counts and charts; text answers listed.

**Actions**

- Build a survey with questions of type choice, rating, text and date.
- Send to an audience (parents get a link by message; staff and students in the app). Each person answers once (inferred).
- Close, see results, export.

**Form fields:** title, questions (type, text, options, required or not), audience, closing date (default 7 days, inferred), anonymous or named (inferred).

### Message Templates

**Purpose:** ready message formats in each language, with blanks like student name and due amount.

**What the person sees**

- Templates list: name, category (fees, attendance, exam, general, admission, transport and so on), channel, languages, status (for WhatsApp: **Approved** by WhatsApp, **Pending**, **Rejected**), DLT template ID (for SMS; "Missing" in red when blank), version, used by (which automatic rules).
- One template: its text in each language, its variables, and a preview with sample data.

**Actions**

- Add or edit a template; add a language version.
- Insert variables from a list (for example {student_name}, {class}, {due_amount}, {receipt_number}, {paid_amount}, {payment_date}, {school_name}).
- **Template check:** a message cannot be sent if a variable has no value for a recipient; those recipients are listed and skipped (or the send is blocked for a single recipient).
- Each save makes a new version; messages sent keep the version they used.
- WhatsApp templates: submit for WhatsApp approval through the connected provider and track the status (inferred); approved templates are locked.
- **SMS templates and DLT:** every SMS template stores the DLT template ID the school registered on the telecom DLT portal. An SMS can only be sent from a template with a DLT template ID; an SMS template without one can be saved as a draft but not used (decided 9 October 2026). The school's DLT entity ID and sender header are in Settings, SMS, WhatsApp & Email.

**Form fields:** name, category, channel, language, text with variables, DLT template ID (required before an SMS template can be used; letters and numbers only, inferred).

### Parent Link

**Purpose:** one personal, secure link for each guardian that opens a phone-friendly page showing all their children in the school, with no password and no app (decided 9 October 2026).

The page has two sides: the **school's Parent Link page** in Communication, where staff manage links, and the **guardian's page** that opens from the link.

**What the person sees (school staff)**

- Summary at the top: links active, links revoked, guardians who opened their link in the last 30 days, guardians who never opened it (inferred: the summary figures).
- Links list: guardian name, mobile number, children (name, class and section), status (**Active** or **Revoked**), created on, last opened, phones verified.
- Filters: class, section, status, never opened, opened in the last 30 days (inferred).
- One link: its history (created, sent, each open with date, time and phone, revoked, reissued) and the consent forms the guardian has given, is waiting on or has withdrawn.
- A "What guardians see" panel showing which parts are switched on (set in section 6), with a preview as one real guardian sees it (inferred: preview).

**What the person sees (guardian)**

The guardian taps the link in WhatsApp or SMS. The first time it opens on a new phone, a one-time code is sent to the guardian's registered mobile and must be entered before anything is shown. After that the page opens straight away on that phone. It shows:

- A card for each of the guardian's children in the school, with photo, name, class and section. Tapping a child switches everything below to that child.
- **Critical notices** pinned at the top until they expire.
- **Fees due:** each installment with amount and due date, the total due, and a **Pay** button that pays online through Razorpay.
- **Receipts:** every receipt, each with a Download button (PDF).
- **Attendance this month:** a calendar with present, absent, late and leave days and the month's percentage.
- **Notices** sent to this guardian's children's classes, newest first.
- **Datesheet** for the coming exams.
- **Report cards**, only once the school has published them.
- **Consent forms** waiting for the guardian's answer, and those already given.
- A short line at the bottom: "To ask a question, message or call the school" with the school's WhatsApp number and phone (inferred: the wording).

The page is read-only apart from paying fees and giving or withdrawing consent. Parents still ask questions by WhatsApp or phone.

**Actions (school staff)**

- **Send links:** each guardian's link is created and sent automatically by WhatsApp or SMS when an admission is approved. For families already in the school, **Send to existing families** sends links in bulk to a chosen class, section or the whole school, with the P11 preview and result summary.
- **Revoke** a link (for example a lost phone or a link forwarded to the wrong person). It stops working at once and the reason is logged.
- **Reissue** a link: revokes the old one and sends a new one to the registered mobile.
- **Resend** the same link by WhatsApp or SMS when a guardian has lost the message (inferred).
- **Request consent:** send one consent form (for example data processing under the DPDP Act 2023, or photo consent) to all guardians or a chosen class or section. Each guardian sees it on their Parent Link and agrees with a one-time code to their mobile. The list shows given, waiting and withdrawn, with a reminder button for those waiting (decided 9 October 2026; inferred: the reminder).
- Switch Parent Link on or off for the school and choose what it shows (section 6).

**Actions (guardian)**

- Switch between children.
- **Pay** fees due through Razorpay. The receipt appears on the page and is sent by message when the payment is confirmed (Fee Management records the payment).
- Download receipts and published report cards.
- Give or withdraw consent on a consent form, confirmed by a one-time code.

**Form fields: Send to existing families**

| Field | Required | Default | Notes |
|---|---|---|---|
| Who | Yes | Guardians with no active link (inferred) | Whole school, class, section |
| Channel | Yes | WhatsApp if connected, else SMS | Uses the Parent Link template |
| Send at | No | Now | Date and time |

**Form fields: Revoke or reissue**

| Field | Required | Default | Notes |
|---|---|---|---|
| Action | Yes | Reissue | Revoke only, or revoke and reissue |
| Reason | Yes | | Lost phone, link shared, guardian changed mobile, other; minimum 5 characters for other (inferred) |

**Form fields: Consent request**

| Field | Required | Default | Notes |
|---|---|---|---|
| Consent type | Yes | | From the consent types in Settings, Data Backup & Security (for example data processing, photo consent) |
| Who | Yes | Guardians with no current consent of this type (inferred) | Whole school, class, section |
| Reply by | No | 14 days (inferred) | Reminders stop after this date |

### Message Settings

**Purpose:** automatic messages on or off, birthday wishes, parents who opted out, query reply time limits and what Parent Link shows. See section 6.

## 3. All features

65 features are mapped to this module: 51 Core and 14 Optional. Tick each one when it is built and tested.

### Send Message (16)

- [ ] Choose recipients: students, parents, staff, groups (Core)
- [ ] Target by class, section, route, role or saved group (Core)
- [ ] Channels: app notification, SMS, WhatsApp, email (Core)
- [ ] Automated voice calls (Optional: schools using voice calls)
- [ ] Message title and body (Core)
- [ ] Recipient count and message preview before sending (Core)
- [ ] Message cost in credits before sending (Core)
- [ ] Personalised messages to each recipient (Core)
- [ ] Audience limited to what the sender is allowed to reach (Core)
- [ ] Schedule a message for later; cancel before it goes (Core)
- [ ] Retry failed messages with a limit (Core)
- [ ] Emergency broadcast to everyone, ignoring opt-outs (Core)
- [ ] Transport emergency notification (Optional: schools running buses) · emergency message to a route
- [ ] Alumni communication (Optional: schools tracking alumni) · alumni as a recipient group
- [ ] SMS backup for fee, attendance and result messages not delivered or not read in time, switched per message type (Core) (decided 9 October 2026)
- [ ] Translate a typed message into each parent's language, previewed and editable, labelled "Translated from English" (Optional: schools using AI features) (decided 9 October 2026)

### Notice Board (11)

- [ ] Create circulars, notices and announcements with attachments (Core)
- [ ] Target a notice to roles, classes or campuses (Core)
- [ ] Schedule a notice (Core)
- [ ] Notice priority Normal, High or Critical; Critical needs a typed confirmation and is pinned on Parent Link (Core) (decided 9 October 2026)
- [ ] Read acknowledgement and acknowledgement tracking (Core)
- [ ] Notice expiry date (Core)
- [ ] Notice archive (Core)
- [ ] Notice approval before publishing (Core) · approval goes to Approvals
- [ ] Publish a notice on several channels at once (Core)
- [ ] Central announcements for the group (Optional: school groups) · group view
- [ ] "Seen by parent" with date and time, from Parent Link opens and WhatsApp read receipts, and resend to those who have not seen it (Core) (decided 9 October 2026)

### WhatsApp Inbox (2)

- [ ] View all WhatsApp conversations (WhatsApp Web) (Optional: schools using WhatsApp)
- [ ] View only conversations assigned to me (Optional: schools using WhatsApp)

### Message History (3)

- [ ] Message history with delivery status: queued, sent, delivered, read, failed (Core)
- [ ] Communication history for one person across channels (Core)
- [ ] Resend to unread in one tap, by the same or another channel, with count and cost preview (Core) (decided 9 October 2026)

### Feedback & Queries (10)

- [ ] Log a parent / student / staff query or complaint with a ticket number (Core)
- [ ] Assign a query to a staff member or a department (Core)
- [ ] Query priority (Core)
- [ ] Query status and resolution notes (open, in progress, resolved, closed) (Core)
- [ ] Internal notes on a query, hidden from the requester (Core)
- [ ] Collect feedback by topic (Core)
- [ ] Response-time targets (SLA) per query type (Optional: larger schools)
- [ ] Automatic escalation of overdue queries (Optional: larger schools)
- [ ] Satisfaction rating after closing a query (Optional: larger schools)
- [ ] Internal staff tickets: IT, facility, academic, transport, HR (Optional: larger schools)

### Surveys (3)

- [ ] Survey builder with field types (choice, rating, text, date) (Optional: schools running surveys)
- [ ] Survey examples: parent satisfaction, staff feedback, event feedback (Optional: schools running surveys)
- [ ] Send surveys and collect answers (Optional: schools running surveys)

### Message Templates (5)

- [ ] Reusable message templates by channel and language (Core)
- [ ] Template variables, e.g. student name, class, due amount (Core)
- [ ] Template checks: missing variables block sending (Core)
- [ ] Template versions (Core)
- [ ] SMS templates store a DLT template ID; an SMS can only be sent from a template with one (Core) (decided 9 October 2026)

### Parent Link (9)

- [ ] One personal, secure link per guardian covering all their children in the school, no password (Core) (decided 9 October 2026)
- [ ] One-time code to the guardian's registered mobile the first time the link opens on a new phone (Core) (decided 9 October 2026)
- [ ] Fees due with a Pay button (Razorpay) and receipts to download (Core) (decided 9 October 2026)
- [ ] Attendance this month, notices, datesheet and report cards once published (Core) (decided 9 October 2026)
- [ ] Consent forms, given or withdrawn with a one-time code, and bulk consent requests to existing families (Core) (decided 9 October 2026)
- [ ] Read-only apart from paying and giving consent; never shows another family's data (Core) (decided 9 October 2026)
- [ ] Link sent automatically when an admission is approved, and in bulk to existing families (Core) (decided 9 October 2026)
- [ ] School switches Parent Link on or off, chooses what it shows, and revokes or reissues a link (Core) (decided 9 October 2026)
- [ ] Every link open logged (Core) (decided 9 October 2026)

### Message Settings (6)

- [ ] Consent and opt-out respected (except emergency messages) (Core)
- [ ] Automatic message rules: WHEN something happens THEN send a message (absence, fee due, exam reminders, results, PTM, homework, transport) (Core)
- [ ] Turn each automatic message on or off; no duplicates (Core)
- [ ] Automation log of what was sent and why (Core)
- [ ] Birthday wishes to students and staff (Core) · automatic
- [ ] Pending-homework messages to parents (Core) · automatic message rule

## 4. Connections

**Receives**

| From | What |
|---|---|
| Every module | Requests to send automatic messages: absence and late (05), fee paid, due and reminders (06), exam reminders and results (08), admission follow-ups and welcome (02), homework set and pending (17), PTM reminders (18), transport pickup, drop, arriving and emergency (12), salary slip ready (10), visitor arrival (16) |
| 03 Student Management | Parents, primary contacts, languages; students by class and section |
| 09 Staff & HR | Staff by role and department |
| 12 Transport (optional) | Students by route |
| 20 Settings | Connected SMS, WhatsApp and email providers, credits, channels on or off; DLT entity ID and sender header; consent texts and their versions |
| Providers | Delivery and read receipts; incoming WhatsApp messages |
| 02 Admission | Admission approved, so the guardian's Parent Link is created and sent (A2) |
| 05 Attendance, 06 Fee Management, 08 Examination & Results | For Parent Link: attendance this month; fees due and receipts; datesheet and report cards once published |

**Sends**

| To | What |
|---|---|
| Parents, students, staff | Messages by WhatsApp, SMS, email, app, voice |
| Guardians | Their Parent Link page |
| 06 Fee Management | Online payments started from Parent Link (Razorpay); Fee Management records the payment and receipt |
| 03 Student Management | Consent given or withdrawn through Parent Link, recorded as a Consent Record on the student's guardian with the consent text version (system map arrow 69) |
| 02 Admission | Incoming WhatsApp messages from enquiries |
| Every module | Delivery status for each message they asked to send (for example reminder history in Defaulters) |
| Top bar Messages | Each person's own messages and replies |
| Top bar Approvals | Notices waiting for approval |
| 19 Reports & Analytics | Message and query reports |

**Automations:** Communication does not own an automation, but it carries the messages of A1, A2, A4, A6, A7, A9, A10, A12 and A15 to people. Every automatic message is checked against the rules in Message Settings (on or off, opt-outs, no duplicates) and logged in the automation log.

## 5. Rules and mistake-proofing

| Rule | How it is prevented | What the person is told | How they recover |
|---|---|---|---|
| Sending to the wrong people | Recipient count and a real preview before sending; audience limited to the sender's scope | "48 parents of 5 A and 5 B" | Change the audience before sending |
| Sending costs more than expected | Credit cost and balance shown; send blocked when credits are not enough | "Needs 480 credits. You have 92." | Top up in Settings, SMS, WhatsApp & Email, or send by app only |
| Message cannot be unsent | Confirmation says so (P4) | "This cannot be unsent once delivered" | Send a correction message |
| Scheduled message wrong | Cancel any time before it goes | "Scheduled for 07:30 AM tomorrow. Cancel?" | Cancel and resend |
| Template blank missing | Missing variables block sending to that recipient | "3 recipients have no due amount and will be skipped" | Fix the data or remove them |
| Messages to parents who opted out | Skipped, except emergency broadcasts | "12 opted out and will not receive this" | Emergency broadcast if truly urgent |
| Same automatic message twice | Each rule sends at most once per event per recipient | Not needed | Not needed |
| Teacher messaging all parents | Scope limits audience to their sections | Other classes are not offered | Ask the office |
| Notice published without approval | Notices needing approval cannot be published until approved | "Waiting for the principal" | Wait |
| Failed deliveries ignored | Failed shown in red with the reason; retry with a limit | "6 failed: not on WhatsApp" | Retry, or resend by SMS |
| SMS backup costs more than expected | The preview counts every SMS the backup may send; the backup SMS is sent only for recipients still not delivered or not read after the wait time, and is skipped when credits run out (decided 9 October 2026) | "SMS backup: up to 48 SMS, 48 credits" | Untick SMS backup, or top up in Settings, SMS, WhatsApp & Email |
| Wrong machine translation reaches a parent | Each translation is shown to the sender before sending and can be edited; the parent's copy is labelled "Translated from English"; off unless the school turns on AI features (decided 9 October 2026) | "Check the Telugu version before sending" | Edit the translation, or send in English |
| Internal notes seen by parents | Internal notes never leave the system | Shown with a lock icon | Not needed |
| SMS sent without DLT registration | SMS can only be sent from a template with a DLT template ID | "This SMS template has no DLT template ID. Add it in Message Templates." | Add the ID, or send by WhatsApp |
| A message lost because its channel cannot carry it (added 18 October 2026) | Each person gets it on a channel that can really carry it: "preferred" tries WhatsApp, then SMS, email and app for each person, and an automatic rule tries its own channels, then WhatsApp and SMS. SMS goes only from a template with a DLT template ID; typed words go by SMS only inside the ready "General announcement (SMS)" template. On a real WhatsApp account only templates WhatsApp approved are used, and typed words go inside the approved "General announcement" template (WhatsApp refuses plain text outside a parent's 24 hours). In test mode nothing is sent, so any template is used | Before sending, the preview counts them in red: "12 not sent: WhatsApp has not approved the template "Absent today" yet; the SMS template "Absent today (SMS)" has no DLT template ID". Messages the software sends by itself (rules, reminders, hostel, library, attendance alerts) are kept in Message History with those people as Not sent; the person who sent a message is notified when some of it was not delivered; the Dashboard shows "Messages not delivered this week" | Fix the channel (approval, DLT template ID), then Resend failed by the best channel for each person |
| A blank reaches a parent unfilled | Every text is checked before sending: braces that are not a blank from the list ({Student Name}, {{diary}}, a lone "{") block the send, naming them; a blank with no value skips that person (or blocks a single send) | "The message has a blank that cannot be filled: {Student Name}." | Use the blank from the list, or take out the braces |
| One phone gets the same message twice | One message per phone, email or login per send: two guardian records with one number get one message; brothers and sisters on one phone get one message naming them all, unless it carries a child's own amount, receipt or link | "Same number as Srinivas Kumar" | Not needed |
| Critical notice sent by mistake | Critical priority needs a typed confirmation (P4) | "Type CRITICAL to pin this on every chosen parent's Parent Link" (inferred: the word) | Archive the notice; it leaves Parent Link at once |
| Someone else opens a guardian's link | The first open on a new phone needs a one-time code sent to the guardian's registered mobile | "We have sent a code to +91 ••••• ••210" | Guardian asks the school to reissue the link |
| Parent Link shows another family's data | A link shows only its own guardian's children; every open is checked on the server and never returns other families' records | Not needed | Not needed |
| Lost phone or forwarded link | Revoke stops the link at once; reissue sends a new one | "This link is no longer active. Please ask the school for a new one." | Reissue the link |
| Guardian tries to change details | Parent Link is read-only apart from paying and consent; no edit buttons | "To change details, please contact the school" | Message or call the school |
| Paying twice from Parent Link | The Pay button shows the current due and is disabled while a payment is in progress (inferred) | "Payment in progress. Please wait." | Not needed; a double payment follows the normal refund path in Fee Management |

## 6. Settings

The **Message Settings** page holds:

- **Automatic messages:** a list of "When this happens, then send this" rules (absence, late arrival, fee due, fee paid, exam reminders, results, PTM, homework set, pending homework, transport pickup, drop and arriving, birthday wishes, salary slip ready). For each: on or off, template, channel, who receives it, timing. Each rule never sends duplicates.
- **Automation log:** what was sent, to whom, and why (which rule and which event). A person the rule could not reach shows as **Not sent** with the reason, once per event; when the channel is fixed, the next run of the same event sends it.
- **WhatsApp approval:** on a real WhatsApp account, a rule whose WhatsApp template is not approved says so, and parents get it by SMS (with a DLT template ID) or not at all until it is approved.
- **Birthday wishes** to students and staff: on or off, template, time of day.
- **Pending-homework messages** to parents: on or off and timing.
- **Consent and opt-out:** the list of parents who opted out of non-emergency messages, with the date and how (inferred: how); add or remove with a note.
- **Query reply time limits (response-time targets)** per query type (optional), and the escalation person.
- **Query types and topics**, and the default owner for each (inferred).
- **Notice approval rule** (shown here, stored in Settings, Forms & Approvals).
- **Saved groups** (inferred).
- **Retry limit** for failed messages (inferred, default 3).
- **SMS backup** (decided 9 October 2026): for each message type (fee, attendance, result), on or off, and the wait time before an unread message is sent by SMS (default 2 hours, inferred). Default off until the school turns it on (inferred). Backup SMS use the message type's SMS template with a DLT template ID and are counted in credits.
- **Translation of typed messages** is available only when AI features are on in Settings, Modules On/Off (default off) (decided 9 October 2026).
- **Parent Link** (decided 9 October 2026):
  - On or off for the school (default on).
  - What it shows: fees due and Pay, receipts, attendance this month, notices, datesheet, report cards, consent forms; each on or off (default all on).
  - Send links automatically when an admission is approved (default on) and the template used.
  - One-time code valid for 10 minutes (inferred); a verified phone stays verified for 180 days (inferred).
- Channel connections, credits, the DLT entity ID and sender header are in Settings, SMS, WhatsApp & Email. Consent texts and types are in Settings, Data Backup & Security.

## 7. Reports

- Messages sent by channel, month and sender; delivery and read rates; failures by reason.
- Credits used by month and channel.
- Notice read and acknowledgement report.
- Queries: open, overdue, resolved, average time to resolve, by type, topic and owner; satisfaction ratings (optional).
- Feedback by topic.
- Survey results (optional).
- Automation log export.
- Parent Link: links active and revoked, guardians who opened in the last 30 days and who never opened, fees paid through Parent Link by month, and the Parent Link open log (who opened, when, from which phone).
- Consent status by consent type and class: given, waiting, withdrawn, with the consent text version agreed to.

All follow P8 and appear in Reports & Analytics.

## 8. Records used

| Record | Creates | Reads | Updates |
|---|---|---|---|
| Message | Yes (one per send) | Yes | Yes (status) |
| Message Recipient | Yes (one per person per message, with their own delivery status and reason) | Yes | Yes (status) |
| Notice | Yes | Yes | Yes (publish, expire, archive) |
| Template | Yes (versioned; SMS templates with a DLT template ID) | Yes | Yes (new version) |
| Parent Link | Yes (one per guardian) | Yes | Yes (last opened, phones verified, revoke) |
| Consent Record | Yes (given or withdrawn through Parent Link, with the consent text version; kept on the student's guardian in 03 Student Management) | Yes | Yes (withdrawn) |
| Student, Guardian, Staff, Class, Section, Route | | Yes | |
| Student Fee Due, Receipt, Attendance Mark, Datesheet Entry, Report Card | | Yes (for Parent Link) | |
| Enquiry | Yes (from a WhatsApp chat, inferred) | Yes | |
| Approval, Notification | Yes | Yes | |
| Audit Log Entry | Yes (including every Parent Link open) | | |

**Parent Link** (decided 9 October 2026): guardian, secure token (long and random, never shown in full on screen, inferred), status (**Active** or **Revoked**), created on, last opened, phones verified (each with the date verified and last used). Payments made from Parent Link are Payment records created by Fee Management.

Other records (inferred): **Recipient Group**, **Automatic Message Rule** and **Automation Log**, **Opt-out Record**, **Notice Acknowledgement**, **WhatsApp Conversation** (with assignment), **Query** (ticket) with **Query Note**, **Survey**, **Survey Question**, **Survey Response**, **Credit Ledger**.

## 9. Done when

1. Sending a WhatsApp message to the parents of class 5 shows the recipient count, the credit cost and a real preview before sending.
2. A teacher can only choose their own sections as recipients.
3. A message using a template with a missing value for 3 recipients skips those 3 and says so.
4. A scheduled message can be cancelled before its time and is never sent.
5. Message History shows each recipient's status, and failed ones can be retried up to the limit.
6. A parent who opted out does not receive a normal message but does receive an emergency broadcast.
7. A notice with read acknowledgement shows who has and has not read it.
8. A query logged by the receptionist gets a ticket number, an owner and a status, and internal notes never reach the parent.
9. Turning off the "absence" automatic message stops absence messages the next time attendance is saved.
10. The automation log shows, for each automatic message, the rule and the event that caused it.
11. A guardian with two children opens Parent Link on a new phone, enters the one-time code, and sees both children's fees due, receipts, attendance and notices, and nothing from any other family.
12. Paying from Parent Link through Razorpay creates the receipt in Fee Management and shows it on the page.
13. A revoked link stops working at once; the reissued link works after a new one-time code; both opens are in the log.
14. Approving an admission sends the guardian their Parent Link without anyone typing it.
15. An SMS template with no DLT template ID cannot be used to send an SMS.
16. A Critical notice cannot be published without the typed confirmation, and appears pinned on the chosen guardians' Parent Link.
17. A fee reminder sent by WhatsApp with SMS backup on reaches by SMS every parent whose WhatsApp failed or was not read within the wait time, and the preview counted those SMS (decided 9 October 2026).
18. "Resend to unread" on a sent message previews the count and cost and sends only to those not yet at Read (decided 9 October 2026).
19. A notice to class 5 A parents shows "Seen by" with each guardian's date and time from Parent Link and WhatsApp read receipts (decided 9 October 2026).

## 10. Open questions

- Who may send an emergency broadcast? Assumed: Principal and School Admin only.
- Should every notice to parents need approval, or only some? Assumed: the school chooses in Forms & Approvals; default all notices to parents.
- Should fee reminders count as emergency (ignoring opt-outs)? Assumed: no.
- Which SMS and WhatsApp providers will be connected first? Not stated in the inputs; this affects template approval and credit tracking.
- D3 (decided): Transport is not in the first version, so sending by bus route and transport messages exist only once Transport is built.
- D4 (decided 9 October 2026): no parent app or password login yet; Parent Link is in the first sellable version and owned by this module. A full parent app comes after Stage 4.
- D8b (decided 9 October 2026): every SMS template carries a DLT template ID, and an SMS can only be sent from a template with one.
