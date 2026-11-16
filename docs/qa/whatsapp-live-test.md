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

## Deploy 9 cards (15-16 Nov)

Live site https://school-os-beta.vercel.app, test school "chaitanya", deploy 9 (main 88af496f). Tested by Claude, 15-11 23:58 to 16-11 00:12 IST.

**Result: blocked. WhatsApp refused 40 of the 41 new card texts at submission ("Invalid parameter"), so no rich card could be sent.**

### What happened
- School Admin > Message Templates > **Make 24 templates ready for WhatsApp**: done, 24 new card versions made.
- **Send 33 templates to WhatsApp for approval** (it then sent 41 language texts): **1 approved, 40 refused at once**, each "WhatsApp said: Invalid parameter". Nothing went to Pending, so there was nothing to re-check every 10 minutes.
  - Approved: **Pickup code (English)**, the AUTHENTICATION code template, which has no header, footer or emoji.
  - Refused: every card. That is Admission welcome, Absent today (en, hi, te), Arrived late, PTM reminder, Exam reminder, Results published, Fee received, Fee reminder (en, te), Appointment cancelled / confirmation / reminder, Pickup gate pass, Visitor pass, Walk-in request number, Behaviour note, Birthday wishes student (en, te) and staff, General announcement, New notice, WhatsApp connection test, Homework pending, Homework set, Consent request, Parent Link (en, hi, te), Query rating request, Query received, Message to staff, Salary slip ready (en, hi, te), Staff invite, Bus arriving, Dropped by the bus, Picked up by the bus.
- **Cause, found by elimination:** a custom test template "QA emoji body test" was made with the same body style (emoji labels, `*{blank}*` bold, blank lines) and **no header, footer or buttons**. WhatsApp accepted it (Pending, name `qa_emoji_body_test_ade03e`). The bodies are therefore fine. The common factor of all 40 refusals is the card's **text header, which always starts with an emoji** (🔔 ⏰ 💳 ✅ 📢 🎂 …) plus the footer. WhatsApp does not support emojis in a text header. Meta's page says only "no Markdown", but WhatsApp Manager and the vendor docs say no emojis. Cards without buttons were refused too, so the buttons are not the cause.

### Results by kind

| Kind | Template status (+ Meta reason) | How sent | Arrived (time) | What the card showed | Problem |
|---|---|---|---|---|---|
| Fee received | Refused at submission: Invalid parameter | Not sent | – | – | Card cannot be approved (header emoji). The receipt PDF header could not be tested |
| Fee reminder (en, te) | Refused: Invalid parameter | Not sent | – | – | Same |
| Absent today (en, hi, te) | Refused: Invalid parameter | Not sent | – | – | Same |
| Arrived late | Refused: Invalid parameter | Not sent | – | – | Same |
| Homework set | Refused: Invalid parameter | Not sent | – | – | Same |
| Results published | Refused: Invalid parameter | Not sent | – | – | Same |
| New notice | Refused: Invalid parameter | Not sent | – | – | Same |
| Consent request | Refused: Invalid parameter | Not sent | – | – | Same |
| Parent Link (en, hi, te) | Refused: Invalid parameter | Not sent | – | – | Same |
| PTM reminder | Refused: Invalid parameter | Not sent | – | – | Same |
| Birthday wishes (student en, te; staff) | Refused: Invalid parameter | Not sent | – | – | Same |
| Admission welcome | Refused: Invalid parameter | Not sent | – | – | Same |
| **General announcement** | v3 card refused; **old v2 still approved** | Send Message > One person (Venkatesh) > General announcement, 1 credit, 16-11 00:02 | **Yes, 12:02 AM** | The OLD plain text: "Dear Venkatesh, here is a message from chaitanya: School OS test: … Please contact the school office if you have any questions." No header, footer or button | Not a card. It shows the approved-text fallback works: parents still get messages while the new versions are refused |
| Message to staff | Refused: Invalid parameter | Not sent | – | – | Same |
| Staff invite | Refused: Invalid parameter | Not sent | – | – | Same |
| Appointment confirmation (Front Office) | Refused: Invalid parameter | Not sent | – | – | Same; Front Office still has no approved template |
| WhatsApp connection test | Refused: Invalid parameter | Not tried | – | – | Same |
| Pickup code | **Approved** (AUTHENTICATION) | Not sent (not on the list) | – | – | None |

Screenshot: `qa/whatsapp-cards/deploy9-fallback-general-0002.png` (the 12:02 AM fallback message). No card screenshots exist, because no card could be approved.

### Credits
**1 WhatsApp credit** used (475 → 474). Template submissions cost nothing.

### School OS bugs found
1. **Card headers with an emoji are refused by WhatsApp** (all 40 cards).
   - To reproduce: Message Templates > Make N templates ready > Send N templates for approval. Every card shows "WhatsApp said: Invalid parameter".
   - Fix: take the emoji out of every `header` in `src/lib/messaging/ready-whatsapp.ts`, or strip `\p{Extended_Pictographic}` and variation selectors from `card.header.text` in `cardSubmission()` (`src/lib/messaging/card.ts`).
   - Also add "The header cannot have an emoji" to `cardProblems()`, so it is caught before sending, and add a test.
   - The emoji can stay in the WhatsApp preview only if WhatsApp gets the same words, so better to drop it everywhere.
   - Then "Make ready" again (new `_vN` names) and resubmit.
2. **Meta's real reason is hidden.**
   - `submitWhatsappTemplate()` (`src/lib/messaging/providers/whatsapp.ts:254`) shows only `error.message` ("Invalid parameter").
   - Meta puts the useful words in `error.error_user_title`, `error.error_user_msg` and `error.error_data.details`. Show those, and add them to the `GraphError` type (line 32).
3. **The page shows the new words, but the old ones go.** In Send Message the template box says "Template, version 3" and shows the new card words, while the preview and the delivered message use approved v2. Suggest a line under the box: "WhatsApp has not approved these words yet; the last approved words go meanwhile."
4. **Small:** the custom-template preview shows `*Ravi Kumar*` with the asterisks instead of in bold.

### Test changes left on the test school
- 24 new card versions (current, "Not submitted", refused). The old approved versions keep going.
- Custom template "QA emoji body test" (Pending on WhatsApp, `qa_emoji_body_test_ade03e`). Archive it after the fix.
- One General announcement to Venkatesh (16-11 00:02).

## Deploy 10 cards (16 Nov)

Deploy 10 (main 7840694d), live 00:39. Tested by Claude, 00:42 to 01:12 IST. Every message went to 9390011378 only: parent Venkatesh, and teacher aswini for the staff message. Arrivals were checked in WhatsApp Web, in the chat from +91 79896 17553 only (opened directly by its link; no search, no other chat opened).

### Approval
- "Send 32 templates to WhatsApp for approval" sent **40 texts**. All were accepted for review: no "Invalid parameter" any more, so the deploy 10 fix works.
  - **36 approved** within about 25 minutes. Fee received was approved first, at about 00:52.
  - Consent request was the last, approved by about 01:08.
  - The page then showed **Approved: 40 · Waiting: 1**, and that one was approved soon after.
- **4 rejected at once, all INCORRECT_CATEGORY.** At first the page said "WhatsApp rejected this text and gave no reason". After the background sync it showed "WhatsApp says the words do not fit the message type (a code, account or sign-in message is not a Utility message) (INCORRECT_CATEGORY)".
  - **Admission welcome**. Probably "Please keep this number safe" next to the admission number reads as an account message.
  - **Pickup gate pass**. Probably "here is the gate pass … show this message at the gate".
  - **Visitor pass**. Probably the same pass wording.
  - **Staff invite**. Rejected again.
- The page offers "Edit" for each rejected text, and the template page offers "Send for WhatsApp approval" again. So there is a re-send path; the words must change first.

### Results by kind

| Kind | Template status (+ Meta reason) | How sent | Arrived (time) | What the card showed | Problem |
|---|---|---|---|---|---|
| Fee received | Approved (v3) | **Real flow:** Accountant aksha collected ₹100 cash for Sri (receipt C-CHE-001/2026-27/00012), then pressed "Send to parent again" | Yes, 12:52 AM | Header "Fee received" (**text, not the PDF**). Bold: Sri Lakshmi, ₹100, **Paid by: Cash**, Paid on 16-11-2026, receipt no., **Still due: ₹19,800**. Footer "chaitanya · School OS". **Open receipt** button opens the right receipt PDF (00012, parent copy) | **No receipt PDF header** (bug A). "Send to parent again" when nothing was sent before (known) |
| Fee reminder | Approved (v3, en + te) | **Real flow:** Accountant > Defaulters > "Sri Lakshmi" > Send reminder to 1 (1 parent, 1 credit) | Yes, 12:56 AM | Header "Fee reminder", ₹19,800, due 14-11-2026, **"How to pay: Please pay at the school office."**, Call school button | None. The dialog's preview shows `*…*` stars instead of bold (small) |
| Absent today | Approved (v3, en/hi/te) | Send Message > One person > Venkatesh | Yes, 12:57 AM | Header "Absent today", bold child and date, **Call school** button | None (the Call button was not pressed) |
| Arrived late | Approved (v3) | Send Message > One person | Yes, 12:58 AM | Header "Arrived late", **Call school** button | None |
| PTM reminder | Approved (v3) | Send Message > One person | Yes, 12:58 AM | Header "Parent-teacher meeting", class 1 A, date, **Open Parent Link** button. It opens Venkatesh's own link (`/p/…`, "code on WhatsApp to ••378") | None |
| Birthday wishes (student) | Approved (Marketing) | Send Message > One person | Yes, 12:59 AM | Header "Happy birthday!", "Dear Sri Lakshmi…", WhatsApp's ⓘ marketing marker | None |
| Homework set | Approved (v3) | Send Message > One person, homework typed in "Message for the other channels" | Yes, 1:00 AM | Header "New homework", class 1 A, the homework line, **See homework** button | None |
| General announcement | Approved (v3) | Send Message > One person | Yes, 1:01 AM | Header "Message from school", the typed line, **Call school** button | None |
| Parent Link code (one-time code) | Approved (v2, AUTHENTICATION) | Opened the PTM card's Open Parent Link, then pressed **Send code**. The page said "We sent a 6-digit code on WhatsApp" | **NO.** Not arrived after 10 minutes | – | **Bug B.** History says "Sent to WhatsApp", but nothing came. The code was not typed |
| Message to staff | Approved (v3) | Send Message > One person > aswini | Yes, 1:04 AM | Header "Message from school", "Dear aswini…", the typed line, no button | None |
| Parent Link | Approved (v3, en/hi/te) | **Real flow:** Venkatesh's guardian page > Resend Parent Link | Yes, 1:05 AM | Header "Your Parent Link", 🔒 line, **Open Parent Link** button | None |
| Appointment confirmation (Front Office) | Approved (v1) | **Real flow:** Receptionist harikaa booked aswini, Tue 17-11 10:00, visitor Venkatesh 9390011378 (the page matched the number to Ramesh Reddy), "Send confirmation" on | Yes, 1:06 AM | Header "Appointment confirmed", "with aswini at chaitanya on Tue, 17-11-2026, 10:00 AM for 15 minutes", **Call school** button | None. Last run's problem 2 (plain text never arrived) is fixed |
| Consent request | Approved (v4) | **Real flow:** Venkatesh's guardian page > Send consent request | Yes, 1:09 AM | Header "Consent needed", **Photos of my child** in bold, **Read and answer** button (the link) | None |
| New notice | Approved (v4) | Tried Send Message > One person with a Title | Not sent | – | **"1 has no notice title"**: the Title field does not fill `{title}`, so it cannot go to one person (known problem 6). The real flow messages whole classes |
| Results published | Approved (v4) | Not sent | – | – | The real flow messages a whole class; Send Message cannot fill `{exam_name}` |
| Admission welcome | **Rejected: INCORRECT_CATEGORY** | Not sent | – | – | Reword it |
| Staff invite | **Rejected: INCORRECT_CATEGORY** | Not sent | – | – | Reword it |
| Visitor pass, Pickup gate pass | **Rejected: INCORRECT_CATEGORY** | Not sent | – | – | Reword them |
| WhatsApp test (Settings) | Connection test approved | Not sent | – | – | The school's Settings has no test button. Only the DREAM TEAM console (`console/schools/[id]/connections`) has one |

Screenshots (in `qa/whatsapp-cards/`):
- `deploy10-fee-received.png`
- `deploy10-fee-reminder-absent.png`
- `deploy10-homework-general.png`
- `deploy10-parent-link-appointment.png`
- `deploy10-consent.png`

### Credits
- **13 WhatsApp credits** used in this run (474 → 461), plus 1 in the deploy 9 run.
- All of them went to 9390011378.

### Bugs found
- **A. Fee received has a text header, not the receipt PDF.**
  - At submission, `uploadTemplateSample()` (`src/lib/messaging/providers/whatsapp.ts:214`) evidently got no sample handle. `cardSubmission()` then falls back to the text header "Fee received" (card.ts:225), and the message goes without the PDF.
  - Likely cause: `WHATSAPP_APP_ID` is not set on Vercel, and the access token cannot read `/app`.
  - Fix: set `WHATSAPP_APP_ID`. Then make a new Fee received version and resubmit; Meta needs a new version for a different header type.
  - Also log or show when the sample upload fails, instead of falling back quietly.
- **B. The Parent Link one-time code never arrives.**
  - The Authentication template is approved, and Meta took the message (it has an id, status "Sent to WhatsApp"), but nothing reached the phone in 10 minutes.
  - Without delivery reports (the webhook points at the gym's site) the reason cannot be seen.
  - Suggest: read the message status once by its id, or connect delivery reports. Also check the auth send against Meta's format (body parameter plus button `sub_type: "url"`, index 0 with the code).
  - Parent Link still cannot be opened on a new phone.
- **C. Four texts rejected as INCORRECT_CATEGORY:** Admission welcome, Visitor pass, Pickup gate pass, Staff invite. Reword them without "keep this number safe", "pass" or "show at the gate" style words.
- **D. A rejected text's reason only shows after the background sync.** At first the page shows "gave no reason"; "Check approval status" right after sending also said "no reason given".
- **E. Small UI problems:**
  - Message History lists template sends without a title as raw words, for example "Dear {guardian_name}, your child is marked absent at school".
  - The fee reminder dialog's preview shows `*…*` stars instead of bold.
  - Send Message keeps the last typed message and title as a draft but returns to "Whole school · 8 parents". A careless second send would go to the whole school with the old test words.

### Test changes left on the test school
- ₹100 cash receipt C-CHE-001/2026-27/00012 for Sri.
- Appointment with aswini, Tue 17-11 10:00 (visitor Venkatesh).
- A second consent request to Venkatesh.
- The Parent Link was resent (it stays active).
- The "QA emoji body test" template is **archived** (01:09).

## Deploy 11 (16 Nov)

Deploy 11 (main cb44ec80), tested by Claude, 02:52 to 03:20 IST. Messages went to 9390011378 only. WhatsApp Web showed only the chat from +91 79896 17553.

### A. Templates
- **"Make N templates ready" was not offered.** The page showed the 4 rejected texts under "Change these before sending. The school wrote or changed them, so School OS does not replace them."
  - **Bug:** the deploy 10 card words of these 4 were not added to `PAST_READY_WHATSAPP` (`src/lib/messaging/ready-history.ts`). The school's rejected v3 is therefore taken as school-written, and the reworded deploy 11 words are never offered.
  - Visitor pass and Pickup gate pass had never been in the history at all.
- **Workaround used:** the page's own path, Edit, then Send for WhatsApp approval. I typed the exact new `ready-whatsapp.ts` words into each.
  - Afterwards the page did list them as "School OS texts".
  - The card header stayed the old one (for example "Welcome to school", not "Admission confirmed"), because Edit keeps the saved card.

| Text | Result | Meta's reason |
|---|---|---|
| Admission welcome v4 | **Rejected at once** (02:53) | Not shown. Toast: "WhatsApp rejected this text. English: no reason given." Still "gave no reason" at 03:20 |
| Staff invite v4 | **Pending** (02:54). Still pending at 03:20 ("No change yet. WhatsApp usually answers within a day.") | – |
| Visitor pass v2 | **Rejected at once** (02:54) | "no reason given" (same as above) |
| Pickup gate pass v2 | **Rejected at once** (02:55) | "no reason given" |
| Fee received | **Could not be resent.** Edit shows "Approved by WhatsApp and locked. Make a new template to change the wording.", so no tiny word change is possible | No "Sent without the receipt PDF" note on the page, because this version was submitted before deploy 11. The page's preview still shows "Receipt PDF · The parent's own receipt, attached", although the approved template has a text header (misleading) |

- **Fix 4 is not seen working:** for an instant rejection, Meta's reason is not shown straight away, nor after "Check approval status", nor after 25 minutes.
  - Deploy 10 showed INCORRECT_CATEGORY after the sync.
  - Perhaps Meta's create response holds no reason and `rejected_reason` stays NONE for these.

### B. Parent Link tap, same browser (WhatsApp Chrome)
- I opened the 1:05 "Your Parent Link" card's button, which goes to the plain `/p/<token>`.
  - It showed "Confirm it's you … we will send your Parent Link to your WhatsApp (+91 ••••• ••378)" with a **Send to my WhatsApp** button.
  - I pressed it. The page said "We sent your Parent Link to your WhatsApp …".
- A new **"Your Parent Link" card arrived at 2:57 AM**.
- Its Open Parent Link goes to `/p/<token>.<secret>`. It showed **"Open your Parent Link on this phone"** and **no warning** (as expected).
- I tapped **Open my Parent Link**. Parent Link opened: "Namaste, Venkatesh", Sri Lakshmi, fees due ₹19,800, paid ₹200, receipts 00012 and 00011, exam datesheet, consent forms.
- **390 px screenshots could not be made.** `resize_window` reports success, but the Chrome window stays 1536 px wide (it is maximized). Only desktop-width shots exist.

### C. Parent Link tap, other browser
- In the Accountant Chrome I opened a fresh tab on the plain link. It showed the same "Confirm it's you" page; I pressed Send to my WhatsApp.
- A new card arrived at **2:59 AM**. I tapped its button in the WhatsApp Chrome.
- The page showed the **warning**: "A Windows computer, Chrome asked to open your Parent Link 0 min ago. **Tap only if that was you, on this phone. If someone asked you to send them this message, do not tap and do not forward it.**"
- **Not confirmed.** I closed the tab, so the accountant browser never became a confirmed device.

### D. Consent tap
- On the confirmed Parent Link > Consent forms > Photos of my child > **Give consent** (Sri Lakshmi ticked).
  - The step still says **"A one-time code goes to +91 ••••• ••378 to confirm it is you."** with a **"Send code"** button. This wording is outdated: no code is sent any more.
  - I pressed it. The page said "You are saying yes for "Photos of my child". To confirm, open the new message we sent to your WhatsApp (+91 ••••• ••378) and tap Open Parent Link."
- A card arrived at **2:58 AM**. It is a plain **"Your Parent Link"** card that does not mention the consent; a parent may not see that this message is for confirming their answer.
- Its button opened **"Confirm your answer. You are saying yes for "Photos of my child". Tap Confirm to record it."** I pressed Confirm.
  - The page said "Thank you. Your consent for "Photos of my child" is recorded."
  - The Parent Link then showed **Consent given · Sri Lakshmi · given 16-11-2026**, with a "Remove consent" button.

### E. Resending reworded cards
- Nothing was resent. Three of the four were rejected again; Staff invite is still pending.

### Screenshots
All in `qa/whatsapp-cards/`, desktop width (1536 px). The files are JPEGs, so they are saved as `.jpg`.
- `deploy11-confirm-same-browser-1440.jpg`
- `deploy11-parent-link-opened-1440.jpg`
- `deploy11-confirm-other-browser-warning-1440.jpg`
- `deploy11-consent-given-1440.jpg`

### Credits
- **3 WhatsApp credits** (Parent Link cards at 2:57, 2:58 and 2:59), all to 9390011378.

### Test changes left on the test school
- Admission welcome v4, Staff invite v4, Visitor pass v2 and Pickup gate pass v2: new versions with the deploy 11 words.
- The WhatsApp Chrome is now a confirmed device for Venkatesh's Parent Link.
- Photos consent for Sri Lakshmi is **given**.

## Deploy 12 (16 Nov)

Deploy 12 (main 4b252769). Tested by Claude, 04:21 to 04:50 IST (School OS clock). Messages went to 9390011378 only. WhatsApp Web showed only the chat from +91 79896 17553.

### Templates
- **"Make 4 templates ready for WhatsApp"** offered "Admission welcome, Fee received, Pickup gate pass, Visitor pass". Bug 1 is fixed.
  - Only English: this school has no hi/te versions of these four.
  - Staff invite was not offered: it was still pending.
- **"Send 4 templates to WhatsApp for approval"** (04:21): all four "Sent. Waiting for WhatsApp's answer." None was refused at once.
- **All approved.** Pressing "Check approval status" on each template page (about 04:46) showed "WhatsApp approved" for Admission welcome v5, Fee received v4, Pickup gate pass v3, Visitor pass v3, **and Staff invite v4**.
  - No refusal happened, so the new "filed as" wording could not be seen.
  - **Bug:** the Message Templates list still showed all five as **Pending** at 04:58, while Meta had already approved them. Each flipped only when its own "Check approval status" was pressed; the background sync had not caught up.
  - The "Getting WhatsApp messages approved" box (with "Approved: N · Waiting: N") also disappeared from the page while five texts were pending.
- **Fee received: the receipt PDF still does not go on top.**
  - The template page shows no note. The preview header is the text "Fee received", which is honest now (deploy 11 claimed "Receipt PDF … attached").
  - The note exists only in the **Audit log** (Settings > Data Backup & Security > Audit log), word for word: **`Template "Fee received" (en) sent for WhatsApp approval: Pending. Sent without the receipt PDF on top: WhatsApp did not open the upload.`**
  - **Bug, page:** `[id]/page.tsx` shows `whatsappNote` only in the "rejected" banner. A pending or approved card sent without its PDF shows nothing.
  - **Likely root cause:** the message has no "(…)" after it, so Meta answered the upload-session POST with 200. The failing check is then `/^upload:[A-Za-z0-9_=:-]+$/` (`providers/whatsapp.ts:239`). Meta's upload session ids look like `upload:<base64>?sig=<…>`, and `?` (and possibly `+` or `/`) is not allowed by that pattern, so a good session is thrown away. Suggest allowing `?`, `&`, `+`, `/` (for example `^upload:\S+$`) and keeping the id as is for the second POST.

### Sends (real flows)

| Kind | Template | How sent | Arrived | What the card showed | Problem |
|---|---|---|---|---|---|
| Fee received | Approved (v4, text header) | Accountant collected **₹1 cash** for Sri (C-CHE-001/2026-27/00013), then "Send to parent again" | 4:47 AM | Header "Fee received" (text, **no PDF on top**), ₹1, Paid by: Cash, Receipt 00013, Still due ₹19,799, Open receipt button | No PDF (cause above). Still says "Send to parent again" when nothing was sent first |
| Visitor pass | Approved (v3, "Visit registered") | Admin > Front Office > Visitors > Add visitor 9390011378 (returning visitor **Ramesh Reddy**, meets anjali) > Register and make pass V-0009 > **Send to phone** | 4:48 AM | "Visit registered", "Dear Ramesh Reddy, your visit to the school today is registered at the front desk.", "🗂️ Visit V-0009, until 1:00 PM", "For any help, please ask at the front desk.", footer | None. The visitor was checked out afterwards (04:50) |
| Pickup gate pass | Approved (v3, "Pickup noted") | Admin > Student Pickup > Sri > Venkatesh > "A parent or guardian confirmed on a call" > Other ("School OS WhatsApp test") > **Release Sri and make gate pass** GP-2026-0002 > **Send to phone** | 4:49 AM | "Pickup noted", "Dear Venkatesh, the school has noted that Sri leaves with you at 4:48 AM today.", "🗂️ School record GP-2026-0002", "If you did not ask for this, please call the school." | Small: WhatsApp turns "2026-0002" into a phone link (green) |
| Admission welcome | Approved (v5) | Not sent (needs a real admission) | – | – | – |
| Staff invite | Approved (v4) | Not sent (aswini already has a login) | – | – | – |

### Pickup code (Front Office)
- "Pickup code check" is off on this school. I switched it on for the test (Admin > Front Office settings), opened Student Pickup > Sri > Venkatesh, and pressed **Send code**.
- The desk sees, word for word: **"The code could not be sent: WhatsApp does not deliver one-time codes to Indian (+91) numbers, so no code can be sent. Verify by calling the guardian instead."**
- No message went out.
- **Bug:** with the setting on, release is still blocked. After ticking "A parent or guardian confirmed on a call" and a reason, the button says **"Send the code first"** and stays disabled, so no child can be released.
  - Suggest: while codes cannot be sent, let the call check count, or hide or disable the "Pickup code check" switch with the same reason.
- I switched the setting back **off** (checked).

### Consent step wording
- On the confirmed Parent Link (WhatsApp Chrome), Consent forms > Photos of my child > **Remove consent** (cancelled, nothing sent).
- The step now says **"We send a message to +91 ••••• ••378 to confirm it is you."**, with a **"Send to confirm"** button. Fix 5 is OK.

### Screenshots
All in `qa/whatsapp-cards/`. Some are PNG data saved under `.jpg` as asked.
- `deploy12-fee-received.jpg`
- `deploy12-visit-registered.jpg`
- `deploy12-pickup-noted.jpg`
- `deploy12-pickup-code-desk.jpg`
- `deploy12-consent-step-wording.jpg`

### Credits
- **3 WhatsApp credits** (Fee received, Visit registered, Pickup noted), all to 9390011378.

### Also noticed
- The audit log calls each Parent Link card send "Code sent · Parent Link" and "One time code sent · Message". These are cards now, not codes.

### Test changes left on the test school
- ₹1 cash receipt C-CHE-001/2026-27/00013 for Sri.
- Visitor V-0009 (Ramesh Reddy), checked out.
- Early pickup GP-2026-0002 (Sri with Venkatesh, 4:48 AM, "Other: School OS WhatsApp test").
- New approved versions: Admission welcome v5, Fee received v4, Pickup gate pass v3, Visitor pass v3. Staff invite v4 is approved.
- "Pickup code check" was switched on and off again.

## Deploy 13 (16 Nov)

Deploy 13 (main 4288893e). Tested by Claude, 05:18 to 05:30 IST (School OS clock). Messages went to 9390011378 only.

| Check | Result |
|---|---|
| Make ready | Offered "Make 1 template ready for WhatsApp": **Fee received**. Pressed it, then "Send 1 template to WhatsApp for approval": "Sent. Waiting for WhatsApp's answer." (v5, 05:18) |
| Fee received page | **No "The receipt PDF is not on this card." note.** The preview header is "Receipt PDF · The parent's own receipt, attached". The sample PDF upload worked |
| List refresh | Opening Message Templates showed "Approved: 43 · Waiting for WhatsApp: 1". A few minutes later, **without pressing Check approval status**, opening the list showed **Fee received: Approved v5**, and the approval box had gone (nothing waiting). The list now updates on its own |
| Fee received send | Accountant aksha collected **₹1 cash** for Sri (C-CHE-001/2026-27/00014, 5:28 AM), then "Send to parent again" |
| Arrived | **Yes, 5:28 AM, with the receipt PDF ON TOP**: `receipt-C-CHE-001-2026-27-00014.pdf` as the document header, then "Dear Venkatesh, thank you. We have received your payment.", Sri Lakshmi of class 1 A, Amount ₹1, Paid by: Cash, Paid on 16-11-2026, Receipt no. 00014, Still due ₹19,798, footer "chaitanya · School OS", **Open receipt** button |
| Pickup code check | Switched on briefly. Student Pickup > Sri shows the blue note, word for word: **"Pickup code check is on, but WhatsApp does not deliver one-time codes to Indian (+91) numbers, so no code can be sent. Check the photo, ID proof or call a guardian instead."** With Venkatesh, "A parent or guardian confirmed on a call" and reason "Doctor visit", the button **"Release Sri and make gate pass" became active**. It was not pressed. The setting was switched back **off** (checked) |

Small note: the Release button is offered although Sri already has an open early pickup today (GP-2026-0002, "Waiting at the gate"), so a second release for the same child could be made.

Screenshots:
- `qa/whatsapp-cards/deploy13-fee-received-pdf.jpg` (PNG data)
- `qa/whatsapp-cards/deploy13-pickup-call-check-active.jpg`

Credits: **1** (Fee received).

Left on the test school: ₹1 cash receipt C-CHE-001/2026-27/00014 for Sri; Fee received v5 approved, with the PDF header.

## Deploy 15 pickup approval (16 Nov)

Deploy 15 live. Tested by Claude, about 13:00 to 13:22 IST. First round (no message sent) below, then the second round that completed the test.

| Step | Result |
|---|---|
| 1. Template | Message Templates offered **"Send 1 template to WhatsApp for approval"** (no "Make ready" step needed). Pressed at 13:01. It sent 3 (English, Hindi, Telugu): "Pickup request (English/Hindi/Telugu): Sent. Waiting for WhatsApp's answer." At the next look (about 13:12) **Pickup request: Approved v1, English, Hindi, Telugu**, and the approval box was gone |
| 2. Desk | "Pickup code check" was **off**. Switched it on (Admin > Front Office settings, saved). As Receptionist harikaa, Student Pickup > Sri Lakshmi shows only: **"Sri already has gate pass GP-2026-0002 waiting at the gate."** No guardian list and no "Ask Venkatesh to approve on WhatsApp" button. That pass is the 4:48 AM test pass (Venkatesh, released by Saiveni, never checked at the gate); it blocks a new pickup for Sri until midnight |
| 3 to 4 | **Not done: blocked by step 2.** The only way on is "Check gate pass > GP-2026-0002 > Let them out", which closes that old pass for good and writes a gate log line. Not pressed: it was not in the brief |
| 5. Setting | Switched "Pickup code check" back **off**, saved, re-opened: off |

Small notes:
- The button said "Send **1** template" but sent 3 (one per language), shown as "Sending 1 of 3…".
- The "Pickup code check" switch still says "A code to the guardian's mobile before release", but with this deploy it means "the guardian approves on WhatsApp".

### Second round (13:15 to 13:22 IST), after the coordinator's go-ahead

| Step | Result |
|---|---|
| Ramesh Reddy | His child is **Aarav Reddy, 1 A** (C-CHE-001/2026/0003). Aarav's profile lists Ramesh as "Father · Parent Link", "May pick up", and on the Pickup list. Switched Pickup code check **on**. At the desk, Ramesh shows only: **"Ramesh has no Parent Link, so approval cannot be asked on WhatsApp. Check the photo, ID proof or call a guardian instead."** No Ask button, so I used the fallback |
| Old pass | Check gate pass > GP-2026-0002 > **Let them out**: "Already used at 1:17 PM." Sri's pickup form then opened |
| 2. Ask | Sri > Venkatesh > "Approval on WhatsApp: Switched on by the school. Sent to Venkatesh's own WhatsApp." > **Ask Venkatesh to approve on WhatsApp**: "Waiting for Venkatesh to tap Approve on WhatsApp…" (1:17 PM) |
| 3. Card | **Arrived 1:17 PM** in the chat from the school number: header "Pickup request", "Dear Venkatesh, Venkatesh is at the school front desk to take **Sri Lakshmi** home now. If you agree, tap the button below. If you do not know about this, please call the school.", footer "chaitanya · School OS", button **Open Parent Link** |
| 3. Approve page | The button opened Parent Link: **"Approve: Venkatesh takes Sri home now?"**, "The front desk is asking. Tap Approve only if you know about this.", buttons Approve and "No, call the school", "Only you can see this page". Tapped **Approve**: "Thank you. The front desk can now let Venkatesh take Sri home." with "Open your Parent Link" |
| 4. Desk | The desk tab updated by itself, with no reload: **"Approved by Venkatesh on WhatsApp at 1:19 PM"** (green). The button still said "Check ID proof or call first" (Venkatesh has no photo). After ticking "ID proof shows Venkatesh" and the reason "Doctor visit", **"Release Sri and make gate pass" became active**. **Not pressed**; tab closed without saving |
| 5. Setting | Pickup code check switched back **off**, saved, re-opened: off |

Things to look at:
- **Ramesh's Parent Link**: his profile says "Father · Parent Link", but the desk says "Ramesh has no Parent Link". Either his link is not active (invited, never opened) and the profile badge reads too strongly, or the desk check is wrong.
- **Card wording when the guardian is the person collecting**: "Dear Venkatesh, Venkatesh is at the school front desk…" reads oddly. Suggest "you are at the school front desk" when they are the same person.
- The approval shows 1:19 PM, 2 minutes after the ask; that was my own delay, not the app's.

Screenshots (`qa/whatsapp-cards/`):
- `deploy15-pickup-card.jpg`: the WhatsApp card
- `deploy15-pickup-approve-page.jpg`: the Parent Link approve page
- `deploy15-pickup-approved-thanks.jpg`: after Approve
- `deploy15-pickup-desk-approved.jpg`: the desk, approved, with Release active (not pressed)
- `deploy15-pickup-ramesh-no-link.jpg`: Ramesh, "no Parent Link"

Credits: **1** (one Pickup request card; template submission is free).

Left on the test school: GP-2026-0002 marked used (left at 1:17 PM, with a gate log line); one approved pickup request for Sri (Venkatesh, 1:19 PM), never used for a release; Pickup request v1 approved in English, Hindi and Telugu; Pickup code check off.
