# Follow-up defects from browser testing (22-10-2026, evening)

Four small findings from browser testing on the demo after the SEC-01 fix. Fixes are on branch `wave10/w4`, each
proved by a vitest test against `school_os_w4_test` where the fix is in the app. Seed fixes were checked by seeding
`school_os_w4` (never the main demo database). Screen-only parts were checked by reading the code, typecheck and lint.

| ID | Priority | Module | Short title | Status |
|---|---|---|---|---|
| LABEL-01 | P3 | Communication (Message History), Settings (Audit Log) | Parent Link and staff invite messages labelled "Emergency broadcast" | Fixed |
| SEED-02 | P4 | Demo data (Staff & HR, Leave) | A half-day leave on 21-10-2026, a school holiday, counted as 0.5 days | Fixed |
| SEED-03 | P3 | Demo data, Approvals | Demo requests point at no record; approving one says the person was told | Fixed |
| HYDRATE-01 | P4 | Student Management (Student List), every page with sideways rows | React hydration warning on the Student list | Fixed |

---

## LABEL-01 · P3 · Message History · Parent Link and staff invite messages labelled "Emergency broadcast"
- **Steps:** send a parent their Parent Link (Communication › Parent Link, a student's profile, or an approved
  admission), or invite a new login (Settings › Users & Permissions). Open the message in Communication › Message
  History, and the Audit Log.
- **Expected:** like a one-time code after SEC-01: a message School OS sends with a person's own link is not an
  emergency broadcast and is not counted as one. It still reaches a parent who opted out of messages (it is their own
  key, not news). Nobody pressed "Emergency broadcast", and only the Principal and School Admin may send one.
- **Actual:** the message page said "Emergency broadcast. Sent also to parents who opted out.", "Sent by" named the
  staff member who pressed Send, and the Audit Log said "sent-emergency-broadcast" (shown as "Sent emergency
  broadcast").
- **Root cause:** `sendLinks()` in src/lib/parent-link/links.ts and `sendInviteMessage()` in
  src/lib/settings/invite-message.ts passed `emergency: true` only so that opted-out people still get their link.
  SEC-01 gave one-time codes their own kind (`oneTimeCode`, Message Type "one-time-code"); these two were left as
  emergencies.
- **Fix:**
  - New src/lib/messaging/system-message.ts: a message School OS sends with a person's own link has Message Type
    "parent-link" or "staff-invite". `sendMessage()` takes it as `systemMessage`: it reaches people who opted out,
    `is_emergency` stays off, nobody is its sender, and the Audit Log says "system-message-sent" ("Message sent by
    School OS (a personal link)"), with the person who asked as the person on the line and the actor note "School OS
    (Parent Link)" or "School OS (staff invite)".
  - Parent Link (every way it is sent: create, resend, reissue, existing families, admission approved, going live)
    and the staff invite use it. "Resend to failed / unread" from Message History keeps the kind, so it still reaches
    the opted-out parent and is still not an emergency.
  - Message History names the sender "School OS (Parent Link)" or "School OS (staff invite)" in the list, the
    message page and the export. The message page says "Sent by School OS. This is a parent's own Parent Link. It goes
    also to people who opted out of messages, because it is their own link. It is not an emergency broadcast." The
    "Sent by: People" filter leaves out School OS's own messages (codes too).
  - Migration `20261022140000_system_messages_not_emergency` relabels messages saved before the update, found by the
    link placeholder in their recipients' text, as SEC-01 did for its rows: Message Type set, emergency mark and
    sender taken off, one Audit Log line each ("system-message-relabelled") keeping what it was before. Earlier
    Audit Log lines are history and are not rewritten. Running it again changes nothing. A real emergency broadcast
    (Send Message, a critical notice) is not touched.
  - Test: tests/communication/system-messages.test.ts (6 tests): Parent Link to an opted-out father and a staff
    invite are not emergencies, have no sender and log "system-message-sent"; a resend keeps the kind and reaches
    the opted-out father; the People filter leaves them out; a real emergency broadcast is unchanged; the migration
    relabels old Parent Link, existing-families and invite messages once and leaves a real emergency alone.
- **Status:** Fixed.

## SEED-02 · P4 · Demo data · A half-day leave on a school holiday
- **Steps:** seed the demo; open Staff & HR › Leave, or Approvals, as the Principal.
- **Expected:** demo leave falls on school days only, as the app makes sure for leave applied on screen ("These dates
  are all days without school (Sundays, days off or School Calendar holidays), so no leave is needed.").
- **Actual:** "Casual Leave: Ravi Teja, 21-10-2026 (0.5 days)", waiting for approval. 21-10-2026 is inside the Dasara
  holidays (17-10-2026 to 25-10-2026 in the demo School Calendar), so no leave is needed that day.
- **Root cause:** prisma/seeds/staff-hr.ts wrote Leave Request rows directly with a typed number of days, so none of
  the app's checks ran (school days, half days, overlap, balance).
- **Fix:**
  - A leave still waiting is now applied for through the app itself (`applyLeave()` in src/lib/staff/leave.ts), as
    the person who asked: the app counts the days from the School Calendar, refuses a day without school, and sends
    it to the head of department or the Principal as it would on screen. Ravi Teja's half day moves to Wednesday
    28-10-2026, the first half (a school day after the holidays). Kavitha Nair's leave still waits for Ravi, her
    head of department.
  - Leave already decided (approved or rejected in the past) is still written as decided, but its days are counted
    with the app's own rule (`offDaySet()`, `countLeaveDays()`), and the seed stops with a plain error if a demo leave
    has no school day in it. Its Approvals line uses the app's own words (`leaveSummary()`).
  - Checked by seeding `school_os_w4`: Ravi Teja 28-10-2026, 0.5 days, waiting for the Principal; Kavitha Nair
    15-10-2026 to 16-10-2026, 2 days, waiting for Ravi Teja; the July, August and September leave as before.
    An existing demo database keeps the old row until it is seeded again.
- **Status:** Fixed.

## SEED-03 · P3 · Demo data, Approvals · Demo requests point at no record; approving one says the person was told
- **Steps:** seed the demo; as the Principal open Approvals and approve "Casual leave, Ravi Teja, 2 days".
- **Expected:** every demo request is about a real record, and the decision moves that record on (00-global.md
  §3.4). If a request's record cannot be found, the approver is told plainly and nothing changes (P7).
- **Actual:** "Approved. The person who asked has been told." Nothing moved: the request had record type "Staff
  Leave" (the app uses "Leave Request") and a made-up record id. Checked on a freshly seeded `school_os_w4` with a
  query over every request: six demo requests pointed at no record, all from prisma/seeds/settings.ts: "Lab
  chemicals for Class 10 practicals" and "Printer cartridges for the office" (Expense), "Refund of bus fee, Aarav
  Reddy (Class 6 A)" (record type "Fee Payment"), "Sibling discount for Diya Sharma (Class 2 B)" (record type
  "Student"), "Casual leave, Ravi Teja, 2 days" (record type "Staff Leave") and "Bonafide certificate, Sai Kiran
  (Class 9 C)". The other 52 demo requests were real.
- **Root cause:** the Settings seed wrote Approval rows directly with `recordId: randomUUID()`. `decide()` in
  src/lib/approvals.ts ran the request type's follow-up, which found nothing to move and said nothing, then marked
  the request decided and told the person who asked.
- **Fix:**
  - Seed: the six made-up requests are gone. The demo's requests are made by each module's seed through the app,
    so each points at a real record. prisma/seeds/fees-finance.ts now also asks, through the app, for a sibling
    discount of ₹6,000 (above the ₹1,000 concession limit, so it waits for the Principal) and a ₹3,500 refund
    asked by the School Admin (waits for the Accountant), so Approvals still shows a concession and a refund.
    Staff leave and expenses already had real requests.
  - App: new src/lib/approval-records.ts lists, for each record type a module asks Approvals about, how to find
    the record. `decide()` asks it first. When the record cannot be found, the request is not approved and not sent
    back for a change: "The leave request this request is about cannot be found in School OS, so it cannot be
    approved, and nothing was changed. Reject it with a reason to take it off the list." Nobody is told and nothing
    is written. Rejecting (or withdrawing) still works and runs no follow-up. Bulk approve leaves such a request out
    with the same reason. The two names the old demo seed used ("Staff Leave", "Fee Payment") are listed too, so a
    demo database seeded before this fix refuses them the same way.
  - Test: tests/approval-missing-record.test.ts (7 tests): approve and ask for a change are refused with the plain
    reason and change nothing; the old "Staff Leave" row is refused; reject works and tells the person who asked;
    bulk approve skips it with the reason; a record that is there is found; a source scan fails if a module asks
    Approvals about a record type the list does not know.
  - Checked by seeding `school_os_w4` again: the same query finds no request without its record; the new requests
    read "Sibling of ₹6,000 for Aanya Gupta" (waiting for the Principal) and "Refund ₹3,500 to Pranav Yadav from
    receipt SPS/2026-27/00120" (waiting for the Accountant).
- **Noticed, not changed:** a sibling concession's request reads "Sibling of ₹6,000 for …": the app names the
  concession by its type ("Sibling"), the same on screen for any sibling concession. "Sibling discount of ₹6,000"
  would read better; it is left for the Fee Management owner.
- **Status:** Fixed. An existing demo database keeps its six old rows until it is seeded again; the app now refuses
  to approve them.

## HYDRATE-01 · P4 · Student List · React hydration warning
- **Steps:** open Student Management › Student List on a phone-width window (or any width where the module tabs or
  the class chips do not fit), with the browser console open, on a dev server.
- **Expected:** no React warnings.
- **Actual:** "A tree hydrated but some attributes of the server rendered HTML didn't match the client properties.
  This won't be patched up." The diff React printed was not a date or a time: it was `- data-more="right"` on the
  module tabs (`ul.no-scrollbar`) and on the class chips ("Students by class", `nav.no-scrollbar`).
- **Reproduced:** on a webpack dev server of this branch (phone width, Chrome), with the Student list's data held
  back a few seconds so that the page streams in after React has started (as on a slow database or a big school):
  the warning came on 3 loads out of 3. Without the delay it did not show, because the page had arrived before
  React started. Time zone and locale made no difference (Asia/Kolkata en-IN and America/New_York en-US both tried).
- **Root cause:** src/components/ui/scroll-hints.tsx (on every page, from the root layout) marks each sideways row
  `data-more="left|right|both"` so globals.css can show a fade, and does it again on every change to the page. It
  is in its own Suspense boundary, so it runs before the page itself is hydrated. When the Student list streamed in
  (inside its `loading.tsx` boundary), ScrollHints marked its tabs and chips at once; React then hydrated them,
  found an attribute it had not drawn, and warned. The same could happen on any page with a sideways row that
  streams in late.
- **Fix:** ScrollHints now touches a row only once React has taken it over: React keeps its own key
  (`__reactFiber$…`) on every element it has hydrated, and the row is checked for the key that `<body>` carries. A
  row React has not reached yet is looked at again every 100 ms (for up to 10 seconds, then it is marked as
  before). A row's selected tab is still brought into view once per page, now also for rows that stream in late.
  If a future React keeps no such key, nothing waits and it works as before. No date or time is drawn differently
  on the server and in the browser on this page: dates use `formatDate()` with the school's time zone on the
  server; the client components on the page (search and filters, bulk bar, tabs, the More menu, the pin) draw
  nothing time- or locale-dependent.
- **Same pattern elsewhere:** ScrollHints is the only code that changes attributes of elements React draws, on
  every page. Other client code that changes the page does it after a person's action (theme, colours on `<html>`,
  which React has already hydrated) or changes properties, not attributes (`checked` on bulk tick boxes). Client
  components that use the current time do so in effects or after an action (marks "saved at", photo time, quiz
  timer), not while drawing the page. So the one fix covers every page with sideways rows (module tabs, page tabs,
  chips, segmented filters).
- **Verified:** the same reproduction after the fix: once the dev server had rebuilt the changed file, no warning on
  7 Student list loads out of 7 (the one load made while it was still rebuilding warned once), and none on Parents
  & Guardians or the Dashboard; the rows still get `data-more="right"`, so the fade still shows. Test:
  tests/scroll-hints.test.ts (3 tests): a row without React's key is left alone, a hydrated row is marked, nothing
  waits when React keeps no key, and the React that Next.js runs still keeps that key (so an upgrade that changes
  it fails the test instead of bringing the warning back unnoticed).
- **Status:** Fixed.
