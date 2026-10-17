# 06 Fee Management

Build order: 7th (Stage 2). Needs students, classes, the academic year and Communication. Finance Management (Day Book) is built right after and reads the payments made here.

## 1. Purpose

Collecting fees, keeping each student's fee account and following up on dues.

Used by: the Accountant and cashier (collection, ledger, defaulters, structure, reports), the Principal (concessions, refunds, approvals, reports), the Office Staff role template (collection at the counter) and class teachers (fee status of their own students only). Office Staff and Class Teacher get no fee access by default; it is a permission the school grants in Settings, Users & Permissions. Parents see fees due, pay and download receipts on Parent Link (owned by Communication).

## 2. Pages

### Fee Dashboard

**Purpose:** today's collection, pending and overdue totals, and Recent Payments as they come in.

**What the person sees**

- Tiles: collected today (amount and number of payments), collected this month, pending (due but not yet overdue), overdue. Each opens the list behind it.
- **Monthly collection trend:** collected per month this year against the amount due per month.
- **Payment-method breakdown:** cash, UPI, card, net banking, bank transfer, cheque, gateway, for the chosen period.
- **Collection forecast (optional, AI):** expected collection for the next 1 to 3 months from installments due and past payment behaviour, labelled "Suggestion" with the numbers used.
- **Recent Payments:** live list, newest first. Columns: date and time, student (name, class), fee heads, amount, mode, receipt number or reference, status (**Posted**, **Waiting for verification**, **Cancelled**, **Failed**). Tabs: Full payments, Partial payments (as in the old software).
- **Failed online payments:** payments the gateway reported as failed or not confirmed, with the parent's phone and a "Send new link" action (the old link stops working, so the family pays once). Payments the parent opened and closed without paying, where Razorpay says no money was taken, are counted, not listed (added 18 October 2026).
- **Online payments to check** (added 18 October 2026, shown to the people who collect fees when there is something to check): money Razorpay took that matched no payment link, with the amount, time and the phone it was paid from, and **Post to a student** (students whose parent has that phone are suggested; or type the admission number). It is posted the usual way: the student's oldest dues first, anything over held as advance, the receipt, the parent's message and the Day Book. Also refunds made in the Razorpay Dashboard and disputes raised by a parent's bank: the receipt still stands, with **Ask to cancel**, which goes to Approvals like any cancellation; a refund of only part of a payment is recorded as a refund on Concessions & Refunds instead. The Accountants are told of each one.

**Actions**

- Open a payment: view receipt, print, download, share by WhatsApp.
- **Payment verification (optional):** when the school switches on "verify before posting" in Fee Settings, payments in the chosen modes (for example cheque, bank transfer) arrive as Waiting for verification. Approve (posts it and makes the receipt) or Reject (with a reason). These also appear in Approvals.
- Cancel a payment (see Student Fee Ledger).
- Filters: date range (default today), class, fee head, mode, status, collected by.

**Form fields:** none (filters only).

### Collect Fee

**Purpose:** find the student, see the due, enter the amount and mode, and the receipt is ready. Cash, UPI, card, cheque or online.

**What the person sees**

- A search box at the top: name, admission number, username or phone; class filter; reset. Opening from Search ("fee Ravi") or from a student's profile skips this step.
- The student card: photo, name, class and section, roll number, father's name, total fees for the year, paid, balance, and a progress ring.
- **Dues table:** one row per installment and fee head, oldest first. Columns: fee head, installment (for example "Apr 2026"), due date, amount, already paid, late fee (if any), balance, status (**Not due**, **Due**, **Overdue**, **Paid**). Overdue rows in red.
- A list of students can also be exported (P8) from the search results.

**Actions (one-step collection)**

1. Find the student.
2. The overdue and currently due rows are ticked by default (inferred: the default selection). The total payable shows below, including late fee.
3. Change the ticks, or type an amount for a partial payment. A partial amount is applied to the oldest ticked row first (inferred: allocation rule).
4. Choose the mode. The reference fields for that mode appear (see fields).
5. Press **Collect ₹X**. The receipt is ready on the same screen: print (office copy, parent copy or both), download PDF, or send by WhatsApp. Automation A1 runs.

Other actions:

- **Discount or penalty change at the counter:** only for people with the permission ("give discount", "waive late fee"). Above the school's limit it becomes a concession request in Approvals and the payment waits (inferred: it waits rather than proceeding).
- **Advance payment (optional):** paying more than the current dues, only when Fee Settings allows advances; the extra is held as advance and applied to the next installments (inferred: how advance is applied).
- **Send payment link:** sends an online payment link for the selected dues by WhatsApp or SMS (uses the gateway set for the student's class in Fee Settings). When Parent Link is on, parents can also pay any time from the Pay button on their Parent Link (decided 9 October 2026, D4). Tapping Pay again for the same fees and the same amount opens the same payment link while it is open and has at least an hour left, instead of making a new one each time (added 18 October 2026, inferred: the hour).
- **UPI QR:** shows a UPI QR for the exact amount on screen for the parent to scan at the counter (inferred: dynamic QR when the gateway supports it).

**Form fields: Collect fee**

| Field | Required | Default | Notes |
|---|---|---|---|
| Rows being paid | Yes | Overdue and currently due rows | Fee head or installment |
| Amount | Yes | Total of ticked rows | Never more than outstanding, unless advance is allowed |
| Mode | Yes | Cash (inferred), or the mode this person used last | Cash, UPI, card, net banking, bank transfer, cheque, gateway |
| Reference | Yes for UPI, card, net banking and bank transfer | | Transaction or UTR number |
| Cheque number, bank, cheque date | Yes for cheque | Cheque date: today | |
| Payment date and time | Yes | Now | Changing it needs the "change payment date" permission (from the old software) |
| Late fee | Shown | Calculated from Fee Settings | Waiver needs permission |
| Discount | No | None | Needs permission; above the limit goes to Approvals |
| Note | No | | Printed on the office copy only (inferred) |

**Tax invoice (GST):** when a payment covers a taxable fee head, a tax invoice is made with the receipt, showing the school's GSTIN (from Settings, School Profile), the fee head, its GST rate and the tax amount. It is printed, downloaded and shared the same way as the receipt (decided 9 October 2026, D8c). Tax invoices have their own number series (inferred).

**Bank account on the receipt (optional):** when the school uses "Fees into different bank accounts" in Fee Settings, the receipt shows, for each fee head paid, the bank account it goes to (for example "Tuition fee: School account; Transport fee: Trust account"), and the Day Book entry shows the same account for each fee head (decided 9 October 2026).

### Student Fee Ledger

**Purpose:** each student's fees, payments, balance, receipts and fee certificate.

**What the person sees**

- Summary strip: for each fee head, paid of total (for example "₹5,000 / ₹60,000 Tuition fee"), and the grand total paid, total and balance.
- Tabs:
  - **Fees:** each fee head with its installments: amount, frequency, installments paid of total (for example 0 / 12), period covered (for example 04-2026 to 03-2027), status.
  - **Payments:** every payment with date, mode, amount, receipt number, status; cancelled payments shown struck through with the reason.
  - **Partial payments:** payments that did not clear a row fully, with balance, reference, slip, recorded date and settled date.
  - **Invoices:** fee invoices raised (inferred: one per installment or on demand).
  - **Adjustments:** concessions, scholarships, late fees, waivers, reversals and refunds, each with reason and approver.
- **Opening balance:** dues carried in from before (old dues), shown as their own row.
- **Brought-in receipts:** past receipts imported from the old software, shown in Payments marked **Brought in**, read-only (decided 9 October 2026, D7).
- **On Parent Link:** the guardian sees this ledger's fees due with a **Pay** button (Razorpay) and can download receipts and tax invoices. Parent Link is read-only apart from paying (the page is owned by Communication, decided 9 October 2026, D4).
- **Daycare charges (optional):** charges per child per billing cycle, from the daycare plan.

**Actions**

- View, print or download a receipt (office copy, parent copy, both) and share it.
- **Fee invoice:** generate and send an invoice for chosen dues (design in Settings, Document Designs). The rows due now (Due and Overdue, with their late fees) are ticked; rows not due yet can be ticked too, and the total is what is ticked. An invoice never asks for the whole year unless those rows are ticked (added 18 October 2026).
- **Fee certificate:** a certificate of fees paid in a year or period (for example for income tax), from the design in Document Designs.
- **Cancel a payment** (decided, D2): needs a reason; the payment stays on record marked Cancelled; the dues reopen; the receipt is marked cancelled; Finance posts a reversal in the Day Book on the cancel date. Cancelling a payment older than today needs approval (inferred).
- **Adjust:** change an amount on the student's plan (for example a corrected fee) by an adjustment with a reason, never by editing a payment.
- Add opening balance (old dues) with a note.
- **Import opening balances (old dues) in bulk** with the shared importer (P10): admission number, fee head (or "Old dues"), amount, due date, note. Each row becomes an opening balance row on the student's ledger. Importing dues adds nothing to the Day Book; the money is counted only when it is collected (decided 9 October 2026, D7).
- **Import past receipts** with the shared importer (P10): admission number, old receipt number, date, amount, mode, fee head. They are kept as read-only Payment and Receipt records marked **Brought in**, with the old receipt number. They show in the ledger and fee certificates, but never post to the Day Book of School OS, never count in today's collection, and cannot be cancelled or refunded here (inferred: refunds of old payments are recorded in Finance as an expense). Both imports are steps of workflow 15, "Switching to School OS" (see 02-workflows.md).
- Assign a fee plan or remove an unpaid row (with the "assign / unassign fees" permission and a reason).

**Form fields: Cancel payment**

| Field | Required | Default | Notes |
|---|---|---|---|
| Reason | Yes | | From a list plus "Other" (wrong student, wrong amount, cheque bounced, duplicate, other) (inferred list) |
| Note | No | | |

### Defaulters

**Purpose:** students with pending fees, how long overdue, and the reminders already sent.

**What the person sees**

- List: student, class, parent and phone, amount overdue, oldest overdue date, days overdue, ageing group (the groups the school sets in Fee Settings; defaults 0 to 30, 31 to 60, 61 to 90 and over 90 days), last reminder sent and how many.
- Totals by class at the top (outstanding by class), each opening the class list.
- Filters: class, section, fee head, ageing bucket, amount above, reminded or not.

**Actions**

- **Send reminder** to one, selected, or everyone on the list in one go: choose channel and template; the payment link is added automatically when a gateway is connected (with Parent Link on, the guardian's Parent Link with its Pay button, inferred); preview with recipient count and cost (Communication rules, P4). Parents who opted out are skipped, and the preview says how many were skipped (see the open question on opt-outs).
- **Reminder history** per student: date, channel, template, delivery status.
- Call log note: "Called parent, promised by 15-10-2026" (inferred).
- **Promise to Pay (optional, added 17 October 2026):** when "Promise to pay" is on in Fee Settings, the call note can record what the family promised: "will pay ₹5,000 on 25-10-2026". While the promise is open:
  - automatic fee reminders to that family pause until the date (reminders sent by hand from this page still go);
  - the list shows "Promised for 25-10-2026" (with the amount when one was said), and the family moves to the end of the list; the student's fee ledger shows the same;
  - the Collection forecast and Looking ahead count the promised amount on the promised date.
  When posted payments made after the call and dated on or before the promised date cover it, the promise is marked **Kept**. When the date passes without that, it is marked **Broken**: the family goes to the top of the list with "Promise of 25-10-2026 broken", the person who recorded it is told, and automatic reminders resume. A new promise replaces an open one. The Fee Dashboard shows **Promises to pay**: kept and broken this term, and how many are open now.
- Open Collect Fee for a student.

**Form fields: Send reminder**

| Field | Required | Default | Notes |
|---|---|---|---|
| Recipients | Yes | Selected rows, or all on the filtered list | |
| Channel | Yes | WhatsApp | |
| Template | Yes | The fee reminder template | Variables: student name, class, due amount, due date, link |
| Include payment link | No | On when a gateway is connected | |
| Send at | No | Now | Or schedule |

**Form fields: Call note and Promise to Pay**

| Field | Required | Default | Notes |
|---|---|---|---|
| Note | Yes, unless a promised date is given with Promise to Pay on | | Up to 500 characters. Empty with a promise: "Promised to pay ₹5,000 by 25-10-2026." |
| Promised to pay by | No | | With Promise to Pay on: today or within 60 days |
| Amount promised | No | All overdue | Promise to Pay only. More than ₹0 and not more than the family owes in all |

### Fee Structure

**Purpose:** class-wise fees for the year, fee types, installments and due dates, including daycare fees.

**What the person sees**

- **Fee heads (fee types)** are created here, not on a separate page: tuition, annual, admission, activity, transport, exam, class, monthly, hostel, lab, sports, library, miscellaneous, plus the school's own. Each has a taxable flag; a taxable head also has a GST rate (decided 9 October 2026, D8c).
- **Class cards** for the selected year: each class shows its fee rows (fee head, amount, frequency) and how many of the school's fee heads are set ("5 of 18 set").
- Versions: a structure has a version history; the version in use and the date it changed.
- **Daycare plans (optional):** billing cycles daily, weekly or bi-weekly, rates, and enrolment charges. A daycare plan can bill by days attended: the charge for each cycle is the daily rate times the days the child was marked present in Attendance Management.
- **Category-wise fees (optional):** different amounts by student category.

**Actions**

- Add a fee head (name, taxable or not; for a taxable head, the GST rate and SAC code (inferred: SAC code)). Fee amounts on a taxable head include GST, and the tax invoice shows the tax part separately (inferred).
- **Bank account (optional):** when "Fees into different bank accounts" is on in Fee Settings, each fee head is linked to one of the school's bank accounts (set up in Finance Management, Cash & Bank), for example tuition to the school account and transport to the trust account. Heads with no account chosen use the main bank account (decided 9 October 2026).
- Add a fee row to a class: fee head, amount, frequency. Edit or remove a row (removing a row that is already assigned or paid is blocked; it can be ended from a date instead, inferred).
- Copy a class's structure to other classes, or last year's structure to this year with an optional % increase (inferred).
- **Installments:** for each row, the installment schedule with due dates. The installments must add up to the row total.
- **Assign** the structure to a class (all students in it) or to one student. An exception for one student needs a reason.
- Publish a new version; existing students' unpaid future installments update only after the person confirms, and paid rows never change (inferred). Added 18 October 2026:
  - Before publishing, the sheet shows what the new version does from the date chosen (worked out again when the date changes): how many students change, how much is added and taken off in all, how many rows are kept, and what happens to late fees. The publish does exactly that.
  - Each student's rows from the date are matched to the new version by fee head and due month (else by name). A period is never charged twice: a row already paid, part-paid, or with a concession or adjustment is kept, and the new installment for that period is not added again. The change in the fee goes on what is left to pay on it, as an adjustment with the reason "Fee structure version 3 from November 2026", never below what is left. A fully paid or fully waived row does not change; the sheet says how much it differs from the new fee, so the school can add a charge or a refund by hand.
  - Other rows move to the new version: as they are when nothing differs, otherwise replaced (the old row kept as Removed, never deleted). A late fee on a replaced row moves to the new row, so it is never added twice; when the row goes, or the new one is due later, an unpaid late fee comes off with it.
  - Putting back an older version ("Use again") works the same way.
- Daycare: enrol a child in a daycare plan; charges are raised per cycle.

**Form fields: Add fee row**

| Field | Required | Default | Notes |
|---|---|---|---|
| Fee head | Yes | | Pick, or "New fee head" inline |
| Amount | Yes | | Per installment or per year (the person chooses; inferred) |
| Frequency | Yes | Monthly | Monthly, quarterly, half-yearly, term, yearly, one-time, or (daycare) attendance-based: daily, weekly or bi-weekly, charged for the days attended |
| Installment due dates | Yes | Generated from the frequency and the year start, on the 10th of each period (inferred) | Editable |
| Category | No | All students | Optional, category-wise fees |
| Applies to | Yes | This class | This class, several classes, or one student |

### Concessions & Refunds

**Purpose:** discounts, scholarships, bulk discounts and refunds, each with a reason and approval.

**What the person sees**

- Tabs: **Concessions**, **Bulk discounts**, **Scholarships** (optional), **Refunds**.
- Each list shows student, type, amount or %, fee heads affected, reason, requested by, approved by, status (**Waiting**, **Approved**, **Rejected**, **Applied**).

**Actions**

- **Concession for a student:** amount or %, fee heads, period, reason. Above the limit set in Forms & Approvals it goes to Approvals; below, it applies at once.
- **Bulk fee discount rules:** for example "pay 3 months, get 5% off". Applied automatically at Collect Fee when the condition is met, shown on the receipt.
- **Scholarship (optional):** a scholarship type applied as a fee reduction.
- **Scholarship applications (optional, scholarship-heavy schools):** record an application with supporting documents; approval through Approvals; set the amount; renew each year (renewal reminder before the year starts, inferred).
- **Refund:** full or partial, never more than paid; reason and refund mode (cash, bank transfer, cheque). Goes to Approvals; once approved, "Mark refunded" records the refund with date and reference. Finance records it in the Day Book.

**Form fields: Concession**

| Field | Required | Default | Notes |
|---|---|---|---|
| Student | Yes | The student open on screen | |
| Type | Yes | Discount | Discount, scholarship, sibling, staff child (inferred list) |
| Amount or % | Yes | | |
| Fee heads | Yes | Tuition (inferred) | |
| Period | Yes | Rest of this year | |
| Reason | Yes | | |
| Document | No | | |

**Form fields: Refund**

| Field | Required | Default | Notes |
|---|---|---|---|
| Payment(s) | Yes | | From the student's posted payments |
| Amount | Yes | Full amount of the payment | Not more than paid minus earlier refunds |
| Reason | Yes | | |
| Refund mode | Yes | Same as the payment mode (inferred) | |

### Fee Reports

**Purpose:** collection, dues, discounts, payment modes, and audit and tax reports. See section 7.

### Fee Settings

**Purpose:** late fee rules, reminder schedule, receipt numbering and which payment gateway each class uses. See section 6.

## 3. All features

65 features are mapped to this module: 48 Core and 17 Optional. Tick each one when it is built and tested.

### Fee Dashboard (6)

- [ ] Collected, pending and overdue totals (Core)
- [ ] Monthly collection trend (Core)
- [ ] Collection forecast (AI-assisted prediction) (Optional: schools wanting forecasts)
- [ ] Payment-method breakdown (Core)
- [ ] Recent payments: date, student, amount, mode, receipt / reference, status (Core)
- [ ] Payment approval step in Recent Payments (Optional: schools that verify payments before posting) · on or off in Fee Settings

### Collect Fee (13)

- [ ] Find a student by name, username / admission no. or phone; filter by class; reset; export the list (Core)
- [ ] See assigned fees and outstanding before collecting (Core)
- [ ] Pick the fee head or installment being paid (Core)
- [ ] Full or partial payment (never more than outstanding; original dues kept) (Core)
- [ ] Payment modes: cash, UPI, card, net banking, bank transfer, cheque, gateway (Core)
- [ ] Payment reference and time recorded (Core)
- [ ] Penalty added and total payable shown (Core)
- [ ] Discount or penalty at the counter, only if authorised (Core)
- [ ] One-step collection: search, see the due, enter amount, choose mode, done (Core)
- [ ] Receipt, parent message and ledger update happen automatically after payment (Core) · automatic, see 'Fee paid'
- [ ] Advance payment above dues only when the school allows it (Optional: schools accepting advance fees) · allowed or not in Fee Settings
- [ ] Online fee payment through a payment gateway (Core) · gateway connected in Settings, Payment Gateways
- [ ] UPI and QR-code payments (Core)

### Student Fee Ledger (11)

- [ ] Fee ledger per student: invoices, dues, paid, balance, payment history, partial payments (Core)
- [ ] Opening balance (dues carried in) (Core)
- [ ] Import opening balances (old dues) in bulk with the shared importer; no Day Book posting (Core) · workflow 15, Switching to School OS
- [ ] Import past receipts as read-only "Brought in" records that never post to the Day Book (Core) · workflow 15, Switching to School OS
- [ ] Payments never edited silently; corrections only by reversal or adjustment with a reason (Core)
- [ ] Daycare charge tracking per child (Optional: schools with daycare)
- [ ] Receipt only after confirmed payment, with a unique receipt number (online receipts too) (Core)
- [ ] Fee invoice (Core)
- [ ] Fee certificate (fees paid) (Core)
- [ ] Tax invoice (GST) for payments on taxable fee heads, with the school's GSTIN (Core)
- [ ] Fees due with a Pay button, and receipts to download, shown to parents on Parent Link (Core) · page owned by 11 Communication

### Defaulters (5)

- [ ] Defaulters list: students with pending fees and overdue installments (Core)
- [ ] Outstanding report by class and student, with ageing buckets (Core)
- [ ] Reminder history per defaulter (Core)
- [ ] Send a reminder to everyone on a dues list in one go (Core)
- [ ] Payment links sent by message (Core)
- [ ] Promise to Pay on a call: automatic reminders pause until the date; kept or broken worked out from payments; a broken promise goes back to the top of the list (Optional: switched on in Fee Settings) (added 17 October 2026)

### Fee Structure (10)

- [ ] Fee heads / types: tuition, annual, admission, activity, transport, exam, class, monthly, hostel, lab, sports, library, miscellaneous, plus custom; taxable flag with GST rate (Core)
- [ ] Class-wise fee structure per academic year (heads and amounts), versioned (Core)
- [ ] Edit, view and delete fees in a structure; count of fees set (Core)
- [ ] Payment frequency: monthly, quarterly, half-yearly, term, annual (Core)
- [ ] Installments with due dates that add up to the structure total (Core)
- [ ] Assign a fee plan to a class or an individual student; exceptions need a reason (Core)
- [ ] Category-wise fees (Optional: schools charging by student category)
- [ ] Daycare billing cycles: daily, weekly, bi-weekly (Optional: schools with daycare)
- [ ] Daycare enrolment charges (Optional: schools with daycare)
- [ ] Daycare billing by days attended (frequency "Attendance-based: daily, weekly or bi-weekly") (Optional: schools with daycare)

### Concessions & Refunds (9)

- [ ] Concession / discount per student with reason and approver; approval needed above a set limit (Core)
- [ ] Bulk fee discount (Core)
- [ ] Scholarship applied as a fee reduction (Optional: schools with scholarships)
- [ ] Full or partial refund (never more than paid) with reason and mode (Core)
- [ ] Scholarship applications (Optional: scholarship-heavy schools)
- [ ] Supporting documents (Optional: scholarship-heavy schools)
- [ ] Scholarship approval (Optional: scholarship-heavy schools) · goes to Approvals
- [ ] Scholarship amount (Optional: scholarship-heavy schools)
- [ ] Scholarship renewal (Optional: scholarship-heavy schools)

### Fee Reports (4)

- [ ] Fee reports with filters, analytics and export (Core)
- [ ] Collection, outstanding, defaulter, discount, penalty and payment-mode reports (Core)
- [ ] Audit and tax reports (Core)
- [ ] GST report: taxable collection, tax by rate and tax invoices by period (Core)

### Fee Settings (7)

- [ ] Fee rules: late fee by days late, with a grace period (Core)
- [ ] Automatic fee reminders on a schedule (channel, template; respects opt-outs), e.g. "fee due tomorrow" (Core) · automatic, see 'Fee due date comes'
- [ ] Receipt settings (Core)
- [ ] Dues ageing groups chosen by the school (defaults 0-30, 31-60, 61-90, over 90 days) (Core)
- [ ] Scholarship types (Optional: scholarship-heavy schools)
- [ ] Eligibility rules (Optional: scholarship-heavy schools)
- [ ] Fees into different bank accounts: each fee head linked to a bank account; online payments split by the gateway; the account shown on the receipt and in the Day Book (Optional: schools keeping separate school and trust accounts) (decided 9 October 2026)

### Automatic work: Online payment received (3)

These are listed in the feature map under "Automatic work". They have no page; they are built with this module.

- [ ] Payment confirmed only from the gateway's verified callback; never posted twice (Core)
- [ ] Automatic reconciliation of online payments (Core) · every 15 minutes the software asks Razorpay about payments opened and not confirmed, and posts what was captured, once (added 18 October 2026)
- [ ] Failed-payment handling (Core) · failed payments listed on Fee Dashboard

## 4. Connections

**Receives**

| From | What |
|---|---|
| 03 Student Management | Students, classes, categories, parents' phones; new students from import and promotion (A13) needing fee plans |
| 02 Admission | Fee plan request on conversion (A2); application fee collection |
| 12 Transport (optional) | Transport fee for a student's stop (A12) |
| 15 Hostel (optional) | Hostel fees for allocated students |
| 13 Library, 14 Inventory | Fines and charges (lost books, books and uniforms issued at the store) added to the student's dues (inferred: as fee rows) |
| 18 Events & Calendar | Event payments (optional) |
| 05 Attendance | Days each daycare child attended, for attendance-based daycare billing (optional) |
| 11 Communication | Payments started from the Pay button on Parent Link (confirmed only through A8) |
| 20 Settings | Connected payment gateways, document designs (receipt, invoice, tax invoice, fee certificate), approval limits, permissions, the school's GSTIN (School Profile), the shared importer |
| Payment gateway | Verified payment confirmations and failures (A8) |

**Sends**

| To | What |
|---|---|
| 07 Finance | Every posted payment, cancellation and refund for the Day Book (A1). Brought-in receipts and imported opening balances are never sent |
| 11 Communication | Payment confirmation to the parent (A1), fee reminders (A7), payment links; fees due, receipts and tax invoices for Parent Link |
| 01 Dashboard | Collection today, dues, overdue |
| 03 Student Management | Fee status on the profile; fee clearance for leaving (A14) |
| 19 Reports & Analytics | Fee reports; fee signals for early warnings |
| Top bar Approvals | Concessions above limit, refunds, payment verification, cancellations of past payments |

**Automations owned**

- **A1 Fee paid:** in one step, the Payment is posted, the Receipt is created with the next number, the student's dues and balance update, the Day Book gets an entry (built in Finance), the Dashboard updates, and the parent gets the payment message (WhatsApp, using the receipt template with school name, student name, receipt number, amount and date).
- **A7 Fee due date comes:** reminders go on the days set in Fee Settings (for example 3 days before, on the day, 7 days after); after the grace period the late fee is added as its own row; the Defaulters list updates. Each reminder is sent once per installment per scheduled day (inferred). A family with an open Promise to Pay dated today or later gets no automatic reminder on that day.
- **Promise to Pay kept or broken** (added 17 October 2026): when a payment is posted, the student's open promise is checked and marked Kept if it is covered. Each day, open promises whose date has passed are marked Kept or Broken from the payments made by the date; a broken one tells the person who recorded it, and is done before the day's reminders so they resume at once.
- **A8 Online payment received:** see the automatic-work features below. A payment is posted only when the gateway's verified callback confirms it; the gateway's payment ID is stored, and a second callback with the same ID does nothing; payments are matched automatically to the student and installments from the payment link; payments that fail or are not confirmed within 30 minutes (inferred) are flagged on the Fee Dashboard, and no receipt is made. Added 18 October 2026: only a captured payment is posted (payment.captured or order.paid; an authorised one is not money taken yet). A payment on any order ever made for a link is matched to it, and when the order is unknown, by the link reference School OS put in the order's notes. Every 15 minutes, payments opened 10 minutes to 3 days ago with no confirmation are checked with Razorpay (again each hour): a captured payment is posted, a failed one is recorded, and one Razorpay cannot be asked about is tried again later. Money that matches no link waits in Online payments to check for a person to choose the student. Refunds and disputes made at Razorpay are kept for the office to check and never cancel a payment by themselves. Admission application fees are left to Admission Management.

## 5. Rules and mistake-proofing

| Rule | How it is prevented | What the person is told | How they recover |
|---|---|---|---|
| Paying more than is owed | Amount capped at outstanding unless advance is allowed | "Balance is ₹12,000. Advance payments are off in Fee Settings." | Lower the amount, or switch on advances |
| Same payment entered twice | Warning when the same student, amount and mode are collected within 10 minutes, or the same reference number is used again (inferred) | "₹5,000 cash for Ravi was collected at 10:41 by you. Collect again?" | Cancel, or confirm it is a second payment |
| Receipt before money is confirmed | Receipts only for posted payments; online and verified modes post only on confirmation | "Waiting for the gateway to confirm" | Wait, or check the gateway status |
| Deleting a payment | Decided, D2: no delete button anywhere; cancel with a reason keeps the record, reopens the dues and reverses the Day Book | "Payments cannot be deleted. Cancel this payment with a reason?" | Cancel; collect again correctly |
| Silent edit of a payment | Posted payments cannot be edited; only reversal or adjustment with a reason | "Use Cancel or Adjust. The original stays on record." | Cancel and collect again |
| Refund more than paid | Capped at paid minus earlier refunds | "Maximum refund ₹5,000" | Lower the amount |
| Discount without authority | Discount and waiver fields shown only to permitted roles; above the limit goes to Approvals | "Discounts above ₹1,000 need the principal's approval" | Request approval |
| Installments that do not add up | Save blocked until installments equal the row total | "Installments add up to ₹58,000. Total is ₹60,000." | Fix an installment |
| Changing a structure already paid | Paid rows never change; future unpaid rows change only after confirmation; a period already paid, part-paid or with a concession is never charged again, only the change on what is left to pay is added (18 October 2026) | "This updates 120 students' unpaid installments from Nov 2026. Paid rows are not changed." With the amounts added and taken off and the rows kept | Undo the version (inferred) |
| Student without a fee plan | Collect Fee shows "No fees assigned" with an Assign button; Student List filter "No fee plan" (inferred) | "No fees assigned to Kiran (Nursery A)" | Assign the class plan |
| Backdating a payment | Needs the "change payment date" permission; not before the last closed day (inferred) | "Payment date cannot be before 30-09-2026 (books closed)" | Ask an authorised person |
| Wrong gateway account used | Gateway chosen by Fee Settings routing (by class, class group or fee head) | Not needed | Change routing |
| Fee money landing in the wrong bank account | When "Fees into different bank accounts" is on, each fee head carries its bank account; online payments are split by Razorpay to those accounts, and counter payments show the account on the receipt and in the Day Book. The setting cannot be switched on until every linked bank account is also set up for split settlement with Razorpay (inferred: Razorpay Route) (decided 9 October 2026) | "Trust account is not set up for split payments with Razorpay yet" | Finish the Razorpay set-up, or link the fee head to another account; payments already made keep the account they were made to |
| Late fee added wrongly | Late fee is its own row, can be waived with permission and reason | "Late fee ₹200 added on 18-10-2026" | Waive with reason |
| Old receipts counted twice after switching | Imported past receipts are marked Brought in, read-only, and never post to the Day Book or today's collection | "Brought in from old software on 01-11-2026. Not in the Day Book." | Undo the whole import from the import history and import again |
| Taxable fee without a GSTIN | A fee head cannot be marked taxable until the school's GSTIN is saved in School Profile (inferred) | "Add the school's GSTIN in Settings, School Profile first" | Add the GSTIN |
| Promise that never ends | Promise to Pay dates must be today or within 60 days; one open promise per student, a new one replaces it | "Choose a date within 60 days, by 16-12-2026." | Pick an earlier date, or change the installments in the student's ledger |
| Promise for more than is owed | Amount capped at what the family owes in all | "The family owes ₹18,000 in all. The promise cannot be for more." | Lower the amount, or leave it empty for everything overdue |
| Cheque bounced | Cancel the payment with reason "Cheque bounced"; dues reopen; optional bounce charge as an adjustment (inferred) | "Payment cancelled. Dues reopened." | Collect again |

## 6. Settings

The **Fee Settings** page holds:

- **Late fee rules:** amount or % by days late, a grace period, a maximum (inferred), and which fee heads attract late fee.
- **Reminder schedule:** days before and after the due date, channel, template; respects opt-outs. Example: "fee due tomorrow".
- **Receipt settings:** receipt numbering (prefix and running number, for example SS/2026/00001; a separate series for partial payments such as PP/ if the school wants), restart each year or not; display layouts; invoice options; terms and conditions printed on receipts; office copy and parent copy.
- **Payment gateway routing:** which connected gateway each class, class group or fee head uses. (Gateways are connected in Settings, Payment Gateways; Razorpay first, decided D1.)
- **Advance payments:** allowed or not.
- **Dues ageing groups:** the day ranges used on Defaulters and the outstanding report. Defaults: 0 to 30, 31 to 60, 61 to 90 and over 90 days; the school can change the ranges or add more.
- **Tax invoice numbering:** prefix and running number for GST tax invoices (inferred). GST rates sit on each fee head in Fee Structure; the GSTIN sits in Settings, School Profile.
- **Payment verification step (optional):** on or off, and for which modes (for example cheque, bank transfer).
- **Fees into different bank accounts (optional)** (decided 9 October 2026): on or off (default off). When on, each fee head in Fee Structure has a "Bank account" field. Online payments are split automatically by the gateway to each head's account; this depends on Razorpay's split-settlement feature (inferred: Razorpay Route), with each linked bank account also set up with Razorpay. Counter collections show the account on the receipt and in the Day Book, so the office knows which account to deposit the cash or cheque into. Bank accounts themselves are added in Finance Management, Cash & Bank.
- **Counter permissions shown here, stored in Settings, Users & Permissions:** give discount, waive late fee, change payment date, manage class fee structure, assign or unassign fees, edit a student's fee structure, view Day Book only, collect fee at the counter (for Office Staff), view fee status of own students (for Class Teacher). None of these is given to Office Staff or Class Teacher by default.
- **Approval limits shown here, stored in Settings, Forms & Approvals:** concessions, refunds, cancellations.
- **Scholarship types** and **eligibility rules** (optional, scholarship-heavy schools).
- **Bulk discount rules** are kept on Concessions & Refunds.
- **Promise to pay (optional, added 17 October 2026):** on or off (default off). When off, a promised date on a call note is only noted, as before; nothing pauses.

## 7. Reports

- Collection report: by date, class, fee head, mode and collector; daily, monthly, yearly.
- Outstanding report: by class and student, with the school's ageing groups.
- Defaulter report.
- Discount and concession report; scholarship report (optional).
- Penalty (late fee) report: added, waived, collected.
- Payment-mode report.
- Cancelled payments report (replaces the old Deleted Payments Log): who cancelled, when, reason, amount.
- Refund report.
- Audit report: installment-wise breakdown for accounting.
- Tax report: collection on taxable fee heads by period.
- GST report: for each period, taxable collection by fee head and GST rate, tax amount, and the list of tax invoices, ready for the school's GST filing (decided 9 October 2026, D8c).
- Online payments: successful, failed, reconciled (inferred).
- Daycare billing (optional).

All have filters, analytics and export (P8), and appear in Reports & Analytics.

## 8. Records used

| Record | Creates | Reads | Updates |
|---|---|---|---|
| Fee Head | Yes (with its bank account, when fees go into different bank accounts; decided 9 October 2026) | Yes | Yes |
| Fee Structure | Yes (versioned) | Yes | Yes (new version) |
| Installment | Yes | Yes | Yes |
| Student Fee Due | Yes | Yes | Yes (paid amount, late fee, adjustments) |
| Concession | Yes | Yes | Yes (decision, applied) |
| Payment | Yes (also brought-in past payments by import) | Yes | Yes (status: posted, cancelled; never amount; brought-in payments never change) |
| Receipt | Yes | Yes | Yes (marked cancelled) |
| Refund | Yes | Yes | Yes (paid) |
| Student, Guardian, Class, Section, Academic Year | | Yes | |
| Day Book Entry | | Yes (Finance creates it) | |
| Message, Template | Yes (confirmations, reminders, links) | Yes | |
| Approval, Notification | Yes | Yes | |
| Audit Log Entry | Yes | | |

**Promise to Pay** (added 17 October 2026, in 04-data-model.md): the call log note with a promised date, amount, and status Open, Kept, Broken or Replaced.

Other records (inferred): **Fee Invoice**, **Fee Certificate**, **Payment Link** (amount, rows covered, gateway, expiry, status), **Payment Link Order** (every gateway order made for a link, added 18 October 2026), **Gateway Transaction** (gateway payment ID, callback received, verified, matched, the phone and method it was paid with, a refund or dispute reference), **Reminder Log**, **Bulk Discount Rule**, **Scholarship Type** and **Scholarship Application**, **Daycare Plan** and **Daycare Enrolment**, **Late Fee Rule**, **Advance Balance**, **Tax Invoice** (number, GSTIN, rate, tax amount, payment), **Ageing Group**.

## 9. Done when

1. An accountant finds a student by typing part of the name, sees the dues, and collects a cash payment with 3 taps after the search; the receipt prints with the next number.
2. After that payment, the student's balance, the Fee Dashboard, the Dashboard tile and the Day Book all show it, and the parent receives one WhatsApp message.
3. Typing more than the balance is refused unless advances are on.
4. There is no way to delete a payment; cancelling one needs a reason, keeps it on record as Cancelled, reopens the dues and appears in the cancelled payments report.
5. A gateway callback received twice for the same payment creates one payment and one receipt only; a failed payment appears in Failed online payments with no receipt.
6. A fee structure with installments that do not add up to the total cannot be saved.
7. A concession above the limit waits in Approvals and is applied only after approval.
8. On the day after the grace period, the late fee appears as its own row, the student moves to Defaulters, and the scheduled reminder goes once.
9. A refund cannot exceed the amount paid, and once paid it appears in the Day Book as money out.
10. A bulk reminder to 48 defaulters shows the count and credit cost before sending, and each student's reminder history shows it afterwards.
11. A payment on a fee head marked taxable at 18% produces a tax invoice with the school's GSTIN and the tax shown separately, and the GST report for that month includes it.
12. Importing 300 old dues and 2,000 past receipts shows them on the students' ledgers; the Day Book and today's collection do not change; the brought-in receipts cannot be cancelled.
13. A guardian opens Parent Link, sees the fees due, pays with Razorpay, and the receipt appears for download once the gateway confirms it.
14. A daycare child billed by days attended is charged for exactly the days marked present that week.
15. With fees into different bank accounts on, a cash payment of tuition and transport fees prints a receipt showing each head's bank account, and the Day Book shows tuition against the school account and transport against the trust account; the same payment online is split by Razorpay to the two accounts (decided 9 October 2026).
16. With Promise to pay on, the accountant notes "will pay ₹5,000 on 25-10-2026" for a defaulter: no automatic reminder goes to that family until then; a ₹5,000 payment on 24-10-2026 marks it Kept; with no payment, on 26-10-2026 it is Broken, the family is first on Defaulters and its reminders resume. The Collection forecast for October counts the ₹5,000.

## 10. Open questions

- D1 (decided): Razorpay is the first gateway. Cash and UPI at the counter work from day one without a gateway.
- D2 (decided): staff can never delete a fee payment. A wrong payment is cancelled with a reason.
- Should cancelling a payment made today need approval, or only older ones? Assumed: only older ones.
- D8c (decided 9 October 2026): a fee head can be marked taxable with a GST rate; the school's GSTIN sits in School Profile; payments for taxable heads produce a tax invoice; a GST report exists. Assumed: fee amounts include GST.
- D4 (decided 9 October 2026): parents see fees due, pay and download receipts on Parent Link. There is still no parent app or password login.
- D7 (decided 9 October 2026): old dues and past receipts can be imported when a school switches from old software; past receipts are kept read-only as "Brought in".
- Should fee reminders be sent to parents who opted out of messages? Message Settings says opt-outs are respected except for emergencies. Assumed: opted-out parents get no reminders.
- How should a partial payment be split across several ticked rows? Assumed: oldest due first.
