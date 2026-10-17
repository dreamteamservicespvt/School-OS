# 07 Finance Management

Build order: 8th (Stage 2). Follows Fee Management, because the Day Book fills from fee payments. Salary (module 10) and Inventory (module 14) post into it later.

## 1. Purpose

All money coming in and going out of the school, beyond fees.

Used by: the Accountant (Day Book, income, expenses, cash and bank, accounts), the Principal (approves large expenses, reads reports), department heads (raise expenses, see their budget, inferred), and staff with "view Day Book only" access.

## 2. Pages

### Day Book

**Purpose:** every rupee received and spent on a date, filled in automatically.

**What the person sees**

- Title "Day Book: daily income and expense summary, 06 Oct 2026".
- Filters: financial year (default the current one), date (default today; a date range is allowed, inferred, inside one financial year), class (optional, default all classes), with **Apply** and **Reset**. The Day Book works by financial year (default April to March), kept apart from the academic year (decided 9 October 2026, D8d). Shows posted entries only by default; a switch shows waiting entries too (for example payments waiting for verification).
- Totals: **Total income** (with number of transactions and the split "Fees ₹X + Partial ₹Y"), **Total expense** (with number of transactions), **Net balance** (income minus expense).
- Income grouped: online fees, full payments, partial payments, daycare, other fee types, other income. Chips show each group's amount and count, and a pill per payment mode (for example "Online ₹5,000").
- Sections, each with a row count, a total and its own empty state ("No partial payments on this date."):
  - **Fee payments (full)**, **Partial payments**, **Daycare payments**, **Other income**, **Expenses**, **Salary** (when a payroll is paid that day), **Refunds and reversals**.
- Entry columns: #, student (or payer or vendor), class, fee type or head, amount, penalty, total, mode, reference, time, category, notes.
- **Bank account (optional):** when Fee Settings has "Fees into different bank accounts" on, each fee entry also shows the bank account its fee head goes to (for example School account or Trust account), and a filter and subtotals by bank account appear. Online payments show the account Razorpay split them into; counter collections show the account the cash or cheque is to be deposited into (decided 9 October 2026).

**Actions**

- Open an entry: shows where it came from (the payment and receipt, the expense and bill, the payroll run) with a link.
- Export the Day Book to CSV, Excel or PDF (P8).
- Print (P9).
- Entries cannot be added or edited here: they come from fees, income, expenses, salary, refunds and purchases. A wrong entry is corrected at its source, which posts a reversal (inferred: no manual entries in the Day Book).

**Form fields:** none (filters only).

### Income

**Purpose:** money the school receives other than fees.

**What the person sees**

- List: date, income head (account), source or payer, amount, mode, reference, posting status (**Draft**, **Posted**, **Cancelled**, inferred), recorded by.
- Filters: date range, head, mode, status.

**Actions**

- Record income (for example rent of the hall, donations, scrap sale, alumni donations); post it to the Day Book.
- Print a receipt for income (design from Document Designs, inferred).
- Cancel with a reason (keeps the record; reverses the Day Book entry).

**Form fields: Record income**

| Field | Required | Default | Notes |
|---|---|---|---|
| Date | Yes | Today | |
| Income head | Yes | | From the chart of accounts |
| Amount | Yes | | |
| Received from | Yes | | Free text or pick a vendor or person (inferred) |
| Mode | Yes | Cash | Cash, UPI, bank transfer, cheque |
| Reference | Yes for non-cash | | |
| Cash or bank account | Yes | Cash in hand for cash, the main bank account otherwise (inferred) | |
| Note | No | | |
| Post now | Yes | On | Off keeps it as draft |

### Expenses

**Purpose:** bills and expenses with a photo of the bill; large amounts go for approval.

**What the person sees**

- Tabs: **All expenses**, **Waiting for approval** (the pending expenses list), **Vendor bills** (optional).
- List columns: date, expense head (category), vendor, amount, mode, bill attached (yes or no), status (**Draft**, **Waiting for approval**, **Approved**, **Paid**, **Cancelled**; decided 9 October 2026, D12), requested by.
- Filters: date range, head, vendor, department or cost centre, status, amount above.

**Actions**

- **Record an expense** (from a phone in under a minute: photo of the bill, amount, head).
- Expenses above the limit set in Finance Settings go to Approvals; below the limit they are approved at once (inferred: auto-approve below limit). A rejected expense goes back to Draft with the approver's reason, to be changed and sent again or cancelled (inferred).
- Mark paid (mode, reference, date); the expense becomes Paid and only then posts to the Day Book, on the date paid, because that is when money leaves (decided 9 October 2026, D12). Draft, Waiting for approval and Approved expenses are not in the Day Book.
- **Import past expenses (optional):** a school that starts part way through the financial year can import its earlier expenses with the shared importer (P10), so expense reports cover the whole year. They are kept read-only, marked **Brought in**, and never post to the Day Book or the cash and bank books, because the opening balances already include them (decided 9 October 2026, D7; workflow 15, "Switching to School OS", see 02-workflows.md). The Accountant brings them in from **Expenses, Import past expenses**, without Settings; the ready Excel sheet lists the school's expense heads.
- **Vendor bills / purchase invoices (optional):** record a vendor's bill with bill number and due date; pay later (part or full). A bill with the same vendor and bill number, or the same vendor, amount and date, gives a duplicate warning.
- Cancel with a reason.
- Expense reports (see section 7).

**Form fields: Record expense**

| Field | Required | Default | Notes |
|---|---|---|---|
| Bill photo or file | No (Yes above a limit set in Finance Settings, inferred) | | Camera first on phones |
| Amount | Yes | | |
| Expense head | Yes | The head used last by this person (inferred) | |
| Date | Yes | Today | |
| Vendor | No | | Pick or add inline |
| Paid now | Yes | Yes | If yes: mode (default cash), reference for non-cash, cash or bank account |
| Department or cost centre | No | The person's department (inferred) | Only when cost centres are on |
| Note | No | | |

### Cash & Bank

**Purpose:** cash book and bank book with opening and closing balance.

**What the person sees**

- **Cash book:** for a date or period: opening balance, receipts, payments, closing balance, and every entry in time order.
- **Bank book:** the same per bank account.
- Both books work by financial year (default April to March). The opening balance of a new financial year is the closing balance of the last one, carried over by the software (inferred).
- Accounts list: cash in hand and each bank account, with current balance.

**Actions**

- Add a bank account (name, bank, account number masked, opening balance and date).
- **Move money** between cash and bank, for example a cash deposit to the bank (contra entry) (inferred: needed to keep both books right).
- **Opening balances at go-live:** set the cash in hand and each bank account's balance once, on the day the school starts using School OS (any day of the year), as a step of workflow 15, "Switching to School OS" (decided 9 October 2026, D7). Later changes need approval (inferred).
- Export and print (P8, P9).

**Form fields: Move money (inferred)**

| Field | Required | Default | Notes |
|---|---|---|---|
| From | Yes | Cash in hand | |
| To | Yes | Main bank account | |
| Amount | Yes | Today's cash closing balance | |
| Date | Yes | Today | |
| Reference | No | | Deposit slip number |

### Budget

*Optional page: shown only when the school switches on budgets in Finance Settings.*

**Purpose:** yearly budget by head and department, and how much is used.

**What the person sees**

- Budgets by account (expense head), department and period (year, term or month): budget, spent, committed (approved but unpaid, inferred), remaining, % used.
- Variance alerts: heads above 80% and above 100% used (inferred: thresholds).

**Actions**

- Set a budget for the financial year (inferred) by head and department; copy last year's with a % change (inferred).
- Revise a budget (keeps the original and each revision).
- An expense that takes a head over budget shows a warning to the requester and the approver (inferred).

**Form fields:** year (default current), head, department (optional), amount, split by month or term (default equal, inferred).

### Accounts

*Optional page: for schools keeping full accounts (switched on in Finance Settings).*

**Purpose:** journal entries, ledger, payables and receivables, for schools keeping full accounts.

**What the person sees**

- **Journal entries:** date, number, accounts debited and credited, amount, narration, created by.
- **General ledger:** any account's entries and running balance for a period.
- **Payables:** vendor bills not yet paid, by due date. **Receivables:** amounts owed to the school other than student fees (inferred: fees have their own ledger).
- **Multi-campus accounting (optional):** each campus has its own books; a consolidated view adds them up.
- **Group view (optional):** central finance for a school group.

**Actions**

- Add a journal entry (debits must equal credits).
- Reverse a journal entry (never edit a posted one).
- Every automatic posting (fees, income, expenses, salary) also creates its journal lines when Accounts is on (inferred).

**Form fields: Journal entry**

| Field | Required | Default | Notes |
|---|---|---|---|
| Date | Yes | Today | |
| Lines: account, debit or credit, amount | Yes, at least two | | Debits must equal credits |
| Narration | Yes | | |
| Campus | Yes | The person's campus | Multi-campus only |

### Finance Reports

**Purpose:** income and expense, profit and loss, and department-wise spending. See section 7.

### Finance Settings

**Purpose:** income and expense heads, approval limits, cost centres and Tally export. See section 6.

## 3. All features

32 features are mapped to this module: 20 Core and 12 Optional. Tick each one when it is built and tested.

### Day Book (7)

- [ ] Day Book: all money in and out for a date, with date filter (posted entries only by default) (Core)
- [ ] Class filter with Apply / Reset (Core)
- [ ] Totals: income, expense, net balance (Core)
- [ ] Income grouped as online fees, full payments, partial payments, daycare, other fee types (Core)
- [ ] Entry details: student, class, fee type, amount, penalty, total, mode, reference, time, category, notes (Core)
- [ ] Export Day Book to CSV, Excel, PDF (Core)
- [ ] Bank account shown on each fee entry, with a filter and subtotals by bank account, when fees go into different bank accounts (Optional: schools keeping separate school and trust accounts) (decided 9 October 2026)

### Income (1)

- [ ] Record other school income (date, account, amount, source; posting status) (Core)

### Expenses (6)

- [ ] Record an expense: date, vendor, account, amount, bill attachment (Core)
- [ ] Expense approval above set limits (Core)
- [ ] Pending expenses list (Core)
- [ ] Expense reports (Core)
- [ ] Vendor bills / purchase invoices, with duplicate warning (Optional: schools paying vendors through the system)
- [ ] Import past expenses as read-only "Brought in" records that never post to the Day Book (Optional: schools starting part way through the financial year) · workflow 15, Switching to School OS

### Cash & Bank (3)

- [ ] Cashbook: opening, receipts, payments, closing (Core)
- [ ] Bankbook per bank account (Core)
- [ ] Cash and bank opening balances set at go-live (Core) · workflow 15, Switching to School OS

### Budget (2)

- [ ] Budgets by account, department and period (Optional: schools that set budgets)
- [ ] Budget vs actual, with variance alerts (Optional: schools that set budgets)

### Accounts (5)

- [ ] Journal entries (Optional: schools keeping full accounts)
- [ ] General ledger (Optional: schools keeping full accounts)
- [ ] Payables and receivables (Optional: schools keeping full accounts)
- [ ] Multi-campus accounting (Optional: multi-campus schools)
- [ ] Central finance for the group (Optional: school groups) · group view

### Finance Reports (3)

- [ ] Income and expense reports by category and period (Core)
- [ ] Profit and loss (Core)
- [ ] Expense analysis and department-wise expenses (Core)

### Finance Settings (5)

- [ ] Expense categories (Core)
- [ ] Financial year (default April to March), separate from the academic year; Day Book, cash and bank books and finance reports work by financial year (Core)
- [ ] Cost centres (Optional: larger schools and groups)
- [ ] Chart of accounts (income and expense heads with codes) (Core)
- [ ] Accounting software (e.g. Tally) (Optional: schools using outside accounting software) · Tally export

### Automatic work: Fee paid / Salary approved (1)

These are listed in the feature map under "Automatic work". They have no page; they are built with this module.

- [ ] Fee and salary payments post to the Day Book automatically; salary, salary advances and expenses post when marked Paid (Core) · shown in Day Book

## 4. Connections

**Receives**

| From | What | Posting rule |
|---|---|---|
| 06 Fee Management | Posted payments (A1), cancelled payments, refunds | Payment → income entry on the payment date; cancellation → reversal entry on the cancel date (the original stays); refund → money-out entry on the refund date (inferred: reversal and refund rules) |
| 10 Salary | Payroll runs marked Paid (A6); salary advances when paid | One salary entry per payroll run (with staff breakdown on open) on the date the run is marked Paid; an advance is a money-out entry on the date it is paid (decided 9 October 2026, D12) |
| 14 Inventory (optional) | Purchase invoices and payments | Expense entries when paid |
| 15 Hostel (optional) | Mess and hostel expenses | Expense entries |
| 12 Transport (optional) | Fuel and repair costs per vehicle | Expense entries, tagged to the vehicle (inferred) |
| 03 Student Management | Alumni donations (optional) | Income entries (inferred) |
| 20 Settings | Approval rules, Tally connection, campuses, the shared importer | |

**Sends**

| To | What |
|---|---|
| 01 Dashboard | Expenses today, this month, pending; income vs expense; budget used |
| Top bar Approvals | Expenses above the limit; opening balance changes |
| 19 Reports & Analytics | Finance analytics: collection, dues, expenses |
| Tally (optional) | Export of vouchers for outside accounting software |
| Notifications | Expense approved or rejected; budget variance alerts |

**Automations:** builds the Day Book posting part of **A1 Fee paid** and **A6 Salary approved** (the automatic-work feature below). Every posting is made once per source record: posting the same payment or payroll again does nothing (inferred).

## 5. Rules and mistake-proofing

| Rule | How it is prevented | What the person is told | How they recover |
|---|---|---|---|
| Day Book typed by hand and differing from fees | No manual Day Book entries; everything posts from its source | Day Book has no Add button | Correct the source record |
| Changing a posted entry | Posted income, expenses and journals cannot be edited; cancel or reverse with a reason | "Posted entries cannot be edited. Cancel and record again?" | Cancel and re-record |
| Large expense without approval | Expenses above the limit wait in Approvals and cannot be marked paid | "Above ₹5,000: waiting for the principal" | Wait, or split only with a reason (inferred: splitting a bill to avoid the limit is flagged) |
| Duplicate vendor bill | Warning on same vendor and bill number, or same vendor, amount and date | "Bill INV-221 from Sharma Stationers already recorded on 02-10-2026" | Open existing, or save with reason |
| Expense without a bill | Bill required above a set amount (inferred) | "Attach the bill for amounts over ₹2,000" | Attach a photo |
| Cash book going below zero | Warning when a cash payment would make cash in hand negative (inferred) | "Cash in hand is ₹1,200. This payment is ₹3,000." | Use bank, or record the cash received first |
| Journal not balanced | Save blocked until debits equal credits | "Debits ₹10,000, credits ₹9,500" | Fix a line |
| Over budget | Warning to requester and approver (inferred) | "Stationery budget: 104% used after this expense" | Approver decides |
| Entry in the wrong financial year | Every entry belongs to the financial year of its date; reports never mix two financial years unless a range is chosen on purpose (inferred) | "This date is in 2025-26 (April to March). Finance year 2025-26 is closed." | Post an adjustment in the open year |
| Past expenses counted twice after switching | Imported past expenses are Brought in and never post to the Day Book or the cash and bank books | "Brought in from old software. Not in the Day Book." | Undo the whole import from the import history |
| Closed period changed | Books for a closed month or year are read-only (inferred: month close) | "September 2026 is closed" | Post an adjustment in the open month |

## 6. Settings

The **Finance Settings** page holds:

- **Financial year:** start month (default April, so the year runs April to March), kept apart from the academic year (decided 9 October 2026, D8d). The Day Book, cash and bank books, budgets and finance reports use it.
- **Chart of accounts:** income and expense heads with codes, grouped (for example "Academic income", "Staff costs").
- **Expense categories** (the expense heads used on the expense form).
- **Approval limits** for expenses and purchases (shown here, stored in Settings, Forms & Approvals).
- **Bill required above** an amount (inferred).
- **Cost centres** (optional, larger schools and groups): departments or units that expenses and budgets are tagged to.
- **Bank accounts** and the cash account (inferred: kept here as well as on Cash & Bank).
- **Budget on or off** (optional page) and **Accounts on or off** (optional page).
- **Month and year close:** close a month, or a financial year, so its books cannot change (inferred).
- **Accounting software (Tally) export** (optional): map heads to Tally ledgers and download vouchers; the connection itself is in Settings, Modules On/Off.

## 7. Reports

All finance reports are by financial year (default the current one), with a date range inside it.

- Income and expense by category (head) and period.
- Profit and loss.
- Expense analysis and department-wise expenses (by cost centre when on).
- Expense reports: by head, vendor, month, approver; pending expenses.
- Cash book and bank book for a period.
- Budget vs actual, with variance (optional).
- General ledger, trial balance, payables and receivables (optional, Accounts; trial balance inferred).
- Day Book for any date or range.

All follow P8 and appear in Reports & Analytics.

## 8. Records used

| Record | Creates | Reads | Updates |
|---|---|---|---|
| Day Book Entry | Yes (from every source) | Yes | No (reversals are new entries) |
| Income | Yes | Yes | Yes (post, cancel) |
| Expense | Yes (also brought-in past expenses by import) | Yes | Yes (approve, pay, cancel) |
| Budget | Yes | Yes | Yes (revisions) |
| Payment, Receipt, Refund | | Yes | |
| Payroll Run, Payslip | | Yes | |
| Student, Class | | Yes (Day Book columns and filter) | |
| Approval, Notification | Yes | Yes | |
| Audit Log Entry | Yes | | |

Other records (inferred): **Account Head** (chart of accounts), **Cost Centre**, **Vendor** (shared with Inventory), **Vendor Bill** and **Bill Payment**, **Bank Account**, **Cash Transfer** (contra), **Journal Entry** with **Journal Line**, **Period Close**, **Tally Export Batch**, **Financial Year** (start and end date, open or closed), **Opening Balance** (per cash or bank account, go-live date, approval).

## 9. Done when

1. A cash fee payment made in Fee Management appears in today's Day Book within seconds, with student, class, fee type, amount, mode and time, and the income total matches the Fee Dashboard.
2. Cancelling that payment adds a reversal line on the cancel date; the original line stays; the net for the day is correct.
3. Approving a payroll and marking it paid adds one salary entry to the Day Book on the payment date.
4. An expense of ₹12,000 waits in Approvals and cannot be marked paid until approved; an expense of ₹800 is approved at once.
5. Recording the same vendor bill number twice shows the duplicate warning.
6. The cash book for a day shows opening, receipts, payments and closing, and the closing equals the next day's opening.
7. The Day Book exports to Excel and PDF with the same totals as on screen.
8. With Budget on, an expense that crosses a head's budget warns the requester and the approver.
9. A journal entry with unequal debits and credits cannot be saved.
10. An approved expense is not in the Day Book; marking it Paid adds it on the date paid.
11. With the financial year April to March and the academic year June to May, the Day Book and the cash book for 2026-27 cover 01-04-2026 to 31-03-2027.
12. A school starting on 01-11-2026 sets its cash and bank opening balances, imports past expenses, and the cash book for November opens with exactly those balances.

## 10. Open questions

- Should the Day Book also show income and expenses that are recorded but not yet posted, as a separate section? Assumed: posted only by default, with a switch.
- Does the school need month closing, so past months cannot change? The inputs say corrections are by reversal, but do not mention closing periods. Assumed as an option.
- Which Tally version and voucher format should the export follow? Not stated in the inputs.
- D2 (decided): payments are cancelled, never deleted, so the reversal rules above apply.
- D7 (decided 9 October 2026): cash and bank opening balances are set at go-live; past expenses can be imported and are kept as "Brought in".
- D8d (decided 9 October 2026): Finance has a financial year (default April to March) apart from the academic year.
- D12 (decided 9 October 2026): expenses, salary and salary advances reach the Day Book when marked Paid. Expense statuses: Draft, Waiting for approval, Approved, Paid, Cancelled.
