# 10 Salary Management

Build order: 13th (Stage 3). Needs staff (module 09), staff attendance and leave (modules 05 and 09), and posts into the Day Book (module 07).

## 1. Purpose

Monthly salary for all staff, from salary structure to salary slip.

Used by: the Accountant or salary manager (structures, generating salary, slips, reports), the Principal (approves payroll), and every staff member (downloads their own salary slips).

## 2. Pages

### Generate Salary

**Purpose:** monthly salary worked out from attendance and leave, checked, approved and locked.

**What the person sees**

- Summary at the top: active salary structures, payrolls generated this year, payrolls waiting for approval, this month's net pay.
- Payroll months as a list: month, campus, staff count, gross, deductions, net, status (**Open**, **Calculated**, **Waiting for approval**, **Approved**, **Paid**, **Locked**; decided 9 October 2026, D12), approved by. One payroll run per month per campus.
- Inside a month: PF, ESI, Professional Tax and TDS columns when those are switched on, with the employer's PF and ESI share shown as the school's cost (not taken from net pay).
- Inside a month: one row per staff member with paid days, leave, loss-of-pay days, overtime (optional), gross, deductions, net, and flags ("No salary structure", "Attendance not complete", "Adjustment added").

**Actions**

1. **Open the month:** one payroll run per month per campus (status Open). Default: the month just ended (inferred).
2. **Inputs arrive by themselves:** present days and late marks from Staff Attendance, approved leave and loss-of-pay days from Staff Leave, overtime from Staff Attendance (optional), loan and advance recoveries (optional). Missing attendance for any staff member is flagged. A day with approved leave is a leave day even when it was marked absent, so it is never cut as an absence too; leave without pay and leave days beyond the balance are loss of pay.
3. **Calculate:** gross pay, deductions and net pay from each person's salary structure and the rules in Salary Settings (status Calculated). When switched on, PF and ESI are calculated from the rates and ceilings in Salary Settings, Professional Tax from the state slab table, and TDS is the monthly amount entered for the staff member (decided 9 October 2026, D9).
4. **Review:** sort and filter; open any row to see how each amount was worked out.
5. **Adjust:** add a bonus, arrears or a one-time deduction to a person, each with a reason.
6. **Send for approval:** status Waiting for approval; goes to Approvals (rules in Settings, Forms & Approvals).
7. **Approved:** automation A6 runs: salary slips are made and staff are told. From here the amounts cannot change.
8. **Mark paid:** date, mode (bank transfer, cash, cheque) and reference; status Paid. Only now does the salary go into the Day Book, on the date paid, because that is when money leaves (decided 9 October 2026, D12). A bank transfer file can be downloaded (inferred; see open questions).
9. **Export PF and ESI statements** for the month, ready to upload on the government portals (decided 9 October 2026, D9).
10. **Lock:** closes the run for good (status Locked). A Paid run is locked by the Accountant, or by itself when the next month's run is approved (inferred).
11. **Correct after approval:** only by a reversal or an adjustment in the next payroll, with a reason. An approved or locked payroll never changes. When leave is approved, cancelled or changed, or attendance is corrected, after a month was approved (or for days after the date it was worked out to), the next month's calculation adds the correction by itself: **arrears** when loss of pay is given back, a **deduction** when more loss of pay is found, one per person and month, with the reason and the month it belongs to (for example "September 2026 salary: 2 days of loss of pay given back"). PF and ESI on it are worked out by that month's rates and ceilings. It is listed under "Check before sending"; the Accountant can remove it, and a removed correction does not come back. When a correction or a one-time deduction makes someone's net pay less than zero, that person is flagged under "Check before sending" with the amount, and the month cannot be sent for approval, or approved, until the Accountant changes the adjustment (added 18 October 2026). Loan and advance recoveries never take net pay below zero: they wait for the next month.

**Form fields: Adjustment**

| Field | Required | Default | Notes |
|---|---|---|---|
| Staff member | Yes | The row clicked | |
| Type | Yes | Bonus | Bonus, arrears, deduction, other |
| Amount | Yes | | |
| Reason | Yes | | |
| Month it belongs to | No | | Only on a correction made by itself (step 11), with the change in loss-of-pay days and the PF and ESI on it |

### Salary Structures

**Purpose:** each staff member's earnings and deductions, with past versions kept.

**What the person sees**

- List: staff member, designation, gross, deductions, net (monthly), effective from, version.
- One structure: earnings and deductions lines (component, amount or formula), totals, and the version history (each version with its effective date and who changed it).
- Staff without a structure are flagged.

**Actions**

- Add a structure for a staff member: start from a template for the designation (inferred) or copy another person's.
- **Revise:** a new version from a date (for example an increment); past payrolls keep the old version.
- Bulk revise: for example a 5% increase for a designation from a date, with a preview (P11) (inferred).
- Import structures from a spreadsheet (P10).

**Form fields: Salary structure**

| Field | Required | Default | Notes |
|---|---|---|---|
| Staff member | Yes | | |
| Effective from | Yes | First day of next month (inferred) | |
| Earnings lines | Yes, at least one | From the designation template (inferred) | Components from Salary Settings, for example basic pay, dearness allowance, house rent allowance (inferred examples) |
| Deduction lines | No | From the template | For example a staff welfare fund (inferred example). PF, ESI and Professional Tax are not typed here; they are calculated from Salary Settings when switched on |
| PF applies | No | On when PF is switched on in Salary Settings | With the staff member's UAN (inferred), restricted |
| ESI applies | No | On when the staff member's wages are within the ESI limit | With the ESI number (inferred), restricted |
| TDS per month | No | 0 | Income tax to deduct each month, entered by the Accountant; not calculated (decided 9 October 2026, D9). Can be changed for one month in Generate Salary with a reason (inferred) |
| Bank account (for salary transfer) | No | | Restricted |

### Salary Slips

**Purpose:** salary slips for every staff member; each person can download their own.

**What the person sees**

- For salary staff: slips by month and staff member, with status (Made, Sent, Downloaded; inferred).
- For every staff member (**My salary slips**): their own slips by month, newest first.

**Actions**

- Slips are made automatically from the approved payroll (never before approval).
- View, download as PDF, print, or send by WhatsApp or email (design and options from Salary Settings and Document Designs).
- A staff member downloads their own slips, from this page or from Profile.

**Form fields:** none.

### Advances & Loans

*Optional page: for schools giving staff advances or loans.*

**Purpose:** salary advances and loans, recovered from monthly pay.

**What the person sees**

- List: staff member, type (advance or loan), amount, date given, installment, recovered so far, balance, status (**Active**, **Closed**).

**Actions**

- Give an advance or loan (approval if set in Forms & Approvals). The amount goes to the Day Book as money out when it is marked paid (decided 9 October 2026, D12).
- Recovery is added automatically as a deduction in each payroll until the balance is zero.
- Pause or change the installment (with a reason); close early when repaid in cash.

**Form fields: Advance or loan**

| Field | Required | Default | Notes |
|---|---|---|---|
| Staff member | Yes | | |
| Type | Yes | Advance | Advance or loan |
| Amount | Yes | | |
| Monthly recovery | Yes | Full amount next month for an advance; amount divided by 10 months for a loan (inferred) | |
| Start recovery from | Yes | Next payroll month | |
| Reason | Yes | | |

### Salary History

**Purpose:** salary paid by month and by staff member, with salary reports.

**What the person sees**

- By month: totals of gross, deductions and net; staff count.
- By staff member: every month's gross, deductions, net and payment date.
- Reports: see section 7.

**Actions:** filter (year, month, designation, department, staff member); open a month's payroll or a slip; export (P8).

### Salary Settings

**Purpose:** salary components, approval steps and salary slip options. See section 6.

## 3. All features

18 features are mapped to this module: 16 Core and 2 Optional. Tick each one when it is built and tested.

### Generate Salary (9)

- [ ] Open a payroll period for a month (one payroll run per month per campus; statuses Open, Calculated, Waiting for approval, Approved, Paid, Locked) (Core)
- [ ] Attendance, leave and overtime inputs to payroll (Core) · automatic
- [ ] Gross pay, deductions and net pay calculated from rules (Core)
- [ ] Generate and review monthly salary (Core)
- [ ] Payroll adjustments (bonus, arrears, deductions) with a reason (Core)
- [ ] Approve and lock payroll; corrections only by reversal or adjustment (Core)
- [ ] PF and ESI calculated from the rates and ceilings in Salary Settings (Core) · switched on in Salary Settings
- [ ] TDS entered as a monthly amount per staff member (Core)
- [ ] Mark payroll paid; salary posts to the Day Book on the date paid (Core)

### Salary Structures (1)

- [ ] Salary structure per staff: earnings and deductions with a version history (Core)

### Salary Slips (2)

- [ ] Payslips generated from approved payroll (Core)
- [ ] My Salary Slips: staff view and download their own payslips (Core)

### Advances & Loans (1)

- [ ] Salary advances and loans recovered from pay (Optional: schools giving staff advances)

### Salary History (3)

- [ ] Salary history per staff member and per month (Core)
- [ ] Salary reports (Core)
- [ ] Monthly PF and ESI statements exported for the government portals (Core)

### Salary Settings (2)

- [ ] Salary settings / payroll preferences (Core)
- [ ] Professional Tax by state slab table (Optional: schools in states with Professional Tax)

## 4. Connections

**Receives**

| From | What |
|---|---|
| 09 Staff & HR | Staff list, designations, departments; approved leave and loss-of-pay days (A5); final settlement on exit |
| 05 Attendance | Present days, late marks, overtime (optional) per staff member for the month |
| 04 Academic | Substitution counts, if the school pays for extra periods (inferred; see module 04 open questions) |
| 20 Settings | Approval rules, slip design, restricted fields |

**Sends**

| To | What |
|---|---|
| 07 Finance | Payroll runs marked Paid into the Day Book (A6); advances when paid out (D12) |
| Notifications and 11 Communication | "Your salary slip for September 2026 is ready" to each staff member (A6) |
| 09 Staff & HR | Salary tab on the staff profile (restricted) |
| 19 Reports & Analytics | Salary reports and HR cost analytics |
| Top bar Approvals | Payroll approval, advances and loans |

**Automations:** owns **A6 Salary approved**: payslips are made and staff are told on approval; the payment goes into the Day Book only when the run is marked Paid. Receives the salary part of **A5**.

## 5. Rules and mistake-proofing

| Rule | How it is prevented | What the person is told | How they recover |
|---|---|---|---|
| Two payrolls for one month | One payroll run per month per campus (decided 9 October 2026, D12) | "September 2026 payroll already exists" | Open the existing one |
| Paying someone with no structure | Flagged and left out until a structure exists | "3 staff have no salary structure" | Add structures, recalculate |
| Calculating before attendance is complete | Warning listing staff with missing days (inferred) | "Attendance missing for 2 staff on 5 days" | Complete attendance, or calculate anyway |
| Adjustment with no reason | Reason required | "Give a reason for this bonus" | Not needed |
| Slips before approval | Slips are made only after approval | "Payroll waiting for approval" | Wait |
| Changing an approved or locked payroll | Amounts frozen from approval; corrections by reversal or adjustment in the next month | "September is locked. Add an adjustment in October." | Adjustment |
| Leave or attendance changed after a month was approved | The next month's calculation adds arrears or a deduction by itself, once, with PF and ESI by the earlier month's rules | "September 2026 salary: 1 day of loss of pay given back" | Check it before sending; remove it if it should not be paid |
| Absent and on leave the same day | Approved leave decides the day: it counts once, as leave | Not needed | Not needed |
| Leave beyond the balance paid in full | Days beyond the balance, saved on the Leave Request, are loss of pay on the leave's last days | "2 days of leave beyond the balance (loss of pay)" | Not needed |
| Structure revised for a past month | Effective date before a locked payroll is refused, or creates arrears in the next payroll (inferred) | "Revision before 01-10-2026 will be paid as arrears" | Accept arrears |
| Recovery more than net pay | Recovery capped so net pay is not negative; the rest moves to next month (inferred) | "Loan recovery reduced to ₹2,000 this month" | Not needed |
| Seeing others' salaries | Salary is restricted; staff see only their own | Nothing shown | Not needed |
| Paid twice into the Day Book | One Day Book posting per payroll run, made only when it is marked Paid (see module 07) | Not needed | Not needed |
| PF or ESI worked out on the wrong wages | Rates and ceilings come from Salary Settings only; each row shows the wages used and the ceiling applied | "PF on ₹15,000 (ceiling), not ₹22,000" | Change the rate or ceiling in Salary Settings and recalculate before approval |
| TDS forgotten for a staff member | Staff with a TDS amount of 0 whose yearly pay is above a limit the school sets are flagged (inferred) | "4 staff have no TDS amount" | Enter the monthly TDS, or calculate anyway |

## 6. Settings

The **Salary Settings** page holds:

- **Salary components:** earnings and deductions, each with a type (fixed amount, % of another component, or from attendance such as loss of pay; inferred types), and whether it is taxable (inferred).
- **Designation templates** of components (inferred).
- **Payroll preferences:** pay day, how a month's days are counted for loss of pay (calendar days or a fixed 30; inferred), late-mark rule (for example 3 late marks equal half a day; inferred), overtime rate (optional).
- **Statutory deductions (decided 9 October 2026, D9):**
  - **PF** on or off. Default rates: 12% employee and 12% employer, on basic pay up to the wage ceiling (default ₹15,000 a month, inferred: the current government ceiling). Which components count as PF wages (default basic pay, inferred).
  - **ESI** on or off. Default rates: 0.75% employee and 3.25% employer, for staff whose wages are up to the ESI limit (default ₹21,000 a month, inferred: the current government limit).
  - The school can change every rate and ceiling when the government changes them; a change applies from a chosen month and never changes approved payrolls.
  - **Professional Tax** (optional): on or off, with a slab table for the school's state (salary from, salary to, tax per month, and any month with a different amount).
  - **TDS** is not calculated: the Accountant enters a monthly amount per staff member on the salary structure.
  - **PF and ESI statement formats:** the files exported each month for the government portals (inferred: the EPFO ECR file and the ESIC monthly contribution file).
- **Approval steps:** who approves payroll and advances (shown here, stored in Settings, Forms & Approvals).
- **Salary slip options:** which components and details show, the school's signature, whether to send slips by WhatsApp or email automatically. The slip design is in Settings, Document Designs.

## 7. Reports

- Monthly payroll summary (gross, deductions, net).
- Monthly trends over the year.
- Designation-wise and department-wise breakdowns.
- Employee salary history.
- Deductions report by component.
- **PF statement** and **ESI statement** for a month: each staff member's wages, employee and employer share, exported for the government portals.
- Professional Tax and TDS deducted by month and staff member.
- Advances and loans outstanding (optional).
- Bank transfer list for a month (inferred).

All follow P8 and appear in Reports & Analytics.

## 8. Records used

| Record | Creates | Reads | Updates |
|---|---|---|---|
| Salary Structure | Yes (versioned) | Yes | Yes (new version) |
| Payroll Run | Yes (one per month per campus) | Yes | Yes (status: Open, Calculated, Waiting for approval, Approved, Paid, Locked) |
| Payslip | Yes | Yes | Yes (sent) |
| Staff | | Yes | |
| Attendance Mark, Leave Request | | Yes | |
| Day Book Entry | | Yes (Finance creates it) | |
| Approval, Notification, Message | Yes | Yes | |
| Audit Log Entry | Yes | | |

Other records (inferred): **Salary Component**, **Salary Template** (per designation), **Payroll Line** (one per staff member per payroll), **Payroll Adjustment**, **Advance or Loan** with **Recovery**, **Staff Bank Account**, **Statutory Setting** (PF and ESI rates and ceilings, with effective month), **Professional Tax Slab**, **Statutory Statement** (month, type, file).

## 9. Done when

1. Opening September 2026 brings in each staff member's present days, approved leave and loss-of-pay days without typing.
2. Net pay for a staff member equals their structure minus loss of pay and deductions, and opening the row shows how it was worked out.
3. A second payroll for the same month cannot be created.
4. Adding a bonus without a reason is not possible.
5. After the principal approves, every staff member gets a notification that their slip is ready, and can download only their own slip.
6. Marking the payroll paid adds one salary entry to the Day Book on the payment date.
7. A locked payroll cannot be edited; a correction appears as an adjustment in the next month. Leave approved for a day already paid as loss of pay appears by itself in the next month as arrears for that month, with PF and ESI on it.
8. An active loan's installment is deducted each month until the balance is zero, then the loan closes.
9. A salary revision creates a new version; the previous month's slip still shows the old amounts.
10. With PF and ESI on, a teacher with basic pay ₹22,000 has PF worked out on ₹15,000, and a staff member earning ₹18,000 has ESI at 0.75%; the employer shares show as the school's cost.
11. A TDS amount entered for a staff member appears on every payslip until changed.
12. An approved payroll is not in the Day Book; marking it Paid adds it on the date paid; a salary advance appears in the Day Book on the date it is paid.
13. The PF and ESI statements for September 2026 download and match the totals in the payroll.

## 10. Open questions

- D9 (decided 9 October 2026): PF and ESI are calculated (switched on in Salary Settings, rates and ceilings changeable); Professional Tax uses an optional state slab table; TDS is entered as a monthly amount per staff member, not calculated; monthly PF and ESI statements are exported.
- D12 (decided 9 October 2026): Payroll Run statuses are Open, Calculated, Waiting for approval, Approved, Paid, Locked; one run per month per campus; salary and advances reach the Day Book when marked paid.
- Is a bank transfer file (for the school's bank) needed when marking salary paid? Not in the inputs; listed as inferred.
- Payroll is per campus (decided 9 October 2026, D12). Should there also be a combined view for the whole school? Assumed: yes, read-only.
