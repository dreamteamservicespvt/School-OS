# Self-test B, 2026-11-12 (15:00 to 15:40 IST)

Tester: Claude (QA, layman + engineer). App: production build on http://localhost:3000 (SSD copy), Sunrise Public School,
logins accountant, teacher (Class Teacher Ravi Teja, Class 5 A), admin, subjectteacher (forgot-password only).
Scripts: `qa/full/selftest-B-*.mjs` (helper `selftest-B-h.mjs`, sessions saved once per login).
Screenshots: `qa-output/2026-11-12-B/`. Raw pass/fail lines: `qa-output/2026-11-12-B/results.log`.

## Summary

| # | Item | Result |
|---|------|--------|
| 1a | Fee collect at 390x844, light + dark, payment end to end | PASS (3 payments collected: Sahithi Yadav 5,000 light, Karthik Goud 5,000 and Myra Varma 1,000 dark; receipts SPS/2026-27/00346 and 00347 seen on screen). Small notes B2, B3 |
| 1b | Marks Entry at 390x844, light + dark | PASS (entries saved and kept after reload; 95 out of 80 refused at once). Note B4 |
| 1c | Attendance, mark a class at 390x844, light + dark | PASS (Class 5 A saved: 13 present, 2 absent, 1 late; Back/Forward keeps it). Note B5 |
| 2 | Forgotten password from /sign-in | PASS (empty, unknown login, wrong code, right code, lands on My profile with "Set a new password"). Note B6 |
| 3 | Student changes section (Ananya Verma, 5 A to 5 B) | PASS for fees, attendance history and marks; problems B7 (Medium), B8, B9 (Low) |
| 4 | Double tap / double click on Collect | PASS: desk (dblclick + 3rd click) and phone (3 fast taps) each made exactly 1 payment and 1 receipt (DB: Ayaan Kumar 1 payment 2,000, receipt 00348; Pari Varma 1 payment 3,000, receipt 00349) |
| 5 | Rechecks of 7, 10, 25, 30 | 4 of 4 PASS |

Dark mode: the demo logins have "light" saved as their own theme, which (correctly) wins over the phone's dark setting.
For the dark screenshots the scripts held the page on `data-theme="dark"` without changing anybody's saved choice.

No sideways scrolling on any screen tested (document width 390 on all 13 phone screens checked). No text under 12px found.

Data changed by this run (test school, local only): 5 cash payments (Sahithi Yadav 5,000; Karthik Goud 5,000; Myra Varma 1,000;
Ayaan Kumar 2,000; Pari Varma 3,000), Class 5 A attendance for 12-11-2026, a few Half Yearly
Maths 6 A marks (not submitted), Ananya Verma moved to 5 B (roll 17), one student import left at review
(`/student-management/import/review/6811a492-…`, nothing brought in). "Attendance locks at" was set to 11:30 PM for the
attendance run and put back to 11:00 AM straight after.

## B1. Fee success screen says "parents got the receipt on WhatsApp" when nothing was sent (Medium)
- **Steps:** Accountant, phone, Collect fee for Karthik Goud, 5,000 cash, Collect.
- **What happened:** the success sheet says "Karthik Goud's parents got the receipt on WhatsApp." The app log for the same
  moment says `[dev] receipt link for xxxxxx4403 (Test mode, not sent)`. Same for every payment in this run.
- **Why:** `sent` in `src/app/(school)/fee-management/collect/[studentId]/actions.ts` (line 77) is true as soon as a Message
  row exists for the payment (queued), not when it was delivered, and it ignores Test mode.
- **Should:** say only what is true: "The receipt is on its way to the parents on WhatsApp" when queued, and in Test mode
  "Test mode: no message went to the parents. Print or share the receipt." (Give homework already says "Parents were not
  messaged: automatic messages to parents start when the school goes live", so the two screens disagree.)
  A cashier who believes this tells a parent "you have it on WhatsApp".
- **Screenshot:** `qa-output/2026-11-12-B/fee-dark-after.png`, `fee-light-after.png`

## B2. Collect fee on a phone: "Discount, waiver, date or note" is a 20px-high tap target (Low)
- **Steps:** Collect fee at 390x844.
- **What happened:** the link that opens discount/date/note is 198x20 px; easy to miss with a thumb. Other small targets on
  the page: the back link "Collect fee" (98x32) and the student name link (123x23). The tick boxes (20x20) are inside a
  whole-row button, so they are fine.
- **Should:** at least 40px high (e.g. `min-h-10` on the button in `collect-form.tsx` line 259).
- **Screenshot:** `qa-output/2026-11-12-B/fee-light-full.png`

## B3. Collect fee on a phone: the Collect button sits partly under the bottom Quick menu (Low)
- **Steps:** Collect fee at 390x844, scroll to the Payment card.
- **What happened:** the Collect button (y 715 to 771) overlaps the fixed Quick menu (top 768); in the empty-amount screenshot
  the bottom of "Collect ₹0" is hidden behind the bar. It still works when tapped in its middle.
- **Should:** page bottom padding equal to the Quick menu height, so the last button is fully visible.
- **Screenshot:** `qa-output/2026-11-12-B/fee-light-empty-amount.png`
- Also seen: with the amount box emptied the button reads "Collect ₹0" and stays blue; pressing it shows a good red
  "Enter an amount" (no payment made). A disabled look would be clearer.

## B4. Marks Entry keypad adds to a mark that is already there (Low)
- **Steps:** Teacher, phone, Half Yearly Maths 6 A, One at a time. Akshara Nair's Internal already held 11 (saved earlier).
  Tap Internal, tap 1, 8.
- **What happened:** the box became 1118 (red "1118 is too high"). Next is greyed out until Clear is pressed.
  The red message and the disabled Next are good, but a teacher who taps a filled box to correct it expects to type a
  new mark, not to add digits to the old one.
- **Should:** the first key after selecting a filled box replaces the mark (like selecting the text), or the box shows a
  clear cursor/"tap Clear to change" hint.
- **Screenshot:** `qa-output/2026-11-12-B/marks-light-append.png` (and `marks-light-student1.png` from the first run)
- Also seen: after "Save now" there is no visible "Saved" note near the keypad (the "Entered" count changes higher up,
  off screen). `marks-light-saved.png`.

## B5. Attendance on a phone: small notes (Low)
- "Add note" under each student is 50x18 px (hard to tap). `att-light-full.png`
- After saving, the Save bar reads "Saved" in white on a pale blue (light) / dark on mid blue (dark): low contrast for the
  one word that confirms the save. `att-light-saved.png`, `att-dark-top.png`
- The Saved banner, counts (13 / 2 / 1 / 0) and all buttons fit the phone; the last student's P/A/L are not hidden by the
  Save bar.

## B6. Forgot password: an outsider can tell which logins exist (Low, security)
- **Steps:** /sign-in, "Forgot password? Sign in with a one-time code", type `nosuchperson77`, Send code; then type
  `subjectteacher`, Send code.
- **What happened:** unknown login: "We could not send a code to that login. Check what you typed…". Known login: goes to
  "Enter the code". So anyone can test usernames/phones one by one (rate limits apply).
- **Should:** owner decision. Usual safe pattern: always go to "If this login exists, we sent a code" and the code page.
  The rest of the flow is good: empty Send says "Enter your mobile number, email or username"; wrong code says
  "That code is not right. 4 more tries."; right code signs in and opens My profile with "You signed in with a one-time
  code" and "Set a new password". The password itself was not changed (shared demo login).
- **Screenshots:** `forgot-3-empty.png`, `forgot-4-unknown.png`, `forgot-5-code-page.png`, `forgot-6-wrong-code.png`,
  `forgot-8-profile.png`

## B7. After a section change, the new section's register shows the student "not marked" on days before she joined (Medium)
- **Steps:** Admin moves Ananya Verma from Class 5 A to 5 B today (reason given). Open Attendance Register, Class 5 B,
  November 2026.
- **What happened:** 5 B now shows 17 students, and Ananya Verma's row says "not marked" for 2, 3, 9, 10 and 11 November,
  days she was in 5 A and was marked there. 5 A's register for October and November still lists her with her real marks
  (16 students), so for those days she is in both registers.
- **Should:** in 5 B, days before the move show "Not in this section" (or the row starts on the move date), and they never
  count as "not marked" in 5 B's totals or reminders.
- What is right: her attendance rows stay on 5 A (DB: 134 rows on 5 A before and after), her own Attendance tab still says
  96.1%, 123 present, 5 absent. 5 A's Take Attendance for today drops her (13 present, 1 absent, 1 late now; her absent
  mark is kept on her record).
- **Screenshots:** `sec-4-tab-attendance.png`, `sec-5-teacher-5A-today.png` (register check by text, see script output).

## B8. Change section: empty form shows only the browser's "Please select an item in the list." (Low)
- Same family as issue 10. Pressing Change section with nothing chosen shows the browser bubble, not the school-style red
  message under the box. `qa-output/2026-11-12-B/sec-1-empty.png`
- Also: the save took more than 4 seconds ("Moving…") on this build before the profile showed 5 B · Roll 17.

## B9. Exams tab after a section change labels last term's exams with the new section (Low)
- Ananya Verma's Exams tab, after the move: "2026-27 · Class 5 B | Unit Test 1 … Rank 1 | Unit Test 2 … Rank 2". Both exams
  were taken in 5 A. By design (blueprint G23) the marks follow the student (DB: her 10 marks rows moved from 5 A to 5 B,
  total 236 unchanged) and published results keep their old section. A parent or teacher reading this tab would think
  she ranked 1st in 5 B. Should: show the section each exam was taken in ("Unit Test 1 · in 5 A").
- `qa-output/2026-11-12-B/sec-4-tab-exams.png`

## B10. Add Student: Back with a half-typed form loses it without a warning (Low)
- Admin, phone, Add student, press Add student empty (5 red boxes, good), type in one box, press the phone's Back.
- It goes straight to the dashboard; nothing asks "Leave without saving?". A layman loses what they typed.

## Section change: what stayed correct (item 3)
- Fees: before and after the same: 9 dues, total 41,210, paid 8,700, balance 32,510 (24,510 overdue); 2 payments 8,700.
- Attendance: history kept on 5 A; her own %, present and absent counts unchanged.
- Marks: all 10 marks rows follow her (sum 236 unchanged), as the blueprint says.
- A Section Change record with the reason was written; the profile shows 5 B · Roll 17.

## Rechecks (item 5)
- Issue 7 PASS: uploading Dream_Valley_Students_100.csv shows "Students · 100 rows" on the review page before matching. `i7-review.png`
- Issue 10 PASS: empty Add Student marks all 5 needed boxes red at once (Full name, Class and section, Date of birth,
  Parent's phone, Parent's name), the first comes into view, and fixing one clears its mark at once (5 to 4). `i10-empty-submit-full.png`
- Issue 25 PASS: Give homework empty Send says "Give the homework a title, like "Exercise 4.3"."; typing a title removes
  the message and the red border straight away. `i25-1-empty.png`, `i25-2-typed.png`
- Issue 30 PASS: discount 1,500 refused ("Discounts above ₹1,000 need the principal's approval…"); the typed Reason stays;
  changing the discount to 500 removes the red box; clearing it leaves no stale message; no payment made (DB: 0 payments
  for Diya Iyer). `i30-2-refused.png`, `i30-3-changed.png`

## Not tested / limits
- Marks were entered but not submitted (submitting locks the sheet and needs an approval to change).
- Dark mode was forced on the page (see above), not through each login's own theme setting.
- The "Set a new password" form was opened but not used, to keep the shared demo password.
- Ledger/receipts list for item 4 was checked in the database (payment and receipt tables), not on the Ledger screen.
- No fixes committed: B1 needs a Test-mode-aware wording decision; the others are small UI changes that need a rebuild
  and a screenshot check rather than a unit test.

## Fixes made after the report (2026-11-12, coordinator's list; not deployed, need a rebuild to recheck in the browser)
- B1: the Collect fee success sheet now asks what really happened to the parents' message (hands it to the
  provider at once, then reads it back, the confirmInviteSent rule): "…parents got the receipt on WhatsApp" only when a
  provider took it; Test mode says "Receipt saved. WhatsApp is in Test mode, so the parents were not messaged.";
  queued says "on its way… check Message History". Resend and the payment link no longer claim "sent".
  (`src/lib/messaging/delivery-words.ts`, `delivery-check.ts`, `receiptDelivery` in the collect actions.)
- B6 (owner decision): an unknown login on "Forgot password?" goes to the same code page with the same words and the
  same wrong-code answers (decoy in the cookie only; the rate limit still counts). The first code page no longer names
  the masked contact, for real logins too. (`src/lib/auth/decoy.ts`)
- B7: the register book knows the day a student moved in; the new section's register shows "–" (not in this section
  yet) before it and counts start that day. (`src/lib/attendance/on-register.ts`, `register.ts`, register page)
- B4: the first key in a box just chosen replaces its mark (shown highlighted); the save line shows on phones too.
- B2/B3/B5: "Discount, waiver, date or note" and "Add note" are 40px tall; with no amount the Collect button is dimmed
  and says "Enter the amount"; the attendance "Saved" bar is dark text on the page colour (no faded blue).
- B8: every ActionForm (Change section and 31 other forms) shows our own message under an empty box, not the
  browser bubble.

## Recheck 17:00 (build with all of today's fixes, started 16:50)
Scripts: `qa/full/selftest-B-recheck.mjs` (B fixes, 390 px light + dark), `selftest-B-recheck2.mjs` (self-test A,
Fee Adjust, smoke), `selftest-B-decoy-check.mjs`. Screenshots `qa-output/2026-11-12-B/re-*.png`. Saved sessions only
(principal and reception reused from self-test A; no new sign-ins).

**Result: 31 PASS, 4 FAIL, 1 not checkable.** (2 of my script's FAILs were wrong locators, and I corrected them from
the screenshots: B3 and A1, both counted as PASS.)

| Check | Light | Dark |
|---|---|---|
| B1 receipt words in Test mode: "Receipt saved. WhatsApp is in Test mode, so the parents were not messaged." (receipts 00350, 00351) | PASS | PASS |
| B2 "Discount, waiver, date or note" 40px | PASS | PASS |
| B3 empty amount: dimmed, "Enter the amount" (`re-fee-*-empty.png`) | PASS | PASS |
| B4 keypad: chosen box 18, keys 1 5 gives 15 (and back to 18); "All marks saved at 4:53 PM" shows on the phone | PASS (2) | PASS (2) |
| B5 Add note 40px; Saved bar contrast 18.2:1 light / 15.6:1 dark, not faded | PASS (2) | PASS (2) |
| B6 unknown login goes to the same code page; known and unknown pages read the same | PASS (2) | PASS |
| B6 wrong code on the decoy says "That code is not right. 4 more tries." | **FAIL** | **FAIL** |
| B7 5 B register: Ananya "not in this section yet" on 2, 3, 9, 10, 11 Nov (desk) | PASS | |
| B8 own message on an empty box: Change section, Counselling note, Behaviour incident | PASS (3) | PASS (3) |
| No sideways scroll on Collect fee | PASS | PASS |

- **B6 wrong code (my regression, Medium): fixed in code, `2066471a`, needs a rebuild to recheck.** On the decoy the
  wrong-code answer never appeared: the page stayed on "Enter the code" with no message, so the decoy can be told
  apart from a real login. Cause: the code form was keyed by the whole decoy cookie, which changes with every try, so
  the form was rebuilt and lost the message. Its key now leaves out the try count.
- B7, 5 A side: the 5 A November register still lists her, with today's Absent and the earlier days "not marked",
  like the whole class (the seed has no November marks before today). But the row reads **"Ananya Verma (left)"**,
  and she has not left the school; she moved to 5 B. **New, Low:** that row should say "moved to 5 B".
- B8: the Paper consent page's first button is the "Show students" filter (not an ActionForm), so I used Behaviour
  incident instead.

Self-test A fixes:
- **A1 Log a call with a follow-up: PASS.** The default follow-up was 12-11-2026, 6:00 PM (the call was at 4:54 PM),
  and the call saved once (`re-A1-calls.png`).
- **A4 Event end time: FAIL, now partly fixed (Medium stays).** "End before start" is refused (PASS). After clicking
  the To box, Ctrl+A and typing "1:00 PM", the box still read "10:00 AM:00 PM". The form now refuses it ("Enter the
  end time like 10:30.") instead of saving with no end time, which is better. But a person still cannot correct the
  time by selecting and retyping (`re-A4-event-after.png`).
- **A13 Salary pre-send check: not checkable.** The Generate Salary page now shows the card "Salary structures 33 of 39
  · 6 missing · Vani Singh, Ramesh Goud" and 6 "No salary structure" rows. The "Check before sending" list is not on
  the page, so I think the month is past the send step; I did not send anything.

Fee Adjust "remove" above the limit (accountant, Sahithi Yadav, Annual charges ₹6,000, not approved):
- **The row shows "Waiting for approval": PASS** (`re-adjust-ledger.png`).
- **"Sent for approval" message: FAIL.** After saving, the page and sheet text held only "Waiting for approval"; the
  script did not see a "Sent for approval" message in the 5 seconds after saving.

Smoke: every main-menu page opened without an error screen or a server error:
- **principal: PASS, 20 of 20.**
- **accountant: PASS, 9 of 9.**
