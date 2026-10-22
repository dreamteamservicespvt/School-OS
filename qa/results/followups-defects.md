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

---

# Follow-up defects from browser testing of the one import engine (22-10-2026, night)

Three findings from browser testing after gap list G16 (one import engine) was merged. Fixes are on branch
`wave11/w1`, each proved by a vitest test against `school_os_w1_test` where the fix is in the app. Screen-only parts
were checked by reading the code, typecheck and lint.

| ID | Priority | Module | Short title | Status |
|---|---|---|---|---|
| IMPORT-01 | P1 | Every import page, Switching to School OS | Rows with problems and rows left out are lost after Bring in | Fixed |
| GOLIVE-01 | P4 | Settings (Switching to School OS, Go-live check) | "Fees due before go-live" sends the person to the page they are on | Fixed |
| UNDO-01 | P4 | Every import page | "The 1 record it added are archived" | Fixed |

## IMPORT-01 · P1 · Every import page · Rows with problems and rows left out are lost after Bring in
- **Steps:** Events & Calendar › Import holidays; upload a 2-row CSV with one ready row and one row with a problem
  (date 31-02-2027); Check and bring in; Bring in 1 holiday.
- **Expected:** what the confirm promises: "The 1 row with problems stays here; fix it and bring it in after." The
  row is counted after the import, can be fixed, and is brought in as a further import, with Undo for each import.
- **Actual:** the confirm said "Only the 1 ready row are imported. The 1 row with problems stay here; fix them and
  bring them in after." After the import the file page showed only "Brought in · Added 1 · Updated 0 · Left out
  with problems 0" with Open School Calendar and Undo import. The row with the problem was not counted anywhere and
  could not be fixed or brought in; only Undo opened the file again. The same on all 12 import pages and in
  Switching to School OS. Rows the person left out were lost the same way.
- **Root cause:** `importFile()` in src/lib/move-in/service.ts sent only the ready rows to the import job, and
  `settleImports()` then marked the whole file `imported`. A Move-in File knew one Import Batch and nothing about
  which of its rows that import brought in, so it could not stay open for the rest. "Left out with problems" on the
  result counted only rows that failed inside the job, not the rows held back by the check.
- **Design chosen:** one file carries several imports (the simplest safe design: no second file to keep in step
  with the first, and the fixes, matches and choices already made stay with the rows they were made for).
  - The file keeps which of its rows each import brought in (`brought_in`: row → Import Batch), every import not
    undone (`batch_ids`, oldest first) and how many rows were still waiting after its last import (`waiting`).
  - Bring in sends only the ready rows not brought in before. When the import is done, a row the import could not
    save goes back to the file. A file with rows still waiting (rows with problems, rows left out by the person, rows
    not saved) opens again; a file with none is `imported`.
  - Rows already brought in are not checked or sent again, and show as "Brought in already" in the counts. The sheet,
    heading row and kind cannot change while part of the file is brought in (rows are known by their row number).
  - Undo works for each import on its own, wherever it is pressed (the file page, the module's Earlier imports,
    Settings › Imports): its rows go back to the file, which opens again; the file's other imports stay. Rows the
    kind leaves out on purpose ("No old dues") are counted with the file's first import only.
  - The file page shows a card for each import ("Brought in, part 1 of 2": Added, Updated, Not saved, with its own
    Undo) and, while rows wait, "1 row with problems not brought in yet" (also "… and 1 row left out by you"), then
    the rows to fix. The Switching to School OS file list and the module Import pages say "Part brought in · 2 rows
    not brought in yet". Remove from list says the records it brought in stay.
  - The confirm: "Only the 1 ready row is brought in. The 1 row with problems stays here, counted with the file; fix
    it and bring it in after." (rows left out are named the same way); the message after Bring in says the same.
- **Go-live check:** a file with nothing brought in still counts as "not imported yet" and stops going live, as
  before. A file part brought in with rows still waiting does not stop going live (its ready rows are in, and rows
  left out on purpose may never be needed); it is a warning instead: "1 file is part brought in: 2 rows with problems
  or left out are not brought in yet. Open it to fix the rows and bring them in, or remove the file from the list if
  they are not needed; what it brought in stays."
- **Migration:** `20261022193000_move_in_file_rows_waiting` adds `batch_ids`, `brought_in` and `waiting` to
  `move_in_file` with empty defaults, and puts each existing file's import into `batch_ids`. Existing files keep
  working: one already imported shows its one import with Undo as before; one still being checked has none; an import
  still running when the update lands settles as `imported`, as before.
- **Tests:** tests/move-in/rows-waiting.test.ts (6 tests): a holiday file with a ready row, a row with a problem and a
  row left out brings in the ready row and keeps the other two counted with the file; the go-live check warns about
  it without stopping; the fixed row and the row brought back come in as a second import of the same file (file then
  imported, two batches); Undo of the second, then of the first, each puts its own rows back; a file sent before the
  update settles and undoes as before; the plain-words counts. tests/move-in/service.test.ts,
  tests/move-in/one-engine.test.ts and tests/fees/old-dues-left-out.test.ts now expect a file with a row left out,
  or a row with a problem, to stay part brought in with that row counted (the last one said before "the row with a
  problem was never brought in").
- **Status:** Fixed.

## GOLIVE-01 · P4 · Settings › Switching to School OS › Go-live check · "Fees due before go-live" sends the person to the page they are on
- **Steps:** Settings › Data Backup & Security › Switching to School OS › Go-live check, with no go-live date typed
  yet, as a person who sees fees.
- **Expected:** the card points at the Go-live date field on the same page.
- **Actual:** the card "Fees due before go-live" said "Type the go-live date on the go-live check (Settings, Data
  Backup & Security, Switching to School OS) to see the fees due before it." while the person was on that page.
- **Root cause:** `BeforeGoLivePanel` (src/app/(school)/fee-management/ledger/import/before-go-live.tsx, from gap
  list G14) is shared by Fee Management › Import old dues and receipts and the go-live check, and had one sentence
  for both.
- **Fix:** the panel is told where it is. New src/lib/fees/go-live-date-hint.ts gives the words: on the go-live check
  "Type the go-live date under What your old software says on this page to see the fees due before it.", with "What
  your old software says" a link to that card (the card that holds the Go-live date field, now `id="old-software"`).
  A person who cannot type it there reads "The Principal or School Admin types the go-live date under What your old
  software says on this page; then the fees due before it show here." Fee Management's Import page keeps the path to
  the go-live check.
- **Test:** tests/fees/before-go-live.test.ts, "where to type the go-live date" (1 test): the go-live check's words
  name the card on this page and not the Settings path; the Fee Management words keep the path.
- **Status:** Fixed.

## UNDO-01 · P4 · Every import page · "The 1 record it added are archived"
- **Steps:** bring in a file with one ready row on any import page; press Undo import.
- **Expected:** "The 1 holiday it added is archived."
- **Actual:** "The 1 record it added are archived, and the file opens again so you can fix it and bring it in again."
- **Root cause:** the Undo dialog in src/components/import/file-buttons.tsx counted the noun ("1 record") but always
  said "are", and named records, not what the page brings in.
- **Fix:** new `undoWords()` in src/lib/imports/words.ts (with `count()` and `stayWords()` from IMPORT-01): "The 1
  holiday it added is archived.", "The 2 holidays it added are archived.", and for an import that changed records
  "the 1 record it changed is put back as it was". Used by the Undo import dialog (now also for an import that only
  updated records) and by the message after Undo. Swept the other import texts for the same pattern:
  - Undo this import (Earlier imports): "The 1 holiday it brought in is taken back as a whole".
  - The message after Undo from Earlier imports: "1 record put back as it was".
  - Add missing classes: "Add this class and section to this year? It is added … and the rows are matched to it".
  - Add designations / departments: "Add this designation to HR Settings?".
  - "1 word needs matching", the sheet picker's "(1 row)", "1 repeated heading row" under Passed over.
  - Bring in (IMPORT-01): "Only the 1 ready row is brought in. The 1 row with problems stays here…".
  - Outside src/components/import, the same pattern on Student Management's import result page: "The 1 student it
    added is archived, … and their admission number is free".
- **Test:** tests/move-in/rows-waiting.test.ts, "Undo says one record is and two records are" (1 test), and the
  plain-words counts for Bring in (1 test).
- **Status:** Fixed.
