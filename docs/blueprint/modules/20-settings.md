# 20 Settings

Build order: 1st (Stage 1). School profile, users and roles are needed by every other screen. The top bar and shared patterns in 00-global.md are built with it, and so are the safety basics in `08-platform-security.md` (decided 9 October 2026).

## 1. Purpose

Only school-wide settings; each module keeps its own rules on its last page.

Used by: the School Admin (everything here), the Principal (school profile, users, approvals, designs), and the Accountant (payment gateways, if allowed). Most staff never open Settings.

## 2. Pages

### School Profile

**Purpose:** name, logo, address, board, campuses, language, and school documents such as affiliation papers.

**What the person sees**

- **School details:** name, logo, address, phone, email, website address (text only), affiliation number, GSTIN (optional; needed only when some fee heads are taxable, decided 9 October 2026), and branding colours. A preview shows how the logo and colours look on screens, receipts and certificates.
- **Board and curriculum:** board (CBSE, ICSE, state board, IB, Cambridge, custom). The board sets defaults for grading, report card format and terms; the school can still change them in each module. Two boards in one school (optional).
- **Campuses:** list of campuses with address, head and contact (each campus can have its own fees and branding).
- **Language and region:** screen and message languages (English, Hindi, Telugu, Tamil, Kannada, Malayalam, Marathi, Bengali), default language, time zone, date and number formats, currency (several currencies, optional).
- **Group settings (optional, school groups):** the Group this school belongs to, if any (a School may belong to one Group; set by Add School in the Super Admin console), which settings come from the group, and which this school overrides (decided 9 October 2026). Group screens come later.
- **School documents (document vault):** registration, affiliation, NOCs and other compliance papers, with versions, expiry dates and renewal alerts, verification status, search, preview, and access control with time-limited sharing links.
- **Board compliance settings** (for example board registration numbers and required fields; inferred examples).

**Actions**

- Edit details (each section saves on its own); upload logo.
- Choose the board (shows what it will set: "CBSE: 2 terms, CBSE 9-point grade scale, CBSE report card. Apply?").
- Add or edit a campus.
- Upload a document with expiry date; upload a new version (old versions kept); mark verified; share with a link that expires (default 7 days, inferred).

**Form fields: School details**

| Field | Required | Default | Notes |
|---|---|---|---|
| School name | Yes | From the account | |
| Logo | No (strongly suggested) | | PNG or JPG |
| Address, phone, email | Yes | | |
| Affiliation number | No | | |
| GSTIN | No | | 15 characters, format checked (inferred); printed on tax invoices for taxable fee heads (decided 9 October 2026) |
| Board | Yes | | |
| Default language | Yes | English | |
| Time zone | Yes | Asia/Kolkata (inferred) | |

**Form fields: Upload school document**

| Field | Required | Default | Notes |
|---|---|---|---|
| Document type | Yes | | Registration, affiliation, NOC, fire safety, other (inferred list) |
| File | Yes | | |
| Issue and expiry date | No | | Expiry needed for reminders |
| Who can see it | Yes | School Admin and Principal (inferred) | |

### Users & Permissions

**Purpose:** roles, logins, passwords and what each role can see and approve.

A school's first School Admin is made by DREAM TEAM in the Super Admin console (`07-super-admin.md`). Every later login is made here.

**What the person sees**

- **Users:** every login (staff, admins, drivers, students when student logins are on) with name, username, belongs to (Staff, Student or Driver record), roles, scope, status (**Active**, **Disabled**, **Invited**), last sign-in, two-step login on or off. A User Login belongs to one Staff, Student or Driver record, so a hired driver who is not on the staff can still log in (decided 9 October 2026).
- **School Access:** for a person who works in more than one school or campus of a group, one line per school or campus with the roles and scope there. One User Login can work in several schools this way; the top bar school switcher uses these lines (decided 9 October 2026).
- **Admin accounts:** cards with search, view, message and edit (as in the old software).
- **Roles:** the ten ready roles (School Admin, Principal, Accountant, Teacher, Class Teacher, Receptionist / Front Office, Transport In-charge, Librarian, Hostel Warden, Store Keeper) and the role templates the school can switch on (Vice Principal, Academic Head, HR, Office Staff, Exam In-charge, Admission Counsellor, Counsellor, Gate Security, Driver, Student), plus the school's own roles. For each: number of users (decided 9 October 2026). Office Staff does office work in workflows, such as recording student leave, substitutions, the datesheet and admit cards, and recording a student leaving.
- **One role:** permissions per module and action (view, create, edit, delete, approve, export, print; "delete" always means archive or cancel with a reason, P13), scope (whole school, campus, class, own records), sensitive fields it may see (normal, restricted, highly restricted), channels (web, mobile, API), and approval rights with amount limits. Shown in plain words, grouped by module, with "Select all" per module.
- The side menu of each user shows only the modules their role may use.
- **User requests:** join requests from staff (inferred: from the old User Requests list), approved in Approvals.
- **Password and session rules.**

**Actions**

- Create a user (usually through Add Staff; drivers through Transport; admins directly here), enable, disable, reset password, send a new invite.
- **Disabling a user signs them out everywhere at once**, on every device, and they cannot sign in again until enabled.
- **Reset two-step login** when a person has lost the phone that receives their one-time codes: another School Admin or the Principal resets it, the person sets it up again at their next sign-in, and the reset is logged with who did it and why. The reset also forgets every device remembered for that person, so each asks for the code again. A person cannot reset their own (inferred: the last rule).
- Give a person School Access to another school or campus of the group, with roles and scope there (only for school groups).
- Create a role by copying an existing one; change permissions; archive a role with no users.
- Give one person extra permissions or a narrower scope (shown as exceptions).
- Set password format rules (minimum length, letters and numbers; inferred defaults: 8 characters with a number).
- Require two-step login (one-time code) for sensitive roles. It is on from the first day for School Admin, Principal and Accountant (schools that existed before were switched on too, unless their School Admin had switched it off). A School Admin may switch it off, after a warning that anyone who learns one of their passwords could then sign in; the change is in the audit log. Nobody is locked out: a person no code can reach signs in with the password, it shows in Security alerts, and Data Backup & Security lists who still needs a mobile number or email (added 18 October 2026). The code is asked once per device: after it, that device is remembered until the person signs out there, signs out everywhere, changes their password or is switched off, or does not use it for 180 days; on a shared computer they tick "Shared computer: ask for the code every time" (decided by the owner, 22 October 2026; `00-global.md` §1.4).
- Session rules: time-out after inactivity (default 30 minutes on computers, 7 days on the installed phone app; inferred), sign out everywhere.
- Task access levels (full task manager or own tasks only) per role.
- **Permission change alert:** whenever anyone's roles, permissions, scope or exceptions change, every School Admin gets an alert saying who changed what for whom. It cannot be switched off (inferred: cannot be switched off).

**Form fields: Add admin**

| Field | Required | Default | Notes |
|---|---|---|---|
| Full name | Yes | | Error if blank: "Full name is needed" |
| Phone | Yes | +91 | |
| Email | No (Yes for email invite) | | |
| Username | Yes | Made from the school's format | Unique |
| Role | Yes | School Admin | |
| Login | Yes | Send invite | Invite or temporary password |

**Form fields: Reset two-step login**

| Field | Required | Default | Notes |
|---|---|---|---|
| User | Yes | | Cannot be the person doing the reset |
| Reason | Yes | Lost phone | Lost phone, new phone, number changed, other |
| Check done | Yes | | How the person was confirmed, for example "in person at the office" (inferred) |

### Payment Gateways

**Purpose:** connect Razorpay, PhonePe, Easebuzz and others, and test the connection.

**What the person sees**

- List of gateways: name, type (Online or Cash deposit), provider, status (**Active**, **Inactive**), test or live, last changed, actions (Edit, Test).
- Providers available: PhonePe, Razorpay, Cashfree, Easebuzz, PayU, Paytm, SabPaisa, HDFC SmartGateway, Stripe, POS, and cash or cash deposit; more can be added by DREAM TEAM SERVICES.
- A note: which class or fee head uses which gateway is set in Fee Management, Fee Settings.
- When the school sends fees into different bank accounts (Fee Management, Fee Settings), each linked bank account is added to the Razorpay account here, so Razorpay can split online payments (decided 9 October 2026; inferred: Razorpay Route).

**Actions**

- **Add a gateway:** display name, provider, the provider's fields (for example merchant key and salt), environment (test or live), the webhook address (filled automatically for the provider and read-only), and "Enable".
- **Test connection** before saving and any time later; the result says what worked and what did not in plain words.
- Edit credentials or switch active or inactive: the person types the gateway name to confirm (P4).
- Secrets are stored encrypted and are never shown again after saving (only the last 4 characters, inferred).
- Several accounts of the same provider (for example "Razorpay Class A") are allowed when Fee Settings routing is by class, class group or fee head.

**Form fields: Add gateway**

| Field | Required | Default | Notes |
|---|---|---|---|
| Display name | Yes | The provider name | Help: "Use a distinct name when you add more than one account of the same provider" |
| Provider (gateway code) | Yes | | Providers already added are hidden unless routing allows several accounts |
| Merchant key, salt (or the provider's fields) | Yes | | Encrypted; never shown again |
| Environment | Yes | Test (sandbox) | Test or live |
| Webhook address | Shown | Filled for the provider | Read-only, with Copy |
| Enable | Yes | Off | Turn on after a successful test (inferred) |

Decided **D1**: Razorpay is the first gateway connected.

### SMS, WhatsApp & Email

**Purpose:** connect SMS, WhatsApp and email, see message credits, and turn each one on or off.

**What the person sees**

- One card per channel: SMS, WhatsApp, email, app notifications (and voice calls when used): status (Connected, Not connected, Error), provider, on or off switch, credits left (for paid channels), last test.
- The SMS card also holds the school's **DLT entity ID** and **sender header** registered on the telecom DLT portal. Every SMS template then carries its own DLT template ID (Communication, Message Templates), and an SMS can only be sent from a template with one (decided 9 October 2026).
- Credit history: added and used by month (inferred).
- **Notification settings:** which kinds of in-app and push notifications the school uses, and the default channels for staff (each person can then choose in their Profile).

**Actions**

- Connect the WhatsApp provider (WhatsApp Business), the SMS provider with sender ID, and the email provider; test each with a message to oneself (inferred).
- Turn each channel on or off for the school.
- Low-credit alert level (inferred: default 100 credits), which appears on the Dashboard (Needs Attention).

**Form fields:** provider, account details (encrypted), DLT entity ID and sender header (SMS, both required before SMS can be switched on, decided 9 October 2026), from name and address (email), on or off.

### Document Designs

**Purpose:** designs for receipts, certificates, ID cards, admit cards and report cards, with the school's logo and signatures.

**What the person sees**

- Design list by type: fee receipt, fee invoice, tax invoice (for taxable fee heads, with the school's GSTIN; decided 9 October 2026), fee certificate, salary slip (decided 9 October 2026), transfer certificate, bonafide, study certificate, character certificate, experience letter, offer letter, ID cards (student, staff, bus pass, library card), admit card, report card, final result, visitor pass, and letters. Each shows the design in use and a preview with sample data.
- Ready-made designs for each type (for example Classic, Modern, CBSE format), which the school can choose and adjust.

**Actions**

- Choose a ready design; adjust it in the template editor: layout, text, logo, signatures, and **merge fields** (for example student name, class, admission number, amount, date) picked from a list.
- **ID card designer:** size (standard, credit card, mini, vertical), orientation, background colour or image, school branding, layout and cards per row; fields to show (photo, name, admission number, roll number, class, date of birth, blood group, contact number, parents' names and phones, address, and others); school details (name, phone, address, website); QR code and library barcode on or off; academic year and valid-until date. Opened from Certificates & ID Cards as "ID card settings".
- **Digital signatures (optional):** add a signature image or a digital signature for chosen signatories.
- Preview with a real record before saving; every design keeps its versions (inferred).
- Documents always use the right academic year and the branding of the student's campus.

**Form fields:** design type, chosen ready design, editor changes, signatories.

### Forms & Approvals

**Purpose:** extra fields on forms, custom forms, and who approves what up to which amount.

**What the person sees**

- **Custom fields:** extra fields added to records (students, parents, staff, enquiries, applications and others), with type (text, number, date, choice, yes or no, file), required or not, and who can see them.
- **Form builder:** custom forms (for example an appraisal form, a consent form) built from fields; **conditional fields** (optional) that show only when another answer matches.
- **Approval rules (workflow builder):** for each kind of request (leave, concession, refund, expense, purchase, admission, certificate, payroll, attendance correction, marks moderation, notice, transport change, outing, asset disposal, data deletion): the steps, who approves at each step (role or named person), amount limits per step, and escalation after N days.

**Actions**

- Add, edit, reorder or archive a custom field (archiving keeps the data already entered).
- Build a form; preview; publish.
- Edit an approval rule; see a plain-words summary ("Refunds: up to ₹5,000 the Accountant approves; above that, the Principal. Escalate after 2 days.").

**Form fields: Custom field**

| Field | Required | Default | Notes |
|---|---|---|---|
| Record | Yes | | Student, parent, staff and others |
| Label | Yes | | |
| Type | Yes | Text | |
| Required | Yes | No | |
| Choices | Yes for choice type | | |
| Visible to | Yes | Everyone who can see the record | Or restricted |

**Form fields: Approval rule step**

| Field | Required | Default | Notes |
|---|---|---|---|
| Request type | Yes | | |
| Step approver | Yes | Principal | Role or person |
| Up to amount | No | No limit | |
| Escalate after | No | 2 working days (inferred) | |

### Modules On/Off

**Purpose:** switch modules on or off, start from a school-type template, and connect Google, Tally, printers and other tools.

**What the person sees**

- The 20 modules with on or off switches (Dashboard, Settings and the core modules cannot be switched off; inferred list: Transport, Library, Inventory and Hostel, and optional pages inside modules, can be switched). Switching off hides a module everywhere but keeps its data (P19).
- **School-type templates:** for example "CBSE day school", "State board day school", "Boarding school", "Pre-school" (inferred names). A template switches on the right modules and fills sensible settings. The screen shows what a template will change before applying it.
- **System preferences:** general switches (for example week start day, roll number order; inferred examples).
- **AI assistant:** on or off, and which roles may use it.
- **AI features list:** under the AI assistant, each AI feature with its own switch: Ask and Do (with ready-made questions), Smart Import, AI auto-reply to enquiries, student insights and early warnings, forecasts, the teacher assistant, AI question papers, and **translation of typed messages into each parent's language** (default off; the sender previews and can edit each translation, and the parent's copy is labelled "Translated from English"; used in Communication, Send Message) (decided 9 October 2026). The AI safety rules in `00-global.md` section 2.1 apply to all of them.
  - A feature that is not built yet says **Coming soon** and cannot be switched on: Ask and Do, AI auto-reply to enquiries and translation, for now. **AI question papers** is not built and not listed (decided 17 October 2026: free tools already do this). Each feature, wherever it appears, is used only by the roles chosen for the AI assistant; with AI off, no AI label, "Ask" or AI sparkle shows anywhere (gap list G24, 18 October 2026).
  - **Smart Import** is switched here only (it was also a Student Settings box; schools that had that box ticked keep it on).
- **AI service** (added 18 October 2026, gap list G28): whether DREAM TEAM has connected the AI service ("Not connected yet: DREAM TEAM connects it" until then; every feature keeps working on School OS's own rules), the school's requests and estimated cost this month, today's requests, and **Most AI requests a day** (empty: DREAM TEAM's limit; a school may choose fewer, never more). Only what a task needs is sent; restricted fields (Aadhaar, bank details, salary, counselling notes) never are; every request is logged with no personal content.
- **Integrations list** with health status (Connected, Error, Not connected): Google and Microsoft accounts, Tally, printers and scanners, CCTV links, outside learning platforms, IoT devices, webhooks to other systems, the GPS tracking provider, and attendance devices.

**Actions**

- Switch a module or optional page on or off (switching off asks for confirmation and says what will be hidden).
- Apply a template (shows the changes; only fills settings not already set, unless the person chooses otherwise; inferred).
- Connect, test or disconnect an integration. A test calls only addresses on the public internet: https only (Tally may use http), never the server itself, a private network or the cloud's metadata address, with the name looked up and checked first, no redirects followed and a 5-second limit (added 18 October 2026).
- Turn AI on or off and choose roles; switch each AI feature, including translation of typed messages, on or off (decided 9 October 2026).

**Form fields:** switches; template choice; per-integration connection fields.

### Data Backup & Security

**Purpose:** download all school data, see who changed what and when, login history, consent and privacy requests, and when the school's data was last backed up.

**What the person sees**

- **Backups:** "Last backup: today, 2:00 AM". The school sees its last backup time here; how and how often server backups run, and how a restore is done, are described in `08-platform-security.md`, section 4 (decided 9 October 2026). The school can still download all its own data at any time (below).
- **Import and export tools:** CSV templates for each import, the column matching step, import preview, import error report, partial import (good rows only), import history with **Undo** (the shared importer, P10). Each kind of record is imported and undone only by people whose role may add it in its own module, and kinds of switched-off modules are not offered.
- **Switching to School OS** (workflow 15): the steps in the order a school does them (year and classes, departments, staff, students and parents, fee structures, old dues, past receipts, opening cash and bank balances, past expenses, then the optional ones), each file checked row by row, with a choice for each row that may already be on record (same student: update, same family, a new student), kept with the file until it is imported.
- **Export all school data:** a full download of the school's data (prepared in the background; link sent by notification and valid for a short time).
- **Audit log:** every change with who, what, when, device, and before and after values. Filters: person, record type, date, action.
- **Login history:** sign-ins and failed attempts by user, with device and place.
- **Export log:** who exported what and when.
- **Security alerts:** unusual logins (new device or place, many failed attempts, a sign-in without two-step login because no code could reach the person) and mass exports. The person who signed in on a new device is also told at once, in the app and by email, with "Not you? Sign out everywhere" (added 18 October 2026).
- **Integration and API call logs** (optional): calls to and from connected systems, with errors.
- **Privacy:** data retention periods per record type; consent records; data deletion requests (need approval); data export request for one person.
- **Consent texts and records** (decided 9 October 2026): the consent types, each with its current text and earlier versions. Consent types include data processing under the DPDP Act 2023, photo consent (for the gallery and social media), APAAR consent and message opt-ins. A guardian gives consent on the admission form or through Parent Link, confirmed by a one-time code to the guardian's mobile. Each Consent Record keeps the guardian, the student, the consent type, the version of the text agreed to, when and how it was given, and when it was withdrawn, if it was. Consent can be withdrawn at any time; a withdrawal is a new entry, never an edit. Consent Records are kept on the student's guardian in 03 Student Management; this page holds the versioned consent texts and a **consent log view** showing, per consent type and class, who has given, who has not, and who has withdrawn.

**Actions**

- Download an import template; run an import; undo an import.
- Request a full data export.
- Search the audit log; open a record's history.
- Set retention periods (for example delete visitor photos after 1 year; inferred example). Records past retention are listed for approval before deletion (inferred).
- Record a deletion request; it goes to Approvals; when approved, the data is removed or anonymised and the request stays logged.
- Export one person's data on request.
- Add a consent type or change its text. Each change makes a new version; records already given keep the version agreed to. The school can ask guardians to agree to the new version through a bulk consent request on Parent Link (Communication) (inferred: asking again is the school's choice).
- Open a guardian's consent from the log view; a withdrawal given by phone or letter is recorded on the guardian in Student Management, with a note (inferred). From then on the student is treated as without that consent (for example left out of shared photos).

**Form fields: Consent text**

| Field | Required | Default | Notes |
|---|---|---|---|
| Consent type | Yes | | Data processing (DPDP Act 2023), photo consent, APAAR, message opt-in, or the school's own |
| Text | Yes | A ready text for data processing and photo consent (inferred) | In each of the school's message languages |
| Asked on the admission form | Yes | Yes for data processing and photo consent (inferred) | |
| Version | Shown | Made automatically | Read-only |

**Form fields: Data deletion request**

| Field | Required | Default | Notes |
|---|---|---|---|
| Person | Yes | | Student, parent or staff |
| What to delete | Yes | All personal data | Or chosen parts |
| Reason and who asked | Yes | | |
| Proof | No | | Letter or email |

## 3. All features

90 features are mapped to this module: 74 Core and 16 Optional. Tick each one when it is built and tested.

### School Profile (18)

- [ ] School profile: name, logo, address, contacts, affiliation number (Core)
- [ ] School branding (logo, colours) on screens and documents (Core)
- [ ] Board choice: CBSE, ICSE, state board, IB, Cambridge, custom (Core)
- [ ] Settings that follow the board (grading, report format, terms) (Core)
- [ ] More than one curriculum in the same school (Optional: schools running two boards)
- [ ] Language, locale, time zone and date / number formats (Core)
- [ ] Eight Indian languages: English, Telugu, Hindi, Tamil, Kannada, Malayalam, Marathi, Bengali (Core)
- [ ] Several currencies (Optional: international schools)
- [ ] School settings override group defaults (Optional: school groups)
- [ ] School and compliance documents (registration, affiliation, NOCs) (Core)
- [ ] Document versions (Core)
- [ ] Expiry dates with renewal alerts (Core)
- [ ] Document verification status (Core)
- [ ] Search the vault (Core)
- [ ] Access control and time-limited links (Core)
- [ ] Document preview (Core)
- [ ] Board compliance settings (Core)
- [ ] GSTIN in the school profile, printed on tax invoices (Optional: schools with taxable fee heads) (decided 9 October 2026)

### Users & Permissions (17)

- [ ] User accounts: create, enable, disable, reset password (Core)
- [ ] A login belongs to a Staff, Student or Driver record, so a hired driver can log in (Core) (decided 9 October 2026)
- [ ] Disabling a user signs them out everywhere at once (Core)
- [ ] Reset two-step login when a phone is lost, by another School Admin or the Principal, logged (Core)
- [ ] Alert to School Admins when anyone's permissions change (Core)
- [ ] One login works in several schools or campuses through School Access (Optional: school groups) (decided 9 October 2026)
- [ ] Admin accounts: cards, search, view, message, edit (Core)
- [ ] Password format rules (Core)
- [ ] Side menu showing only the modules the role may use (Core) · menu follows each role
- [ ] Ten ready roles, the role templates the school can switch on, and custom roles (Core) (decided 9 October 2026)
- [ ] Permissions per module and action: view, create, edit, delete, approve, export, print (Core)
- [ ] Scope: whole school, campus, class, own records (Core)
- [ ] Hide sensitive fields from roles that must not see them (Core)
- [ ] Sensitivity levels: normal, restricted, highly restricted (Core)
- [ ] Access by channel: web, mobile, API (Core)
- [ ] Approval rights per role and amount (Core)
- [ ] Two-step login (MFA) for sensitive roles (Core)

### Payment Gateways (5)

- [ ] Add a payment gateway: name, code, active switch, test mode (Core)
- [ ] Gateway credentials: merchant key, salt, environment, webhook URL (Core)
- [ ] Gateway providers: PhonePe, Razorpay, Cashfree, Easebuzz, PayU, Paytm, cash / cash deposit; more can be added (Core)
- [ ] Gateway list with active status (Core)
- [ ] Gateway secrets stored encrypted and never shown again (Core)

### SMS, WhatsApp & Email (6)

- [ ] Notification settings (Core)
- [ ] Turn messaging services (SMS, WhatsApp, email) on or off (Core)
- [ ] WhatsApp provider connection (Core)
- [ ] SMS provider connection with sender ID (Core)
- [ ] Email provider connection (Core)
- [ ] DLT entity ID and sender header stored for SMS (Core) (decided 9 October 2026)

### Document Designs (6)

- [ ] ID card designer: size, orientation, background colour or image, school branding, layout (Core) · opened from Certificates & ID Cards
- [ ] ID card settings (Core) · opened from Certificates & ID Cards
- [ ] Document templates: receipts, tax invoices, salary slips, certificates, ID cards, report cards, letters (Core)
- [ ] Template editor with merge fields (Core)
- [ ] Documents use the right year and branding (Core)
- [ ] Digital signatures on documents (Optional: schools signing documents digitally)

### Forms & Approvals (5)

- [ ] Custom fields on records (Core)
- [ ] Form builder (Core)
- [ ] Conditional form fields (Optional: schools building complex forms)
- [ ] Workflow builder (steps, approvers) (Core)
- [ ] Approval rules (limits, approvers, escalation) (Core)

### Modules On/Off (13)

- [ ] Turn modules on or off per school (Core)
- [ ] Start from a school-type template (e.g. CBSE day school, boarding school) (Core)
- [ ] System preferences (Core)
- [ ] Integrations list (Core)
- [ ] Integration health status (Core)
- [ ] Google / Microsoft accounts (Optional: schools using Google or Microsoft tools)
- [ ] Printers and scanners (Optional: schools printing from the system)
- [ ] CCTV (Optional: schools with CCTV links)
- [ ] Outside learning platforms (Optional: schools using another LMS)
- [ ] IoT devices (Optional: schools with smart devices)
- [ ] Webhooks to other systems (Optional: schools connecting other software)
- [ ] AI assistant on / off, and which roles may use it (Optional: schools using AI)
- [ ] Translation of typed messages into each parent's language on / off, default off (Optional: schools using AI) (decided 9 October 2026)

### Data Backup & Security (20)

- [ ] Integration / API call logs (Optional: schools connecting other software)
- [ ] CSV templates for each import (Core) · used by every Import button
- [ ] Column mapping (Core)
- [ ] Import preview (Core)
- [ ] Import error report (Core)
- [ ] Partial import (good rows only) (Core)
- [ ] Undo an import (Core)
- [ ] Export all school data (Core)
- [ ] Audit log of every change: who, what, when (Core)
- [ ] Before / after values in the audit log (Core)
- [ ] Login history (Core)
- [ ] Export log (who exported what) (Core)
- [ ] Security alerts (unusual logins, mass exports) (Core)
- [ ] Data retention periods (Core)
- [ ] Data deletion requests with approval (Core)
- [ ] Consent records (Core)
- [ ] Data export request for one person (Core)
- [ ] Versioned consent texts; each Consent Record keeps the version agreed to (Core) (decided 9 October 2026)
- [ ] Consent types include data processing (DPDP Act 2023) and photo consent; consent can be withdrawn (Core) (decided 9 October 2026)
- [ ] Last backup time shown to the school (Core) (decided 9 October 2026)

## 4. Connections

**Receives**

| From | What |
|---|---|
| 09 Staff & HR | New staff logins and role assignments from Add Staff |
| 03 Student Management | Student logins (optional) |
| 12 Transport | Driver logins (a hired driver's User Login belongs to the Driver record) |
| 03 Student Management | Consent Records (given on the admission form or through Parent Link, or withdrawn) for the consent log view |
| Every module | Approval requests (to the rules here), audit entries, exports, imports, designs used |

**Sends**

| To | What |
|---|---|
| Every module | School, Campus, board defaults, languages, roles and permissions, approval rules, custom fields, document designs, modules on or off, integrations |
| 06 Fee Management | Connected gateways (routing set in Fee Settings) |
| 11 Communication | Connected channels and credits; DLT entity ID and sender header; consent types and texts for Parent Link |
| 06 Fee Management, 10 Salary Management | GSTIN and the tax invoice design; the salary slip design |
| 01 Dashboard | Setup checklist progress; low-credit and integration error alerts |
| Notifications | Security alerts; document expiry reminders (vault) |

**Automations:** none owned. The school document vault uses the expiry reminder pattern of **A15**.

## 5. Rules and mistake-proofing

| Rule | How it is prevented | What the person is told | How they recover |
|---|---|---|---|
| Locking everyone out | The last active School Admin cannot be disabled or lose the role (inferred) | "At least one School Admin must remain" | Add another admin first |
| Giving too much access | Roles start from templates; changes shown in plain words; every change audited | "Teacher role can now see salary. Save?" | Undo from the role history |
| Permission only hidden on screen | Every permission checked on the server | Not needed | Not needed |
| Gateway credentials changed by mistake | Typed-name confirmation; test before enabling | "Type Razorpay to confirm" | Re-enter the old credentials |
| Gateway secrets leaked | Encrypted, never shown again | Only the last 4 characters shown (inferred) | Replace the secret |
| Switching off a module loses data | Data kept; module hidden only | "Transport will be hidden. Its data stays and returns when switched on." | Switch on again |
| Template overwrites the school's settings | Preview of changes; existing settings kept unless chosen | "This will switch on 3 modules and set 12 settings" | Do not apply |
| Bad import | Preview, partial import, undo | "48 rows ready, 2 with problems" | Undo the import |
| Data deleted without approval | Deletion only through an approved request | "Needs approval" | Reject the request |
| Approval rule with nobody to approve | Every step needs an approver who exists and is active (inferred) | "No active user has the Principal role" | Pick another approver |
| Custom field removed with data | Archived, not deleted; data kept | "Archived. Existing answers are kept." | Restore |
| Disabled user still signed in somewhere | Disabling signs the person out on every device at once | "Ravi Kumar is disabled and signed out on 2 devices" | Enable again if it was a mistake |
| Locked out after losing the two-step phone | Another School Admin or the Principal resets two-step login; logged | "Two-step login reset for Ravi Kumar. He will set it up at his next sign-in." | Not needed |
| Permissions changed quietly | Every School Admin is alerted to every change in roles, permissions or scope | "Meena gave the Teacher role access to Salary" | Undo from the role history |
| SMS sent without DLT registration | SMS cannot be switched on without the DLT entity ID and sender header | "Add your DLT entity ID and sender header first" | Enter them from the DLT portal |
| Consent text changed after parents agreed | Each change is a new version; old agreements keep their version | "Version 3 saved. 412 guardians agreed to version 2." | Send a consent request for the new version |
| Photo of a student without photo consent shared | Photo consent is checked before a photo is shown in the gallery or shared (18 Events & Calendar) | "3 students have no photo consent and are blurred" | Ask the guardian for consent through Parent Link |

## 6. Settings

This module is the school-wide settings. Each page above is itself a settings page. Module rules (late fee, attendance lock, grade scale and so on) are not here; they sit on the last page of each module.

## 7. Reports

- Users and roles: users by role, last sign-in, disabled users, users with exceptions (inferred).
- Audit log export (filtered).
- Login history and security alerts.
- Export log.
- Import history.
- Consent status by type, class and version: given, not given, withdrawn.
- Permission changes: who changed which role or person, and when (inferred).
- Message credit usage (with Communication).
- Integration health and API call errors (optional).
- School documents expiring.

All follow P8.

## 8. Records used

| Record | Creates | Reads | Updates |
|---|---|---|---|
| School | Yes (made by Add School in the Super Admin console, `07-super-admin.md` §4) | Yes | Yes (including GSTIN) |
| Group | | Yes (a School may belong to one Group; set by Add School in the Super Admin console) | |
| Campus | Yes | Yes | Yes |
| User Login | Yes | Yes | Yes (enable, disable, reset, two-step, two-step reset) |
| School Access | Yes | Yes | Yes (one per school or campus a login works in, with roles and scope) |
| Consent Record | | Yes (consent log view; the records are kept on the guardian in 03 Student Management) | |
| Role | Yes | Yes | Yes |
| Template | Yes (document designs, inferred: Template also covers document templates) | Yes | Yes |
| Approval | | Yes (rules applied to it) | |
| Notification | Yes | | |
| Audit Log Entry | Yes | Yes | |

Other records (inferred): **Permission** (role, module, action, scope), **User Role Assignment** (with scope and exceptions), **Password Policy**, **Session**, **Login Event**, **School Document** with versions, **Payment Gateway Account** (encrypted secrets), **Messaging Channel** and **Credit Ledger**, **Document Design** (if kept apart from message Template), **Custom Field** and **Custom Form**, **Approval Rule** with steps, **Module Switch**, **School Template**, **Integration** with **Integration Log**, **Import Batch**, **Export Log Entry**, **Data Export Job**, **Retention Rule**, **Consent Type** with **Consent Text Version**, **Deletion Request**, **Security Alert**.

A **User Login** belongs to one Staff, Student or Driver record. A **School** may belong to one **Group**, and one User Login can work in several schools through **School Access** entries (school or campus, roles, scope) (decided 9 October 2026).

## 9. Done when

1. A new school fills its profile, chooses CBSE, and sees the CBSE defaults (terms, grade scale, report card) offered in the relevant modules.
2. A School Admin creates a "Vice Principal" role by copying Principal, removes salary access, and a user with that role cannot open salary data, even by typing the page address.
3. A user with the Teacher role sees only their classes in every list, search and export.
4. Adding a Razorpay gateway in test mode, testing it, and enabling it needs the typed name to confirm; the secret is never shown again.
5. Switching off Transport hides it from the menu, Search, Dashboard and student profiles; switching it on again brings back all its data.
6. An approval rule "refunds above ₹5,000 go to the Principal" sends a ₹6,000 refund to the Principal and a ₹2,000 refund to the Accountant.
7. Every change to a student's admission number shows in the audit log with old and new values.
8. An import with 2 bad rows imports the rest, gives an error file, and can be undone.
9. A full data export arrives as a download link by notification and appears in the export log.
10. A data deletion request cannot remove data until it is approved.
11. Disabling a user signs them out of every device at once, and every School Admin is alerted when a role's permissions change.
12. A School Admin resets two-step login for a teacher who lost her phone; the reset appears in the audit log.
13. Changing the photo consent text makes a new version; guardians who agreed earlier still show the old version, and a withdrawal is kept as its own entry.
14. SMS cannot be switched on until the DLT entity ID and sender header are entered.
15. The last backup time shows on Data Backup & Security.
16. A login with School Access to two schools sees the school switcher and only those two schools' data.

## 10. Open questions

- D1 (decided): Razorpay is the first payment gateway connected.
- D2 (decided): staff may never delete a fee payment, so the old permission "delete own payments" is replaced by "cancel payments (with a reason)".
- D6 (decided 9 October 2026): server backups, restore and the other safety basics are in `08-platform-security.md`, built in Stage 1 with Settings. This page only shows the last backup time and the school's own data download.
- D8 (decided 9 October 2026): consent texts are versioned and consent can be withdrawn (a); the SMS card holds the DLT entity ID and sender header (b); School Profile holds the GSTIN and Document Designs has a tax invoice (c).
- D10 (decided 9 October 2026): a School may belong to one Group, and a User Login can work in several schools through School Access. Group screens come later.
- C1 (decided 9 October 2026): ten ready roles and ten role templates, as listed under Users & Permissions.
- Which modules may a school switch off? The plan marks Transport, Library, Inventory and Hostel as "can be switched off"; it says "each module on or off" elsewhere. Assumed: those four plus optional pages; core modules always on.
- What school-type templates should exist on day one, and what does each switch on? The inputs give two examples (CBSE day school, boarding school).
- How long should data be kept by default (retention periods)? The inputs ask for the setting but give no defaults.
