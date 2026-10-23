# Phone audit and owner-problems check, 23 October 2026

What was tested, what was fixed, and what needs a decision. Local only: nothing here is pushed yet.

## How it was tested
- A script signed in as the demo School Admin and the console Owner, opened every page it could reach
  (seeded from every route, then every link found) on a phone screen, 360 and 390 px, light and dark.
- Production build: 626 school pages and 14 console pages checked fully. 269 more pages are re-checked
  (the first pass moved on before the page finished starting, which only the test script saw).
- Per page: wider than the screen, text boxes under 16 px (iPhone zoom), server errors, browser
  console errors, white boxes in dark mode, empty cells in tile grids.
- Screenshots of the main screens reviewed by eye: Dashboard, Students, Student Profile, Fees,
  Attendance (admin and teacher), Marks Entry, Notices, Time Table, Parent Link (Telugu), console.
- Touch-swipe test for scrolling behind open sheets.

## Fixed (commits on branch claude/project-thread-cesreq)
| Problem | Where | Fix |
|---|---|---|
| Page behind an open sheet scrolled on phones | every sheet, dialog, menu | one page lock for all (PageLock) + test |
| iPhone zoomed in when tapping any box | every text box and dropdown (15 px) | 16 px on phones |
| Page wider than the phone | Admission reports (529 px), and any grid with no columns | one rule for all grids |
| Page wider than the phone | admission application, inventory rooms, import page | buttons wrap |
| Marks page crashed on a busy server | withUser had a 5 s limit | 15 s, same as withSchool |
| "Open student" and student names went to a 404 page | admission application, Fee Ledger, Collect Fee, homework submissions | correct link + test for every such link |
| "20 not marked yet" warning on a holiday | Attendance | says "No school" |
| Day's numbers below the first screen | Dashboard on phones | filters fold behind one button |
| Same four totals shown twice | Fee Dashboard | shown once |
| Captions cut ("318 over 3…") | all stat tiles | wrap to two lines |
| "Collect fee" sent Principal/Admin back unexplained | Student Profile | follows the fee desk rule |
| Empty grey cell | Student Profile tiles | last tile fills the row |
| Dropdowns looked different page to page | about 100 dropdowns | one chevron in light and dark |
| Shared document link kept working after archive | document vault | stops while archived + test |

## Checked against what school owners report going wrong
Research: docs/research/school-owner-pain-points.md (17 themes, 47 checks). The 16 most serious:
6 met (4 better than asked: school data walls, payment never lost, no silent edits, support access logged),
7 partly met, 1 missing, 2 need a timed test.

## Needs your decision (new features or settings; not built)
1. Bank settlement matching (missing): daily Razorpay settlements matched to receipts, with unmatched lines.
2. "Paid twice: refund needed" list on the Fee Dashboard (today a second payment is kept as advance).
3. Receipt link inside the fee-paid WhatsApp/SMS (the WhatsApp template must be re-approved by Meta).
4. Privacy notice in English and Telugu on Parent Link and admission (DPDP; legal review before May 2027).
5. Backups and restore test on a schedule on the live server (the scripts exist; nothing runs them).
6. Attendance offline saving is off unless a school switches it on; suggest on for every school.
7. Changing a guardian's mobile could resend Parent Link in the same save.
8. Timed tests: parent pays on a slow phone in under 60 s; teacher marks 40 students in under 60 s.

## Other notes
- `npm run build` runs out of memory on this PC without NODE_OPTIONS=--max-old-space-size=6144
  (the Vercel build already sets it).
- The build warns that src/lib/storage.ts makes Vercel trace the whole project into the server bundle.
- Not checked: the live site (school-os-beta.vercel.app) after these fixes, since they are not pushed.
