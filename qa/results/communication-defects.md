# Communication QA defects (Send Message and Message History)

Found in browser testing on 22-10-2026, on the running demo (:3000, database `school_os`), as the Principal of
Sunrise Public School, on Communication > Send Message and the message page that opens after sending.
Fixes are on branch `wave7/w2`. Each fix is proved by a vitest test against `school_os_w2_test`
(tests/communication/send-checks.test.ts). Screen-only parts were checked by reading the code, typecheck and lint;
they were not seen in the browser on the fixed build. The demo database was only read, never changed.

One-time-code wording ("Code sent by SMS" in test mode) and the form-reset bugs are being fixed by another builder
and are not covered here.

| ID | Priority | Module | Short title | Status |
|---|---|---|---|---|
| COMM-04 | P1 | Communication (Message History, credits) | Test mode used credits and showed "Delivered 14 (100%)" | Fixed 7e92195 + 9f06901 |
| COMM-03 | P1 | Communication (Message History) | "Resend to 14 unread" offered while every message was still queued | Fixed 1ac64a2 |
| COMM-01 | P2 | Communication (Send Message) | {parent_name} skips everyone as "has no parent name" | Fixed 7e92195 + 9f06901 |
| COMM-02 | P3 | Communication (Send Message) | The hint names only {student_name} and {class} | Fixed 9f06901 |
| COMM-06 | P3 | Communication (Send Message) | "14 has no parent name"; toast without a full stop | Fixed 7e92195 + 9f06901 |
| COMM-05 | — | Communication (Send Message) | 319 students became 318 with nothing in the audit log | Not a bug (explained) |
| COMM-07 | P2 | Communication (Message History) | "Resend to 14 unread" offered when all 14 went in Test mode | Fixed 671bfa5 |
| PL-01 | P2 | Communication (Parent Link) | A newly admitted child shows "Class not set" | Fixed 8c48453 |
| SEED-01 | P4 | Demo data (Communication) | "Tuesday 4 November" in a demo notice; it is a Wednesday | Fixed c4c87d2 |

---

## COMM-04 · P1 · Message History · Test mode used credits and counted as delivered
- **Steps:**
  1. With WhatsApp in Test mode (Settings, SMS, WhatsApp & Email), send a typed message to 14 parents.
  2. Open the message.
- **Expected:** nothing is really sent, so no credits are used and nobody is shown as having received it.
- **Actual:** "Delivered 14 (100%)", "Credits 14", each row "Delivered · Test mode: not really sent". The school's
  WhatsApp balance went from 48,708 to 48,362 once the worker ran the demo's queued test-mode sends.
- **Blueprint:** 11-communication.md §5 says "In test mode nothing is sent". Credits pay for messages that go out
  (Message Settings, Credit Ledger). Test mode is the safe way to try every screen, so it must not take credits or
  claim a parent got a message.
- **Root cause:** `recordSend` (src/lib/messaging/send.ts) took credits for every WhatsApp and SMS message before
  knowing the provider. The Sandbox provider answers "Delivered", and Message History counted that as delivered.
- **Fix:**
  - The plan keeps the cost (shown) apart from what is charged. A channel in test mode is charged nothing, its
    messages are saved with 0 credits, and short credits no longer block a test-mode send. Retry failed and SMS
    backup charge nothing in test mode either.
  - The one-off messages to applicants (Admission) and visitors (Front Office), which build their own plan, follow
    the same rule.
  - If a channel goes to test mode after a message was queued on a real account, the delivery job gives the credits
    back when the Sandbox records it.
  - Message History and the message page count these as **Test mode** (its own number, status filter and pill),
    never as Delivered. The export has a "Test mode (not sent)" column; the Message delivery report leaves them out
    of Delivered.
  - Send Message shows "WhatsApp · test mode — None used" in the credits, a line saying nobody will receive it, and
    the confirmation dialog says plainly "WhatsApp is in test mode. Nobody will receive this message…". The toast says
    "Recorded for 14 people. WhatsApp is in test mode, so nobody receives it."
  - Tests: tests/communication/send-checks.test.ts ("test mode (COMM-04)"); tests/communication/messaging.test.ts
    ("credits") changed to match.
- **Not done:** credits already taken by test-mode sends before this fix are not given back. That needs the owner's
  decision (see the report). The Defaulters reminder preview (Fee Management) still shows the cost in credits in test
  mode; no credits are taken when it sends.

## COMM-03 · P1 · Message History · "Resend to unread" offered before the message had gone
- **Steps:** send a message, then open its page at once (every row Queued / "Waiting to go").
- **Expected:** no resend yet. Pressing it would give every parent a second copy.
- **Actual:** "Resend to 14 unread".
- **Blueprint:** Message History, "Resend to unread … to everyone not yet at Read"; §9 Done when 18. It does not say
  what happens before the first copy went, so the rule chosen is: someone still Queued has not been sent it yet.
- **Root cause:** the page and `resend.ts` counted everyone not at Read, including Queued.
- **Fix:** 1ac64a2. "Resend to unread" is offered only once the message has finished going (status Sent), and only to
  people whose message was sent, delivered or failed and who have not read it on any channel. The server refuses a
  resend to unread while the message is still going out ("This message is still going out…").
  Test: send-checks.test.ts ("Resend to unread (COMM-03)").

## COMM-01 · P2 · Send Message · An unknown blank skips everyone
- **Steps:** type "Dear {parent_name}, …" for the parents of a class.
- **Expected:** told at once that {parent_name} is not a blank, with the one meant ({guardian_name}).
- **Actual:** "0 parents", "14 has no parent name (Mohan Pillai, Ramesh Iyer, Srinivas Bhat and others)" — listing
  the very parents' names — and the "Send to 0 parents" button stayed pressable.
- **Blueprint:** §5 "A blank reaches a parent unfilled": braces that are not a blank from the list block the send,
  naming them. The blank list (Message Templates) has {guardian_name}, not {parent_name}, so synonyms are only
  suggested, never filled.
- **Root cause:** the send form did not use `unknownVariables()` for a typed message; the plan treated the unknown
  blank as a value every person lacks.
- **Fix:**
  - New src/lib/messaging/blanks.ts (no database, used by the form and the server): the blank list, the blanks a
    typed message can fill for parents, students and staff, and `suggestBlank()` (common words like parent_name,
    teacher_name, class_name, and near misses like studnet_name).
  - Right under the message box: "{parent_name} is not a blank the school can use. Did you mean {guardian_name}?
    Blanks you can use: {guardian_name}, {student_name}, {class}, …". The same check covers the title.
  - The server (`planMessage`) refuses the send with the same words. The unknown blank stays as typed in the
    preview, so nobody is counted as "has no …" for it.
  - A send that cannot go (nobody reached, a blank problem, credits short) can no longer be pressed; the reason shows
    under the button, and the label says "Nobody to send to" instead of "Send to 0 parents".
  - A blank from the list that the chosen people do not have (for example {staff_name} for parents) gets a warning
    under the box.
  - Test: send-checks.test.ts ("a blank that is not on the list").

## COMM-02 · P3 · Send Message · The hint names only two blanks
- **Actual:** "{student_name} and {class} fill in for each parent".
- **Fix:** 9f06901. "Blanks you can use: …" for the people chosen: parents get {guardian_name}, {student_name},
  {class}, {admission_no}, {school_name}, {school_phone}, {date}; staff get {staff_name} and the school's details.
  This is a screen change; the list it uses is tested in send-checks.test.ts.

## COMM-06 · P3 · Send Message · "14 has no parent name"
- **Actual:** "14 has no parent name"; the toast read "Sending to 14 people. 2 opted out of messages See delivery".
- **Fix:** `countWithReason()` (src/lib/messaging/skip-words.ts) says "1 has …", "14 have …"; used by
  `skippedWords()` (toasts and notes in every module) and the Send Message panel. The toast now ends each sentence
  with a full stop before "See delivery". Test: send-checks.test.ts ("words for people left out").

## COMM-05 · Investigated · 319 students became 318 (281 parents became 280)
- **What the count is:** "All N students studying in 2026-27" counts this year's enrolments with status Studying
  whose student is not archived (src/app/(school)/communication/page.tsx). The parent count comes from the same
  enrolments through `resolveAudience`. It does not depend on the time of day, a date boundary, Parent Link, opt-out
  or consent.
- **What happened (read from `school_os`):** at 13:33:12 IST the background worker ran the daily job
  `completeDueLeaving` (src/lib/students/leaving.ts) for the first time that day. The demo had a leaving request for
  **Akshara Varma** (transfer, "Family moving to another city") with last date 18-10-2026 still in progress, so the
  job completed it: her status became Transferred and her 2026-27 enrolment became Left. Her family was the 281st.
- **Audit log:** it is there, but written by the system, not a person: "Student · status-changed" (TRANSFERRED,
  source `leaving:4653356d…`) and "Leaving Request · left" at 13:33:12 IST, with no user. The enrolment row's
  updated_at is 08:03:12 UTC (13:33 IST).
- **Verdict:** not a bug. The student left on her last date as the blueprint says; the count went down only when the
  worker first ran, because the worker was not running in the demo before 13:33. On a real install the job runs
  every day. Nothing changed in code.

---

## Round 2 (browser testing, 22-10-2026, afternoon)

Fixes are on branch `wave8/w1`, each proved by a vitest test against `school_os_w1_test`. Screen-only parts were checked
by reading the code, typecheck and lint; they have not yet been seen again in the browser.

## COMM-07 · P2 · Message History · "Resend to unread" offered for a message that went in Test mode
- **Steps:** with WhatsApp in Test mode, send a message to 14 parents. Wait until it shows Sent, then open it.
- **Expected:** no resend. Nobody received the first copy, so nobody "has not read" it; a resend would only be
  recorded again.
- **Actual:** "Resend to 14 unread", next to "Test mode 14".
- **Root cause:** `targets()` in src/lib/messaging/resend.ts counted every recipient at Sent, Delivered or Failed who
  had not read it, whatever the provider. A test-mode copy is saved with provider "sandbox".
- **Fix:** 671bfa5. "Unread" now leaves out recipients whose copy went through the Sandbox provider: only people a
  real channel sent it to, and who have not read it, are counted. The page's count (`unreadCount`) and the server
  check (`resendInput`) both use this. If asked anyway, the server says "The people who have not read it were sent it
  in test mode, so nobody received it and there is nothing to resend. Send a new message once the channel is live."
  "Resend to failed" is not changed.
  Test: tests/communication/send-checks.test.ts ("Resend to unread (COMM-03, COMM-07)").

## PL-01 · P2 · Parent Link · A newly admitted child shows "Class not set"
- **Steps:** open the Parent Link (/p/[token]) of Myra Kapoor's guardian. Myra was admitted for 2027-28, Class 3 A, and
  has no class this year.
- **Expected:** the child's card says which class she joins. Nothing of this year that does not exist yet is shown.
- **Actual:** "Class not set" under her name.
- **Blueprint:** 11-communication.md, Parent Link: the link is created and sent when an admission is approved, and each
  child's card shows "class and section". A child admitted for next year is the usual first reader. The blueprint does
  not say what the card shows before the year starts, so "Joining Class 3 A in 2027-28" was chosen. It uses the class
  and section words used elsewhere on the page, such as "Class 5 B".
- **Root cause:** `guardianChildren()` (src/lib/parent-link/view.ts) looked only at the current year's enrolment.
- **Fix:** 8c48453.
  - New `joiningLabels()` in src/lib/parent-link/view.ts. A child with no class this year but a class in a later year
    (not closed) of the same campus gets "Joining Class 3 A in 2027-28".
  - The school's Parent Link list, one link's page and the export (`childrenByGuardian`) use the same words.
  - The child's class and section stay unset for the sections. So this year's class notices, events, attendance and
    results are not shown for her; they are not hers. Each section already leaves itself out when it has nothing, so
    there are no empty boxes.
  - Fees due reads every open due of any year. The joining fee shows once it is billed.
  - Test: tests/communication/parent-link.test.ts ("a newly admitted child whose class is next year (PL-01)").

## SEED-01 · P4 · Demo data · "Classes start again on Tuesday 4 November"
- **Actual:** the demo "Diwali holidays" notice (prisma/seeds/communication.ts) said Tuesday 4 November. 4 November 2026
  is a Wednesday.
- **Fix:** c4c87d2. It now says "Wednesday 4 November" (closed Friday 30 October to Tuesday 3 November). Every other
  weekday-and-date pair in prisma/ and src/ was checked by a script and is right: Saturday 17 October (PTM) and the
  examples in the app's comments and help text. An existing demo database keeps the old wording until it is seeded again.

---

## Notes

- **No schema change.** Test mode is worked out from the channel setup (`inTestMode`) and from the provider saved on
  each recipient ("sandbox"), so existing schools' data keeps working.
- The send form's other bugs (form reset, one-time-code wording) are left to the other builder.
