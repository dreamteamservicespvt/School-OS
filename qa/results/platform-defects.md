# Platform QA defects (agent 5, area "platform")

Branch `qa-platform-w5`. "Base" means the production build of the base commit at
http://localhost:3000. "Dev" means my dev server on port 3105 with the fixes.
Every finding below was reproduced in the browser or by calling the server.
Where a part of a finding comes from reading the code, the entry says so.

| ID | P | Module | Short title | Fix |
|---|---|---|---|---|
| PLATFORM-01 | P1 | App shell (Search) | Search always answers "Too many searches" | f184e44 |
| PLATFORM-02 | P2 | Dashboard | Recent payments "Collect fee" link is a 404, and is offered to the Principal | f184e44 |
| PLATFORM-03 | P2 | Settings (Data Backup & Security) | Demo seed backup shown as a real "Last backup" | 6db2150 |
| PLATFORM-04 | P2 | Settings (Payment Gateways) | "Test these details" empties the typed keys | 6db2150 |
| PLATFORM-05 | P2 | Security (Sign in) | Sign-in limit trusts any x-forwarded-for, and shares one "unknown" bucket | not fixed |
| PLATFORM-06 | P3 | Security (server actions) | Refused actions show a crash page with a digest | not fixed |
| PLATFORM-07 | P3 | Auth (Profile) | Change password has no limit on wrong current passwords | 315318c |
| PLATFORM-08 | P3 | App shell (Search) | No typo matching; no search for receipts, classes or sections, or parents; no guardian name in results | not fixed |
| PLATFORM-09 | P3 | App shell | Top bar overflows at 768px and 1024px | c53bc48 |
| PLATFORM-10 | P3 | App shell (theme) | Muted text, warning text and text on red fail 4.5:1 | c53bc48 |
| PLATFORM-11 | P4 | Settings (Audit log) | "Approved" appears twice in the Action filter | not fixed |
| PLATFORM-12 | P3 | App shell | Profile menu does not take focus; New sheet lets focus escape | c53bc48 |
| PLATFORM-13 | P3 | Dashboard | Dashboard takes 1.4 to 3.0s in the large school | 57e9367, b6c14b5 |
| PLATFORM-14 | P3 | App shell | Notifications panel count is capped at 8; profile menu links go nowhere | c53bc48 |
| PLATFORM-15 | P4 | Reports & Analytics | A report hidden by a school feature says "not open to your role" | 90f1b3d |
| PLATFORM-16 | P4 | Sign in | "Forgot password?" is a Tab stop between login and password | 89efaca |
| PLATFORM-17 | P4 | App shell | Not-found pages answer HTTP 200 | 8fd7f5e |
| PLATFORM-18 | P4 | Dashboard | Transport papers alert says "and 1 more and 1 more" | f184e44 |
| PLATFORM-19 | n/a (environment) | Background jobs | No job worker runs in the QA environment | not fixed: environment |

---

## PLATFORM-01 · P1 · App shell (Search) · Search always answers "Too many searches"
- **Steps:** Sign in as any login (cems.admin). Press Ctrl+K and type "Aarav".
- **Expected:** Students and staff named Aarav are listed.
- **Actual:** Base: every request to `/api/v1/search` returned 429 "Too many searches. Wait a moment." Only page names were found. Every role was affected.
- **Root cause:** `src/app/api/v1/search/route.ts` checked `if (!(await hitLimit(...)))`. `hitLimit` returns an object (`{ ok }`), which is always truthy, so the negation was always false and the check always took the "limited" branch.
- **Fix:** f184e44. The route now reads `.ok`. Test: `tests/platform/search-and-links.test.ts`, which checks repeated searches, isolation of another school's student with the same name, and a 429 after 121 searches.
- **Verified:**
  - Dev: name, partial name, admission number and phone search work.
  - Special characters are safe.
  - Duplicate Aarav Kumar in School A and School B never cross.
  - Role scope holds: the driver sees nothing, and class teachers see only their own classes.

## PLATFORM-02 · P2 · Dashboard · Recent payments "Collect fee" link is a 404 and is offered to the Principal
- **Steps:** Open the Dashboard as cems.accountant or cems.principal, then open the Recent payments panel link.
- **Expected:** People who collect fees go to Fee Management. The Principal does not collect fees under the DUTY model in `src/lib/duty.ts`, so the Principal gets the fee dashboard.
- **Actual:** Base: the link went to `/fee-management/collect`, which shows "This page is not here". It was shown to everyone with fee view.
- **Root cause:** A stale path, plus a missing `doesWork(..., "fee-management", "collect")` check.
- **Fix:** f184e44 in `src/lib/dashboard/widgets/money.ts`. Test: `tests/platform/search-and-links.test.ts`.

## PLATFORM-03 · P2 · Settings · Demo seed backup shown as a real "Last backup"
- **Steps:** As cems.admin, open Settings, then Data Backup & Security.
- **Expected:** An honest "no backup yet" warning while no real backup exists.
- **Actual:** Base: "Last backup: today, 2:30 AM", taken from the seed record whose location is "demo (no real backup on this computer)".
- **Root cause:** `lastBackup` in `src/lib/data-security/privacy.ts` counted demo rows.
- **Fix:** 6db2150. It adds `REAL_BACKUP`, which ignores locations starting with "demo". Test: `tests/platform/backup.test.ts`.

## PLATFORM-04 · P2 · Settings · "Test these details" empties the typed keys
- **Steps:** As qab.admin (synthetic School B), go to Settings, Payment Gateways, Add. Choose Razorpay and type made-up sandbox keys (`rzp_test_DEMO...`). Press "Test these details", then press Add.
- **Expected:** The typed fields stay filled after the test.
- **Actual:** Base: the Key ID and the secrets were emptied, and Add said "Key ID is needed".
- **Root cause:** The form fields were uncontrolled, so the server action's re-render reset them.
- **Fix:** 6db2150. `gateway-form.tsx` now keeps typed values in state.
- **Verified:** Dev: the gateway saved after the test. No real key was used; the real Razorpay check is NEEDS EXTERNAL CREDENTIAL.

## PLATFORM-05 · P2 · Security · Sign-in limit trusts any x-forwarded-for and shares one "unknown" bucket
- **Steps:**
  1. Send 30 wrong sign-ins with no x-forwarded-for header. Every client without the header is now refused, including other people.
  2. Send x-forwarded-for with a new made-up value on each request. The limit never applies.
- **Expected:** The limit is keyed on the real client address, as set by a trusted proxy.
- **Actual:**
  - `deviceInfo()` takes the first x-forwarded-for value as sent by the client.
  - In this QA environment, every agent's browser shared the "unknown" bucket, and sign-ins failed for everyone. The QA scripts now send made-up addresses.
  - The same header is shown as the device IP on Profile, Signed-in devices.
- **Root cause:** No trusted-proxy setting. Part of this comes from reading the code: `src/lib/current.ts` deviceInfo and `src/app/sign-in/actions.ts`.
- **Not fixed:** the right answer depends on the deployment (which proxy, and how many hops to trust). It needs a deployment setting such as TRUSTED_PROXY_HOPS. Login lockout per account still protects each login.

## PLATFORM-06 · P3 · Security · Refused actions show a crash page with a digest
- **Steps:**
  - Call `saveGateway` as cems.accountant.
  - Call `saveContactAction` on another class's student as cems.classteacher.
  - Run the driver sweep, which made 906 calls.
- **Expected:** "You cannot do this" in plain words.
- **Actual:**
  - Nothing changed in the database: all refusals held, and DB counts were checked before and after.
  - However, 146 refusals throw instead of returning words. The person sees the generic error screen with a digest.
- **Root cause:** `requireAction()` throws `PermissionDeniedError`, and many actions do not catch it into their form state.
- **Not fixed:** this touches about 150 actions across every module. A shared wrapper is the right fix, and it belongs to the lead.

## PLATFORM-07 · P3 · Auth · Change password has no limit on wrong current passwords
- **Steps:** Signed in, open Profile, Change password, and type wrong current passwords again and again.
- **Expected:** A limit, as sign-in has.
- **Actual:** No limit or lockout. One wrong try was checked in the browser; that there is no limit at all comes from reading `changePassword` in `src/app/(school)/actions.ts`.
- **Fix:** 315318c. It allows 10 tries per 10 minutes per person, with the same words as sign-in. Test: `tests/platform/change-password-limit.test.ts`.

## PLATFORM-08 · P3 · App shell (Search) · Search gaps against the blueprint
- **Steps:** Search for "Aarv" (a typo), a receipt number, "Grade 5" or "5 A", and a parent's name.
- **Expected:** These are found. The blueprint's search also shows the guardian name with each student.
- **Actual:**
  - A typo finds nothing.
  - Receipts, classes and sections are not searched.
  - Results show class, roll number and admission number, but not the guardian.
- **Not fixed:** this is new search scope (NOT IMPLEMENTED), not a bug.

## PLATFORM-09 · P3 · App shell · Top bar overflows at 768px and 1024px
- **Steps:** Open any school page, signed in, in a window 768px or 1024px wide.
- **Expected:** No sideways scrolling, and the profile button stays visible.
- **Actual:** Base: the page was 803px wide at 768px and 1228px at 1024px. The dark-mode and profile buttons were off screen, so Sign out could only be reached by scrolling sideways.
- **Root cause:** The search button was a flex item with no `min-w-0`, so its long placeholder could not shrink.
- **Fix:** c53bc48. The search can now shrink, the Ctrl K hint shows only at xl, and the year and profile buttons no longer shrink.
- **Verified:** Dev: 768, 820, 1024 and 1280px all fit. A 28-page sweep at 320 to 1920px found no other sideways scrolling.

## PLATFORM-10 · P3 · App shell (theme) · Text below 4.5:1 contrast
- **Steps:** Measure the contrast of every visible text on 6 pages, in light and dark.
- **Expected:** 4.5:1 for body text. Both the blueprint (08 §14 rule 6) and the comment in globals.css promise AA.
- **Actual (base):**
  - Light theme: muted grey (`--ink-3`) was 4.2:1 on white and 3.9:1 on the page background. It is used for 90 to 160 texts per page. Warning text was 4.1:1.
  - Dark theme: white on the light red used for badges and danger buttons was 2.7:1. Muted text on sunken surfaces was 4.4:1.
- **Fix:** c53bc48.
  - `--ink-3` is darkened in light and lightened in dark.
  - The light `--warn` is darkened.
  - A new `--bad-ink` token is added, so text on red is dark in dark mode.
- **Verified:** Dev: 0 failures on the dashboard and audit log in both themes. One remainder: the dark search placeholder is 4.0:1.

## PLATFORM-11 · P4 · Settings · "Approved" appears twice in the audit-log Action filter
- **Steps:** Open Settings, Data Backup & Security, Audit log, and open the Action filter.
- **Actual:** "Approved" is listed twice.
- **Not fixed:** cosmetic.

## PLATFORM-12 · P3 · App shell · Profile menu does not take focus; New sheet lets focus escape
- **Steps:** Using the keyboard only, open the profile button with Enter. Separately, open New and press Tab 25 times.
- **Expected:** Focus moves into the menu. Focus stays inside the modal. Escape closes and returns focus.
- **Actual (base):**
  - The profile menu opened, but focus stayed on the button behind it.
  - In the New sheet, focus left the sheet after 7 Tabs and reached the page behind.
  - Escape worked in both.
- **Root cause:** The shell's own sheet and menu are plain divs with no focus trap. The ui dialogs use `showModal()` and were fine.
- **Fix:** c53bc48. A `useTrap()` hook is added to the shell Sheet, the profile menu and the notifications panel.
- **Verified:** Dev: focus lands on the first item, and stays inside for 25 of 25 Tabs.

## PLATFORM-13 · P3 · Dashboard · Dashboard takes 1.4 to 3.0s in the large school
- **Steps:** Sign in as `principal` in Sunrise (323 students and 122k attendance marks) and open the Dashboard.
- **Expected:** Under 1.5s.
- **Actual:**
  - 1.4 to 3.0s of server time. CEMS takes 0.85 to 1.4s.
  - Profiling with `qa/platform/dash-profile.ts`: 66 widgets run one after another inside one transaction, each with a savepoint. The slowest is `exams.marks-due` at 112ms; most take 15 to 90ms. There is no single hotspot.
  - All other big Sunrise pages took 64 to 370ms.
- **Fix (first try):** `src/lib/dashboard/compose.ts` loaded the widgets in 3 transactions at the same time, still one after another inside each, with a savepoint around every widget and one memo shared by the three transactions.
- **Fix:** 57e9367, 80470ac, 2804596, b6c14b5.
  - The widgets are put in bundles, one per module (fees with finance, academic with attendance). Up to 6 transactions, never more than the connection pool holds, take bundles from one queue. Each transaction has its own memo, so a shared read is never used in another transaction.
  - The year, Seen marks, approvals, tasks and the school-day line load in the same lanes. The setup checklist check runs alongside the page instead of before it.
  - No savepoint per widget: a failing widget's transaction is rolled back and its lane goes on in a new one. Queries per page: 436 before, 313 after.
  - The marks papers list (`exams.marks-due`) looks rows up instead of searching all marks for every paper. `todayFor()` and `minutesLate()` keep one date formatter per time zone.
  - Tests: `tests/dashboard/lanes.test.ts` shows the page is identical in 1, 3 or 6 transactions, a shared read stays in its own transaction, and a failing widget anywhere in a bundle leaves the rest of the page. The page output was byte-for-byte the same before and after for 12 logins in both demo schools.
- **Verified (18 Oct 2026):** `qa/platform/dash-speed.ts principal Sunrise` (NOLOG=1, 12 runs, before and after taken in turn three times on a dev machine at 100% CPU from other work): median 1.85, 1.71 and 1.26s before, 1.04, 1.13 and 0.97s after; best 0.99, 1.27 and 0.84s before, 0.73, 0.74 and 0.52s after. These are buildHome times only, not the whole request. Re-measure on a quiet machine or the test copy.

## PLATFORM-14 · P3 · App shell · Notifications panel count and profile menu links
- **Steps:**
  1. As cems.principal with 16 unread notifications, open the bell.
  2. Open the profile menu and choose "Colours and text size". Also try Ctrl+K "Change password" and "Signed-in devices".
- **Expected:** The panel says "16 new". Each link lands on its section.
- **Actual (base):**
  - The panel said "8 new", because it counted only the 8 it lists. The bell and the page said 16.
  - `/profile#appearance`, `#password` and `#devices` had no anchors, so each link left the person at the top of Profile. Appearance actually lives at `/profile/appearance`.
- **Fix:** c53bc48.
- **Verified:** Dev: bell 17 and panel "17 new". All three links land on their sections.

## PLATFORM-15 · P4 · Reports & Analytics · Feature-hidden report says "not open to your role"
- **Steps:** As cems.admin, open `/reports-analytics/r/at-overtime` (and `at-devices`, `fi-budget`, `fi-trial`).
- **Actual:** "“Overtime and shifts” is not open to your role." The real reason is that the school feature is off. The index rightly hides these reports.
- **Fix:** 90f1b3d. `featureOff()` in the report catalogue tells a report closed only by a School Feature from one the role may not see. The report page now says "“Overtime and shifts” is switched off for <school>. It needs Overtime. The Principal or School Admin can switch it on in Attendance Settings. Nothing is lost while it is off." (Finance reports name Budget or Accounts and Finance Settings.) Exports and background runs use the same words. A report the role may not see still goes to No access.
- **Verified:** `tests/platform/qa-lead-words.test.ts` (Overtime and shifts, Budget against actual, and a role-closed report).

## PLATFORM-16 · P4 · Sign in · "Forgot password?" is a Tab stop between login and password
- **Steps:** On Sign in, press Tab from the login box.
- **Actual:** Focus goes to "Forgot password?" before the Password box. Pressing Enter there switches to the code flow, which is easy to do by mistake when typing quickly.
- **Fix:** 89efaca. The link is now one control after Sign in, "Forgot password? Sign in with a one-time code" (it replaces the old "Sign in with a one-time code instead" button, which did the same). Tab goes login, password (its Show button), Keep me signed in, Sign in, then Forgot password.
- **Verified:** `tests/platform/sign-in-tab-order.test.ts` reads the rendered form's Tab order. `qa/platform/a11y.mjs` updated (one Tab from login to password).

## PLATFORM-17 · P4 · App shell · Not-found pages answer HTTP 200
- **Steps:** GET `/no-such-page`, or another school's student URL.
- **Actual:** 200 with "This page is not here", because of streaming. People see the right words; monitors and crawlers see a success.
- **Cause:** every module has a `loading.tsx`. Next.js sends 200 as soon as that loading screen can show, so a record page calling `notFound()` after it looks the record up can no longer change the status. `/no-such-page` itself already answered 404 on this commit (the `[module]` page has no loading screen).
- **Fix:** 8fd7f5e. `src/proxy.ts` passes the path of a full page load (only GET page loads: not in-app navigation, server actions, uploads or the API) to the school layout, which sits above every `loading.tsx`. The layout asks `src/lib/record-gate.ts`, inside the transaction it already opens: for 45 record pages (students, fees, payments, staff, applications, books and so on), a record id that does not exist in this school, or another school's (row-level security hides it), or a value that is not an id, calls `notFound()` before anything streams. Archived records, roles and own-class checks stay with each page. Loading screens are unchanged, and in-app navigation is unchanged.
- **Verified:** `tests/platform/record-gate.test.ts` (paths, fixed folders checked against `src/app`, another school's record missing). `qa/platform/status-codes.mjs` against `next start`: 404 with "This page is not here" for unknown addresses, missing records, a bad id and School B's student opened as School A's admin; 200 for real pages and School A's own student. With the proxy skipped, the same record pages answer 200, which shows the cause.

## PLATFORM-18 · P4 · Dashboard · Transport papers alert says "and 1 more and 1 more"
- **Fix:** f184e44 in `src/lib/dashboard/widgets/transport.ts`.

## PLATFORM-19 · environment · No job worker runs in the QA environment
- **Actual:**
  - No `npm run worker` process is running.
  - 486 `messaging:deliver` jobs and 22 `attendance-after-save` jobs are queued.
  - Every in-app message stays QUEUED, so Messages is empty for everyone.
- **Not fixed:** this is the environment, not the code. Messages delivery was BLOCKED.
