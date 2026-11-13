# School OS team test: brief for the testers (13-11-2026)

Read this once before you start (10 minutes). The full plan is in `docs/qa/test-plan.md`; this page tells you what is new.

## Where and how

- Site: https://school-os-beta.vercel.app (version "deploy 3", 13-11-2026).
- Use the **Test School** only, never a real school's data.
- One person = one role = one login. Never share a login, and never test two roles in one browser window (use a second Chrome profile or log out first).
- Each person gets their own login from the owner. Nobody sends a password in WhatsApp groups.
- Payments: Razorpay **test mode** only. No real money moves.

## What changed since your last test

A computer tester played 5 office staff for a full day (12-11-2026) and found 69 problems. **All 69 are fixed.** Please re-check the ones in your area, on purpose:

| Area | Re-check these | What good looks like now |
|---|---|---|
| Fees (Accountant) | New concession bigger than the fee | Refused: "Not more than ₹…", and the limit shows while you type |
| Fees / Finance | Day Book for a range, Defaulters vs Outstanding, Finance "Fees" vs Fee Reports, P&L "Salaries" vs Salary History | The numbers agree between screens; loss months show the loss, not ₹0 |
| Staff (HR) | Apply for leave with To before From, then fix it | The error names the date; your dates stay as typed |
| Staff (HR) | Documents & ID Cards | Expired documents are counted as Expired |
| Any form | Make a mistake, press Save, fix only that box | Every box keeps what you typed (dates too) |
| Date boxes | Type a new date over an old one | The new date stays |
| Notices | Set "Publish at" to tomorrow | The notice waits until then; the writer can take it back while it waits |
| Homework | Give homework | Saves in a few seconds; the dashboard count matches the homework page |
| Report cards | Report card PDF | Signature lines and date of issue; "Ready" only when remarks and grades are filled |
| Parent Link | Attendance | Percent counts only the days actually marked |
| Library / Store | Open a book or an item | Its name is shown under the heading |
| Telugu / Hindi | Library, Store, money screens | No half-English labels left (write down any you still see) |
| Excel downloads | Open in Excel, add a column | Numbers add up (they are real numbers, not text); empty cells are blank |
| Invite a user | Settings > Users > Invite | No role is ticked until you choose one |
| Speed | Any page | Opens in under 3 seconds; if busy, a clear "School OS is busy right now" page instead of a crash |

## Owner decision you will notice

The **School Admin now has full access everywhere** (as the roles plan says): collect fees, close the fee day, library desk, front office, hostel, transport and homework. The "View only" badge is gone for the School Admin. The **Principal** keeps the overview and approval screens.

## Records already in the Test School from the computer tester

Names, titles and notes that start with **LA-, LB-, LC-, LD- or LE-** were made by the computer tester. Ignore them, do not edit them, and do not count them in your hand totals. Make your own records with your own names.

## How to report

Same as `docs/qa/test-plan.md` section 4: one row per problem in the shared sheet (or `docs/qa/testing-issues.md`) with role, screen, what you did, what you expected, what happened, a screenshot or phone video, and severity (Blocker / High / Medium / Small). Write it the moment you see it.

## Known small things (no need to report)

- The staff leave form names one mistake at a time. *(Being fixed 13-11.)*
- Add Staff refuses a date of birth under 18 or over 80 years old, instead of a gentle warning. *(Being fixed 13-11.)*
- The browser tab shows a general title ("Book") on record pages. *(Being fixed 13-11.)*
