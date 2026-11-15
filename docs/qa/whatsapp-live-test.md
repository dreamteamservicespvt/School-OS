# WhatsApp live test: every message kind (15-11-2026)

Live site https://school-os-beta.vercel.app, test school "chaitanya", deploy 7 (main b830dc08).
Every message went to 9390011378 only: parent Venkatesh (father of Sri Lakshmi, class 1 A) or teacher aswini.
Arrivals were checked in WhatsApp Web (Principal's Chrome), in the chat from +91 79896 17553.
Tested by Claude, 16:05 to 16:57 IST.

## Parent Link (owner's first request)

- **Sent:** 16:33 from Venkatesh's guardian page (Send Parent Link, to him only).
- **Arrived:** 4:33 PM. "Dear Venkatesh, this is your personal Parent Link from chaitanya. See fees, attendance and notices…" The link points to school-os-beta.vercel.app/p/….
- **Opening the link (same Chrome):** shows "Confirm it's you. This link is being opened on a new phone. We will send a 6-digit code by SMS to +91 ••••• ••378." Pressing **Send code** shows "We could not send the code just now. Please contact the school office."
  - No code was sent (nothing arrived and no credit was used), so the parent page (Sri, fees, attendance, notices) **cannot be opened on a new phone**.
- **Why:**
  - WhatsApp rejected the "Parent Link code" template (INCORRECT_CATEGORY).
  - SMS is not connected.
  - So `sendCode()` (src/lib/parent-link/links.ts) finds no channel that can carry the code.
- **Fix:** see Problem 1 below.

## Templates

- "Make 22 templates ready for WhatsApp": made new versions of the old School OS wording.
- "Send N templates to WhatsApp for approval": sent **32 language texts**.
- **Result:**
  - **28 approved** within about 25 minutes (the last one, Parent Link English, at about 16:32).
  - **4 rejected at once**, all with the reason **INCORRECT_CATEGORY**:
    - Admission consent code (English)
    - Parent Link code (English)
    - Staff invite (English)
    - Parent Link (Hindi)
  - Nothing is still pending (last checked 16:44).

## Results by message kind

| Kind | Template status | How triggered | School OS status | Arrived on 9390011378? | Problem and fix |
|---|---|---|---|---|---|
| general | Approved | Send Message > One person (Venkatesh) > General announcement | Sent | Yes, 4:19 PM "Dear Venkatesh, here is a message from chaitanya: This is a School OS test of the General…" | None |
| late | Approved | Send Message > One person > Arrived late | Sent | Yes, 4:21 PM "Dear Venkatesh, Sri Lakshmi of class 1 A reached school late today, 15-11-2026…" | Sunday, so no attendance flow; sent by hand |
| absence | Approved (en, hi, te) | Send Message > One person > Absent today | Sent | Yes, 4:26 PM "Dear Venkatesh, Sri Lakshmi of class 1 A is absent from school today…" | Sunday; sent by hand |
| homework-set | Approved | Send Message > One person > Homework set | Sent | Yes, 4:27 PM "Dear Venkatesh, new homework has been set for class 1 A:…" | The real flow messages a whole class, so sent by hand |
| consent-request | Approved | **Real flow:** guardian page > Send consent request (Venkatesh only). Needed a "Photos" consent text first (added in Settings > Data Backup & Security > Consent, "Asked on the admission form" unticked) | Sent | Yes, 4:32 PM "Dear Venkatesh, chaitanya asks for your consent: Photos of my child. Please open your Parent Link…" | Send Message cannot send it: the {title} blank shows "1 has no notice title" |
| parent-link | Approved (en, te); **Hindi rejected** | **Real flow:** guardian page > Send Parent Link | Sent | Yes, 4:33 PM "Dear Venkatesh, this is your personal Parent Link from chaitanya…" | The link cannot be opened (code step fails, Problem 1). Hindi text rejected (Problem 1) |
| ptm | Approved | Send Message > One person > PTM reminder | Sent | Yes, 4:36 PM "Dear Venkatesh, the parent-teacher meeting for class 1 A is on 15-11-2026…" | None |
| homework-pending | Approved | Send Message > One person > Homework pending | Sent | Yes, 4:36 PM "Dear Venkatesh, Sri Lakshmi has not yet submitted the homework due on…" | None |
| birthday-student | Approved (en, te) | Send Message > One person > Birthday wishes (student) | Sent | Yes, 4:37 PM "Happy birthday, Sri Lakshmi! Everyone at chaitanya wishes you…" | None |
| admission-welcome | Approved | Send Message > One person > Admission welcome | Sent | Yes, 4:38 PM "Dear Venkatesh, welcome to chaitanya! … admission number is C-CHE-001/2026/0033…" | The real flow needs a new admission; sent by hand |
| bus-pickup | Approved | Send Message > One person > Picked up by the bus | Sent | Yes, 4:39 PM "Dear Venkatesh, here is a bus update from chaitanya:…" | Transport is live in the nav; the automatic bus rules need driver trips, so sent by hand |
| bus-drop | Approved | Send Message > One person > Dropped by the bus | Sent | Yes, 4:39 PM, same wording | Same as bus-pickup |
| bus-arriving | Approved | Send Message > One person > Bus arriving | Sent | Yes, 4:40 PM, same wording | Same as bus-pickup |
| staff-message | Approved | Send Message > One person (aswini) > Message to staff | Sent | Yes, 4:41 PM "Dear aswini, here is a message from chaitanya:…" | None |
| birthday-staff | Approved | Send Message > One person (aswini) > Birthday wishes (staff) | Sent | Yes, 4:42 PM "Happy birthday, aswini! Thank you for all you do for chaitanya…" | None |
| query-number | Approved | **Real flow:** Feedback & Queries > Log a query (from Venkatesh, owner aswini) > Q-00002 | Sent | Yes, 4:43 PM "Dear Venkatesh, we have noted your query. Your ticket number is Q-00002…" | None |
| behaviour-note | Approved | **Real flow:** Behaviour & Counselling > Report incident (Sri, "Helping others", Inform parent) | Sent | Yes, 4:46 PM "Dear Venkatesh, this is to let you know about Sri Lakshmi of class 1 A: Helping others on 15-11-2026…" | **Bug:** Report incident fails with a bare "Required" while behaviour points are off (Problem 3). Worked after turning points on; turned off again afterwards |
| fee-paid | Approved | **Real flow:** Accountant (aksha) collected ₹100 cash for Sri (receipt C-CHE-001/2026-27/00011), then pressed "Send to parent again" | Sent | Yes, 4:49 PM "Dear Venkatesh, chaitanya has received ₹100 for Sri Lakshmi…" + **Open receipt** button (the receipt PDF opens correctly) | The automatic copy is held while the school is moving in ("No message was sent to the parents"); the button says "again" although nothing went the first time |
| fee-due | Approved (en, te) | **Real flow:** Accountant > Defaulters, search "Sri Lakshmi" > Send reminder to 1 (1 parent, 1 credit) | Sent | Yes, 4:49 PM "Dear Venkatesh, a fee of ₹19,900 for Sri Lakshmi of class 1 A is due on 14-11-2026…" | None |
| query-rating | Approved | **Real flow:** close Q-00002. The first close sent nothing because "Ask the requester to rate it" is off; switched it on, reopened, resolved and closed again, then switched it back off | Sent | Yes, 4:54 PM "Dear Venkatesh, your ticket Q-00002 is closed. How happy are you with our help?…" | Not a bug: the setting is off. The Resolve dialog says "sent to the requester", but resolving sends nothing (Problem 6) |
| appointment confirmation | **No template exists** (Front Office sends plain text) | **Real flow:** Receptionist (harikaa) booked aswini, Mon 16-11 11:00, visitor Venkatesh 9390011378, "Send confirmation" on | **Sent** (Delivered 0) | **NO.** Not arrived after 6+ minutes | **Bug** (Problem 2): plain WhatsApp text is refused by WhatsApp outside a 24-hour reply window, but School OS shows "Sent" |
| parent-link-code | **Rejected: INCORRECT_CATEGORY** | Opened the Parent Link and pressed Send code | Not sent: "We could not send the code just now" | No | Problem 1 |
| admission-consent-code | **Rejected: INCORRECT_CATEGORY** | Not triggered: same cause as parent-link-code | – | – | Problem 1 |
| staff-invite | **Rejected: INCORRECT_CATEGORY** | Not triggered: the template cannot carry | – | – | Problem 1 (its "choose your password" link reads to Meta as a login/authentication message) |
| exam-reminder | Approved | **Skipped** | – | – | The real flows (datesheet, exam reminder) message whole classes. Send Message cannot fill {exam_name}, so it could not be limited to 9390011378 |
| result | Approved | **Skipped** | – | – | Same: publishing results messages whole classes; {exam_name} cannot be filled in Send Message |
| notice | Approved | **Skipped** | – | – | The notice form targets only classes or sections, not one person. Send Message cannot fill {title} |
| salary-slip | No WhatsApp template (App notice only, by design) | Not tested | – | – | Not a WhatsApp kind |

## Credits

- **21 WhatsApp credits used** in this test (496 → 475).
- "Used this month" on Message Settings went from 20 before the last five sends to 25.
- Nothing is pending approval (last checked 16:44).

## Problems and fixes

1. **One-time codes and the staff invite are rejected (INCORRECT_CATEGORY)**, so Parent Link cannot be opened on a new phone.
   - `submitForApproval()` (src/lib/communication/templates-admin.ts:217) submits every template as `UTILITY`. Meta requires one-time codes in the **AUTHENTICATION** category, with its fixed OTP format:
     - body with `add_security_recommendation`
     - footer with `code_expiration_minutes`
     - an OTP `COPY_CODE` button
   - Fix for the codes: submit "Parent Link code" and "Admission consent code" as AUTHENTICATION in that format, and send the code as both the body parameter and the button parameter.
   - Fix for Staff invite (password link): reword it without login/password words, for example "Open this link to join School OS", or send it as AUTHENTICATION-style.
   - Fix for Parent Link (Hindi): reword it. It is short, has 3 blanks and says "do not share it" next to a personal link, which Meta read as authentication.
   - Interim workaround: connect SMS (DLT), which `sendCode()` tries first.
   - Also: the Parent Link page says "by SMS" even when SMS is off.
2. **Front Office WhatsApp messages are plain text.** This covers the appointment confirmation, reminder and cancellation, the visitor pass, the walk-in number, the pickup code and the gate pass.
   - `messageVisitor()` (src/lib/front-office/notify.ts) sends with no template (`version: null`).
   - WhatsApp drops free text unless the person messaged the school in the last 24 hours. The test confirmation never arrived, but School OS says "Sent".
   - Fix: add UTILITY templates for each Front Office message (the pickup code as AUTHENTICATION) and send through them.
3. **Report incident always fails with "Required" when behaviour points are off.**
   - `incidentSchema.points` is `z.string()` (src/app/(school)/student-management/_actions/behaviour.ts:37), but the Points field is only drawn when points are on (incident-form.tsx:50).
   - Fix: `points: z.string().optional().default("")`. Also make the form name the missing field instead of a bare "Required".
4. **Delivered and Read never update for WhatsApp.** Every WhatsApp row stays "Sent" with Delivered 0, including messages read on the phone.
   - The shared Meta app's webhook points at the gym's site, so School OS gets no delivery statuses. This is also why the failed appointment message still says "Sent".
   - Not touched, per the rule. The owner decides whether School OS gets its own WhatsApp number or app.
5. **Rejected texts are shown as "The school wrote them".** The box above the list reads "Change these before sending. The school wrote them, so School OS does not replace them." for School OS's own texts that WhatsApp rejected.
   - The reason (INCORRECT_CATEGORY) appears only after the 15-minute background sync. "Check approval status" (`refreshApproval`) looks only at Pending texts, never Rejected ones.
6. **Small wording problems:**
   - The Resolve dialog says "Kept on the ticket and sent to the requester", but resolving sends nothing.
   - The receipt dialog's "Send to parent again" appears when nothing was sent the first time.
   - In Send Message, the Consent request / New notice / Behaviour note templates are offered, but they can never be sent there ("1 has no notice title").
7. **Risk, not tested:** `outgoingFor()` (src/lib/messaging/deliver.ts:68) sends plain text when the parent's language version is not approved. A Hindi-language parent would therefore get the Parent Link as plain text, which WhatsApp drops while the Hindi text is rejected. Suggest falling back to the approved English version.
8. **Security, not School OS:** while searching WhatsApp Web for the school's number, the search results also showed an older chat (23-10-2026) holding the WhatsApp access token and a Firebase service-account private key in plain text. Suggest rotating both and deleting the message.

## Test changes left on the test school

- Consent text "Photos of my child" v1 (not on the admission form).
- Consent request to Venkatesh.
- Q-00002 (closed).
- Behaviour record "Helping others" for Sri (+2 points).
- ₹100 cash receipt C-CHE-001/2026-27/00011 for Sri.
- Appointment with aswini, Mon 16-11 11:00.
- Parent Link for Venkatesh (active).

Behaviour points and the query rating were switched back off.

## Lead's follow-up list (15 Nov)
- Code templates as AUTHENTICATION + "on WhatsApp" wording: helper running.
- Parent Link inside every message that mentions it (consent, exam reminder, results), with versioned Meta names: helper running.
- Front Office messages (appointment confirmation/reminder/cancellation, visitor pass, walk-in number, pickup code, gate pass) need approved templates: in the rich-message redesign batch.
- Message Templates page: rejected School OS texts labelled wrongly; "Check approval status" should also refresh rejected ones and show the reason.
- deliver.ts: when the parent's language version is not approved, send the approved English version, never plain text.
- Wording: "Send to parent again" when nothing was sent; Resolve dialog says "sent to the requester".
- Delivery status: say "Sent to WhatsApp (delivery reports not connected)" (owner: leave the gym webhook).
- Behaviour incident with points off: fixed (points optional).
