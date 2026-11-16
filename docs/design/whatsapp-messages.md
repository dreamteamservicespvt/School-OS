# WhatsApp messages: card design (proposal, 15 Nov 2026)

Status: **design only, no code changed.** Visual preview: `whatsapp-preview.html` (sent to the owner separately).

The problem: parents get one grey paragraph ("Dear Venkatesh, here is a bus update from chaitanya: ... This message was sent automatically by the school transport team."). Nothing stands out, links show as long raw addresses, and the school's name is buried in the middle of a sentence.

The fix uses what WhatsApp Business templates already offer. Every message becomes a small card:

```
┌───────────────────────────────┐
│ ✅ Fee received               │  HEADER: one emoji and 2 to 4 words (WhatsApp shows it bold)
│                               │
│ Dear Venkatesh, thank you.    │  BODY: one friendly line,
│ We have received your payment.│
│                               │
│ 👤 Sri Lakshmi of Class 1 A   │  then the key facts, one per line, values in *bold*,
│ 💰 Amount: ₹2,500             │  each with a small emoji label,
│ 📅 Paid on: 18-11-2026        │
│                               │
│ Please keep this message ...  │  then one short closing line
│ Chaitanya School · School OS  │  FOOTER (small grey)
├───────────────────────────────┤
│        ↗ Open receipt         │  BUTTONS (a link, the school's phone, quick replies)
└───────────────────────────────┘
```

---

## 1. Meta's rules this design follows

Sources (fetched 15 Nov 2026):

- Components: https://developers.facebook.com/docs/whatsapp/business-management-api/message-templates/components and https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/components
- Utility templates: https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/utility-templates/utility-templates
- Template review (rejection reasons): https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-review
- Categories: https://developers.facebook.com/docs/whatsapp/updates-to-pricing/new-template-guidelines
- Template basics and limits: https://developers.facebook.com/docs/whatsapp/business-management-api/message-templates
- Quick-reply webhook: https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/button
- Text formatting: https://faq.whatsapp.com/539178204879377

| Part | Rule (Meta) | What this design does |
|---|---|---|
| Header (text) | Optional, one. **60 characters max.** One blank allowed. "Do not use Markdown special characters" (no `*`, `_`, `~`, backticks). | A fixed emoji and 2 to 4 words, no blank. WhatsApp already shows the header bold. |
| Header (media) | IMAGE, VIDEO, DOCUMENT or LOCATION (utility and marketing). Needs a sample uploaded with the Resumable Upload API at submission. | Not used in v1. Later idea: an image header for birthdays, or the receipt PDF as a DOCUMENT header. |
| Body | Required. **1024 characters max.** Blanks allowed, each with a sample value. | Aim for under 320 characters. |
| Footer | Optional. **60 characters max.** Text only. The syntax has no `example` field, so **a footer cannot hold a blank.** | Fixed text written per school at submission: `<School name> · School OS` (cut to fit 60). If the name is too long: `Sent via School OS`. |
| Buttons | **Up to 10.** Quick reply: up to 10. **URL: up to 2.** **Phone: up to 1.** Copy code: up to 1. **Label: 25 characters max.** The utility page says labels are "Alphanumeric characters only". Quick replies must be grouped together, before or after the other buttons. With more than 3 buttons, WhatsApp shows 2 and puts the rest behind "See all options". | At most 3 buttons. Labels are plain words: **no emoji, no punctuation**. Quick replies go last. |
| URL button | 2000 characters max. **One blank, at the end of the URL only.** A sample URL is required. Special characters in the value must be percent-encoded. | `https://<app>/p/{{1}}` (Parent Link), `/r/{{1}}` (receipt), `/invite/{{1}}` (staff invite). Only the token goes in the blank. |
| Phone button | Number: 20 characters max. | The school's phone in `+91XXXXXXXXXX` form, written into the template at submission. |
| Blanks | Cannot start or end the template ("dangling parameters are not allowed"). Not too many for the length. No `#`, `$` or `%` in blank names. Must be numbered in order. | Every body starts with "Dear …" / "नमस्ते …" / "నమస్కారం …" and ends with a fixed sentence. Every fact line has a label word ("Amount:", "Date:") before its blank, so **two blanks never sit next to each other**. This also keeps School OS's own check (2 words per blank, plus 2) easy to pass. |
| Blank values | Meta refuses a value with a line break or tab, or more than 4 spaces in a row (School OS found this live; `bareText()` already joins lines). | Unchanged. Each value is one line. |
| Formatting | `*bold*`, `_italic_`, `~strike~`, ```` ```mono``` ````, `> quote`, `- list`, `1. list`, line breaks. | Bold for values only. No italics or monospace (they look odd on small phones). |
| Emojis | Meta's documents are silent on emojis in the header, body and footer; template review says "the number of emojis allowed in the body component may also be limited". Button labels: "alphanumeric only". | 1 emoji in the header, 2 to 4 small label emojis in the body, none in buttons. |
| Category UTILITY | Must be "non-promotional" and "specific to or requested by the user", or "essential or critical". Must not "promote, recommend, upsell, cross-sell … include offers". Mixed content counts as marketing. So do templates whose content is unclear ("only {{1}}" or "Congratulations!"). | Every school message is a plain fact about the parent's own child: fee, attendance, result, bus. No offers, no "admissions open", no "hurry". |
| Recategorising | Meta checks approved templates again from time to time. A utility template that reads as marketing is moved to MARKETING with 1 day's notice, and with no notice for accounts warned for misuse. | The `general` and `staff-message` carriers hold free text. School OS should warn the school never to send offers or promotions through them. |
| AUTHENTICATION | No URLs, media or emojis. Meta writes the words: "<code> is your verification code." + the security line + footer "This code expires in 10 minutes." + a "Copy code" button. | The code templates are **left exactly as Meta requires** (already built this way in `authTemplateComponents()`). |
| Limits | 100 templates created per hour per account. 250 templates per account for an unverified business portfolio, 6,000 for a verified one. **Each language counts as one template.** | See section 4, "Blocked ideas", item 6. |

---

## 2. The shared pattern

- **Greeting:** EN `Dear {guardian_name},` · HI `नमस्ते {guardian_name} जी,` · TE `నమస్కారం {guardian_name} గారు,`. Birthdays use `Dear` / `प्रिय` / `ప్రియమైన`.
- **Child line:** EN `👤 *{student_name}* of {class}` · HI `👤 *{student_name}*, कक्षा {class}` · TE `👤 *{student_name}*, తరగతి {class}`. The word "of" / "कक्षा" / "తరగతి" sits between the two blanks.
- **Fact lines:** `<emoji> <Label>: *{blank}*`. Labels: 👤 child · 🏫 Class · 💰 Amount · 📅 Date · ⏰ Time · 🧾 Receipt no. · 📝 Exam / Note · 🚌 Bus · 📍 Stop · 🎫 Ticket no. · 📌 Notice · 📄 Consent · 📖 Homework · 💬 Message.
- **School name:** moved out of the body into the footer, so it no longer interrupts the sentence. The chat title still shows the sending number's WhatsApp display name.
- **Raw links leave the body.** A link becomes a URL button. This removes the 60-character `https://…/p/xxxxxxxx` lines parents see today.
- **Tone:** calm and warm. Money messages state the facts only. Serious ones (absence, behaviour) are respectful and never blame.
- **Footer (every non-code template):** `Chaitanya School · School OS`, written from School profile at submission.
- **Quick replies are "phase 2".** They can be sent now, but a tap reaches only the webhook (see section 3.5). Until replies are received, a tap would go nowhere. Phase 1 therefore ships URL and phone buttons only. Phase 2 adds the quick replies marked below, with one template edit, once the owner approves the reply webhook.

Button index numbers below are 0-based, in the order sent to Meta.

---

## 3. Templates

### Attendance

#### `absence` · Absent today · UTILITY
Blanks: guardian_name, student_name, class, date. `school_name` and `school_phone` leave the body; they go to the footer and the Call button.

| | EN | HI | TE |
|---|---|---|---|
| Header | 🔔 Absent today | 🔔 आज अनुपस्थित | 🔔 ఈరోజు గైర్హాజరు |

EN body
```
Dear {guardian_name}, your child is marked absent at school today.

👤 *{student_name}* of {class}
📅 Date: *{date}*

If you did not expect this, please call the school. We hope all is well.
```
HI body
```
नमस्ते {guardian_name} जी, आज आपका बच्चा स्कूल में अनुपस्थित है।

👤 *{student_name}*, कक्षा {class}
📅 तारीख़: *{date}*

अगर आपको इसकी जानकारी नहीं थी, तो कृपया स्कूल को फ़ोन करें। आशा है सब ठीक है।
```
TE body
```
నమస్కారం {guardian_name} గారు, మీ బిడ్డ ఈరోజు పాఠశాలకు రాలేదు.

👤 *{student_name}*, తరగతి {class}
📅 తేదీ: *{date}*

ఇది మీకు తెలియకపోతే, దయచేసి పాఠశాలకు కాల్ చేయండి. అంతా క్షేమమేనని ఆశిస్తున్నాము.
```
Buttons: 0 PHONE "Call school" / "स्कूल को कॉल करें" / "పాఠశాలకు కాల్ చేయండి" (school phone) · 1 QUICK_REPLY (phase 2) "On leave today" / "आज छुट्टी पर है" / "ఈరోజు సెలవు".

#### `late` · Arrived late · UTILITY
Blanks: guardian_name, student_name, class, date. Header: ⏰ Arrived late / ⏰ देर से पहुँचे / ⏰ ఆలస్యంగా వచ్చారు
```
Dear {guardian_name}, your child reached school late today.

👤 *{student_name}* of {class}
📅 Date: *{date}*

Please help your child be on time tomorrow. Thank you.
```
```
नमस्ते {guardian_name} जी, आज आपके बच्चे को स्कूल पहुँचने में देर हुई।

👤 *{student_name}*, कक्षा {class}
📅 तारीख़: *{date}*

कृपया ध्यान दें कि कल बच्चा समय पर स्कूल पहुँचे। धन्यवाद।
```
```
నమస్కారం {guardian_name} గారు, ఈరోజు మీ బిడ్డ పాఠశాలకు ఆలస్యంగా వచ్చారు.

👤 *{student_name}*, తరగతి {class}
📅 తేదీ: *{date}*

రేపటి నుండి సమయానికి వచ్చేలా చూడండి. ధన్యవాదాలు.
```
Buttons: 0 PHONE "Call school". Optional new blank `{time}` ("⏰ Reached at: *9:20 AM*") if attendance records the time.

### Fees

#### `fee-due` · Fee reminder · UTILITY (two WhatsApp versions)
Blanks: guardian_name, student_name, class, due_amount, due_date. On WhatsApp, `{how_to_pay}` is replaced by the button. SMS keeps `{how_to_pay}` unchanged.
Header: 💳 Fee reminder / 💳 फ़ीस रिमाइंडर / 💳 ఫీజు రిమైండర్
```
Dear {guardian_name}, this is a friendly reminder about a school fee.

👤 *{student_name}* of {class}
💰 Amount due: *{due_amount}*
📅 Due by: *{due_date}*

If you have already paid, please ignore this message. Thank you.
```
```
नमस्ते {guardian_name} जी, स्कूल फ़ीस जमा करने की याद दिला रहे हैं।

👤 *{student_name}*, कक्षा {class}
💰 बकाया राशि: *{due_amount}*
📅 अंतिम तारीख़: *{due_date}*

अगर आप भुगतान कर चुके हैं, तो कृपया इस संदेश को अनदेखा करें। धन्यवाद।
```
```
నమస్కారం {guardian_name} గారు, స్కూల్ ఫీజు గురించి చిన్న గుర్తు.

👤 *{student_name}*, తరగతి {class}
💰 చెల్లించాల్సిన మొత్తం: *{due_amount}*
📅 చివరి తేదీ: *{due_date}*

ఇప్పటికే చెల్లించి ఉంటే, ఈ సందేశాన్ని పట్టించుకోవద్దు. ధన్యవాదాలు.
```
- **`fee-due` (online payment):** buttons 0 URL "Pay fee" / "फ़ीस भरें" / "ఫీజు చెల్లించండి" → `https://<app>/p/{{1}}` (the guardian's Parent Link, which has the Pay button) · 1 PHONE "Call school".
- **`fee-due-office` (no online payment):** the same body, but the closing line becomes "Please pay at the school office. If you have already paid, please ignore this message." / "कृपया स्कूल ऑफ़िस में फ़ीस जमा करें। अगर भुगतान कर चुके हैं, तो इसे अनदेखा करें।" / "దయచేసి స్కూల్ ఆఫీసులో ఫీజు చెల్లించండి. ఇప్పటికే చెల్లించి ఉంటే, దీన్ని పట్టించుకోవద్దు." Button: 0 PHONE "Call school" only.
- **The Razorpay payment link (`/pay/<schoolId>/<token>`) has two parts.** One blank at the end of the URL can carry `<schoolId>/<token>` only if Meta keeps the `/` as it is. **This is untested.** Test it on the first submission. If it fails, add a one-part short route (for example `/pay/<key>`) the same way the receipt uses `/r/<key>`.

#### `fee-paid` · Fee received · UTILITY
Blanks: guardian_name, student_name, class (new in this template; check that it is filled for fee receipts), paid_amount, payment_date, receipt_number, receipt_link (button).
Header: ✅ Fee received / ✅ फ़ीस प्राप्त हुई / ✅ ఫీజు అందింది
```
Dear {guardian_name}, thank you. We have received your payment.

👤 *{student_name}* of {class}
💰 Amount: *{paid_amount}*
📅 Paid on: *{payment_date}*
🧾 Receipt no.: *{receipt_number}*

Please keep this message for your records.
```
```
नमस्ते {guardian_name} जी, धन्यवाद। हमें आपका भुगतान मिल गया है।

👤 *{student_name}*, कक्षा {class}
💰 राशि: *{paid_amount}*
📅 भुगतान की तारीख़: *{payment_date}*
🧾 रसीद नंबर: *{receipt_number}*

कृपया यह संदेश अपने रिकॉर्ड के लिए रखें।
```
```
నమస్కారం {guardian_name} గారు, ధన్యవాదాలు. మీ చెల్లింపు మాకు అందింది.

👤 *{student_name}*, తరగతి {class}
💰 మొత్తం: *{paid_amount}*
📅 చెల్లించిన తేదీ: *{payment_date}*
🧾 రసీదు నంబర్: *{receipt_number}*

దయచేసి ఈ సందేశాన్ని మీ రికార్డుల కోసం ఉంచుకోండి.
```
Buttons: 0 URL "Open receipt" / "रसीद देखें" / "రసీదు చూడండి" → `https://<app>/r/{{1}}` (as built today).

### Exams

#### `exam-reminder` · Exam reminder · UTILITY
Blanks: guardian_name, student_name, class, exam_name, date, plus the Parent Link (button). Header: ✏️ Exams start soon / ✏️ परीक्षा जल्द / ✏️ పరీక్షలు త్వరలో
```
Dear {guardian_name}, exams are coming up for your child.

👤 *{student_name}* of {class}
📝 Exam: *{exam_name}*
📅 Starts on: *{date}*

The full timetable is on your Parent Link. All the best!
```
```
नमस्ते {guardian_name} जी, आपके बच्चे की परीक्षाएँ जल्द शुरू हो रही हैं।

👤 *{student_name}*, कक्षा {class}
📝 परीक्षा: *{exam_name}*
📅 शुरू: *{date}*

पूरा टाइम टेबल आपके Parent Link पर है। शुभकामनाएँ!
```
```
నమస్కారం {guardian_name} గారు, మీ బిడ్డ పరీక్షలు త్వరలో మొదలవుతున్నాయి.

👤 *{student_name}*, తరగతి {class}
📝 పరీక్ష: *{exam_name}*
📅 మొదలు: *{date}*

పూర్తి టైమ్ టేబుల్ మీ Parent Link లో ఉంది. శుభాకాంక్షలు!
```
Buttons: 0 URL "See timetable" / "टाइम टेबल देखें" / "టైమ్ టేబుల్ చూడండి" → `/p/{{1}}`.

#### `result` · Results published · UTILITY
Blanks: guardian_name, student_name, class (new), exam_name, plus the Parent Link (button). Header: 📊 Results are out / 📊 परिणाम आ गए / 📊 ఫలితాలు వచ్చాయి
```
Dear {guardian_name}, the exam results are ready.

👤 *{student_name}* of {class}
📝 Exam: *{exam_name}*

Open your Parent Link to see the full report card.
```
```
नमस्ते {guardian_name} जी, परीक्षा के परिणाम तैयार हैं।

👤 *{student_name}*, कक्षा {class}
📝 परीक्षा: *{exam_name}*

पूरा रिपोर्ट कार्ड देखने के लिए अपना Parent Link खोलें।
```
```
నమస్కారం {guardian_name} గారు, పరీక్ష ఫలితాలు సిద్ధంగా ఉన్నాయి.

👤 *{student_name}*, తరగతి {class}
📝 పరీక్ష: *{exam_name}*

పూర్తి రిపోర్ట్ కార్డ్ కోసం మీ Parent Link తెరవండి.
```
Buttons: 0 URL "See results" / "परिणाम देखें" / "ఫలితాలు చూడండి" → `/p/{{1}}`. The button opens the Parent Link home page. Check that the page shows the new result near the top. A direct link to the report card would need a fixed path after the token, which a URL blank cannot have (see section 4).

### Events

#### `ptm` · PTM reminder · UTILITY
Blanks: guardian_name, class, date (optional new: time). Header: 📅 Parent-teacher meeting / 📅 अभिभावक-शिक्षक बैठक / 📅 తల్లిదండ్రుల సమావేశం
```
Dear {guardian_name}, you are warmly invited to the parent-teacher meeting of *{class}*.

📅 Date: *{date}*

Come and hear how your child is doing. We look forward to meeting you.
```
```
नमस्ते {guardian_name} जी, *{class}* की अभिभावक-शिक्षक बैठक में आपका स्वागत है।

📅 तारीख़: *{date}*

आइए, जानिए आपका बच्चा कैसा कर रहा है। आपसे मिलने का इंतज़ार रहेगा।
```
```
నమస్కారం {guardian_name} గారు, *{class}* తల్లిదండ్రులు-ఉపాధ్యాయుల సమావేశానికి మిమ్మల్ని ఆహ్వానిస్తున్నాము.

📅 తేదీ: *{date}*

మీ బిడ్డ చదువు ఎలా ఉందో తెలుసుకోవడానికి తప్పకుండా రండి.
```
Buttons: 0 URL "Open Parent Link" / "Parent Link खोलें" / "Parent Link తెరవండి" → `/p/{{1}}` · 1 and 2 QUICK_REPLY (phase 2) "I will attend" / "हम आएँगे" / "వస్తాము" and "Cannot attend" / "नहीं आ पाएँगे" / "రాలేము".

### Transport

Today, all three bus templates carry one `{message}` blank that Transport fills with a whole sentence. That sentence is why the owner's phone showed a grey paragraph. **Recommended:** give each fact its own blank. This means new blanks in `blanks.ts` and a small change in `src/lib/transport/messages.ts` (`pickupMessage`, `dropMessage`, `arrivingMessage` already know every value).

New blanks: `bus` ("Bus 4"), `route` ("2"), `stop` ("KPHB 6th Phase"), `time` ("7:43 AM"), `minutes` ("5"), `place` (the stop name, or "school" in the morning). Each must always have a value. Where the stop is unknown, fill "the bus stop".

#### `bus-pickup` · Picked up by the bus · UTILITY
Header: 🚌 On the bus / 🚌 बस में बैठ गए / 🚌 బస్సు ఎక్కారు
```
Dear {guardian_name}, your child is on the school bus.

👤 *{student_name}*
🚌 Bus: *{bus}*
⏰ Boarded at: *{time}*

Sent automatically by the school transport team.
```
```
नमस्ते {guardian_name} जी, आपका बच्चा स्कूल बस में है।

👤 *{student_name}*
🚌 बस: *{bus}*
⏰ बैठने का समय: *{time}*

यह संदेश स्कूल परिवहन टीम ने अपने-आप भेजा है।
```
```
నమస్కారం {guardian_name} గారు, మీ బిడ్డ స్కూల్ బస్సు ఎక్కారు.

👤 *{student_name}*
🚌 బస్సు: *{bus}*
⏰ ఎక్కిన సమయం: *{time}*

ఈ సందేశం స్కూల్ రవాణా విభాగం నుండి ఆటోమేటిక్‌గా వచ్చింది.
```

#### `bus-drop` · Dropped by the bus · UTILITY
Header: 🚌 Off the bus safely / 🚌 बस से उतर गए / 🚌 బస్సు దిగారు
```
Dear {guardian_name}, your child got off the school bus safely.

👤 *{student_name}*
📍 At: *{place}*
⏰ Time: *{time}*

Sent automatically by the school transport team.
```
HI: `नमस्ते {guardian_name} जी, आपका बच्चा स्कूल बस से सुरक्षित उतर गया है।` + `👤 *{student_name}*` / `📍 जगह: *{place}*` / `⏰ समय: *{time}*` + `यह संदेश स्कूल परिवहन टीम ने अपने-आप भेजा है।`
TE: `నమస్కారం {guardian_name} గారు, మీ బిడ్డ స్కూల్ బస్సు నుండి క్షేమంగా దిగారు.` + `👤 *{student_name}*` / `📍 చోటు: *{place}*` / `⏰ సమయం: *{time}*` + the same last line as pickup.

#### `bus-arriving` · Bus arriving · UTILITY
Header: 🚌 Bus arriving soon / 🚌 बस आने वाली है / 🚌 బస్సు దగ్గరలో ఉంది
```
Dear {guardian_name}, the school bus will reach your stop soon.

🚌 Bus: *{bus}*, route {route}
📍 Stop: *{stop}*
⏰ In about *{minutes}* minutes

Please be at the stop on time.
```
```
नमस्ते {guardian_name} जी, स्कूल बस जल्द ही आपके स्टॉप पर पहुँचेगी।

🚌 बस: *{bus}*, रूट {route}
📍 स्टॉप: *{stop}*
⏰ लगभग *{minutes}* मिनट में

कृपया समय पर स्टॉप पर पहुँचें।
```
```
నమస్కారం {guardian_name} గారు, స్కూల్ బస్సు త్వరలో మీ స్టాప్‌కు చేరుకుంటుంది.

🚌 బస్సు: *{bus}*, రూట్ {route}
📍 స్టాప్: *{stop}*
⏰ సుమారు *{minutes}* నిమిషాల్లో

దయచేసి సమయానికి స్టాప్ వద్ద ఉండండి.
```
All three bus templates: 0 PHONE "Call school".

**Stop-gap if Transport is not changed yet.** Keep `{message}` but frame it: header `🚌 Bus update`; body `Dear {guardian_name}, here is an update from the school bus.\n\n🚌 {message}\n\nSent automatically by the school transport team.`

### Homework

#### `homework-set` · Homework set · UTILITY (WhatsApp)
Blanks: guardian_name, class, message, plus the Parent Link (button). Header: 📚 New homework / 📚 नया होमवर्क / 📚 కొత్త హోంవర్క్
```
Dear {guardian_name}, new homework has been set for *{class}*.

📖 Homework: {message}

Please help your child finish it on time.
```
```
नमस्ते {guardian_name} जी, *{class}* के लिए नया होमवर्क दिया गया है।

📖 होमवर्क: {message}

कृपया बच्चे को इसे समय पर पूरा करने में मदद करें।
```
```
నమస్కారం {guardian_name} గారు, *{class}* కి కొత్త హోంవర్క్ ఇచ్చారు.

📖 హోంవర్క్: {message}

సమయానికి పూర్తి చేయడానికి మీ బిడ్డకు సహాయం చేయండి.
```
Buttons: 0 URL "See homework" / "होमवर्क देखें" / "హోంవర్క్ చూడండి" → `/p/{{1}}`. Optional new blank `{due_date}` ("📅 Due by: *20-11-2026*").

#### `homework-pending` · Homework pending · UTILITY
Header: 📚 Homework pending / 📚 होमवर्क बाकी / 📚 హోంవర్క్ పెండింగ్
```
Dear {guardian_name}, some homework is not submitted yet.

👤 *{student_name}*
📅 Was due on: *{date}*

Please help your child finish it soon. Thank you.
```
HI: `नमस्ते {guardian_name} जी, एक होमवर्क अभी तक जमा नहीं हुआ है।` / `👤 *{student_name}*` / `📅 जमा करने की तारीख़: *{date}*` / `कृपया बच्चे को इसे जल्द पूरा करने में मदद करें। धन्यवाद।`
TE: `నమస్కారం {guardian_name} గారు, ఒక హోంవర్క్ ఇంకా సమర్పించలేదు.` / `👤 *{student_name}*` / `📅 ఇవ్వాల్సిన తేదీ: *{date}*` / `త్వరగా పూర్తి చేయడానికి మీ బిడ్డకు సహాయం చేయండి. ధన్యవాదాలు.`
Buttons: 0 URL "See homework" → `/p/{{1}}`.

### Wishes (expect MARKETING)

Meta will most likely class birthday wishes as **MARKETING**: a greeting is not a transaction ("Congratulations!"-style content is its own example of marketing). This means a higher price per message, and parents who turned off marketing messages will not get them (error 131050, already handled in `whatsappReason`). **Submit them as MARKETING from the start** instead of having Meta move them later. The owner decides whether to keep sending them on WhatsApp.

#### `birthday-student` · Birthday wishes (student) · MARKETING
Header: 🎂 Happy birthday! / 🎂 जन्मदिन मुबारक! / 🎂 పుట్టినరోజు శుభాకాంక్షలు!
```
Dear {student_name}, wishing you a very happy birthday! 🎉

May this year bring you lots of learning, fun and good health.

With love from all your teachers.
```
```
प्रिय {student_name}, जन्मदिन की बहुत-बहुत शुभकामनाएँ! 🎉

यह साल आपके लिए ढेर सारी सीख, खुशियाँ और अच्छी सेहत लेकर आए।

आपके सभी शिक्षकों की ओर से ढेर सारा प्यार।
```
```
ప్రియమైన {student_name}, పుట్టినరోజు శుభాకాంక్షలు! 🎉

ఈ సంవత్సరం మీకు చదువు, ఆనందం, మంచి ఆరోగ్యం నిండుగా ఉండాలని కోరుకుంటున్నాము.

మీ ఉపాధ్యాయులందరి తరఫున ప్రేమతో.
```
No buttons. Later idea: an IMAGE header with a birthday card picture.

#### `birthday-staff` · Birthday wishes (staff) · MARKETING
```
Dear {staff_name}, wishing you a very happy birthday! 🎉

Thank you for all you do for our students. Have a lovely day and a great year ahead.
```
HI: `प्रिय {staff_name} जी, जन्मदिन की हार्दिक शुभकामनाएँ! 🎉` / `विद्यार्थियों के लिए आप जो कुछ करते हैं, उसके लिए धन्यवाद। आपका दिन और आने वाला साल शानदार हो।`
TE: `ప్రియమైన {staff_name} గారు, పుట్టినరోజు శుభాకాంక్షలు! 🎉` / `విద్యార్థుల కోసం మీరు చేస్తున్న అన్నిటికీ ధన్యవాదాలు. ఈ రోజు, ఈ సంవత్సరం మీకు ఆనందంగా గడవాలి.`

### Admission and Parent Link

#### `admission-welcome` · Admission welcome · UTILITY
Header: 🎉 Welcome to school / 🎉 स्कूल में स्वागत है / 🎉 పాఠశాలకు స్వాగతం
```
Dear {guardian_name}, welcome! We are happy to confirm your child's admission.

👤 *{student_name}* of {class}
🆔 Admission no.: *{admission_no}*

Please keep this number safe. We look forward to a wonderful year together.
```
```
नमस्ते {guardian_name} जी, स्वागत है! आपके बच्चे का दाख़िला पक्का हो गया है।

👤 *{student_name}*, कक्षा {class}
🆔 दाख़िला नंबर: *{admission_no}*

कृपया यह नंबर संभालकर रखें। साथ मिलकर एक शानदार साल की प्रतीक्षा है।
```
```
నమస్కారం {guardian_name} గారు, స్వాగతం! మీ బిడ్డ అడ్మిషన్ ఖరారైంది.

👤 *{student_name}*, తరగతి {class}
🆔 అడ్మిషన్ నంబర్: *{admission_no}*

ఈ నంబర్‌ను జాగ్రత్తగా ఉంచుకోండి. కలిసి ఒక చక్కని సంవత్సరం కోసం ఎదురుచూస్తున్నాము.
```
Buttons: 0 PHONE "Call school".

#### `parent-link` · Parent Link · UTILITY
Blanks: guardian_name, plus the link (button). **The long link leaves the body.**
Header: 🔑 Your Parent Link / 🔑 आपका Parent Link / 🔑 మీ Parent Link
```
Dear {guardian_name}, here is your own Parent Link from the school.

See fees, attendance, homework and notices for your children, all in one place.

🔒 This link is only for you. Please do not share it.
```
```
नमस्ते {guardian_name} जी, स्कूल की ओर से यह आपका अपना Parent Link है।

अपने बच्चों की फ़ीस, हाज़िरी, होमवर्क और सूचनाएँ एक ही जगह देखें।

🔒 यह लिंक सिर्फ़ आपके लिए है। कृपया इसे किसी से साझा न करें।
```
```
నమస్కారం {guardian_name} గారు, పాఠశాల నుండి ఇది మీ సొంత Parent Link.

మీ పిల్లల ఫీజు, హాజరు, హోంవర్క్, నోటీసులు అన్నీ ఒకే చోట చూడండి.

🔒 ఈ లింక్ మీకు మాత్రమే. దయచేసి ఎవరితోనూ పంచుకోవద్దు.
```
Buttons: 0 URL "Open Parent Link" / "Parent Link खोलें" / "Parent Link తెరవండి" → `/p/{{1}}`.

#### `consent-request` · Consent request · UTILITY
Header: ✍️ Consent needed / ✍️ आपकी सहमति चाहिए / ✍️ మీ అనుమతి కావాలి
```
Dear {guardian_name}, the school needs your consent for the item below.

📄 *{title}*

Please read the details on your Parent Link and give your answer there.
```
```
नमस्ते {guardian_name} जी, स्कूल को नीचे दिए विषय पर आपकी सहमति चाहिए।

📄 *{title}*

कृपया अपने Parent Link पर पूरी जानकारी पढ़कर अपना जवाब दें।
```
```
నమస్కారం {guardian_name} గారు, కింది విషయానికి పాఠశాలకు మీ అనుమతి కావాలి.

📄 *{title}*

దయచేసి మీ Parent Link లో వివరాలు చదివి మీ సమాధానం ఇవ్వండి.
```
Buttons: 0 URL "Read and answer" / "पढ़ें और जवाब दें" / "చదివి సమాధానం ఇవ్వండి" → `/p/{{1}}`. **No "I agree" quick reply, on purpose.** Consent must be given after reading the details, on the Parent Link, where it is recorded with proof.

#### Code templates: `parent-link-code`, `admission-consent-code` · AUTHENTICATION
Left exactly as Meta requires (`authTemplateComponents()`). Meta's own words, a "Copy code" button, and the footer "This code expires in 10 minutes." **No header, emoji, link or our own words is allowed.** `sign-in-code` is SMS only.

### Queries

#### `query-number` · Query received · UTILITY
Header: 🎫 Query received / 🎫 सवाल दर्ज हुआ / 🎫 మీ ప్రశ్న అందింది
```
Dear {guardian_name}, thank you for writing to us. We have noted your query.

🎫 Ticket no.: *{ticket_number}*
📝 About: {message}

We will get back to you soon.
```
HI: `नमस्ते {guardian_name} जी, हमसे संपर्क करने के लिए धन्यवाद। आपका सवाल दर्ज कर लिया गया है।` / `🎫 टिकट नंबर: *{ticket_number}*` / `📝 विषय: {message}` / `हम जल्द ही आपसे संपर्क करेंगे।`
TE: `నమస్కారం {guardian_name} గారు, మమ్మల్ని సంప్రదించినందుకు ధన్యవాదాలు. మీ ప్రశ్నను నమోదు చేశాము.` / `🎫 టికెట్ నంబర్: *{ticket_number}*` / `📝 విషయం: {message}` / `త్వరలో మీకు సమాధానం ఇస్తాము.`

#### `query-rating` · Query rating request · UTILITY (Meta may say MARKETING)
Header: ⭐ How did we do? / ⭐ हमारी मदद कैसी रही / ⭐ మా సహాయం ఎలా ఉంది
```
Dear {guardian_name}, your query is now closed.

🎫 Ticket no.: *{ticket_number}*

How happy are you with our help? Please tap one answer below.
```
HI: `नमस्ते {guardian_name} जी, आपका सवाल अब बंद कर दिया गया है।` / `🎫 टिकट नंबर: *{ticket_number}*` / `हमारी मदद से आप कितने खुश हैं? कृपया नीचे एक जवाब चुनें।`
TE: `నమస్కారం {guardian_name} గారు, మీ ప్రశ్న ఇప్పుడు పరిష్కరించబడింది.` / `🎫 టికెట్ నంబర్: *{ticket_number}*` / `మా సహాయంతో మీరు ఎంత సంతోషంగా ఉన్నారు? దయచేసి కింద ఒక సమాధానం ఎంచుకోండి.`
Buttons (phase 2): QUICK_REPLY "Very happy" (payload `rate:5:<ticket>`), "It was okay" (`rate:3`), "Not happy" (`rate:1`). Hindi: "बहुत खुश", "ठीक था", "खुश नहीं". Telugu: "చాలా సంతోషం", "పర్వాలేదు", "సంతోషంగా లేదు".

Three answers instead of 1 to 5: five buttons would show only 2, with the rest behind "See all options". Meta's rule: "a general/generic survey or request for feedback will not be approved as utility". This one is tied to the parent's own ticket number, so it should pass, but Meta may still class it as MARKETING. **Until phase 2, today's "Reply with a number" text has the same problem: the answer reaches only the webhook.**

### Staff

#### `staff-invite` · Staff invite · UTILITY
Header: 👋 Welcome to School OS / 👋 School OS में स्वागत / 👋 School OS కు స్వాగతం
```
Dear {staff_name}, you are invited to use School OS at your school.

Tap the button below to choose your password.

🔒 The link works once, for 7 days. Please do not share it.
```
HI: `नमस्ते {staff_name} जी, आपको अपने स्कूल में School OS इस्तेमाल करने के लिए आमंत्रित किया गया है।` / `अपना पासवर्ड चुनने के लिए नीचे दिया बटन दबाएँ।` / `🔒 यह लिंक सिर्फ़ एक बार, 7 दिनों तक चलेगा। कृपया इसे साझा न करें।`
TE: `నమస్కారం {staff_name} గారు, మీ పాఠశాలలో School OS ఉపయోగించడానికి మిమ్మల్ని ఆహ్వానిస్తున్నాము.` / `మీ పాస్‌వర్డ్ ఎంచుకోవడానికి కింది బటన్ నొక్కండి.` / `🔒 ఈ లింక్ ఒక్కసారి మాత్రమే, 7 రోజుల వరకు పనిచేస్తుంది. దయచేసి ఎవరితోనూ పంచుకోవద్దు.`
Buttons: 0 URL "Set my password" / "पासवर्ड बनाएँ" / "పాస్‌వర్డ్ సెట్ చేయండి" → `https://<app>/invite/{{1}}`.

#### `staff-message` · Message to staff · UTILITY
Header: 📢 Message from school / 📢 स्कूल से संदेश / 📢 పాఠశాల నుండి సందేశం
```
Dear {staff_name}, here is a message from the school office.

💬 {message}

Please contact the office if you have any questions.
```
HI: `नमस्ते {staff_name} जी, स्कूल ऑफ़िस की ओर से एक संदेश है।` / `💬 {message}` / `कोई सवाल हो तो कृपया ऑफ़िस से संपर्क करें।`
TE: `నమస్కారం {staff_name} గారు, స్కూల్ ఆఫీసు నుండి ఒక సందేశం.` / `💬 {message}` / `ఏవైనా సందేహాలు ఉంటే దయచేసి ఆఫీసును సంప్రదించండి.`

#### `salary-slip` · Salary slip ready · UTILITY (new WhatsApp version; today it is in the app only)
Header: 💼 Salary slip ready / 💼 वेतन पर्ची तैयार / 💼 జీతం స్లిప్ సిద్ధం. New blank `{month}` ("October 2026").
```
Dear {staff_name}, your salary slip for *{month}* is ready.

Open School OS and go to My profile to see and download it.
```
HI: `नमस्ते {staff_name} जी, *{month}* की आपकी वेतन पर्ची तैयार है।` / `देखने और डाउनलोड करने के लिए School OS में My profile खोलें।`
TE: `నమస్కారం {staff_name} గారు, *{month}* నెల మీ జీతం స్లిప్ సిద్ధంగా ఉంది.` / `చూడటానికి, డౌన్‌లోడ్ చేయడానికి School OS లో My profile తెరవండి.`
Buttons: 0 URL (static, no blank) "Open My profile" → `https://<app>/profile`.

### General

#### `behaviour-note` · Behaviour note · UTILITY
Header: 📋 Note from school / 📋 शिक्षक की टिप्पणी / 📋 ఉపాధ్యాయుల గమనిక. The tone is neutral, because a note can also be good news.
```
Dear {guardian_name}, the class teacher would like to share a note about your child.

👤 *{student_name}* of {class}
📝 Note: *{title}*
📅 Date: *{date}*

To talk about it, please call the school. Thank you.
```
```
नमस्ते {guardian_name} जी, कक्षा शिक्षक आपके बच्चे के बारे में एक बात साझा करना चाहते हैं।

👤 *{student_name}*, कक्षा {class}
📝 टिप्पणी: *{title}*
📅 तारीख़: *{date}*

इस बारे में बात करने के लिए कृपया स्कूल को फ़ोन करें। धन्यवाद।
```
```
నమస్కారం {guardian_name} గారు, క్లాస్ టీచర్ మీ బిడ్డ గురించి ఒక విషయం మీతో పంచుకోవాలనుకుంటున్నారు.

👤 *{student_name}*, తరగతి {class}
📝 గమనిక: *{title}*
📅 తేదీ: *{date}*

దీని గురించి మాట్లాడాలంటే దయచేసి పాఠశాలకు కాల్ చేయండి. ధన్యవాదాలు.
```
Buttons: 0 PHONE "Call school".

#### `notice` · New notice · UTILITY
Header: 📢 New notice / 📢 नई सूचना / 📢 కొత్త నోటీసు
```
Dear Parent, there is a new notice from the school.

📌 *{title}*
Details: {message}

You can read the full notice on your Parent Link.
```
HI: `नमस्ते, स्कूल की ओर से एक नई सूचना है।` / `📌 *{title}*` / `विवरण: {message}` / `पूरी सूचना आप अपने Parent Link पर पढ़ सकते हैं।`
TE: `నమస్కారం, పాఠశాల నుండి కొత్త నోటీసు వచ్చింది.` / `📌 *{title}*` / `వివరాలు: {message}` / `పూర్తి నోటీసు మీ Parent Link లో చదవవచ్చు.`
Buttons: 0 URL "Read the notice" / "सूचना पढ़ें" / "నోటీసు చదవండి" → `/p/{{1}}`. The word "Details:" keeps `{title}` and `{message}` apart.

#### `general` · General announcement · UTILITY (the carrier for typed messages)
Header: 📢 Message from school / 📢 स्कूल से संदेश / 📢 పాఠశాల నుండి సందేశం
```
Dear {guardian_name}, here is a message from the school.

💬 {message}

Please call the school office if you have any questions.
```
HI: `नमस्ते {guardian_name} जी, स्कूल की ओर से एक संदेश है।` / `💬 {message}` / `कोई सवाल हो तो कृपया स्कूल ऑफ़िस को फ़ोन करें।`
TE: `నమస్కారం {guardian_name} గారు, పాఠశాల నుండి ఒక సందేశం.` / `💬 {message}` / `ఏవైనా సందేహాలు ఉంటే దయచేసి స్కూల్ ఆఫీసుకు కాల్ చేయండి.`
Buttons: 0 PHONE "Call school". Warning for the Send Message screen: Meta reviews the template's words, not what is typed into `{message}`. A school that sends "Admissions open, 20% off" through it risks the template, or the account, being moved to marketing.

### Front Office and system

#### `appointment-confirmed` · Appointment confirmation · UTILITY (new template)
Today, Front Office (`src/lib/front-office/notify.ts`, `messageVisitor`) sends **free text**. On a real WhatsApp Business account, free text reaches someone only within 24 hours of their last message to the number. Otherwise Meta refuses it (error 131047). So these messages need templates. New blanks: `visitor_name`, `time` (and `staff_name`, `date`).
Header: 📅 Appointment confirmed / 📅 अपॉइंटमेंट पक्का / 📅 అపాయింట్‌మెంట్ ఖరారు
```
Dear {visitor_name}, your appointment at the school is confirmed.

👤 With: *{staff_name}*
📅 Date: *{date}*
⏰ Time: *{time}*

Please show this message at the front desk when you arrive.
```
HI: `नमस्ते {visitor_name} जी, स्कूल में आपका अपॉइंटमेंट पक्का हो गया है।` / `👤 किनसे: *{staff_name}*` / `📅 तारीख़: *{date}*` / `⏰ समय: *{time}*` / `पहुँचने पर कृपया यह संदेश फ़्रंट डेस्क पर दिखाएँ।`
TE: `నమస్కారం {visitor_name} గారు, పాఠశాలలో మీ అపాయింట్‌మెంట్ ఖరారైంది.` / `👤 ఎవరితో: *{staff_name}*` / `📅 తేదీ: *{date}*` / `⏰ సమయం: *{time}*` / `వచ్చినప్పుడు దయచేసి ఈ సందేశాన్ని ఫ్రంట్ డెస్క్ వద్ద చూపించండి.`
Buttons: 0 PHONE "Call school" · 1 QUICK_REPLY (phase 2) "Need to change it". The reminder and cancellation messages follow the same pattern: `⏰ Appointment reminder` with "This is a reminder of your appointment tomorrow.", and `❌ Appointment cancelled` with "Your appointment has been cancelled. Please call the school to choose a new time." Visitor pass, walk-in number and pickup gate pass work the same way. The pickup code stays AUTHENTICATION.

#### `pickup-approve` · Pickup request · UTILITY (owner decision 21, 16 Nov 2026)
WhatsApp never delivers one-time codes (Authentication) to +91 numbers, so with "Pickup code check" on the pickup code could not go. The front desk now asks the guardian collecting to approve in their own WhatsApp (`src/lib/front-office/pickup-tap.ts`). `{visitor_name}` is the person at the desk. Plain facts only: no "code", "verify" or "OTP" (Meta refused credential-like words as not Utility).
Header: 🚸 Pickup request / 🚸 बच्चे को ले जाने का अनुरोध / 🚸 పిల్లలను తీసుకెళ్లే అభ్యర్థన
```
Dear {guardian_name}, {visitor_name} is at the school front desk to take *{student_name}* home now.

If you agree, tap the button below. If you do not know about this, please call the school.
```
HI: `नमस्ते {guardian_name} जी, {visitor_name} आपके बच्चे *{student_name}* को अभी घर ले जाने के लिए स्कूल के फ़्रंट डेस्क पर हैं।` / `अगर आप सहमत हैं, तो नीचे दिया बटन दबाएँ। अगर आपको इसकी जानकारी नहीं है, तो कृपया स्कूल को फ़ोन करें।`
TE: `నమస్కారం {guardian_name} గారు, *{student_name}* ను ఇప్పుడు ఇంటికి తీసుకెళ్లడానికి {visitor_name} పాఠశాల ఫ్రంట్ డెస్క్ వద్ద ఉన్నారు.` / `మీకు సమ్మతమైతే, కింది బటన్ నొక్కండి. దీని గురించి మీకు తెలియకపోతే, దయచేసి పాఠశాలకు కాల్ చేయండి.`
Buttons: 0 URL "Open Parent Link" → `/p/{{1}}`: the guardian's own Parent Link with a one-time secret after a dot (`/p/<token>.<secret>`), put in only when the message is handed to WhatsApp. The page shows "Approve: {person} takes {student} home now?" with Approve and "No, call the school"; the release checks the answer on the server and uses it once.

#### `connection-test` · School connection test · UTILITY (new template)
Today, `sendTestMessage` (`channel-admin.ts`) sends free text. That works only within 24 hours of the person messaging the number. A template always works.
Header: ✅ WhatsApp is working
```
Hello {staff_name}, this is a test message from School OS for your school.

If you can read this, WhatsApp messages from the school are reaching phones.

No reply is needed.
```
HI: `नमस्ते {staff_name} जी, यह School OS की ओर से आपके स्कूल के लिए एक टेस्ट संदेश है।` / `अगर आप इसे पढ़ पा रहे हैं, तो स्कूल के WhatsApp संदेश फ़ोन तक पहुँच रहे हैं।` / `जवाब देने की ज़रूरत नहीं है।`
TE: `నమస్కారం {staff_name} గారు, ఇది మీ పాఠశాల కోసం School OS నుండి ఒక టెస్ట్ సందేశం.` / `ఇది మీరు చదవగలిగితే, పాఠశాల WhatsApp సందేశాలు ఫోన్లకు చేరుతున్నాయి.` / `సమాధానం అవసరం లేదు.`

When a template is tested (the owner's "School OS test of the Picked up by the bus message. Please ignore."), fill it with the realistic samples from `VARIABLES`, so the tester sees the real card. Mark it as a test in Message History, not inside the message.

---

## 4. Blocked ideas (Meta limits)

1. **No emoji in buttons.** Labels are "alphanumeric only", 25 characters max. "👍 Got it" becomes "Got it". WhatsApp adds its own icons: ↗ for links, 📞 for phone, ↩ for quick replies.
2. **The footer cannot hold a blank.** "{school_name} · School OS" works only because each school's templates are submitted separately, so the name is written in at submission. **If the school renames itself, its templates must be submitted again.**
3. **The phone button is fixed at approval.** It holds the school phone at submission time and cannot change per message. A new school phone means submitting again.
4. **A URL blank sits only at the end of the address.** A button cannot open "Parent Link → Results" (`/p/<token>/report-card`) unless `/report-card` goes in the blank too, which is untested (Meta asks for special characters to be percent-encoded, and that may break the `/`). Buttons therefore open the Parent Link home page. A direct link would need a new short route.
5. **The Razorpay payment link has two parts** (`/pay/<schoolId>/<token>`). Test whether Meta keeps the `/`, or add a one-part route (see fee-due).
6. **The template count adds up.** About 28 templates × 3 languages ≈ 84 per school, and each school on the shared DREAM TEAM number gets its own copy. An **unverified business portfolio is capped at 250 templates**, which is about 3 schools on the shared number. A verified one with an approved display name allows 6,000 (about 70 schools). **The DREAM TEAM business must be verified before many schools go live on the shared number.** Submit only the languages a school uses.
7. **Quick reply and another button type together cannot be viewed on WhatsApp desktop.** The same applies to 4 or more buttons. Phone users (almost every parent) are fine. Only `absence`, `ptm` and `appointment-confirmed` mix the two, and only in phase 2.
8. **A quick reply is useless without receiving replies.** On the Cloud API, a tap comes only through the webhook. No phone shows it. See 5.5.
9. **Birthday wishes are marketing.** They are priced higher and can be blocked by parents.
10. **Editing an approved template sends it back to review**, and Meta limits how often an approved template can be edited. Moving to the new cards means submitting every template again. Old approved versions must keep sending until the new ones are approved (see 5.1).
11. **The header cannot be bold-formatted or italic.** WhatsApp already makes it bold.
12. **The chat title is the sending number's display name**, not the school's, for schools on the shared number. The footer carries the school name for that reason.

---

## 5. How the code must change (for the builder; not done)

### 5.1 Data model (`prisma/schema`, TemplateVersion)
Add nullable columns, so every existing version keeps working unchanged:
- `whatsappHeader String?`: header text, 60 characters max, no `*_~` and no blank.
- `whatsappFooter String?`: when null, the footer is built at submission from `School.name` (`<name> · School OS`, or `Sent via School OS` when it does not fit in 60).
- `whatsappButtons Json?`: an ordered list such as
  `[{ "type": "URL", "text": "Pay fee", "target": "parent-link" }, { "type": "PHONE", "text": "Call school" }, { "type": "QUICK_REPLY", "text": "On leave today", "payload": "absence-ack" }]`.
  The `target` values are `parent-link` (`/p/{{1}}`), `receipt` (`/r/{{1}}`), `invite` (`/invite/{{1}}`), `pay-link` and `static:<path>`. The phone number comes from School profile at submission.
- `whatsappCategory`: today it comes from the body (`whatsappCategoryOf`). Add a MARKETING choice for the birthday templates.
- **Sending keeps the last APPROVED version.** When a new card version is saved, deliver must keep using the last version whose `whatsappStatus` is APPROVED until the new one is approved. Otherwise a school's messages stop for up to 24 hours (review time). Today `currentVersions` picks `isCurrent` only.
- `READY_TEMPLATES` gains `header`, `buttons` and `category` per entry and per language. `ensureReadyTemplates` stays safe to run twice. A data migration adds the new card version to existing schools' ready templates, but only where the school has not edited the text (compare with the ready text), and leaves the old version current until approval.
- `BUTTON_BLANKS` / `whatsappParts()` (the "a line holding {receipt_link} becomes a button" trick) is replaced by explicit buttons. Keep it only for old versions.
- `whatsappProblems()` gains checks for the header (60, no Markdown, no blank) and buttons (25, no emoji, at most 2 URL, at most 1 phone, quick replies grouped, at most 10), plus a check that no two blanks have only symbols between them (`*{a}*\n👤 *{b}*` must have a word between).

### 5.2 Submission to Meta (`templateComponents` in `providers/whatsapp.ts`)
```json
{
  "name": "<per-school name>_v2",
  "language": "en",
  "category": "UTILITY",
  "components": [
    { "type": "HEADER", "format": "TEXT", "text": "✅ Fee received" },
    { "type": "BODY",
      "text": "Dear {{1}}, thank you. We have received your payment.\n\n👤 *{{2}}* of {{3}}\n💰 Amount: *{{4}}*\n📅 Paid on: *{{5}}*\n🧾 Receipt no.: *{{6}}*\n\nPlease keep this message for your records.",
      "example": { "body_text": [["Venkatesh", "Sri Lakshmi", "Class 1 A", "₹2,500", "18-11-2026", "CHS/2026/00456"]] } },
    { "type": "FOOTER", "text": "Chaitanya School · School OS" },
    { "type": "BUTTONS", "buttons": [
      { "type": "URL", "text": "Open receipt", "url": "https://<app>/r/{{1}}", "example": ["https://<app>/r/SampleReceiptKey"] },
      { "type": "PHONE_NUMBER", "text": "Call school", "phone_number": "+919876500001" },
      { "type": "QUICK_REPLY", "text": "Got it" }
    ] }
  ]
}
```
- **Use realistic sample values** (`VARIABLES[].sample`), not today's "sample guardian name". Reviewers judge the category partly from the samples.
- Quick replies go together at the end (or the start). Mixing them between other buttons is refused.
- A new card version needs a **new template name** (for example a `_v2` suffix), so the old approved one keeps working.

### 5.3 Sending (`whatsappMessageBody`)
```json
"components": [
  { "type": "body", "parameters": [{ "type": "text", "text": "Venkatesh" }, { "type": "text", "text": "Sri Lakshmi" }] },
  { "type": "button", "sub_type": "url", "index": "0", "parameters": [{ "type": "text", "text": "<token only>" }] },
  { "type": "button", "sub_type": "quick_reply", "index": "2", "parameters": [{ "type": "payload", "payload": "absence-ack:<messageId>" }] }
]
```
- A header and footer without blanks, and phone buttons, need no parameters.
- **`index` is the button's position in the template.** Today it is hard-coded to `"0"` (`buttonParam`). Change `Outgoing.whatsappTemplate.buttonParam` into a list: `buttons: { index, kind: "url" | "quick_reply", value }[]`.
- URL button values are the token only. `deliver.ts` already resolves `⟦parent-link:…⟧` / `⟦invite:…⟧` placeholders with `withRealLinks` and gets the receipt key with `receiptKeyIn`. Add the same "end part of the link" helpers for `/p/` and `/invite/`. **Every guardian template with a Parent Link button needs that guardian's token at send time.** Where a guardian has no active Parent Link, fall back to the version without the button (the same idea as `fee-due-office`).

### 5.4 SMS and the app are unchanged
The SMS versions (DLT-registered words) and the in-app versions keep their present texts. Only the WhatsApp versions get cards.

### 5.5 Receiving quick-reply taps (phase 2, needs the owner's OK)
- A tap arrives on the webhook as `messages[].type = "button"`, with `button.payload`, `button.text` and `context.id` (the id of the template message that was tapped). `parseMetaWebhook` already reads `button.text`, and `handleMetaWebhook` already files it in the WhatsApp Inbox when that is switched on. Phase 2 would match `context.id` to `Message.providerMessageId` and act on `payload`: mark the absence as known, record a PTM RSVP, or save the query rating.
- **The WhatsApp webhook of the shared Meta app points to another live project.** Under the shared-live-setup rule, School OS must not change it. Receiving replies needs the owner's explicit OK and a chosen route: the other project forwards School OS's `phone_number_id` events, or School OS gets its own Meta app or webhook. Until then, phase 1 sends no quick replies.
- A tap also opens WhatsApp's 24-hour customer service window. Inside it, the school can answer in free text.
