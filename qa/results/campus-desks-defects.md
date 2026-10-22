# Campus desks QA defects (Front Office, Hostel, Inventory, Search)

Found in the browser on 22-10-2026 with the demo school. That day falls in the Dasara holidays
(17 to 25 Oct), so the school was closed. The fixes are on branch `wave7/w3`. The worktree cannot
build the app (Turbopack refuses the node_modules junctions), so none of the fixes has been seen in
a browser yet. Where a fix has a rule underneath it, a vitest test on `school_os_w3_test` proves
it. Changes that only affect the screen were checked by reading the code, typecheck and lint.

| ID | Priority | Module | Short title | Status | Fix |
|---|---|---|---|---|---|
| FO-01 | P1 | Front Office (Student Pickup) | "The face matches this photo" when there is no photo | Fixed | 706a774 |
| FO-02 | P2 | Front Office (Student Pickup) | "Attendance not marked yet" on a holiday | Fixed | 706a774 |
| INV-02 | P2 | Inventory Management (Issue Stock) | Issue button shows a fee amount while a line is over stock | Fixed | faeae30 |
| SEARCH-01 | P2 | Top bar (Search) | First letters typed after clicking Search are lost | Fixed | a919c0e |
| PERF-01 | P3 | Front Office | Blank main area for about 3 s when the Principal opens Front Office | Fixed (likely cause) | a67e227 |
| FO-03 | P3 | Front Office (Visitors) | "every pass expires by itself at 3:00 PM" is only true today | Fixed | 706a774 |
| HOSTEL-01 | P3 | Hostel Management (Roll Call) | The red dot in the month calendar is not explained | Fixed | 1607f0b |
| INV-01 | P3 | Inventory Management (Issue Stock) | "Classs" in the "Issued to" filter | Fixed | faeae30 |

---

## FO-01 · P1 · Front Office · Student Pickup: photo match against initials
- **Steps:**
  1. Open Front Office > Student Pickup and find Akshara Pillai (5 A).
  2. Choose Mohan Pillai (father), who has no photo on record.
- **Expected:** the screen says plainly that there is no photo. It asks for a check the desk can really do (16 §2: "the desk can call the registered guardian").
- **Actual:** "The face matches this photo · Look at the person, not only the ID" sits next to the initials "MP", and the button says "Check the photo first". The server also took a photo-match tick for a guardian with no photo.
- **Root cause:** the release form and `releaseStudent` assumed every guardian has a photo. Student Management also had no way to add a guardian's photo, so the gap could not be closed.
- **Fix:**
  - **Pickup screen:** with no photo it shows "No photo of Mohan on record · There is no face to match. Check one of these instead." The desk picks one of two checks:
    - "ID proof shows Mohan Pillai" (Aadhaar, driving licence or another photo ID);
    - "A parent or guardian confirmed on a call".
    The button then reads "Check ID proof or call first".
  - **Adding the photo:** the screen links to "Add Mohan's photo in Student Management" for people who manage students. Everyone else sees "Ask the office to add…".
  - **Server:** a photo-match tick for a guardian with no photo is refused ("No photo of Mohan on record. Check their ID proof, or call a registered parent or guardian."). The gate pass records "ID proof" or "call to a guardian" as its verification, plus ", code" when the school's code check is on. The code is still needed after the ID or call check.
  - **Student Management (Parent 360):** the parent's photo can now be added, replaced or removed. This uses the same photo dialog as students, needs Student Management edit and manage, and each change goes into the audit log (`setGuardianPhoto`).
  - **Tests:** tests/front-office/rules.test.ts ("asks for ID proof or a call…") and tests/students/guardian-phone.test.ts ("keeps a guardian's photo…").

## FO-02 · P2 · Front Office · Student Pickup on a closed day
- **Steps:** on 22-10-2026, inside the Dasara holidays, open Student Pickup and choose any student.
- **Expected:** the screen says the school is closed today and names the holiday.
- **Actual:** the student card says "Attendance not marked yet", as if this were a school day.
- **Root cause:** `pickupStudent` never asked the one school-day rule (`isSchoolDay` in src/lib/calendar/school-days.ts, G32).
- **Fix:**
  - **Student card:** `pickupStudent` now asks `isSchoolDay` for the student's campus and class. The card says "School is closed today (Dasara holidays)" in place of "Attendance not marked yet".
  - **Page:** the subtitle starts with the same words.
  - **Pickup is still allowed on a closed day.** The blueprint has no rule against it, and children can be at school for an event or a special class. A note asks the desk to release the child only if they are at school today. When Hostel Management is on, the note adds that boarders going out use a Hostel Outing pass, because Hostel Outing passes belong to Hostel Management (16 §2, C4).
  - **Test:** tests/front-office/rules.test.ts ("names the holiday on a closed day…") covers a holiday, a school day and a Sunday.

## FO-03 · P3 · Front Office · Visitors: pass expiry words
- **Actual:** "Visitor log · every pass expires by itself at 3:00 PM". Passes end at each day's set time, and a visitor who comes late gets an hour (`passExpiryFor`).
- **Fix:**
  - **Visitors page:** the subtitle uses `passLine`:
    - "Today's passes expire by themselves at 3:00 PM";
    - from 15 minutes before that time: "A pass made now lasts an hour";
    - on a closed day it starts with "School is closed today (Dasara holidays) · …".
  - **Reception Desk:** its subtitle uses the same words.
  - **Test:** tests/front-office/rules.test.ts ("says today's pass expiry…").

## SEARCH-01 · P2 · Top bar · Search loses the first letters
- **Steps:** click the search bar and type "ravi" at once.
- **Actual:** the first letters are lost.
- **Root cause:** the palette mounts after the click and focused its box only after a 40 ms timer. Letters typed in that gap went to the search bar button that had just been clicked.
- **Fix:**
  - **Focus at once:** the box is focused in a layout effect, before the browser paints. The 40 ms timer stays only as a fallback.
  - **Keys typed in the gap:** while the palette is open and focus is still outside it, a capture-phase key listener puts each letter into the box and moves focus there.
  - **Keys left alone:** Ctrl/Cmd/Alt shortcuts, Enter, arrows, Escape and keys pressed inside the palette work as before. The rule is in `typedKey` (src/components/shell/typed-key.ts).
  - **Test:** the repo has no DOM test setup (no jsdom or testing-library), so tests/search-keys.test.ts tests `typedKey`. The focus order was checked by reading the code.

## HOSTEL-01 · P3 · Hostel Management · Roll Call month calendar dot
- **Actual:** a red dot means "someone was absent". The legend's red square is "Missed" and the dot is not explained, so 22 Oct (morning taken, one absent) reads as missed.
- **Fix:** the legend now explains the dot with "• Someone absent". The shared `Legend` (src/components/money/kit.tsx) takes `dots` for this.

## INV-01 · P3 · Inventory Management · "Classs"
- **Actual:** the "Issued to" filter on Issue Stock offers "Classs", made by adding "s" to each label.
- **Fix:**
  - **The filter:** it now uses `ISSUE_TO_MANY` (Staff members, Departments, Classes, Students).
  - **The rest of the code:** I searched for other plurals built by adding "s". The only other one is `requestHeading` in Settings, which already skips labels ending in "s".
  - **Unit words:** the "in stock" lines now use the inventory unit words, so they say "55 reams", not "55 ream".

## INV-02 · P2 · Inventory Management · Issue button while over stock
- **Steps:** on Issue Stock, issue more than the store holds.
- **Actual:** "Only 55 ream in this store." shows on the line, but the button still reads "Issue and add ₹2,59,99,740 to fees" and can be pressed.
- **Fix:**
  - **Item lines:** `ItemLines` reports how many lines are over stock (`onOver`).
  - **Issue form:** while any line is over stock, the button reads "A quantity is above the stock" (or "2 quantities are above the stock"), shows no amount and is disabled (`InlineForm` `blocked`).
  - **Server:** the server check that refuses it is unchanged.

## PERF-01 · P3 · Front Office · Blank main area on the way in
- **Actual:** as the Principal, /front-office showed an empty main area for about 3 s.
- **Cause (most likely, not measured):**
  - **Loading shapes exist:** Front Office already has `loading.tsx` at its root and on Visitors.
  - **But there is a redirect:** the Principal cannot open the Reception Desk, so /front-office runs `foPage()` on the server and then redirects to /front-office/visitors. That page then loads everything again, so the Principal waits for two server trips.
  - **Not confirmed:** no app server could be run in the worktree to measure it.
- **Fix:**
  - **Direct link:** the Front Office link in the menu (computer sidebar and the phone's "All modules") now opens the page the person lands on. That is Visitors for everyone but the desk (`foLanding`, src/lib/front-office/access.ts; `landingFor`, src/lib/shell-data.ts), so there is no redirect on the way in.
  - **Highlighting:** the menu item still highlights on every Front Office page.
  - **Test:** tests/front-office/roles.test.ts ("opens the menu link straight on a page…").
  - **Still to check:** if a blank area still shows in the browser after this, the cause is somewhere else.
