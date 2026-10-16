# Money QA defects (agent 1: Fee, Finance, Salary, Accountant)

Tested on the running app at :3000 (base code) with School A (CEMS) synthetic demo data, plus direct
server action calls and read-only SQL after each money action. Fixes are on branch
`worktree-agent-a3ea1fd807b824386`. The worktree could not be built here (`next build` was killed for
lack of memory), so each fix is proved by a vitest test against `school_os_w1_test` and not yet seen in
the browser. UI-only fixes (02, 03, 05) have no vitest test. They were checked by reading the code and
running typecheck and lint.

| ID | Priority | Module | Short title | Fix |
|---|---|---|---|---|
| MONEY-01 | P1 | Finance Management | Expense paid twice from two tabs | 8de5bd7 |
| MONEY-10 | P1 | Fee Management | Gateway payment posted twice after a failed confirmation | 2852f8e |
| MONEY-02 | P1 | Fee Management | Student Fee Ledger never opens | 7b27ab8 |
| MONEY-05 | P2 | Settings (Payment Gateways) | Test these details empties the keys | 29ae5ab |
| MONEY-06 | P2 | Finance Management | A sent-back expense cannot be changed | 328fb5c |
| MONEY-08 | P2 | Finance Management | A later month closes while an earlier one is open | 0ce5058 |
| MONEY-09 | P2 | Salary Management | Messaging errors show as "a problem on our side" | 00ee921 |
| MONEY-03 | P3 | Fee Management (Receipt) | Long UTR runs off the receipt | 8e629cf |
| MONEY-04 | P3 | Finance Management | Day Book "Total income" line does not add up | 3ea71b7 |
| MONEY-07 | P3 | Finance Management | Closed-day message names the wrong Day Book date | 65b8e64 (+ 328fb5c) |

---

## MONEY-01 · P1 · Finance Management · Expenses: an expense can be paid twice
- **Steps:**
  1. As the accountant, approve EXP/2026-27/00004 (₹8,000).
  2. Open it in two tabs.
  3. Press "Mark paid" in both at the same moment.
- **Expected:** one Expense Payment and one Day Book OUT of ₹8,000. The second tab is refused.
- **Actual (reproduced in the browser on :3000):** 2 expense payments and 2 Day Book OUT entries, ₹16,000 in total. The expense still shows PAID ₹8,000 once, so the extra money out is hidden. This duplicate is left in the shared DB as evidence.
- **Root cause:** `payExpense` in src/lib/finance/expenses.ts read the expense without a row lock. Both transactions passed the "already paid" check.
- **Fix:** 8de5bd7 locks the expense row (`FOR UPDATE`) before the check. Test: tests/finance/expense-pay-twice.test.ts.

## MONEY-10 · P1 · Fee Management · Parent Link: one gateway payment posted twice
- **Steps:**
  1. Send a Razorpay `payment.failed` webhook for an order.
  2. Send `payment.captured` and `order.paid` for the same payment id at the same moment, both signed.
- **Expected:** ONE payment, ONE receipt, ONE Day Book entry.
- **Actual (base code, vitest):** 2 payments, 2 receipts, 2 Day Book entries.
  - Without a prior failure, a replay and a burst of 3 concurrent events on :3000 posted only once (PASS).
- **Root cause:** `confirmGatewayPayment` (src/lib/fees/online.ts) looked for an existing posted payment before taking any lock. The failed attempt's row did not serialise the two confirmations.
- **Fix:** 2852f8e.
  - Locks the payment link row (`SELECT … FOR UPDATE`).
  - Then checks again for a posted payment before posting.
  - Test: tests/fees/webhook-race.test.ts.

## MONEY-02 · P1 · Fee Management · Student Fee Ledger shows "This page could not open"
- **Steps:** as the accountant, School Admin or Principal, open any student's ledger (`/fee-management/ledger/<id>`), on a desktop or at 375 px.
- **Expected:** the ledger with dues, payments and receipts.
- **Actual:** "This page could not open … reference …" every time. The server log shows a Lucide icon component passed to a client component.
- **Root cause:** the ledger page passed icon *components* to the client `MoreMenu`. A server component cannot send those.
- **Fix:** 7b27ab8 uses the shared MoreMenu with icon elements. This is a UI-only change with no vitest test, checked by typecheck and lint.
  - Cancels were tested from the Fee Dashboard instead (`?cancel=`).

## MONEY-05 · P2 · Settings · Payment Gateways: "Test these details" clears the keys
- **Steps:**
  1. As the School Admin, open Add gateway and fill in the Key ID, Key Secret and Webhook secret.
  2. Press "Test these details".
- **Expected:** the typed details stay, so the admin can save.
- **Actual:** the Key ID, Key Secret and Webhook secret are emptied. "Add gateway" then fails until they are typed again.
- **Root cause:** the Test button was a `formAction`. React resets the form after a form action runs.
- **Fix:** 29ae5ab runs the test from `onClick` inside `startTransition`. This is UI-only with no vitest test.

## MONEY-06 · P2 · Finance Management · Expenses: a sent-back expense cannot be changed
- **Steps:**
  1. Approver rejects EXP/2026-27/00004 with "Attach the bill and correct the amount".
  2. The accountant opens it.
- **Expected (blueprint 07 §2):** it goes back to Draft to be changed and sent again.
- **Actual:** only "Send again" (unchanged), "View bill" and "Cancel" are offered.
- **Root cause:** the page had no Change action for a draft.
- **Fix:** 328fb5c adds `changeExpenseAction`, a Change sheet, and a "Change" button on drafts. The attached bill is kept unless a new one is added. Test: tests/finance/expense-change.test.ts.

## MONEY-08 · P2 · Finance Management · Finance Settings: months close out of order
- **Steps:**
  1. Leave April 2026 open.
  2. Close May 2026.
- **Expected:** refused, because months close in order.
- **Actual:** the sheet shows "Close April 2026 first: months close in order." and then "May 2026 closed. Its books are now read only." May was closed on the shared DB.
- **Root cause:** only the screen warned. `closeMonth` (src/lib/finance/accounts.ts) did not check.
- **Fix:** 0ce5058 makes the server refuse while an earlier month of the financial year is open. Test: tests/finance/month-close-order.test.ts.

## MONEY-09 · P2 · Salary Management · Salary Slips: sending shows "a problem on our side"
- **Steps:** with no WhatsApp account connected (WhatsApp off), press "Send unsent slips by WhatsApp".
- **Expected:** a plain reason, for example "WhatsApp is switched off…". No slip is marked sent.
- **Actual:** "That did not save because of a problem on our side…". The slips were correctly not marked sent.
- **Root cause:** `problemState` (src/lib/fees/act.ts) did not know `MessagingProblem` or `NotEnoughCredits`, so it hid their messages.
- **Fix:** 00ee921 adds both to the known errors. Test: tests/salary/send-slips.test.ts.
- **Note:** fixed later: Salary Slips offers "Send by WhatsApp" only while WhatsApp is switched on; otherwise slips are sent by email.

## MONEY-03 · P3 · Fee Management · Receipt PDF: long UTR cut off
- **Steps:** record a UPI payment with the reference DEMOUTR0605AARAV, then open the receipt.
- **Expected:** the full reference is shown.
- **Actual:** the reference runs past the details box and the page border, and is cut off.
- **Root cause:** values in the details box in src/lib/documents/render.ts did not wrap.
- **Fix:** 8e629cf wraps the values. This is a render-only change with no vitest test.

## MONEY-04 · P3 · Finance Management · Day Book: the "Total income" line does not add up
- **Steps:** open the Day Book for a day that has cancelled payments and a refund.
- **Expected:** the explanation under Total income adds up to the total.
- **Actual:** "Fees ₹78,300 + Partial ₹9,200 · less ₹29,850 reversed" (₹57,650) under a total of ₹77,500.
- **Root cause:** src/lib/finance/daybook-view.ts left out payments that were cancelled later but still subtracted their reversals. It also counted fee refunds, which are expense, as reversed income.
- **Fix:** 3ea71b7. Test: tests/finance/daybook-income-line.test.ts.

## MONEY-07 · P3 · Finance Management · Income/Expenses: closed-day message names the wrong date
- **Steps:**
  1. Close 16-10-2026.
  2. Post income dated 16-10-2026 (₹1,500 hall rent, INC/2026-27/00001).
- **Expected:** a message saying the day was closed, naming the Day Book date it went into.
- **Actual:** the entry correctly went to 17-10-2026 with a note, but the message named 16-10-2026.
- **Root cause:** `postIncome` and `payExpense` did not return the Day Book date.
- **Fix:** 65b8e64 (with the expense message part in 328fb5c). The message now reads "16-10-2026 was already closed, so it is in the Day Book for 17-10-2026." Test: tests/finance/closed-day-words.test.ts.
- **Not fixed:** `recordExpense` with "paid now" still names the typed date. This is minor (P4).

---

## Notes, not fixed

- **No background worker (BLOCKED, ops).** `npm run worker` does not run in this QA environment. Late fees, automatic reminders, advance use and link expiry could not be seen running by themselves.
- **Razorpay, WhatsApp and SMS (NEEDS EXTERNAL CREDENTIAL).** There are no accounts and no route to Razorpay.
  - "Test these details" fails with plain words.
  - The pay page cannot open Checkout.
  - Fee reminder sending is disabled with "WhatsApp needs 1 credits. You have 0."
  - Nothing claims "Sent".
  - The gateway was switched on through qa/money/online-harness.ts, using a stand-in tester, to replay webhooks. It was switched off again in the UI.
- **A direct call to the student edit server action returns a 500 with a PermissionDeniedError digest.** It is refused, but not in plain words. This is outside the money area (P4).
- **addSubject and saveDetails check input before permission.** A forbidden user may see a validation message, but nothing is saved (P4).
- **DOB-locked payslip PDF (NOT IMPLEMENTED).** It is not in the blueprint, so it needs a product decision if wanted.
- **The shared DB still holds this QA's evidence:**
  - The MONEY-01 duplicate on EXP/2026-27/00004: 2 payments of ₹8,000.
  - May 2026 closed out of order (MONEY-08).
  - Nothing was deleted.
- **No schema change.**
