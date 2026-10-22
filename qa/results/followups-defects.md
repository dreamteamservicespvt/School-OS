# Follow-up defects from browser testing (22-10-2026, evening)

Four small findings from browser testing on the demo after the SEC-01 fix. Fixes are on branch `wave10/w4`, each
proved by a vitest test against `school_os_w4_test` where the fix is in the app. Seed fixes were checked by seeding
`school_os_w4` (never the main demo database). Screen-only parts were checked by reading the code, typecheck and lint.

| ID | Priority | Module | Short title | Status |
|---|---|---|---|---|
| LABEL-01 | P3 | Communication (Message History), Settings (Audit Log) | Parent Link and staff invite messages labelled "Emergency broadcast" | Fixed |
| SEED-02 | P4 | Demo data (Staff & HR, Leave) | A half-day leave on 21-10-2026, a school holiday, counted as 0.5 days | Fixed |

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
