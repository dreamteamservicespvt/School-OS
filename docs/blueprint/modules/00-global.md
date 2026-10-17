# 00 Global: what every screen shares

School OS Blueprint, module build specs. Prepared for DREAM TEAM SERVICES.

This file describes what sits above and across all 20 modules: the top bar, Search / Ask / Do, approvals, notifications, roles, mobile layout and the shared screen patterns. Every module spec (01 to 20) refers back here instead of repeating these rules. Build what is in this file first, together with module 20 (Settings), because every other module uses it.

## How to read these specs

- Each module file has the same 10 sections: Purpose, Pages, All features, Connections, Rules and mistake-proofing, Settings, Reports, Records used, Done when, Open questions.
- Anything marked **(inferred)** was not written in the plan, the feature map or the recording. It is a sensible default, check or link added so the module can be built without guessing. The owner may change it.
- **Core** means most schools need it. **Optional** means only some schools need it; it stays hidden until the school switches it on.
- Record names in **Records used** follow the shared list of core records (School, Campus, Academic Year, Term, Class, Section, Subject, Teacher Allocation, Timetable Period, Student, Guardian, Staff, User Login, Role, Enquiry, Application, Fee Head, Fee Structure, Installment, Student Fee Due, Concession, Payment, Receipt, Refund, Day Book Entry, Income, Expense, Budget, Attendance Mark, Leave Request, Homework, Submission, Exam, Datesheet Entry, Marks, Grade Scale, Report Card, Salary Structure, Payroll Run, Payslip, Message, Notice, Template, Route, Stop, Vehicle, Driver, Trip, Transport Assignment, Book, Book Copy, Book Issue, Item, Stock Movement, Asset, Hostel Room, Bed Allocation, Visitor Entry, Gate Pass, Event, Calendar Entry, Task, Approval, Notification, Audit Log Entry). Added on 9 October 2026: Group, School Access, Parent Link, Consent Text, Consent Record, Financial Year, Message Recipient and Leave Balance (see `04-data-model.md`). Records a module needs that are not on this list are named under "Other records" and marked (inferred), for the data model owner to confirm.
- On screen, people see school words, not record names. For example the record **Guardian** is shown as "Parent" or "Guardian", and **Student Fee Due** is shown as "Fees due".

## The product rules behind every screen

1. Don't make people learn the software. Make the software understand people.
2. No giant forms. Use smart defaults, show simple options first and more on request, and never ask for what the system already knows.
3. Enter once, update everywhere. One fee payment, one admission or one attendance mark updates every place that uses it.
4. Prevent mistakes, explain them, and let people recover. No action anywhere destroys data with no way back.
5. Humans approve important actions. AI never invents facts and always keeps suggestions apart from actions.
6. Use familiar school words. Every screen works on a phone, a tablet and a computer.

## 1. The top bar

The top bar is on every screen, above the page. It is not part of the 20-item menu.

| Item | What it does | Who sees it |
|---|---|---|
| Search | One box to find any student, staff member, parent, receipt, record or page, and to Ask or Do (section 2). | Everyone |
| Approvals | A count badge and one list of everything waiting for this person's yes or no (section 3). | Anyone allowed to approve something |
| Notifications | A bell with an unread count. Each alert opens the right screen (section 4). | Everyone |
| Messages | The person's own messages and replies (their inbox). Sending to groups happens in Communication. | Everyone |
| Profile | Own details, password, signed-in devices and notification choices. | Everyone |
| School switcher | Moves between schools or campuses the person works in. | Only users of school groups with more than one school or campus |
| Academic year | Shows the year being viewed. Past years open read-only. | Everyone |

### 1.1 Search box

- Placed in the middle of the top bar on computers. On phones it is a magnifier icon that opens a full-screen search.
- Keyboard shortcut "/" puts the cursor in the box on computers (inferred).
- Results appear while typing, after 2 characters (inferred), grouped as: Students, Staff, Parents, Receipts and payments, Other records, Pages.
- Each student result shows photo, name, class and section, admission number and father's or guardian's name, so two children with the same name can be told apart.
- Search matches name, admission number, phone number (student or guardian), receipt number, staff ID and page names. Partial and misspelt names still match (inferred).
- **Search by intent:** a word for a task followed by a name opens that task for that person. Examples: "fee Ravi" opens Ravi's page in Collect Fee; "attendance 5A" opens Take Attendance for class 5, section A (inferred example); "TC Ravi" opens the TC page for Ravi (inferred example). If more than one Ravi matches, the person picks one from a short list first.
- **Recent and pinned pages (Favourites):** with an empty box, Search shows the person's recent pages and pinned pages. Any page can be pinned with a pin icon in its title bar. This replaces the old Quick Filter and Favorites menu items.
- **Module shortcuts (quick links):** the empty box also shows 4 to 6 shortcuts for the person's role, such as "Collect Fee" for an accountant or "Take Attendance" for a teacher (inferred: the shortcut list per role).
- Search only returns what the person is allowed to see. A teacher searching a student outside their classes sees nothing about that student.

### 1.2 Academic year selector

- Shows the year being viewed, for example "2026-27". Default: the current active year of the person's campus.
- Choosing a past year opens every screen read-only, with a yellow strip "You are viewing 2025-26. This year is closed. Changes are not allowed." Only people with the "correct a closed year" permission see a "Make a correction" button, and every correction is logged (see module 04, Academic Settings).
- Choosing the next year (once it is opened in Academic Settings) lets authorised staff prepare fee structures, classes and the timetable before the year starts.

### 1.3 School switcher

- Shown only when the person's User Login is linked to more than one School or Campus.
- Lists the schools or campuses with logo and name. Switching reloads the current page for the chosen school if that page exists there, otherwise the Dashboard (inferred).
- Group-level admins see an extra choice "Whole group", which opens the group views (central admissions, HR, finance, curriculum, announcements, purchasing and side-by-side comparison) described in each module (inferred: the label).
- Each school keeps its own data, branding, fees, templates and messages. A person never sees another school's records unless their login is linked to it.

### 1.4 Profile menu

- My profile: view and edit own name, photo, phone and email. Changing the phone or email needs a one-time code sent to the new number or address (inferred).
- Change password. Rules come from Settings, Users & Permissions. After signing in with a one-time code instead of the password (a forgotten password), a new password can be set without the old one, once, within 30 minutes. A person whose role needs two-step login signs in with codes only by typing two, one by email and one to the mobile (added 18 October 2026).
- Signed-in devices: list of active sessions with device, place and last used time, "Sign out" per device and "Sign out everywhere".
- My notification preferences: per notification type, choose app, push, email, SMS or WhatsApp where the school allows it (section 4).
- Language: one of the school's enabled languages for screens (inferred: per-person choice; the school sets which languages are on).
- My salary slips and my leave appear here as shortcuts for staff (inferred).
- What's new: every "What's new" note the person has been shown (P20), newest first, so they can read it again (decided 9 October 2026).
- Sign out.

## 2. Search / Ask / Do

The one Search box has three uses. Ask and Do are part of the optional AI assistant, which the school switches on, and limits to chosen roles, in Settings, Modules On/Off.

| Use | Example | What happens |
|---|---|---|
| Search | "Ravi Kumar", "SS/2026/00123", "9876..." | Shows matching records and pages. Nothing changes. |
| Ask | "How many class 8 students are below 75% attendance this month?" | Shows an answer in plain words with the numbers, the source and a link to the list behind it. Nothing changes. |
| Do | "Add Ravi to class 5", "Send fee reminder to class 3 defaulters" | Prepares the action as a filled form or preview. The person checks it and presses the normal button. Only then does anything change. |

The box decides which use is meant from the words. When it is not sure, it shows the search results first and offers "Ask this" and "Do this" below them (inferred).

When AI is on, Ask also works in three more ways (decided 9 October 2026):

- **Ready-made questions.** With an empty box, below the shortcuts, Search shows 4 to 6 questions to ask for the person's role, for example Accountant: "Who has not paid term 2?"; Principal: "Which classes are below 75% attendance this week?" Tapping one asks it. Only the roles allowed to use Ask see them, and only questions about data the person may see (inferred: the questions per role).
- **Ask knows the page you are on.** On a class page, "Who is absent most?" means that class; on Defaulters, "How much is pending?" means that list with its filters. The answer always says which page and filters it used ("For 5 A, this month"), and the person can widen it to the whole school.
- **Act on the list behind an answer.** When an answer is a list (for example "23 students"), it offers the normal actions for that list: send message, send fee reminder, export. Each opens the usual form or preview with recipient count and cost; nothing changes or goes until a person presses the button (rule 4 in 2.1).

### 2.1 AI safety rules (apply everywhere AI appears)

These rules apply to Ask, Do, Smart Import, AI auto-reply to enquiries, student insights, early warnings, forecasts, the teacher assistant, AI question papers and translation of typed messages into each parent's language (module 11; the sender sees and can edit each translation, and the parent's copy is labelled "Translated from English") (decided 9 October 2026).

1. **Real data only.** AI uses only the school's own records, and only those the person is allowed to see. It never uses one school's data for another school.
2. **No invented facts.** If the data does not answer the question, AI says so ("I could not find attendance for class 8 this month") and offers the closest screen. It never guesses a number, name, date, fee amount or rule. Every number in an answer links to the records behind it.
3. **Suggestions look like suggestions.** Anything AI writes or proposes carries a "Suggestion" label and a different background. A suggestion becomes real only when a person edits or accepts it.
4. **A person confirms every change.** Do never saves, sends, approves, pays, cancels or deletes by itself. It opens the same form or preview a person would use, already filled, and the person presses the button. The same rules, limits and approvals apply as if the person had filled the form. This includes actions offered on the list behind an Ask answer (send message, send fee reminder, export) (decided 9 October 2026).
5. **AI cannot approve.** AI cannot decide anything in the Approvals list, cannot cancel or refund a payment, cannot publish results, and cannot send a message to more than one person without the normal preview with recipient count and cost (inferred: the list of blocked actions).
6. **Logged.** Every Ask question, every Do preparation and every change confirmed from a Do preparation is written to the Audit Log, marked "prepared by AI, confirmed by <person>".
7. **Private data stays private.** Fields marked restricted or highly restricted (for example Aadhaar numbers and counselling notes) are never shown in an AI answer unless the person can already see them, and are never sent outside the school's systems for AI processing (inferred).
8. **Easy to switch off.** The school can switch AI off as a whole or per role. With AI off, the box is a plain Search box and no AI labels appear anywhere.

## 3. How approvals work

One **Approvals** list in the top bar replaces the separate approval screens of the old software. It holds every request waiting for a yes or no: leave (staff and student), discounts and concessions, refunds, expenses, purchases, admissions, certificates (including TC), salary and payroll, attendance corrections, marks moderation, notices, scholarships, transport changes, outing passes, asset disposal, fee payments waiting for verification (when that step is on), data deletion requests and user join requests.

### 3.1 The Approval record

Every request creates one **Approval** with: what it is about (a link to the record), who asked and when, the amount if there is one, the reason given, the current approver, the status and the full history.

Status flow: **Waiting** → **Approved** or **Rejected**. Also **Withdrawn** (the requester takes it back before a decision) and **Escalated** (moved to the next approver after the waiting time) (inferred: status names).

### 3.2 Who approves

- Approval rules are set once in Settings, Forms & Approvals: for each kind of request, who approves (a role or a named person), up to which amount, how many steps, and when to escalate. Modules show these limits on their own settings page but do not store a second copy (inferred).
- Default rules when the school has not set any (inferred): Principal approves everything; Accountant may approve expenses up to ₹5,000; class teachers approve student leave of up to 2 days for their own section.
- A person never approves their own request. If the requester is the only approver, the request goes to the next step or to the Principal (inferred).
- A request is shown only to people allowed to decide it. The badge count shows only those.

### 3.3 What the approver sees and does

- The list shows: type icon, one-line summary ("Refund ₹2,000 to Ravi Kumar, 5 A"), requester, waiting time, amount. Filters: type, waiting longer than 2 days (inferred), campus.
- Opening an item shows the full request and the facts needed to decide, taken from the record (for example the student's fee ledger for a refund, the leave balance and timetable impact for staff leave).
- **Approve** needs one tap. **Reject** needs a reason (minimum 5 characters, inferred). **Ask for change** sends it back to the requester with a note (inferred).
- Several items of the same type can be approved together with a preview and a result summary (see P11).
- Approvals work on a phone: each item fits one screen with Approve and Reject buttons at the bottom.

### 3.4 After a decision

- The requester gets a notification with the decision and the reason.
- The linked record moves on by itself (for example approved leave reduces the balance; an approved refund becomes ready to pay).
- Every decision is written to the Audit Log. A decision cannot be edited. A mistaken approval is undone by the normal reversal of the record (for example cancelling the leave), never by changing the history.
- If an approver does nothing within the escalation time set in Forms & Approvals (default 2 working days, inferred), the request moves to the next approver and both are told.

## 4. Notifications (no spam)

A **Notification** is an alert inside School OS for one staff member or student login. Messages to parents are not notifications; they are sent through Communication by WhatsApp, SMS or email, because there is no parent login. What a parent can look up by themselves (fees, receipts, attendance, notices, datesheet, report cards, consent) is on their **Parent Link** (module 11, decided 9 October 2026).

Rules:

1. **Only for this person.** A notification goes only to people who need to act or asked to know: the approver, the owner of a task or enquiry, the teacher of the class, the person whose request was decided.
2. **Opens the right screen.** Every notification has one target screen. Tapping it opens that screen with the record already open.
3. **One event, one notification.** The same event never creates two notifications for the same person. Repeated events of the same kind within 30 minutes are merged into one line with a count, for example "5 new fee payments" (inferred: the 30 minutes).
4. **Not for your own actions.** People are not notified about things they did themselves (inferred).
5. **Clears itself.** When the work is done (the approval is decided, the task is closed), the related notification is marked done for everyone who received it (inferred).
6. **People choose the channel.** In Profile, each person chooses for each type whether they get it in the app only, as a push alert, or also by email or WhatsApp where the school allows it. Default: in-app and push for approvals and tasks; in-app only for everything else (inferred).
7. **Some cannot be switched off.** Security alerts (new sign-in, password changed) and approvals waiting on this person cannot be switched off (inferred).
8. **Push respects the phone.** Push alerts use the installable web app. Each push carries the same link as the in-app notification.
9. **Kept tidy.** Read notifications older than 90 days move to an archive the person can still search (inferred).

The bell list shows unread first, newest first, with a "Mark all read" action.

## 5. Roles and permissions in plain words

- A **Role** is a named set of things a person may do, such as Principal or Accountant. A person can have more than one role.
- Each role says, for every module: **view**, **create**, **edit**, **archive** (instead of delete), **approve**, **export** and **print**.
- Each role also has a **scope**: whole school, one campus, chosen classes, or own records only. A class teacher sees only their sections; a subject teacher sees only the classes they teach.
- Some fields are **restricted** (for example Aadhaar numbers, salary, private student notes) or **highly restricted** (for example counselling notes). Roles that may not see them never get them, on screen, in exports, in search or in AI answers.
- Some roles can be limited by **channel**: web only, mobile only, or API.
- Sensitive roles (Principal, Accountant, School Admin) must use two-step login (a one-time code) (inferred: which roles; the feature is two-step login for sensitive roles).
- The menu shows only the modules a person's roles allow. Hidden items are also blocked on the server. Every permission is checked on the server, never only hidden on screen.

### 5.1 Roles ready from the first day

| Role | What they get by default |
|---|---|
| School Admin | Everything, including Settings. Usually the school owner or office head (inferred: name and scope). |
| Principal | Everything, with Dashboard, Approvals and Reports first. Approves leave, discounts, refunds and results. |
| Accountant | Fee Management, Finance Management, Salary Management and money reports. No marks, no private student notes. |
| Teacher | Only their own classes: Take Attendance, Time Table, Homework, Marks Entry, lesson plans and those students' profiles, plus their own leave and salary slips. |
| Receptionist / Front Office | Front Office, new enquiries in Admission Management, student search for pickup, and messages to parents. |
| Class Teacher | Everything a Teacher has, plus their whole section: its register, attendance corrections, student leave, every profile in the section and report card remarks. |
| Transport In-charge | Transport Management only, plus messages to parents of a route. |
| Librarian | Library Management only, with a student and staff search. |
| Hostel Warden | Hostel Management: rooms, beds, roll call, outings, visitors and mess. |
| Store Keeper | Inventory Management: stock, issues, purchases and assets. |

These ten ready roles are the same in every file (decided 9 October 2026). The full table is in `05-roles.md`.

Role templates the school can switch on: Vice Principal, Academic Head, HR, Office Staff, Exam In-charge, Admission Counsellor, Counsellor (can see counselling notes), Gate Security, Driver (a staff driver or a hired one, with a login for the driver app) and Student (only for schools giving students logins). The school can copy and change any role, or create new ones, in Settings, Users & Permissions. Parents are not a role: they use Parent Link, which has no login.

## 6. Mobile layout rules

Every screen works on phone, tablet and computer. School OS is an installable web app (PWA). The teacher mobile app is this same app on a phone, opening on the teacher's home. Teachers on iPhones add it to the home screen to get alerts (iOS 16.4 or later). Bus drivers get a small native Android app with Transport, because a web app cannot reliably send the bus's location in the background (decided 9 October 2026). Parent Link is a phone-friendly page, not an app.

| Width | Layout (inferred breakpoints) |
|---|---|
| Phone, under 600 px | Menu in a slide-out drawer; bottom bar with Home, Search, Approvals, Notifications, Me. One column. |
| Tablet, 600 to 1023 px | Collapsible side menu. Two columns where useful (list and detail side by side in landscape). |
| Computer, 1024 px and wider | Full side menu with the 20 items. Lists as tables. |

Rules:

1. **One main action per screen**, in a fixed button at the bottom on phones (for example "Save attendance", "Collect ₹5,000").
2. **Lists become cards on phones.** Each card shows the 3 or 4 most important fields; the rest open on tap. No horizontal page scroll. Wide grids (Time Table, marks entry, attendance register) scroll inside their own box with the first column fixed.
3. **Touch targets** at least 44 by 44 px, with space between destructive and normal buttons.
4. **Forms are one column on phones**, with the right keyboard for each field (number pad for amounts and phone numbers, date picker for dates).
5. **Use the phone.** Photos come straight from the camera (bill photos, visitor photos, documents, student photos). Scanning a QR or barcode uses the camera (QR attendance, library books, ID cards).
6. **Screens designed per role.** A teacher on a phone sees today's classes first; an accountant sees Collect Fee first; a driver sees today's trips.
7. **Poor internet.** For schools that switch on offline mode, attendance and transport trips can be taken offline and sent when the connection returns. The screen shows "Saved on this phone, will send when online" and never loses the entry. What the phone keeps, and what happens when two people mark the same register or the lock time passes offline, is in `08-platform-security.md` §10.
8. **Printing from a phone** opens the PDF; it does not try to print a screen layout.

## 7. Shared patterns every module uses

Module specs refer to these as P1 to P20.

### P1. Lists

- Every list has: a search box, quick filters as chips, sort by any column shown, paging (25 rows per page by default, inferred), a count ("Showing 1 to 25 of 432") and Export.
- Default filters fit the person: the current academic year, their campus, and for teachers their own classes.
- Each row shows the record's actions (P12). Selecting rows shows bulk actions (P11).
- Lists open fast: under 2 seconds for 5,000 rows on a normal connection (inferred).

### P2. Filters

- The most used 2 or 3 filters are visible; the rest sit under "More filters".
- Active filters show as chips with an × to remove each, plus "Reset".
- The page address keeps the filters, so a filtered list can be shared or bookmarked (inferred).
- The last filters a person used on a list are remembered for them (inferred).

### P3. Forms

- Ask only what is truly needed now. Everything else sits under "More details" or can be added later from the record.
- Fill what the system knows: today's date, the current year, the person's campus, the class already chosen on the list, the parent's details already on file, the fee due already calculated.
- Mark required fields with a star and explain each unusual field with one line of help text below it (this replaces the old "HOW TO USE" pop-ups).
- Check each field when the person leaves it and say how to fix it (P7). Check everything again on the server.
- Warn about likely duplicates before saving (same phone, same name and date of birth, same bill number) and offer "Open existing" or "Save anyway".
- Long forms keep a draft so nothing is lost if the page closes (inferred).
- Phone numbers default to +91 and check 10 digits for India (inferred). Dates show as DD-MM-YYYY. Money shows in rupees with Indian grouping (₹1,16,400).

### P4. Confirmations

- Ask for confirmation only before actions that are risky, affect many records, send messages or cost money. Do not ask for routine saves.
- The confirmation says exactly what will happen, to how many records, and whether it can be undone. Example: "Send fee reminder to 48 parents by WhatsApp. Cost: 48 credits. This cannot be unsent."
- The confirm button repeats the action ("Send to 48 parents"), never just "OK".
- For the most sensitive changes (payment gateway credentials, closing an academic year, removing a module's data from view), the person types a word, such as the gateway name, to confirm.

### P5. Undo and recovery

- Simple changes (marking a status, moving a student between sections, archiving) show an "Undo" button for 10 seconds (inferred: 10 seconds).
- Archived records can be found with the "Archived" filter and restored.
- Imports can be undone as a whole from the import history.
- Locked money and marks records are corrected by a reversal or adjustment with a reason, never by editing or deleting. The original stays visible.
- Where something cannot be undone (a message already sent), the confirmation says so before it happens.

### P6. Empty states

- An empty screen says what is missing, why, and offers one button to fix it. Example: "No students in Nursery A yet. Add students or import from Excel."
- Choices that would lead to an empty or broken result are not offered. Example: classes with no students are not offered when setting homework.
- First-use empty states show a short example of what the page will look like (inferred).

### P7. Error messages

- Say what happened, why, and what to do, in plain words: "Phone number has 11 digits. Indian mobile numbers have 10 digits." Never show internal codes or record IDs.
- Show the message next to the field, and a summary at the top when there are several.
- Keep everything the person typed. On a network error, keep the entry and offer "Try again".
- When a rule blocks an action, name the rule and where it is set: "Attendance for 06-10-2026 is locked after 11:00 AM (Attendance Settings). Ask the principal for a correction."

### P8. Export

- Every list and report exports to Excel, CSV and PDF, using the filters on screen.
- The file shows the school name, the filters used, who exported it and when.
- Only fields the person may see are exported.
- Every export is written to the export log (Settings, Data Backup & Security).
- Large exports run in the background and send a notification with a download link when ready.

### P9. Print

- Printing uses ready designs from Settings, Document Designs (receipts, certificates, ID cards, admit cards, report cards, letters), with the school's logo, signatures and the right academic year.
- Batch printing (ID cards, admit cards, report cards) prints by class, in batches of up to 50 (as in the old software), and shows the total count first.
- Every printable document can also be downloaded as a PDF and shared by WhatsApp or email.
- Lists print in a clean layout with the title, filters and date.

### P10. Import

Every Import button uses one shared importer from Settings, Data Backup & Security:

1. Download the CSV template for this import.
2. Upload a file (CSV or Excel).
3. Match columns (auto-matched by name; AI suggestions when Smart Import is on).
4. Preview with each row's problems shown in plain words.
5. Import the good rows; download the bad rows with their errors to fix and re-import.
6. Summary: added, updated, skipped.
7. Undo the whole import from the import history.

### P11. Bulk actions

- After selecting rows, the bar shows the count and the allowed actions.
- Every bulk action shows a preview (what will change for each record) before it runs, and a result summary after ("45 updated, 2 skipped: no phone number").
- Bulk actions follow the same rules and approvals as single actions.

### P12. Actions on each record

Each record shows the actions a person can take on it, where they are looking. On a student: Collect fee, Mark attendance, Send message, Print TC, and so on. Actions the person may not take are not shown.

### P13. Archive, not delete

Records are archived, not deleted. Archived records drop out of lists, counts and dropdowns but stay in history, reports for past periods and the Audit Log. Hard deletion happens only through an approved data deletion request in Settings, Data Backup & Security.

### P14. Audit trail

Every create, change, archive, approval, export and sign-in writes an **Audit Log Entry** with who, what, when, from which device, and the before and after values. People with permission see a "History" link on each record.

### P15. Loading and success states

- Show a light skeleton while loading, never a blank screen.
- After saving, show a short success message that says what happened ("Receipt SS/2026/00123 created. Parent informed on WhatsApp.") with a link to the result.

### P16. Help text

Short help sits next to the field or action it explains. There are no separate help pop-ups to discover.

### P17. Words, numbers and dates

- Same word for the same thing everywhere (see the word list in section 9).
- Screens and messages in the school's enabled languages: English, Hindi, Telugu, Tamil, Kannada, Malayalam, Marathi and Bengali.
- Dates DD-MM-YYYY; times in 12-hour format with AM and PM (inferred); money in rupees unless the school uses several currencies.

### P18. Past years are read-only

When the top bar shows a closed academic year, every create, edit and delete button is hidden, and a yellow strip says why (see 1.2).

### P19. Modules and optional pages

- A module switched off in Settings, Modules On/Off disappears from the menu, Search, Dashboard tiles and other modules' screens. Its data is kept and returns when it is switched on again.
- Optional pages appear only when the school switches them on, usually in that module's settings page.
- Accessible: everything works with a keyboard, has enough contrast and is readable by screen readers.

### P20. What's new notes (decided 9 October 2026)

- When a screen changes after an update, the first time a person opens it they see a short note at the top saying what changed (for example "Collect Fee: the Pay button is now at the bottom on phones"), in plain words, with a "Got it" button.
- Each note is shown once to each person, only on the screens their roles can open. It never blocks the screen or hides the main action.
- Every note stays in Profile, What's new (see 1.4), newest first.
- Small fixes that change nothing a person sees do not get a note (inferred).

## 8. What the software does by itself (the 15 automations)

Each automation belongs to one module, which builds it. Other modules only react. Every automation must be **safe to run twice**: running it again never creates a second receipt, message, record or charge (inferred: idempotency rule).

| # | When | What happens | Built in |
|---|---|---|---|
| A1 | Fee paid | Receipt, student balance, Day Book, Dashboard, Parent Link and parent's WhatsApp update together. The parent's message uses SMS backup when the school has it on (decided 9 October 2026). | 06 Fee Management (Day Book posting in 07) |
| A2 | Admission approved | Student record, admission number, class, section, roll number, parent link, fee plan and ID card are created without typing again. | 02 Admission Management |
| A3 | Enquiry at the front desk | It appears in Admission Enquiries with an owner and a follow-up reminder. | 16 Front Office hands off; 02 receives |
| A4 | Attendance marked | Parents of absent students get one message, register and Dashboard update, anyone below 75% is flagged to class teacher and principal. The absence message uses SMS backup when the school has it on (decided 9 October 2026). | 05 Attendance Management |
| A5 | Teacher leave approved | Leave balance drops, substitutions are suggested for that teacher's periods, and the leave reaches the salary. | 09 Staff & HR (substitutions in 04, salary in 10) |
| A6 | Salary approved, then paid | On approval, salary slips are made and staff are told. When the month is marked Paid, the payment goes into the Day Book (decided 9 October 2026). | 10 Salary Management |
| A7 | Fee due date comes | Reminders go on the set days, late fee is added after the grace period, Defaulters list updates. Reminders use SMS backup when the school has it on (decided 9 October 2026). | 06 Fee Management |
| A8 | Online payment received | Posted only after the gateway confirms it, never twice, matched automatically; failed payments are flagged. | 06 Fee Management |
| A9 | Marks entered | Total, percentage, grade and rank are worked out; on result day report cards are ready and parents are told. The result message uses SMS backup when the school has it on (decided 9 October 2026). | 08 Examination & Results |
| A10 | Datesheet published | Exams appear in the School Calendar and Time Table, admit cards are ready, reminders go to parents. | 08 Examination & Results |
| A11 | Holiday added | Attendance is switched off for that day and reports leave it out. | 18 Events & Calendar (School Calendar page, built with 05) |
| A12 | Student given a bus stop | The stop's transport fee is added to the student's fees, and the bus seat count updates. | 12 Transport Management |
| A13 | Year-end promotion | Students move to the new class with the new year's fees; last year's record stays unchanged. | 03 Student Management |
| A14 | Student leaving | Fee dues and library books are checked before the TC can be printed. | 03 Student Management |
| A15 | Something about to expire or run out | Staff documents, driver licences, bus papers, warranties and low stock give a reminder in time. | Each owning module (09, 12, 14) |

Every parent message sent by an automation goes through Communication: it uses the school's template, respects opt-outs, is written to Message History and appears in the automation log in Message Settings. **SMS backup** (decided 9 October 2026): for fee, attendance and result messages (A1, A4, A7, A9), if WhatsApp or app delivery fails, or the message is not read within the wait time (default 2 hours, inferred), the same message goes by SMS. The school switches it on or off per message type in Message Settings, and the SMS are counted in credits. A backup SMS is sent at most once per message per parent, so the safe-to-run-twice rule still holds.

## 9. Words to use on screen

| Say | Do not say |
|---|---|
| Student, Parent, Guardian | User, contact, lead (for an admitted student) |
| Class, Section | Grade-group, batch (unless the school names its classes that way) |
| Enquiry | Lead, CRM |
| Fees due, Balance | Outstanding invoice amount |
| Receipt | Invoice ID |
| Cancel payment (with a reason) | Delete payment |
| Archive | Delete |
| Time Table | Schedule grid |
| Datesheet | Exam schedule object |
| Salary slip | Payslip document (the record is Payslip) |
| Approvals | Workflow queue |

## 10. Owner decisions

The owner decided these on 9 October 2026. Each module that depends on them marks them "decided".

| # | Question | Decided | Modules affected |
|---|---|---|---|
| D1 | Which online payment gateway to connect first: Razorpay, PhonePe or Easebuzz? | **Razorpay**. It is already active in the demo school and most Indian schools know it. Cash and UPI at the counter work from day one. | 06 Fee Management, 20 Settings, 02 (application fee), 18 (event payments) |
| D2 | May staff delete a fee payment? | **No.** A wrong payment is cancelled with a reason and stays on record, so receipts, balances and the Day Book always match. | 06 Fee Management, 07 Finance Management, 20 Settings |
| D3 | Should Transport, with live bus tracking, be in the first sellable version? | **No.** Transport is built first in Stage 4. Not every school runs buses. | 12 Transport, 01 Dashboard, 02 Admission, 03 Student, 06 Fee, 11 Communication |
| D4 | Parent app or login? | **Parent Link in the first sellable version:** one secure link per guardian, no password, a one-time code on a new phone. Shows fees due with Pay, receipts, attendance, notices, datesheet, report cards and consent forms. A full parent app comes after Stage 4. | 11 Communication (owns it), 02, 03, 05, 06, 08 |
| D5 | Report cards in the first sellable version? | **Yes.** Examination & Results is built 10th, in Stage 2; the Dashboard is 11th. | 08 Examination & Results, 01 Dashboard |
| D6 | Where do backups, data separation and security live? | **In `08-platform-security.md`,** built in Stage 1. The Super Admin console (`07-super-admin.md`, section 14 below) has only DREAM TEAM's own screens. | Every module |
| D7 | Moving in from old software | **Workflow 15, "Switching to School OS",** with imports for old dues, past receipts (read-only, "brought in"), opening balances, enquiries, items and assets. | 02, 06, 07, 14, 20 |
| D8 | Indian rules | **DPDP Act 2023 consent** by the guardian with a one-time code, versioned consent texts; **SMS DLT** IDs required; **GST** on taxable fee heads; a **financial year** separate from the academic year. | 02, 03, 06, 07, 11, 19, 20 |
| D9 | PF, ESI and TDS | **PF and ESI calculated; TDS typed in monthly;** Professional Tax optional. | 10 Salary Management, 19 |
| D10 | School groups | **Group record now;** one login can work in several schools through School Access. | 20 Settings, every module through the School switcher |
| D11 | Phone apps | **Installable web app for staff;** a small **Android driver app** with Transport; a native parent app with the full parent app later. | 12 Transport, this file §6 |
| D12 | When salary and expenses reach the Day Book | **When marked paid.** | 07 Finance, 10 Salary |

D4 to D12 were decided by Claude at the owner's request after the gap review; full wording in `school-os/reviews/decisions-2026-10-09.md`.

## 11. Features that live in the top bar or on every screen

These features are not part of any one module. They are built once, here, with module 20 (Settings).

### Top bar

#### Approvals (5)

- [ ] Pending approvals queue with counts (only items the user may decide) (Core) · also shown as a count on Needs Attention
- [ ] One approvals inbox: leave, refunds, purchases, discounts / concessions, admissions, certificates, salary adjustments, transport changes, expenses, attendance corrections (Core)
- [ ] Approval counts and "approval pending" notifications (Core)
- [ ] Approve on mobile (Core)
- [ ] User requests list (Core)

#### Profile (6)

- [ ] Profile menu in the top bar (Core)
- [ ] View and edit my profile (Core)
- [ ] Change password; see and sign out active sessions and devices (Core)
- [ ] My notification preferences (Core)
- [ ] Session and device control (time-outs, sign out everywhere) (Core) · rules in Settings, Users & Permissions
- [ ] "What's new" note shown once when a screen changes after an update, kept in Profile, What's new (Core) (decided 9 October 2026) · pattern P20

#### Messages (1)

- [ ] Messages shortcut in the top bar (Core)

#### Search (4)

- [ ] Module shortcuts / quick links (Core) · replaces Quick Filter
- [ ] Global search across students, staff, parents and records (Core)
- [ ] Search by intent, e.g. "fee Ravi" opens Ravi's fee page (Core)
- [ ] Favourites (Core) · recent and pinned pages; replaces Favorites

#### Notifications (2)

- [ ] Notification centre (bell) (Core)
- [ ] Push notifications that open the right screen (Core)

#### Search (ask in plain words) (5)

- [ ] Ask questions in plain words and get answers with links to act (Optional: schools using AI)
- [ ] Give instructions in plain words, e.g. "Add Ravi to class 5" (Optional: schools using AI)
- [ ] Ready-made questions for the person's role when the box is empty (Optional: schools using AI) (decided 9 October 2026)
- [ ] Ask knows the page you are on, and the answer says which page it used (Optional: schools using AI) (decided 9 October 2026)
- [ ] Act on the list behind an answer: send message, fee reminder or export, through the usual preview (Optional: schools using AI) (decided 9 October 2026)

#### School switcher (4)

- [ ] School switcher for users in more than one school (Optional: school groups)
- [ ] Other schools list (Optional: school groups)
- [ ] Group-level admin across schools (Optional: school groups) · group view
- [ ] One user account working in several schools (Optional: school groups)

### Every screen

#### How every screen behaves (12)

- [ ] Back navigation (Core)
- [ ] Permissions checked on the server, not just hidden on screen (Core)
- [ ] Clear loading, empty, error and success states (Core)
- [ ] Every entry checked on the server (Core)
- [ ] Confirmation before risky actions, and a way to undo or recover (Core)
- [ ] Records archived, not deleted (Core)
- [ ] Lists with paging, search, sort and export (Core)
- [ ] Accessible (keyboard, contrast, screen readers) (Core)
- [ ] Plain words on screen; no internal codes or IDs shown (Core)
- [ ] Show simple options first, more on request (Core)
- [ ] Same words for the same thing everywhere (Core)
- [ ] Bulk actions with preview and a result summary (Core)

#### Lists with search and filter (1)

- [ ] Quick filter on lists (Core)

#### Actions on each record (1)

- [ ] Actions shown on each record, e.g. on a student: collect fee, mark attendance, send message, print TC (Core)

#### AI rules (1)

- [ ] AI safety: only permitted data, human confirms every change, actions logged (Core)

#### Works on phone, tablet and computer (5)

- [ ] Works on phones and tablets (responsive) (Core)
- [ ] Screens designed for each role on mobile (Core)
- [ ] Teacher mobile app (Core)
- [ ] Installable web app (PWA) (Core)
- [ ] Offline mode with sync later (attendance, transport, poor-internet campuses) (Optional: schools with poor internet)

## 12. Not included (do not build)

The owner excluded these. They are listed so nothing is forgotten and nobody builds them by mistake. There is no parent login or parent app: parents get WhatsApp, SMS and email messages, payment links, and their **Parent Link** (module 11, decided 9 October 2026). Features that only look related stay in their modules: the "medical" attendance status and medical leave type, the hostel incident log, emergency contacts and blood group, the emergency broadcast, the transport emergency message, discipline incidents, the online application form, the student app, consent records, the custody flag and staff-recorded student leave.

#### Share the App link (1)

- [ ] "Share the App" link (Optional: schools promoting their app) · removed from menu

#### Moved into School OS: `08-platform-security.md` (decided 9 October 2026) (15)

These were once listed with the Super Admin console. They are now built in Stage 1 or with the module that first needs them. They are no longer "do not build".

- [ ] Each school's data kept separate, with isolation tests (Core) · `08` §1
- [ ] Automatic backups (database and files, with replication) (Core) · `08` §4
- [ ] Point-in-time recovery and disaster recovery (Core) · `08` §4
- [ ] Restore tests (Core) · `08` §4
- [ ] Encryption and secret storage (Core) · `08` §3
- [ ] Rate limits (Core) · `08` §7
- [ ] Time-limited file links (Core) · `08` §8
- [ ] Versioned internal API (Core) · `08` §7
- [ ] Payment API (Core) · gateway confirmations, `08` §7, built with Fee Management
- [ ] Attendance device API (Optional: schools using attendance devices) · `08` §7, built with Attendance Management
- [ ] Transport / GPS API (Optional: schools tracking buses by GPS) · `08` §7, with the Android driver app, built with Transport Management
- [ ] API keys / tokens with scopes (Optional: later, when a school asks) · `08` §7
- [ ] Student data API (Optional: later, when a school asks) · `08` §7
- [ ] Open platform / app marketplace (Optional: future ecosystem) · not planned yet
- [ ] Choice of cloud file storage (Optional: hosting choice) · data stays in India, `08` §1

#### Safety & Health / Medical (14)

- [ ] Student health profile: conditions, allergies, medicines (Excluded)
- [ ] Health tab in Student 360 (Excluded)
- [ ] Medical room visits (Excluded)
- [ ] First-aid log (Excluded)
- [ ] Vaccination records (Excluded)
- [ ] Health screenings (Excluded)
- [ ] Safety incidents (Excluded)
- [ ] Emergency response workflow (Excluded)
- [ ] Parent told about a safety incident (Excluded)
- [ ] Nearby hospital information (Excluded)
- [ ] Health records restricted to authorised staff (Excluded)
- [ ] Medical information and medical documents at admission (Excluded)
- [ ] "Safety Management" menu item (Excluded)
- [ ] Nurse role (Excluded)

#### Parent Portal / parent app (19)

A full parent app is planned after Stage 4 and is not specified here. Items marked "now on Parent Link" are covered in the first sellable version by Parent Link (module 11), without a login.

- [ ] Parent account / login (Excluded)
- [ ] Parent login created at admission conversion (Excluded) · a Parent Link is sent instead when admission is approved
- [ ] One parent account for several children (Excluded) · one Parent Link already covers all of a guardian's children
- [ ] Parent home screen (Excluded) · the Parent Link page is the simple version
- [ ] Parents pay fees online in the app (now on Parent Link)
- [ ] Parents download receipts (now on Parent Link)
- [ ] Parents view attendance (now on Parent Link)
- [ ] Parents view homework (Excluded)
- [ ] Parents request leave (Excluded)
- [ ] Parents book PTM slots (Excluded)
- [ ] Parents track the bus (Excluded)
- [ ] Parents raise a query (Excluded)
- [ ] Parents respond to notices, give feedback, update their profile (Excluded) · consent forms only, on Parent Link
- [ ] Parents upload documents (Excluded)
- [ ] Parent portal views of the child's records (Excluded) · datesheet and report cards are on Parent Link
- [ ] Parents view performance (now on Parent Link: published report cards only)
- [ ] AI answers for parents (Excluded)
- [ ] Parent workspace (Excluded)
- [ ] Parent role and parent mobile flows (Excluded)

#### School Website / CMS (8)

- [ ] Website page manager (Excluded)
- [ ] News on the website (Excluded)
- [ ] Events feed on the website (Excluded)
- [ ] Admission form embedded in the website (Excluded)
- [ ] Notice feed on the website (Excluded)
- [ ] Gallery on the website (Excluded)
- [ ] Results and admission status on the website (Excluded)
- [ ] Website integration (Excluded)

## 13. Open questions

- D1 to D12 above are decided (section 10).
- Should Ask and Do also be available in the eight Indian languages from the first version, or English first? (Screens and messages are multilingual; the AI language scope is not stated in the inputs.)
- iPhone alerts are answered by D11: teachers add the installable app to the home screen (iOS 16.4 or later). Which push service to use is left to the builder.

## 14. Super Admin console (`07-super-admin.md`)

DREAM TEAM SERVICES' own console, separate from the School Master and built at the end of Stage 2 (decided 9 October 2026). It is specified in `07-super-admin.md`; this list only keeps the old feature map's items in one place. It uses School Access the same way as the School switcher (section 1.3).

- [ ] Create a new school account (Core)
- [ ] School account status: trial, active, suspended, closed (Core)
- [ ] School list with status (Core)
- [ ] Organisation / branch / campus structure (Core) · the records (Group, School, Campus) are in School OS, `04-data-model.md`
- [ ] Per-school settings from the console (Core)
- [ ] User lists across schools (Core)
- [ ] School onboarding and onboarding campaigns (Core)
- [ ] Free trials (Core)
- [ ] Plans and which features each plan includes (feature flags) (Core)
- [ ] School subscription: plan, start, renewal (Core)
- [ ] Usage limits per plan (students, messages, storage) (Core)
- [ ] Billing, invoices and renewals (Core)
- [ ] Usage dashboard per school (Core)
- [ ] Support tickets from schools (Core) · later, see `07-super-admin.md` §9
- [ ] Incident records (Core)
- [ ] Announcements and release notes to schools (Core) · later, see `07-super-admin.md` §9
- [ ] App logs (Core) · recorded by School OS (`08-platform-security.md` §11), viewed in the console
- [ ] Error monitoring (Core) · recorded by School OS (`08-platform-security.md` §11), viewed in the console
- [ ] Product usage analytics (Optional: if the company tracks usage)
- [ ] System health page (Core) · the full page is later, see `07-super-admin.md` §9; the console Dashboard shows system alerts
- [ ] Background job monitor (Core) · viewed in the console
- [ ] Platform audit log (Core)
- [ ] Sales CRM / Leads for DREAM TEAM (Core) · later, see `07-super-admin.md` §9
- [ ] API keys for schools (Optional) · later, see `07-super-admin.md` §9
