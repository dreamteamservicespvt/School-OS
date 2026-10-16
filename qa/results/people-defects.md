# People area: defects (QA agent 2)

Area: Admission Management, Student Management, Front Office, Communication (Parent Link, notifications).
Tested on the production build of the base commit (http://localhost:3000), school CEMS, with synthetic "Demo" records.
"Fixed" means a commit on branch `worktree-agent-aec1336534a5f0b6e` with a vitest test (UI-only fixes have none).
Fixes were not checked in the browser on the fixed build unless the row says so: the branch's dev server was killed by memory pressure twice.

| Id | Priority | Module | Short title | Status |
|---|---|---|---|---|
| PEOPLE-10 | P1 | Student Management | Add student refuses every save with "Required" | Fixed 827b4c3 |
| PEOPLE-24 | P1 | Fee Management / Admission / Student | New, admitted, imported and promoted students get no fee plan | Fixed 6adf002 |
| PEOPLE-13 | P2 | Student Management / Parent Link | Changing a guardian's mobile kept old confirmed phones signed in | Fixed 0052ca5 |
| PEOPLE-06 | P2 | Admission Management | Applications cannot be saved without SMS/WhatsApp (consent code) | Needs external credential |
| PEOPLE-21 | P2 | Admission Management | "The parent was sent the time" when nothing was sent | Fixed 910ec46 |
| PEOPLE-22 | P2 | Admission Management | "Parent Link sent: 2 links" when nothing was sent | Fixed 4fa6e46 |
| PEOPLE-01 | P3 | Student Management | Import shows only the first problem of a row | Fixed 7ff5f21 |
| PEOPLE-05 | P3 | Admission Management | Consent code message blamed the phone number | Fixed 4f8fdb9 |
| PEOPLE-07 | P3 | Admission Management | Application form shows one problem at a time | Not fixed |
| PEOPLE-08 | P3 | Admission Management | "No valid mobile number" given as the reason a message did not go | Fixed 4f8fdb9 |
| PEOPLE-11 | P3 | Student Management | Roll number 0 accepted | Fixed 827b4c3 |
| PEOPLE-12 | P3 | Student Management | Class and section lost after a failed save | Fixed 827b4c3 |
| PEOPLE-14 | P3 | Communication | Message History counts test-mode messages as Delivered | Fixed 4829683 |
| PEOPLE-15 | P3 | Communication | First Parent Link said "sent again" | Fixed 4829683 |
| PEOPLE-16 | P3 | Communication | Send Message promised channels that are not connected | Fixed 4829683 |
| PEOPLE-17 | P3 | Front Office | Appointment confirmation not sent, but the receptionist is not told | Fixed 41627a8 |
| PEOPLE-23 | P3 | Admission Management | Application consent not moved to parents when the school has no consent text | Not fixed: needs product decision |
| PEOPLE-02 | P4 | Student Management | Import result not in admission-number order | Fixed 7ff5f21 |
| PEOPLE-03 | P4 | Admission Management | Long unbroken name makes the enquiry panel scroll sideways | Not fixed |
| PEOPLE-04 | P4 | Several | Controls with no name for screen readers | Not fixed |
| PEOPLE-09 | P4 | Admission Management | "00 this week" on the pipeline card | Not fixed |
| PEOPLE-18 | P4 | Dashboard | "and 5 more" birthdays cannot be opened | Fixed 32b3235 (checked in the browser on the dev server) |
| PEOPLE-19 | P4 | Front Office | Early pickup "Other" reason lower-cased | Fixed 4d421c1 |
| PEOPLE-20 | P4 | Admission Management | Schedule test sheet defaults to a past time | Fixed 910ec46 |
| PEOPLE-25 | P4 | Student Management | Full name box has no length limit | Not fixed |

Count: 25 defects. P1: 2, P2: 4, P3: 11, P4: 8. Fixed: 18. Not fixed: 6. Needs external credential: 1.

---

## PEOPLE-10 (P1) Add student refuses every save with "Required"
- Module: Student Management, page Add student, role School Admin.
- Steps: As cems.admin, open Student Management > Add student. Fill in every main field with valid values and press Add student.
- Expected: Student saved and the profile opens.
- Actual: The form shows "Required" every time (server errors `{duplicateReason: "Required"}`). No student can be added from this page. Every other validation check on the page (future birth date, 5-digit phone, used admission number) is hidden behind this message.
- Root cause: The duplicate-reason box is on screen only when a duplicate is suspected, so the field is missing from the form. The shared `optionalText()` treated a missing field (null) as an error.
- Fix: 827b4c3. Optional fields that are missing from a form are read as empty (`optionalText`, `optionalIndianMobile`, `optionalEmail`, `optionalDate`). Covered by a vitest test. Not checked in the browser on the fixed build because the dev server was killed (see the BLOCKED rows).

## PEOPLE-24 (P1) New students get no fee plan
- Module: Fee Management (Student Management and Admission Management call it). Role: Admission Counsellor, School Admin.
- Steps: In CEMS, Grade 5 has a published 2026-27 fee structure. Confirm admission APP/2026/0001, which gives CEMS/2026/0352. Separately, add Demo Varun Teja with "Apply the class fee plan" on.
- Expected: The class fee plan is added (blueprint A2, A13). The page says so.
- Actual: Both students have 0 fee rows. The Admitted page says "Set up in Fee Management once its fee structures are ready" even though 13 structures are published. This applies to Add student, import, admission and promotion.
- Root cause: Student Management runs its `onEnrolled` hooks (src/lib/students/hooks.ts), but Fee Management never registered a handler.
- Fix: 6adf002. New `src/lib/fees/enrolled.ts` handler, registered from students.ts. If the student has no plan for the year, it gives them the class's published structure (the category structure when category fees are on). It does nothing when no structure exists, when the year is closed, or when the student already has fees. Test: tests/fees/new-student-plan.test.ts, which fails without the fix.

## PEOPLE-13 (P2, security) Old confirmed phones stayed signed in after the mobile changed
- Module: Student Management (Parent & guardian), Parent Link. Role: School Admin.
- Steps: A guardian confirms a phone on Parent Link with a one-time code. The office then changes the guardian's mobile.
- Expected: Phones confirmed through the old number must confirm again with a code sent to the new number.
- Actual: `updateGuardian` left every confirmed phone working for up to 180 days. This was found by reading the code and confirmed in vitest; it was not done in the browser, because codes cannot be read here.
- Fix: 0052ca5. Those phones are signed out, the link itself keeps working, and the Audit Log records the reason. Test: tests/students/guardian-phone.test.ts.

## PEOPLE-06 (P2) Applications cannot be taken without SMS/WhatsApp
- Module: Admission Management, page New application. Role: Admission Counsellor.
- Steps: In CEMS (no SMS or WhatsApp account), open an enquiry > New application, fill it in and save.
- Expected: The application is saved, or the page explains plainly what is needed.
- Actual: Refused with "The guardian must agree to the data consent, confirmed with the one-time code". The code cannot be sent, so CEMS cannot take any application. The message is plain, and it follows decision D8a.
- Not fixed: NEEDS EXTERNAL CREDENTIAL (an SMS or WhatsApp account). Skipping the consent code would change an intentional blueprint decision. My own pipeline test used a stand-in application seed.

## PEOPLE-21 (P2) Interview booking claimed the parent was told
- Module: Admission Management, page Test & Interview. Role: Admission Counsellor.
- Steps: CEMS (no channel), with interviews switched on. Book an interview slot for Demo మేఘన Lanka.
- Expected: Booked, and honest that the parent was not messaged.
- Actual: "Interview booked. The parent was sent the time." `messageParent` returned skipped.
- Fix: 910ec46. The page now says why the parent was not sent the time and asks staff to call the parent. Test: tests/admission/no-channel.test.ts.

## PEOPLE-22 (P2) "Parent Link sent: 2 links" when nothing went
- Module: Admission Management, page Admission Decision (Admitted). Role: Admission Counsellor.
- Steps: Confirm admission of APP/2026/0001 in CEMS (no channel).
- Expected: Parent Link made but not sent, with what to do next.
- Actual: "Parent Link sent: 2 links…". In the database, both links have `last_sent_at` empty.
- Fix: 4fa6e46. The page reads `lastSentAt` and shows "Parent Link made, not sent". Checked in the browser on the dev server (PASS row). Test: tests/communication/no-channel.test.ts.

## PEOPLE-01 (P3) Import shows only the first problem of a row
- Steps: Import a file where row 186 (Meghana Rao) has an empty birth date and parent phone 12345.
- Expected: Both problems are listed.
- Actual: Only "Date of birth is empty."
- Root cause: When a required column was empty, previewImport stopped before running the rest of the row check.
- Fix: 7ff5f21. Test: tests/students/import-problems.test.ts.

## PEOPLE-05 (P3) Consent code message blamed the number
- Steps: In CEMS, ask for the consent code on a new application with a valid mobile number.
- Expected: The message says messages are not set up.
- Actual: The message said the code could not be sent to this number.
- Fix: 4f8fdb9. Test: tests/admission/no-channel.test.ts.

## PEOPLE-07 (P3) Application form shows one problem at a time
- Steps: Save a New application with no gender, no class, no address and birth date 01-01-2030.
- Expected: All problems are listed together (pattern P7).
- Actual: The form shows one problem at a time: gender first, then consent. The future birth date is never reported before consent.
- Not fixed: the form's checks run in sequence, with consent as a gate. Fixing it means restructuring the application save. I left it for the module owner because it could not be checked end to end without a consent code (PEOPLE-06).

## PEOPLE-08 (P3) Wrong reason given when a message did not go
- Steps: Documents & Verification > Remind about missing papers, on an application with valid phone 9876501299.
- Actual: "The application has no valid mobile number". The fee link, send-back and campaign skip list gave the same reason, and reject-with-message gave no reason at all.
- Fix: 4f8fdb9. The real reason (no messaging channel set up) is shown, and success words say queued or on its way. Test: tests/admission/no-channel.test.ts.

## PEOPLE-11 (P3) Roll number 0 accepted
- Steps: Add student with roll number 0.
- Fix: 827b4c3. Refused both on the form and in `createStudent()`. Covered by a test.

## PEOPLE-12 (P3) Class and section lost after a failed save
- Steps: Add student, choose Grade 5 A, cause any error.
- Actual: The class box goes back to "Choose".
- Fix: 827b4c3. Checked in the browser on the fixed build: Grade 5 A is kept.

## PEOPLE-14 (P3) Test-mode messages counted as Delivered
- Steps: Communication > Message History in a school whose messaging is in test (sandbox) mode.
- Actual: The list counts them as Delivered with no mark. Only each recipient row on the detail page says test mode.
- Fix: 4829683. A banner on the list and on the detail page, and the Delivered count says how many were in test mode.

## PEOPLE-15 (P3) First Parent Link said "sent again"
- Steps: Parent & guardian > send the first Parent Link.
- Actual: "Parent Link sent again to +91 …208", although it was the first link and was only queued.
- Fix: 4829683. The page now says "is on its way to".

## PEOPLE-16 (P3) Send Message promised channels that are not connected
- Steps: As Principal, Send Message to Grade 5 A parents as an App notice with nothing connected.
- Actual: "they get WhatsApp, SMS or email" when none of these is connected.
- Fix: 4829683. The page now says they will not get it. Checked in the browser on the dev server (PASS row).

## PEOPLE-17 (P3) Appointment confirmation not sent, receptionist not told
- Steps: As cems.reception, Front Office > Appointments > Book with "Send confirmation" on (the default), in CEMS (no channel).
- Actual: "Booked: … 9:45 AM for 15 minutes". The database shows `confirmation_sent=false`.
- Fix: 41627a8. The message adds "The confirmation was not sent: … Call the visitor to tell them." Test: tests/front-office/rules.test.ts. The browser check on the fixed build was BLOCKED (dev server killed).

## PEOPLE-23 (P3) Application consent not moved to the parents
- Steps: Confirm admission of an application that has an OTP-verified data-processing consent, in a school with no consent text.
- Expected: Consent Records on each guardian (system map arrow 69).
- Actual: No consent records were moved, because `convert.ts` skips any consent that has no text (`if (!text) continue`).
- Not fixed: NEEDS PRODUCT DECISION. Should a consent with no school text be moved (and with what wording or version), or should the school be required to publish consent text first? Note: the consent row in this test came from my stand-in seed, because PEOPLE-06 blocks real applications in CEMS.

## PEOPLE-02 (P4) Import result order
- Actual: 0008..0013 were listed before 0001..0007.
- Fix: 7ff5f21. The list follows the import order. Test: tests/students/import-problems.test.ts.

## PEOPLE-03 (P4) Long unbroken name scrolls sideways
- Steps: An enquiry with a 120-character child name with no spaces, then open its panel at 1280px.
- Actual: The document is 1971px wide.
- Not fixed: cosmetic, and real names have spaces. The fix is a `break-words` on the panel heading.

## PEOPLE-04 (P4) Controls with no accessible name
- Actual: The More details fields of Add student and the icon-only links on several lists have no label.
- Not fixed: spread across shared components. Left for an accessibility pass.

## PEOPLE-09 (P4) "00 this week"
- Actual: The Admission Dashboard pipeline card reads "00 this week".
- Not fixed: cosmetic, and lower priority than the honesty fixes. I did not get to it.

## PEOPLE-18 (P4) Hidden birthdays
- Actual: Birthdays this week showed 6 names and "and 5 more" with no way to open it. Teja Varma (Tue 20 Oct) was hidden. The class teacher does see him.
- Fix: 32b3235. The rest open in place. Checked in the browser on the dev server (PASS).

## PEOPLE-19 (P4) Pickup "Other" reason lower-cased
- Actual: "Demo QA pickup" became "demo qa pickup" in the class teacher's note.
- Fix: 4d421c1. Test: tests/front-office/rules.test.ts.

## PEOPLE-20 (P4) Schedule test defaults to a past time
- Actual: The default is today 9:30. Once that time has passed, submitting the default is refused.
- Fix: 910ec46. The default is now tomorrow 9:30 (UI only).

## PEOPLE-25 (P4) Full name box has no length limit
- Actual: A 205-character name can be typed. The server refuses it (limit 120), but on the base build that message is hidden by PEOPLE-10.
- Not fixed: add `maxLength={120}` on the input. Low priority.

---

## Not defects, noted
- PTM slot booking on Parent Link was not tested (BLOCKED): CEMS has no PTM. Reading the code (not tested): `bookPtmSlot` says "A confirmation message is on its way" even when no channel is set up. This is likely the same honesty problem as PEOPLE-21 and should be checked once a PTM exists.
- The staff App notice stays Queued because the background worker is not running in this environment. History says Queued honestly.
- `saveDetailsAction` (student profile) validates input before checking the role. It refuses either way and changes no data.
