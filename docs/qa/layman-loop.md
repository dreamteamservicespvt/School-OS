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

7. Send every kind of WhatsApp message to 9390011378 (also as a parent's number); Parent Link not sending; check Parent Link and student progress → same root cause (templates); fix in code, test every message kind locally with 9390011378 as the parent; real delivery after the owner deploys and Meta approves.
8. School Calendar confusing → DONE ff0cd2ed (month once, names wrap + "+N more", colour key, pick a day, phone list view, shorter Events subtitles). Admissions Pipeline → DONE 0665f5a8 (one step list with labelled next-step buttons).
9. Staff Attendance month list with one choice ("UI corrupted") → DONE 6cbf8094 (plain text; every one-choice form dropdown too).

10. Moving a school's data in (students, parents, staff, old fees): practise different ways with realistic messy files (made-up data), as a layman, on the new local "Day One Test School" → round "Moving in".

11. Security and sign-in: "one bug can cost the company" → white-box (code) and black-box (attack the LOCAL app only, never live) review; verify each finding, fix, test.

### WhatsApp: why it does not work (found 15 Nov, read-only on live)
- Connected and sending for real (own WhatsApp Business number, last test passed 04-11, 497 credits). Only 3 messages ever went.
- 26 of 27 WhatsApp templates are "Not submitted"; only "School connection test" is approved. WhatsApp only lets a business start a chat with an approved template.
- ROOT CAUSE IN OUR CODE: the built-in template texts end with "- {school_name}"; WhatsApp refuses a text that ends with a blank, so School OS (correctly) refuses to submit them. The school's General announcement also has too many blanks for its length.
- Fix: (1) WhatsApp-ready default texts + a test that every default passes; (2) a one-click "make WhatsApp-ready" for existing schools' untouched, never-submitted texts (new version, old kept); (3) "send all for approval". Real submission to Meta only after the owner deploys (no deploy until Monday).

## Needs the owner's decision (Monday)

1. Security fix: Staff & HR can no longer send a reset/sign-in link to a Teacher (a Teacher has some access HR lacks). Keep it, or let HR send the link only to the person's own phone/email without showing it on HR's screen?
2. "Sign in with a one-time code" tells strangers which logins exist (would remove tonight's helpful wording to fix).
3. Changing your own mobile/email or switching off two-step asks no password, and the old contact is not told.
4. A School Admin of one school resets a shared login's two-step for all schools in the group.
5. Deploy settings to review: console code shown on a test copy; TRUSTED_PROXY_HOPS=0 makes every visitor share one rate-limit bucket.
6. Console WhatsApp webhook forwards unsigned requests to the gym's live site (shared live setup: not touched).
7. Admissions: drag-and-drop removed from the pipeline (step list with buttons instead); bring back as an extra?
8. WhatsApp (DONE in code c5747f67): after deploy, Communication > Message Templates > "Make N templates ready for WhatsApp", then "Send N templates to WhatsApp for approval"; Meta answers in minutes to a day. Root cause corrected: defaults were fixed 30 Oct, but the live school kept old words (test mode had marked them approved, then the real account reset them to Not submitted). Admission messages to families now go inside the approved General announcement template on a real account (commit e1c2697b — its message says "moving-in finding logged" but it also holds this change; tests 423/424, the 1 is the translation check during the text pass); screens now say "The parent was not messaged (…). Please tell them by phone." instead of always "told".
9. Assistant face: the owner rejected the 3 flat looks and the code-built 3D helper ("worst"); now building a lifelike 3D person with the free TalkingHead engine (loaded from a public CDN, no running cost).
10. Day-one school data: the test school's 4 students already have fee rows 'Due 14-11-2026' made before the due-date fix; correcting old rows is a one-off data change (owner OK needed). Also: archive the duplicate 'Naresh Kumar' staff record; Hindi/Telugu legal consent texts need owner-approved wording; 'cancel a pass made by mistake' is not in the blueprint.
11. Setup checklist can now un-tick for live schools (fees for every class, Parent Link for every parent, WhatsApp live): 'I already did this' still works.
12. Demo data: test names (QA-, L1-L4, LD-, NA-, NC-, Test..., emoji) are on most pages of the test copy, and tests on the live site used real logins, so check the live pages before a demo or keep a clean demo school. In the test copy every child owes fees (re-seed for demos).
13. Side menu names: a demo visitor asked for shorter names (Fees, Students, Attendance) and a Time Table entry; the blueprint says module names must match exactly, so not changed.
14. Telugu fee-reminder template says 'pay by {due_date}' even when overdue; changing a WhatsApp template's words means Meta approval again (do with the deploy's template step). Notifications are stored in English; showing each reader's language needs a schema change.
15. Moving in: a parent row without a phone cannot come in (Guardian phone is required in the database; Parent Link needs it). Allow a parent without a phone (migration) or keep refusing?
16. Settings (payment gateways, messaging) say 'DREAM TEAM'; pick the wording schools should see (for example 'your School OS support team').
17. Parent Link footer: a WhatsApp number for parents (the school office phone is used when it is a mobile).
18. Accountants still open Fee Management on Collect Fee (the 2nd tab); admin and principal now open the Fee Dashboard. Same for accountants?
19. Staff with salary vs staff on roll: Salary pages count the payroll subset (42 on payroll, 32 with a structure) while Staff & HR says 43 on roll; next loop: the salary labels will say which subset.
20. App icon: the Assistant wears a glowing open-book badge (the School OS mark, decided 15 Nov). Switch the School OS app icon (now a rising sun on blue) to the same book mark so logo, mascot and the sound brand match?
21. Pickup check over WhatsApp: WhatsApp never delivers code messages to Indian (+91) numbers (live test 16 Nov), so the pickup code can no longer go by WhatsApp (the desk is told to call the guardian). Build a "tap to approve" instead: the guardian gets a card "<person> is at the desk to collect <child>" with an Approve button, and the desk sees "Approved by the guardian"? (Or connect SMS with DLT, which carries codes.)
22. Receipt PDF on the Fee received card: needs WHATSAPP_APP_ID (the Meta app's number) in Vercel's settings, or a token that may read the app; the template page now shows the exact reason after resending. Also verify the Meta business to lift the 250-template cap.
23. Admission consent code: same +91 block as 21. Until SMS is connected, the counter cannot confirm a parent's consent by code (the page now says why). Allow the office to record a signed paper consent form instead, or confirm consent later by the Parent Link tap?
24. "New notice" and "Results" WhatsApp cards are approved but Send Message cannot fill their title / exam name for one person; they go from the Notice and Results pages to whole classes. Test them with one real class?

### Owner answers (15 Nov, in chat) — build these
- 1 HR reset link for a Teacher: keep blocked (School Admin only).
- 2 One-time code sign-in: always the same message ("If this number has a login, a code is on its way").
- 3 Changing own mobile/email or switching off two-step: ask the password (or a code) first, and tell the old phone/email.
- 4 Shared multi-school login two-step reset: console (DREAM TEAM) only; school admins see "ask support".
- 7 Admissions pipeline: buttons only (no drag-and-drop).
- 13 Side menu: short labels (Attendance, Fees, Students, Admissions, Exams, ...); page titles keep full names; Time Table findable in search; blueprint updated to match.
- 15 Moving in: allow a parent without a phone; mark "Phone missing"; no Parent Link or messages until a phone is added.
- 18 Accountant opens Fee Management on Collect Fee (admin and principal on the Fee Dashboard).
- 16 Settings wording: "the School OS support team" instead of DREAM TEAM.
- 14 Bell notifications in each reader's language: build it (kind + values, safe migration; old ones stay English).
- 17 Parent Link footer: a per-school "WhatsApp number for parents" in School Profile; fallback the office mobile.
- 10 Consent texts: draft Hindi and Telugu, marked draft, NOT shown to parents until the owner approves on Monday.
- 6/WhatsApp webhook (15 Nov): leave the shared gym webhook as it is; School OS says 'Sent to WhatsApp' honestly (delivery reports not connected).
- URGENT for the owner (outside School OS): a WhatsApp chat (Govardhan, 23-10-2026) holds the WhatsApp access token and a Firebase private key in plain text: rotate both and delete the message.

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
| 119 | Less text on every screen (founder): 368 files, 817 new short words; warnings/undo/who-approves kept | All | All | Full suite 2,889 pass | af0021ab |
| 120 | Moving in: student import stuck "Bringing in…" forever (job runner frozen after one hung burst) | Clerk | Import | Bursts give up after 35 s; stale flag no longer blocks | cd427d52 |
| 121 | Moving in: old register's "Emp Code"/"Salary" silently left out; no Staff ID column | Clerk | Staff import | Lists columns not brought in; Staff ID column from Emp Code etc. | ccb91c74 |

| 122-212 | Loop 2: 5 people (clerk, teacher on a phone, accountant, receptionist, principal) used the rebuilt app; 91 findings (docs/qa/layman-loop2-findings.json). 87 fixed by area; plus dashboard money approval confirm, one waiting refund per receipt (triple refund), phone bar steps aside for the keyboard, My leave title, plainer approval titles | All | All | Full suite 2,891 pass (2 load timeouts re-run clean) | c54c1b52 |
| 213-308 | Loop 3: Telugu-first clerk/teacher, parent on Parent Link, wrong clicks, new school day one, re-check of loop 2; 96 findings (docs/qa/layman-loop3-findings.json). 99 fixes: Parent Link {school} consent text, 2.1 MB page cut to its own words, Due now/Not due yet, class teacher + school WhatsApp; Cancel drops drafts; no blank form on Back; fees not overdue on publish day; setup list honest about test mode; fixed bars stay on screen; 227 Telugu words | All | All | Full suite pass (6 load timeouts re-run clean) | 481ed699 |
| 309-402 | Loop 4: demo visitor, principal on a phone, month-end accountant, Hindi receptionist, careless user; 94 findings (docs/qa/layman-loop4-findings.json). Marks above the maximum never saved; test mode never priced as credits; bank below zero explained; closed day shown; absent list with staff; approvals Next request; notice quick audiences; one student count; dark band; names must start with a letter; 259 Hindi words | All | All | Full suite 2,892 pass first run | 87d57b54 |
| 813-886 | Loop 6 (16 Nov, visible, owner's 6 role Chromes on the live site): 74 findings (docs/qa/layman-loop6-findings.json), 4 high: grade-only papers counted 0% (false 'failing' alert), 'Nobody absent' when not taken, H = Half-day and Holiday, templates list stuck at 25. About 65 fixed by 3 parallel fixers; skipped L6-04/08/10/16/47/58/61/68/70 | All 6 roles | Many | See commits | 3401f9a9 7c24a219 6f25ed50 e7e1da30 |
| 887-895 | Leftovers (17 Nov night, deploy 23): concession sheet closes after Apply (re-tested, already fixed); 27 hand-built forms clear a fixed box's message (FormProblems); student picker names a parent; lists over 12 choices get 'Type to find'; Send Message templates behind one button + 'No one yet'; 28 dropdown pairs stack on phones; L6-16 class name in academic messages; L6-68 one support name DREAM TEAM; line-clamp fixed in 7 places (deploy 22) | All | Many | Browser checks qa/loop/find-check.mjs, clear-check.mjs, concession-close.mjs | e79b7d09..a38b58eb |

### Noted for the next batches (all done 17 Nov, row 887-895)
- Concession form stays open after Apply (loop 2, money): reproduce in the browser; may be shared SheetForm.
- Shared pieces asked for by loop 2: student picker (parent phone, father's name, close after pick), staff type-to-search picker, action-form error clears when fixed, School holiday WhatsApp template.
- Send Message is heavy for a simple notice: 4 channels, Message type, 2 template boxes, Title, SMS backup (parent/communication batch: simplify the first view).
- 76 forms use side-by-side pairs; check each at 390 px in screenshots and stack where text is cut.
