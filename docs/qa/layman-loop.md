# Layman loop (14 Nov 23:55 → Monday 16 Nov morning)

Owner's goal: every word, button, screen, click, approval and link between modules is clear to a non-technical
school worker or parent on the first try, with no training. Test as one person at a time, fix the root cause,
check (lint, typecheck, tests, build on the SSD copy, screenshots 390/1440 light/dark), repeat, loop again.

How: visible clicking in the role Chrome profiles (live site, see memory "QA role-play browsers"); a read-only
code audit per area and mindset; fixes verified on the local production build (qa/loop/shots.mjs).
Local commits only. Nothing pushed or deployed (owner reviews on Monday).

Progress page: see docs/HANDOFF.md (link).

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

### Noted for the next batches
- Issue certificate: Bonafide shows "Conduct" and "Reason for a duplicate" that only apply to a TC/character certificate; "signatories" is a hard word (front batch).
- Send Message is heavy for a simple notice: 4 channels, Message type, 2 template boxes, Title, SMS backup (parent/communication batch: simplify the first view).
- 76 forms use side-by-side pairs; check each at 390 px in screenshots and stack where text is cut.
