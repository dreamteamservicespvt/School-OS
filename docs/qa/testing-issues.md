# Testing issues (found by the owner while testing the live software)

Site tested: https://school-os-beta.vercel.app (school: chaitanya chekkapalli, user Saiveni, School Admin).
Status: Open = not fixed yet. Add new items at the bottom; never delete, mark Fixed with the date.

## 1. Fee Structure: "Add fee row" does nothing when the school has no fee heads (Open, found 2026-11-03)

- **Where:** Fee Management → Fee Structure → open any class → "Add fee row".
- **What happens:** the class dialog closes, the URL becomes `...&do=row`, and nothing opens. No form, no message.
- **Root cause:** `src/app/(school)/fee-management/structure/page.tsx` line ~304: `if (!options.length) return null;`. With no fee heads there are no options, so the row form is silently not rendered.
- **Workaround:** add a fee head first (Add fee head, top right).
- **Fix wanted:** when there are no fee heads (or all are already used in the class), show a clear message ("Add a fee head first") with a button that opens the Add fee head form; or disable "Add fee row" with that explanation. Add a test. Check the same silent-`return null` pattern on the other sheets in this page.

## 2. Student list: School Admin sees a "My class" chip next to "class 1" (Open, found 2026-11-03)

- **Where:** Student Management → Student List, logged in as School Admin (Saiveni). The school has class 1 (1 student) and class 2 (0 students).
- **What happens:** two chips appear, "My class 1" and "class 1 1". Both show the same single student, so it looks like two different classes.
- **Root cause:** `src/app/(school)/student-management/page.tsx` line ~162: the "All" chip is labelled "My class" whenever only one class has students (`data.tiles.length === 1`), for every role. Classes with no students get no chip.
- **Fix wanted:** call it "My class" only for a class teacher; admins always see "All classes". When only one class has students, hide the duplicate "All" chip or make it clearly the same as that class. Consider showing classes with 0 students (class 2) so the admin sees every class. Add a test.

## 3. Fee Settings: "Allow advance payments" and "Verify before posting" look editable but cannot be changed in the Payments card (Open, found 2026-11-03)

- **Where:** Fee Management → Fee Settings → Payments card. Its "Change" form only has the concession limit, cancel-approval switch and the verification modes.
- **What happens:** the two rows show On/Off labels, but there is no way to change them there. The owner could not find where.
- **Root cause:** the real switches are in the separate "Optional parts" card further down the left column (`settings/page.tsx` lines ~190-201, features `fee-advance` and `fee-verification`). The Payments card (line ~223) just displays their state. The modes chosen in Payments → Change only apply once "Verify payments before posting" is on.
- **Fix wanted:** put the two switches in the Payments card (or add a "Change in Optional parts" link on those rows), and show a hint in the Payments form with a link when verification is off. Test for School Admin and Principal.

## 4. Collect fee: typing a discount does not lower "Amount received" or the Collect button (Open, UI/UX, found 2026-11-03)

- **Where:** Fee Management → collect a student's fee (accountant aksha, student vasundhra, class 2 A, Academic fee Term 2 ₹15,000).
- **What happens:** typed discount ₹500. "Amount received" stays 15000 and the button stays "Collect ₹15,000". Only a small grey line appears: "₹500 more than the dues. It is held as advance." The user expected the amount to drop to ₹14,500.
- **Risk:** an accountant who just presses Collect would take ₹15,000 and the ₹500 discount becomes an advance payment instead of a discount saving. Not yet confirmed by submitting (no payment was made in this test).
- **Fix wanted:** when a discount is typed, show the new payable (₹14,500) and update the amount received and the button to it, unless the accountant edited the amount by hand; show "Fee ₹15,000 − discount ₹500 = ₹14,500".
- **Still to test (ask the owner first, it writes live data):** discount over the limit (limit ₹1,000). From the code (`src/lib/fees/collect.ts` line ~128) the payment is refused with "Discounts above ₹1,000 need the principal's approval" and an "Ask for approval" button appears; the request goes to the Principal on Approvals. Check on screen that the Principal gets it, and that collecting after approval works.

## 5. Collect fee: over-limit discount flow works, but the form is confusing (Open, UI/UX, found 2026-11-03)

- **Tested (accountant aksha, vasundhra, ₹15,000 due, limit ₹1,000):** discount ₹1,500 + reason → Collect is refused ("Discounts above ₹1,000 need the principal's approval") and no payment is made. "Ask for approval" then creates ONE request "Discount of ₹1,500 for vasundhra", kind Discount or concession, "waiting for the Principal", visible under Approvals → Asked by me. So the rule itself works.
- **Problems seen:**
  1. The Reason box is emptied after every Collect / Ask press (form reset). After the first refusal the accountant must type the reason again before "Ask for approval", or it fails with "Give a reason of at least 5 characters".
  2. After "Ask for approval" succeeds the screen still shows the old red errors and the "Give a reason" message and no "sent to the principal" message with the Approvals link (the action returns one: `collect/[studentId]/actions.ts` line ~106). The accountant thinks it failed and may press again and send duplicates. Check for a duplicate guard.
  3. With discount ₹1,500 the line under Amount says "₹1,500 more than the dues. It is held as advance." (same cause as issue 4).
- **Fix wanted:** keep the typed reason (controlled input) after server answers; show the success message + link and clear the old errors after "Ask for approval"; block or merge a duplicate pending request for the same student/rows.
- **Test data left on the live school:** one pending approval "Discount of ₹1,500 for vasundhra" (reason "Testing over-limit discount"). The Principal should reject it or the accountant should withdraw it. Not yet done.
