# Layman loop (14 Nov 23:55 → Monday 16 Nov morning)

Owner's goal: every word, button, screen, click, approval and link between modules is clear to a non-technical
school worker or parent on the first try, with no training. Test as one person at a time, fix the root cause,
check (lint, typecheck, tests, build on the SSD copy, screenshots 390/1440 light/dark), repeat, loop again.

How: visible clicking in the role Chrome profiles (live site, see memory "QA role-play browsers"); a read-only
code audit per area and mindset; fixes verified on the local production build (qa/loop/shots.mjs).
Local commits only. Nothing pushed or deployed (owner reviews on Monday).

Progress page: see docs/HANDOFF.md (link).

## Owner's requests during the loop (15 Nov)

1. Sunday: "No school" shown twice on every Dashboard; Take Attendance says it twice → DONE e0a8ddd8 (one "Today" tile, one calm card with when school is back).
2. Staff Attendance calendar: month dropdown with one choice looks broken ("UI corrupted") → fix it and every one-choice dropdown on the platform.
3. Admissions Pipeline is confusing; cards hard to use → redesign simply.
4. WhatsApp is not working → find out why (read-only in the Dream Team Services Chrome, never touch the gym's setup); test sends only to 9390011378, checked in WhatsApp Web (chsrinu4644 Chrome, device 69dcd765).
5. WhatsApp only: switch off normal SMS by default everywhere (not implemented now). → agent running.
6. Founder review: "the software looks heavy with text, clumsy and confusing" → a "less text" pass over every screen (next round).

### WhatsApp: why it does not work (found 15 Nov, read-only on live)
- Connected and sending for real (own WhatsApp Business number, last test passed 04-11, 497 credits). Only 3 messages ever went.
- 26 of 27 WhatsApp templates are "Not submitted"; only "School connection test" is approved. WhatsApp only lets a business start a chat with an approved template.
- ROOT CAUSE IN OUR CODE: the built-in template texts end with "- {school_name}"; WhatsApp refuses a text that ends with a blank, so School OS (correctly) refuses to submit them. The school's General announcement also has too many blanks for its length.
- Fix: (1) WhatsApp-ready default texts + a test that every default passes; (2) a one-click "make WhatsApp-ready" for existing schools' untouched, never-submitted texts (new version, old kept); (3) "send all for approval". Real submission to Meta only after the owner deploys (no deploy until Monday).

## Mindsets (one per round, then start over)

1. Older office clerk, little English, scared of breaking something
2. Teacher on a phone with 2 minutes between classes
3. Accountant afraid of a money mistake
4. Receptionist with an impatient parent at the desk
5. Principal: "is everything okay today?"
6. Parent on a cheap phone opening a WhatsApp link
7. Brand-new school, day one, empty data
8. Clicks the wrong thing, presses back, refreshes, gives up halfway
9. Telugu-first user who reads English slowly
10. Careless, fast user who skips reading

## Issues

| # | Problem | Mindset | Screen | Fix | Commit |
|---|---|---|---|---|---|
| 1 | School year never switched on: every Dashboard number empty, attendance "Not taken" though taken | Principal | Dashboard | First year of a campus that has started is active at once (year opened on live by hand) | 7fdc1a98 |
| 2 | Every 2nd receipt showed "The PDF could not be made" | Accountant | Fee receipt | Dead kept browser replaced, print retried once | 3044c8a8 |
| 3 | "Add enquiry" quick action opened the list, not the form | Receptionist | Dashboard | Opens the form (?do=add) | 203e955e |
| 4 | Give homework / Send a notice / New application quick actions landed on the wrong page | Teacher | Dashboard | Each opens its form | 6639457b |
| 5 | Homework card: "32 students in 1 class" for a class of 16 | Teacher | Homework | "32 pieces of work for 1 class" | 6639457b |
| 6 | A paper 2 days away was open for marks with nothing saying it is not written yet | Teacher | Marks Entry | Note: "This paper is written on …" | b14a7a0e |
| 7 | Browser's grey "Choose File" box in 8 forms looked broken | Clerk | Leave, notices, … | One style for every visible file box | d03a5bab |
| 8 | "Check days and balance" looked like plain text | Teacher | Apply for leave | Real button | d03a5bab |
| 9 | Phone matching a known parent: only "sibling" or "Cancel" (closed the form) | Receptionist | Add enquiry | "Different family" choice, as Add student has | 26ad8fa4 |
| 10 | No sounds | Owner | Every screen message | Soft sounds: saved, money in, sent, problem; follows Sound on/off | fd38a4f5 |
| 11 | Changing a parent's phone took 4 clicks through "Settings" (custody page) and a hidden ⋯ menu | Clerk | Student profile, Parents | "Change phone or name" on the parent card (back to the child after saving); "Settings" → "Relation and who may collect"; Edit details visible on the parent page | fc0cdfd3 |
| 12 | Send Message: whole school chosen but "0 parents", "they get WhatsApp…", "nobody can be reached" with no reason | Clerk | Communication, Send Message | Real reason shown (typed WhatsApp not approved yet), in plain words; "Users to notify" → "Who will get it" | 72b1d8cc |
| 13 | Enquiry form on a phone: "For year" cut off ("2027-28 (Main C…") | Receptionist | Add enquiry, 390 px | Paired fields stack on phones | 72b1d8cc |
| 14-36 | 23 shell findings (audit): "module/role" on No access, "waiting for nobody" approvals, Decline that did not reject, two "Messages", approvals count hidden on phones, long sign-in refusals, gateway jargon, "these dates", "Watch signs/flag", "data consent", "fault in School OS", notification table on phones, … | Clerk, Principal | Dashboard, Approvals, Sign-in, Menus, Profile | See commit message and audit file (area shell) | 7f50bf70 |

| 37 | Phone top bar cut "Attendance Managem…"; Attendance tab looked selected on every page; day-off advice told teachers to edit the School Calendar; "Go to today" on today | Teacher (phone) | Top bar, bottom bar, Take Attendance | Short word in the bar; outline main button; "the School Admin can turn on…"; button hidden on today | 0feb7e6b |
| 38 | Teacher home on a holiday said "not a working day" 3 times | Teacher (phone) | Dashboard, My classes today | Said once | ba5cbac2 |
| 39-62 | 24 money findings (audit, accountant mindset): Close the day mixed cash with UPI/bank and showed the expected cash in the counted box, "Pending" vs late, % raise started at 5, invoice button did not say it sends WhatsApp, Approve refund in one tap with no amount, "Receipts/Payments" in the cash book, "Resend", "Row", jargon in reminders and Department/Income head help, … | Accountant | Fee and Finance screens | See commit message and audit file (area money) | 3959523e |
| 63 | Day Book on a quiet day: 6 tiles of ₹0 "None" and 8 empty cards; "apart from the academic year" | Accountant (phone) | Day Book | One line: nothing paid in or out; plain filter note | ac4cbd8f |
| 64 | Fee Dashboard on a phone: every class listed, ~6,000 px | Accountant (phone) | Fee Dashboard | 6 most overdue first, "Show all N classes" | d716b33e |
| 65-89 | 25 front-office findings (audit, receptionist) + certificate form showing TC-only boxes for a Bonafide and "signatories": button names per certificate type, welcome-message status in words, pickup "Allow to pick up", lock messages with a next step, promotion "batch", Aadhaar help, … | Receptionist, Clerk | Front Office, Admissions, Students | See commit and audit file (area front) | a2446e02 |
| 90-117 | 27 teaching findings + "overdue" cut on phone: messages that cost credits now say how many families and cost first (PTM summary, event reminder, results, homework, attendance absent alert), "audit log", AB rule on marks, Submit marks of N students, syllabus "should be X% done", attendance colours follow the school's threshold, "quota", "Undo excuse", empty register points to Classes & Sections | Teacher | Attendance, Homework, Exams, Time Table, Events | See commit and audit file (area teach) | a1ff91c4 |
| 118 | Principal's phone Dashboard 7,000 px (20 attention rows); early-warning row read like a puzzle | Principal | Dashboard | 6 most urgent first + "Show all"; "13 students need a closer look" with the split below | 38ca8f7f |

### Noted for the next batches
- Teacher home on a holiday: "Take attendance" shown twice and "not a working day" said 3 times (teaching batch).
- Send Message is heavy for a simple notice: 4 channels, Message type, 2 template boxes, Title, SMS backup (parent/communication batch: simplify the first view).
- 76 forms use side-by-side pairs; check each at 390 px in screenshots and stack where text is cut.
