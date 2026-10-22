# Admissions QA defects (browser testing, 22-10-2026)

Found while testing in the browser on 22-10-2026: Admissions, the Dashboard and the Front Office desk.
Fixes are on branch `wave7/w1`. The UI-only fixes (02, 04's wording, 05, 06, and the screen part of
01) were checked by reading the code, typecheck and lint, plus the tests named below. They have not yet
been seen again in the browser.

| ID | Priority | Module | Short title | Status | Fix |
|---|---|---|---|---|---|
| ADMIT-01 | P2 | All modules (found in Admission Management) | A refused save clears a drop-down choice ("Class applied for" goes back to "Choose class") | Fixed | 4db3685 |
| ADMIT-02 | P3 | All modules (shared forms) | After a refused save the problem shows at the top of a long form, off screen | Fixed | d045639, 67d4264 |
| ADMIT-03 | P2 | Admission Management, Front Office, Parent Link, sign-in | "Code sent … by SMS" while Test mode sent nothing | Fixed | ae1565c, c74265c |
| ADMIT-04 | P4 | Dashboard | "due mon 19" on the marks card | Fixed | 786339c |
| ADMIT-05 | P4 | Admission Management | Add enquiry says "Five things now" but asks for seven | Fixed | b24eec7 |
| ADMIT-06 | P4 | Dashboard / Front Office | Receptionist's "Add visitor" opens the list, not the sheet | Fixed | 41932fc |

Also checked: the New application form showed "Transport needed" (and "Hostel needed") even with the
module off. Transport is not in version 1 (README "Decisions made"). Blueprint 02 §3 asks for these
switches only "when those modules are on". Fixed in 4d4ea35: the form and the application page show
each one only when the school has that module on, or when the application already has that preference
saved.

---

## ADMIT-01 · P2 · Admission Management (and every module) · A refused save clears a drop-down choice
- **Steps:**
  1. Admissions > New application. Choose "LKG" for Class applied for.
  2. Leave a required field empty and press Save application.
- **Expected:** the problem is shown, and LKG is still chosen.
- **Actual:** the box shows "Choose class" while the screen still holds LKG, so the next save sends "".
  - The same happens in Front Office > Add visitor: "Person to meet" shows "Choose staff member" again while the hint under it still says "In school, free now" for the chosen person.
- **Root cause:** React 19 resets every `<form action={...}>` when the server action ends. A text box comes back from its value. A controlled `<select value>` goes back to its first option, and a controlled `<input type="checkbox|radio" checked>` goes back to how it started. React does not put either back.
- **Fix:** 4db3685.
  - `KeepSelect` now handles every controlled select and also multi-selects. A new `KeepCheck` does the same for tick boxes and round choices. Both are in src/components/ui/keep-select.tsx and put back what React holds after the form's reset.
  - The fix changes 172 places in 53 files: every controlled select or tick box inside an action form, or in a field piece or sheet that is drawn inside one. Examples are the application form, Add visitor, sheets in Hostel, Homework and Front Office, the datesheet, custom fields and the student picker.
  - URL filters, pickers and screens that save from a button are left alone and listed by name in the test.
  - Text boxes did not need a change, because React keeps their default value equal to their value. The Switch and Checkbox controls did not either: they are buttons with a hidden input, which a reset does not touch.
  - Test: tests/keep-on-reset.test.ts reads every .tsx file and fails when a controlled select or tick box that can sit in an action form does not use KeepSelect or KeepCheck.

## ADMIT-02 · P3 · Shared forms · The problem after a refused save is off screen
- **Steps:**
  1. Fill the long New application form and leave something wrong.
  2. Press Save application at the bottom.
- **Expected:** the person sees what is wrong.
- **Actual:** the problem box appears at the top, out of view, so the press seems to do nothing.
- **Fix:** d045639.
  - New `ProblemInView` (src/components/ui/problem-in-view.tsx). When a new problem appears, it scrolls into view and takes the focus, so a screen reader reads it.
  - It does not move on the first page load.
  - Used by ErrorSummary (src/components/ui/field.tsx), the Admission FormProblem, the Attendance sheet FormProblem and the "may already have an application" box.
  - The problem box was chosen over the first wrong field because it lists every problem in one place. This is a UI-only fix.
  - 67d4264 does the same for the other shared one-line problem displays: FormMessage (Academic and many others), the Staff & HR forms, the address-bar sheets (url-sheet), Inventory's InlineForm and the Examination ActionSheet.

## ADMIT-03 · P2 · Messages · "Code sent" while Test mode sent nothing
- **Steps:** with Settings, SMS, WhatsApp & Email in Test mode, press "Send one-time code" on New application.
- **Expected:** the screen says the code was not sent.
- **Actual:** "Code sent to +91 98450 12308 by SMS. It works for 10 minutes."
- **Root cause:** the actions wrote "Code sent" whenever the message was recorded. The senders did not report Test mode.
- **Fix:** ae1565c.
  - `channelInTestMode()` and `codeNotSentWords()` are in src/lib/dev-codes.ts. The words are: "Test mode, not sent: no code went to …, because the school's SMS is in Test mode (Settings, SMS, WhatsApp & Email)." On a tester's computer they add "the code is in the server log".
  - Fixed on every one-time code screen:
    - admission consent code: at the counter, on the application, and on the online form (`startOtp`);
    - front desk pickup code: toast and a line under the code box;
    - Parent Link new-phone, consent and event consent codes;
    - two-step sign-in code.
  - A code that was really sent now names the channel it went by. It no longer always says "SMS".
  - The console sign-in and invite screens already showed a Test mode note, so they were not changed.
  - c74265c: parent screens (online admission form, Parent Link new-phone, consent and event consent codes) never show staff words or settings paths. When the code was not sent (Test mode or no channel) they say "We could not send the code just now. Please contact the school office." and the code box stays closed. Only on a tester's computer (where `mayLogCode` allows the server log) does the page add that the code is in the log and go on. A Parent Link code that nobody can read is ended at once, so a reload does not wait for it.
  - Tests: tests/communication/code-test-mode.test.ts (admission, Parent Link, pickup) and tests/platform/dev-codes.test.ts (sign-in).

## ADMIT-04 · P4 · Dashboard · "due mon 19"
- **Actual:** the "Needs your attention" card read "14 papers past the marks due date … due mon 19".
- **Root cause:** src/lib/dashboard/widgets/exams.ts lowercased `dayWord()`, which is meant for days ahead, not days gone.
- **Fix:** 786339c.
  - New `dueWord()` in src/lib/dashboard/common.ts gives "due today", "due tomorrow", "due Fri" or "due Mon 19 Oct", the same "Mon 12 Oct" form as `dayDate()` on the other cards.
  - The card now uses the earliest due date of the papers it shows.
  - Test: tests/dashboard/exams.test.ts.

## ADMIT-05 · P4 · Admission Management · "Five things now"
- **Actual:** the Add enquiry sheet said "Five things now. Add the rest later from the enquiry." It asks for seven required things: child, parent, phone, source, owner, follow-up date and time. These match blueprint 02 §2 "Form fields: Add enquiry".
- **Fix:** b24eec7. The line now reads "The basics now. Add the rest later from the enquiry." The blueprint has no wording for this line.

## ADMIT-06 · P4 · Dashboard · "Add visitor" needs a second press
- **Actual:** the Receptionist's dashboard "Add visitor" opened /front-office/visitors without the sheet.
- **Fix:** 41932fc. The quick action for the Receptionist and Gate Security now links to `/front-office/visitors?do=visitor` (src/components/shell/nav-config.ts).
