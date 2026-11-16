# School OS: what changed this weekend (14 to 16 Nov 2026)

Written for the owner. All of it is live on the test copy (school-os-beta.vercel.app, school "chaitanya"), unless a line says "not live yet".

## In one minute
- **6 rounds of testing as first-time users**, with fixes after each round. The loop log counts 743 problems found and 880 fixes made; the progress page counts about 140 commits. 13 deploys were made, each after its tests passed. The last full run was 3,445 tests, and failures caused only by machine load passed when run again on their own.
- **WhatsApp now works for real.** Every kind of message is approved by WhatsApp and arrives as a card, with a title, the key facts in bold, the school's name and buttons. The Fee received card carries the receipt PDF on top. Everything was tested on 9390011378.
- **Parent Link opens with one tap.** WhatsApp never delivers code messages to Indian (+91) numbers, so before this fix no parent could open the Parent Link. Now the parent taps the button in the school's WhatsApp message. Consent works the same way. The page warns the parent if someone else asked.
- **Your own sound brand**: one School OS signature, and every app sound is built from it. Animations are calm. The Assistant is built with your robot and cat, but it stays off until it gets an AI key.

## By role (what each person will notice)

**Parent (Parent Link on the phone)**
- The parent opens the link from the school's WhatsApp and taps once; there is no code to type. Consent works the same way. If someone else asked, the parent sees a warning.
- These arrived on your test phone as cards: fee received (with PDF), fee reminder, absent, late, homework, PTM, birthday, announcement, consent request, Parent Link. Their buttons open the parent's own Parent Link or receipt. "New notice" and "Results" are approved but were not sent in the test (decision: see below).

**Receptionist**
- Every message to a visitor or parent arrives as an approved WhatsApp card: visit registered, appointment, pickup noted.
- An enquiry asks which family when a phone matches more than one. The follow-up counts agree, and old visitor passes close with one button.
- At pickup, a child already released shows the waiting gate pass. When codes can't go, the desk is told to check the photo or ID, or call a guardian.

**Accountant**
- Collect Fee opens empty. "Full" is one tap, and the button names the amount and the mode ("Collect ₹19,798 in cash"), so a mis-tap can't post a big receipt.
- A receipt shows the balance right after that payment. The Fee received WhatsApp card carries the receipt PDF.
- Defaulters ageing groups now hold the right students. "Collected" says whether it is before or after refunds, so the dashboard and the report agree.

**Class Teacher**
- Attendance shows "Not saved yet" until it is saved, and every letter has a key; H is Half-day, and a holiday is HOL.
- On a leave day, the teacher sees that the class needs cover.
- In Send Message, picking a student reaches that student's parents, and only templates the teacher can fill are offered.

**Subject Teacher**
- Grade-only papers say "Grade paper" and are never counted as 0%.
- "Next class" appears only when the time table has one, and the homework words are shorter.

**Principal**
- "Who is absent today" first lists the classes that haven't taken attendance.
- A teacher on leave shows as "needs cover".
- The false "6 students failing" alert is gone: their grades are A, A and B.

**School Admin**
- Message Templates pages through every template, and the approvals box stays until WhatsApp answers.
- Send Message starts on "One person", never on the whole school.
- The Parent Link count reads "1 of 8 guardians". Two-step status is the same on Users and on each person's profile.

## Decisions waiting for you
See docs/qa/layman-loop.md, "Needs the owner's decision". The new ones from this night:
- **21. Pickup check:** a code can't go by WhatsApp. Build "tap to approve" for the guardian, or connect SMS?
- **22. Meta business verification:** this lifts the cap of 250 WhatsApp texts. The receipt PDF is fixed.
- **24. "New notice" and "Results" WhatsApp cards:** they are approved, but Send Message can't fill their title or exam name for one person. They go only from the Notice and Results pages to whole classes. Should we test them with one real class?
- **23. Admission consent at the counter:** a code can't go by WhatsApp. Allow a signed paper form, or confirm later by a Parent Link tap?

## Only you can do these
1. Rotate the WhatsApp token and the Firebase key that were shared in an old WhatsApp chat (Govardhan, 23-10-2026), then delete that message.
2. Verify the Meta business (it lifts the 250-template cap).
3. Add an AI key in the server settings (never in chat) to switch on the Assistant's free talk.
4. Decide whether the app icon should become the book mark (decision 20).
