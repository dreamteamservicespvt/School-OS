# 13 Library Management

*Can be switched off.* Build order: 18th (Stage 4). Needs students, staff and ID cards (library card barcodes).

## 1. Purpose

The school library: books, issue and return, and fines.

Used by: the Librarian (everything here, with a student search), the Principal (reports), and the office (library clearance when a student leaves).

## 2. Pages

### Books

**Purpose:** book list with author, publisher, copies, accession numbers and barcode labels.

**What the person sees**

- Catalogue list: title, author, publisher, ISBN, category, subject, copies (total, available, issued, lost), shelf location (inferred).
- One book: its details and each **copy** with accession number, barcode, status (**Available**, **Issued**, **Reserved**, **Lost**, **Damaged**, **Withdrawn**), and who has it.
- Filters: category, subject, author, available only.

**Actions**

- Add a book; add copies (accession numbers given automatically in sequence, or typed).
- Fill details from the ISBN where an online lookup is available (inferred; see open questions).
- Import the catalogue from a spreadsheet (P10).
- Print barcode, QR or RFID labels for copies (choose copies, print sheet).
- Withdraw a copy (old or damaged) with a reason; it stays in history.

**Form fields: Add book**

| Field | Required | Default | Notes |
|---|---|---|---|
| Title | Yes | | |
| Author(s) | Yes | | Pick or add |
| Publisher | No | | Pick or add |
| ISBN | No | | Format check: 10 or 13 digits (the last of a 10-digit ISBN may be X) with a valid check digit; hyphens and spaces ignored (inferred: the check). Duplicate check |
| Category and subject | No | | Category list from Library Settings |
| Number of copies | Yes | 1 | Accession numbers created for each |
| Price | No | | Used for lost-book charges |
| Shelf location | No | | (inferred) |

### Issue & Return

**Purpose:** issue, return, renew and reserve books in a few taps.

**What the person sees**

- A single desk screen: scan or search the member (student or staff, by name, admission number or library card barcode), then scan or search the book copy.
- The member panel: photo, class, books out with due dates, overdue, fines due, limit ("2 of 3 books").
- Today's list: issued, returned, due today, overdue.

**Actions**

- **Issue:** member and an available copy; due date set from the loan days in Library Settings. Blocked when over the limit or when the copy is not available.
- **Return:** scan the copy; if late, the fine is shown and added (see Fines & Stock Check); if damaged, mark damaged.
- **Renew:** extends the due date, unless the book is reserved by someone else or the issue has already been renewed the maximum number of times set in Library Settings (default 2, inferred).
- **Reserve:** for a book with no available copy; reservations queue in the order set in Library Settings (first come, first served by default, or staff first) and the first in the queue gets the next returned copy (the librarian is told, and the member is informed by message if they are a student's parent or staff, inferred).

**Form fields: Issue**

| Field | Required | Default | Notes |
|---|---|---|---|
| Member | Yes | | Scan card or search |
| Copy | Yes | | Scan barcode or search |
| Due date | Yes | Today plus loan days | Change needs permission (inferred) |

### Members & Cards

**Purpose:** students and staff who can borrow, their limits and library cards.

**What the person sees**

- Members list: name, type (student or staff), class or department, card number, limit, books out, fines due, status (Active, Blocked).
- All active students and staff are members automatically (inferred); limits come from Library Settings by member type.

**Actions**

- Print library cards (from the ID card designer in Settings, Document Designs) by class; or include the library barcode on the student ID card (an option in the ID card settings).
- Block or unblock a member (with a reason).
- Change a member's limit (with a reason).

**Form fields:** none for automatic members; block reason; limit change with reason.

### Fines & Stock Check

**Purpose:** late fines, lost or damaged books, and the yearly stock check.

**What the person sees**

- Fines list: member, book, reason (late, lost, damaged), amount, status (**Due**, **Paid**, **Waived**).
- Stock check (stock audit) sessions: date, copies expected, copies found, missing, extra.

**Actions**

- **Overdue fines:** worked out on return from the fine rate in Library Settings.
- **Lost or damaged:** mark a copy lost or damaged with a charge (default the book's price, inferred). A charge above the amount set in Library Settings (default ₹500, inferred) goes to Approvals first and is added only when approved.
- Collect a fine: for students the fine is added to their fees in Fee Management and collected there (inferred: one place to pay); for staff, collected here or recovered from salary (inferred).
- Waive a fine with a reason (permitted roles).
- **Stock check:** start a session, scan every copy on the shelves (phone camera or scanner), and close; the result lists missing and unexpected copies; mark missing copies lost after review.

**Form fields: Lost or damaged**

| Field | Required | Default | Notes |
|---|---|---|---|
| Copy | Yes | | |
| Lost or damaged | Yes | Lost | |
| Charge | Yes | Book price | Above the set amount, needs approval |
| Note | No | | |

### Library Reports

**Purpose:** books issued, overdue, most read and fines collected. See section 7.

### Library Settings

**Purpose:** borrowing limits, loan days and fine rates. See section 6.

## 3. All features

18 features are mapped to this module: 0 Core and 18 Optional. Tick each one when it is built and tested.

### Books (5)

- [ ] Book catalogue: title, ISBN, category, subject (Optional: schools with a library)
- [ ] Authors and publishers (Optional: schools with a library)
- [ ] Book copies with accession numbers (Optional: schools with a library)
- [ ] Barcode / QR / RFID labels on books (Optional: schools with a library)
- [ ] ISBN format check on entry (Optional: schools with a library)

### Issue & Return (6)

- [ ] Issue a book (within limits, available copy only) (Optional: schools with a library)
- [ ] Return a book (Optional: schools with a library)
- [ ] Renew a book (unless reserved) (Optional: schools with a library)
- [ ] Reserve a book; first in queue gets it (Optional: schools with a library)
- [ ] Maximum renewals per issue (Optional: schools with a library)
- [ ] Reservation queue order: first come, first served or staff first (Optional: schools with a library)

### Members & Cards (1)

- [ ] Library card (Optional: schools with a library)

### Fines & Stock Check (4)

- [ ] Overdue fines (Optional: schools with a library)
- [ ] Lost or damaged books with charge (Optional: schools with a library)
- [ ] Lost or damaged charges above a set amount need approval (Optional: schools with a library)
- [ ] Library stock audit (Optional: schools with a library)

### Library Reports (1)

- [ ] Library reports: issued, overdue, popular, fines (Optional: schools with a library)

### Library Settings (1)

- [ ] Library members (students and staff) with borrowing limits (Optional: schools with a library) · borrowing limits; the member list is on Members & Cards

## 4. Connections

**Receives**

| From | What |
|---|---|
| 03 Student Management | Students (members), photos, ID card barcodes; leaving requests needing clearance (A14) |
| 09 Staff & HR | Staff (members); exit clearance requests |
| 20 Settings | ID card designer (library cards, barcodes) |

**Sends**

| To | What |
|---|---|
| 03 Student Management | Books not returned for TC clearance (A14); library tab on the profile |
| 09 Staff & HR | Books not returned for exit clearance |
| 06 Fee Management | Fines and lost-book charges as fee rows for students (inferred) |
| 01 Dashboard | Librarian home: due today, overdue, reservations; operations panel |
| Notifications and 11 Communication | Reservation ready; overdue reminders (inferred: optional automatic message) |

**Automations:** takes part in **A14 Student leaving** (books not returned block the TC).

## 5. Rules and mistake-proofing

| Rule | How it is prevented | What the person is told | How they recover |
|---|---|---|---|
| Issuing beyond the limit | Blocked | "Ravi has 3 of 3 books" | Return a book first, or raise the limit with a reason |
| Issuing a copy that is out | Only available copies can be issued | "Copy 1045 is issued to Meena, 7 B" | Reserve instead |
| Renewing a reserved book | Blocked | "Reserved by 2 members" | Return it |
| Renewing again and again | Blocked after the maximum renewals | "Already renewed 2 times. Please return the book." | Return it, then issue again if no one is waiting |
| Reservation queue skipped | First in queue (by the school's queue order) gets the copy; changing order needs a reason (inferred) | "Next in queue: Kiran, 6 A" | Not needed |
| Large lost or damaged charge added by mistake | Charges above the set amount wait for approval | "₹850 charge needs approval" | Approver rejects, or the librarian corrects the amount |
| Wrong ISBN typed | Format and check digit checked on entry | "This ISBN is not valid. Check the number on the back cover." | Correct it, or leave it blank |
| Member blocked for unpaid fines | Issue blocked when fines are above a set amount (inferred) | "₹120 fines due" | Pay or waive |
| Losing a book's history | Copies are withdrawn, not deleted | Not needed | Not needed |
| Leaving student with a book | TC blocked by clearance (A14) | "1 library book not returned" | Return or mark lost and charge |
| Wrong accession number | Unique check | "Accession 1045 already exists" | Use the next number shown |

## 6. Settings

The **Library Settings** page holds:

- **Borrowing limits** for library members: number of books by member type (students by class group, staff) (for example 2 for students, 5 for staff; inferred defaults).
- **Loan days** by member type and by category (for example 14 days; reference books not for loan) (inferred defaults).
- **Fine rates:** per day late, maximum fine, and grace days (inferred).
- **Lost and damaged charge rule:** book price, or price plus a fee (inferred), and the amount above which a charge needs approval (default ₹500, inferred; the approver is set in Settings, Forms & Approvals).
- **Maximum renewals** per issue (default 2, inferred).
- **Reservation queue order:** first come, first served (default) or staff first.
- **Categories** and shelf locations (inferred).
- **Accession number format** (inferred).
- **Overdue reminders** on or off (inferred).

## 7. Reports

- Books issued (by date, class, member).
- Overdue books (with days overdue).
- Most read (popular) books and categories.
- Fines collected, due and waived.
- Stock check result (missing and found copies).
- Catalogue list and copies by status.

All follow P8 and appear in Reports & Analytics.

## 8. Records used

| Record | Creates | Reads | Updates |
|---|---|---|---|
| Book | Yes | Yes | Yes |
| Book Copy | Yes | Yes | Yes (status) |
| Book Issue | Yes | Yes | Yes (return, renew) |
| Student, Staff | | Yes | |
| Student Fee Due | Yes (fines for students, inferred) | | |
| Notification, Message | Yes | | |
| Audit Log Entry | Yes | | |

Other records (inferred): **Author**, **Publisher**, **Library Member** (limits, status, card number), **Reservation**, **Library Fine**, **Stock Check Session** with **Stock Check Scan**, **Library Card Print**.

## 9. Done when

1. A librarian issues a book by scanning a library card and a book barcode in two scans; the due date fills from the settings.
2. Issuing a fourth book to a student with a limit of 3 is blocked with a clear message.
3. Returning a book 5 days late shows and records the fine at the set rate.
4. A reserved book cannot be renewed; when it is returned, the first member in the queue is shown.
5. A leaving student with a book not returned cannot get a TC until it is returned or marked lost and charged.
6. A stock check session lists missing copies after scanning the shelves.
7. Library reports show the same overdue count as the Issue & Return screen.
8. A third renewal is blocked when the maximum is 2.
9. With "staff first" on, a staff reservation is served before an earlier student reservation.
10. A lost-book charge above the set amount appears in Approvals and is added to the student's fees only when approved.
11. An ISBN with a wrong check digit is not accepted.

## 10. Open questions

- Should student fines be paid through Fee Management (one place to pay) or collected at the library desk? Assumed: added to fees.
- Is an online ISBN lookup wanted to fill book details? It needs an outside service; not in the inputs.
- Should overdue reminders go to parents by message? Not stated; listed as an option.
