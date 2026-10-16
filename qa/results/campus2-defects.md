# Campus 2 QA: Inventory, Hostel, Staff & HR (and one Library leftover)

Tested on 16-10-2026 against the production build at http://localhost:3000 (branch
`claude/chaitanya-qa-audit-s5vm34`), through the real screens in Chromium. Demo school
"Chaitanya EM School — QA Demo". All data was synthetic, and every record created is named "QA Demo …".
Results: `qa/results/campus2.jsonl`. Scripts: `qa/campus2/`.

Before testing, the Inventory, Hostel and Library switches in Settings, Modules On/Off were already **On**
for CEMS, so nothing was changed. WhatsApp, SMS and Email were all **Off** (Settings, SMS, WhatsApp & Email).
The school profile does not say CEMS has a hostel. The two QA Demo hostels exist only as demo data.

Records created: items QA Demo Notebook 9186 and 1569, vendor QA Demo Paper Mart 6374, PR-0001,
PO/2026-27/0001 (and an order waiting for approval), GRN-0001, bill QA-B-72643 (paid ₹5,400), place QA Demo Room 0720,
MR-0001/MR-0002, asset AT-0001 (a disposal is waiting for approval), a stock audit with 1 difference waiting for
approval, book set QA Demo Class 5 set 5174, hostels QA Demo Boys Hostel and QA Demo Girls Hostel (rooms B-101,
B-102, G-101; B-101 Bed 1 blocked "QA Demo broken cot"), outing passes GP-2026-0004 to 0006, incident HI-2026-0001,
mess expense EXP/2026-27/00010, staff QA Demo Staff 8853 (CEMS-ST-048, resignation in progress, contract document)
and QA Demo Aadhaar Check, leave for Demo Pavan Seela on 12-11-2026 (approved) and for HR on 19-11-2026 (waiting),
and an open library stock check session. Nothing was deleted.

## Defects

| ID | Priority | Module | Title |
|---|---|---|---|
| CAMPUS2-01 | P3 | Inventory | Stock out says "What it was used for" is optional, then refuses an empty one |
| CAMPUS2-02 | P2 | Inventory, Hostel, Staff & HR | A refused form clears the drop-down choices (item, staff member, bed) but keeps the typed text |
| CAMPUS2-03 | P4 | Staff & HR | Add Staff step 1 accepts a malformed Aadhaar; the problem shows only at "Create staff" |
| CAMPUS2-04 | — | Hostel | Not a defect: late-return alert works (number kept so the IDs stay stable) |
| CAMPUS2-05 | P3 | Hostel | "Parents are told when their child goes out and comes back" while no WhatsApp, SMS or Email is connected |
| CAMPUS2-06 | P3 | Hostel | Allocation scrolls sideways on a 375px phone (hostel switcher) |
| CAMPUS2-07 | P4 | Staff & HR | Staff List count says "Showing 25 of 48"; the blueprint and other lists say "Showing 1 to 25 of 48" |

---

### CAMPUS2-01 · P3 · Stock out says the note is optional, then refuses it empty

**Steps** (Store Keeper, `cems.store`)
1. Inventory Management, Items & Stock, **Stock out** (`/inventory-management/items?open=out`).
2. Choose QA Demo Notebook 1569, Main store, quantity 1. Leave **What it was used for** empty. Its placeholder says
   "Optional" and it has no required mark.
3. Press **Record stock out**.

**What the screen said:** "Say what it was used for."

**Expected:** saved, because the form marks the box optional. Or, if the school wants a reason, the box shows the
required star and no "Optional" placeholder.

**Cause:** the sheet and the server disagree.
- `src/app/(school)/inventory-management/_components/sheets.tsx:176`: `required={kind !== "OUT"}` and
  `placeholder={kind === "OUT" ? "Optional" : …}`.
- `src/lib/inventory/stock.ts:273`: `if (input.reason.trim().length < (input.kind === "OUT" ? 3 : 5)) throw … "Say what it was used for."`

**Suggested fix:** pick one rule. To keep it optional, change line 273 to check only when `kind !== "OUT"`
(an empty note for OUT is fine; still cap the length). Or make the field required for OUT and drop the "Optional" placeholder.

---

### CAMPUS2-02 · P2 · A refused form clears the drop-downs but keeps the typed text

After the server refuses a form for one field, every `<select>` on the form goes back to its first option ("Choose…"),
while text boxes keep what was typed. The person has to notice and choose again. If they don't, the next submit
fails with a new and confusing error. Seen in three modules:

| Where | Steps | What the screen said / showed |
|---|---|---|
| Inventory, Purchases & Vendors, **Raise a purchase request** (`?new=1`) | Choose QA Demo Notebook 1569, quantity 200, rate 45, leave Reason empty, press Send for approval | "Reason needs at least 5 characters." The item box then shows **Choose an item** while quantity 200 and rate 45 stay, and "Total ₹9,000" still shows. After typing the reason and pressing again: "Choose the item on line 1." |
| Staff & HR, **Staff Exit, Record exit** (`/staff-hr-management/exit/new`) | Choose a staff member, Date received today, Last working day 30 days ago, reason, press Record exit | "Last working day is before the date received." The **Staff member** box goes back to **Choose**; dates and reason stay. |
| Hostel, Allocation, **Move student** (`?move=<id>`) | Choose bed B-102, leave Reason empty, press Move student | "Reason needs at least 3 characters." Then, with the reason typed, pressing again gives "Choose the bed." The bed box had reset. |

**Expected:** after a refusal, every field keeps what the person chose (00-global.md: prevent mistakes, explain
them, let people recover; P7).

**Cause:** these forms post with React 19 `<form action={formAction}>`, and React resets the form after every action.
Text inputs come back because they are re-rendered with the posted value as `defaultValue` (or are controlled).
A `<select>` does not: a changed `defaultValue` is not applied to a mounted select, and a controlled select's DOM
value is reset while React state still holds the old choice. So the screen and the state disagree (the request
total still counts the item).
- `src/app/(school)/inventory-management/_components/client.tsx:95` (`ItemLines`, controlled `<select name="itemId" value={r.itemId}>`). This is used by purchase requests, orders, issues and book sets.
- `src/app/(school)/staff-hr-management/exit/exit-forms.tsx:13` (`SelectField name="staffId" defaultValue={f.val("staffId", …)}`), posted by `ActionForm` in `src/app/(school)/staff-hr-management/_components/forms.tsx:57`.
- `src/app/(school)/hostel-management/_components/sheets.tsx:259`, `MoveSheet`: `<select key={f.key} name="bedId" defaultValue={f.value}>` with `useTyped("bedId", "")`. `useTyped` (`src/components/ui/url-sheet.tsx:120`) brings a select back only from `state.values[name]`. The hostel action helper puts `values` in a refused state only when it was given the FormData (`src/lib/hostel/act.ts:35`). So the move refusal for the empty reason probably comes back without `values.bedId`, and the select remounts empty. Check that every refused path passes `fd`.

**Suggested fix:** do it once in the shared form wrappers (`SheetForm`, `InlineForm`, `ActionForm`, `FormDialog`).
Submit with `onSubmit` + `startTransition(() => formAction(new FormData(form)))` and `preventDefault()`, so React does
not auto-reset, and reset only on success. A smaller fix: give each select `key={postedValue}` so it remounts with the
posted value, or re-apply the select value in a `useEffect` after each refused state. Add a test that submits a refused
form and checks that the select keeps its value.

---

### CAMPUS2-03 · P4 · Add Staff step 1 lets a malformed Aadhaar through to the end

**Steps** (HR, `cems.hr`)
1. Staff & HR, Add Staff. Fill name "QA Demo Aadhaar Check …", a valid phone, a designation.
2. Open More details and type Aadhaar `12AB`. The screen's `pattern` attribute was removed to act like a browser
   or app that ignores it (a pasted value would also do this).
3. Press **Next**. Step 1 is accepted and step 2 opens. Untick login, press Next, then **Create staff**.

**What the screen said:** step 1 passed. Only at Create staff did it say "Aadhaar has 2 digits. It must have 12 digits."
and go back to step 1.

**Expected:** step 1's server check (`checkDetails`) refuses it, as it does for phone, birth date and name, so the
person isn't sent back after finishing steps 2 and 3.

**Cause:** `src/lib/staff/schemas.ts:24`: `aadhaar: optionalText("Aadhaar", 14)` (length only). The real check
`checkAadhaar()` (`src/lib/staff/staff.ts:27`) runs only in `createStaff` (`staff.ts:162`).

**Suggested fix:** add `.refine((v) => !v || !checkAadhaar(v), …)` (or a superRefine using `checkAadhaar`) to
`detailsSchema.aadhaar` and `personalSchema` so the step-1 check and the profile edit say it at once.

---

### CAMPUS2-04 · Not a defect: hostel late-return alert works

Outing pass GP-2026-0006 (Demo మేఘన Lanka) was due back at 1:53 PM. With Hostel Settings "Late alert after 15 minutes", the
`hostel-late-returns` job (every 15 minutes, `src/lib/hostel/jobs.ts`) alerted both the warden and the Principal at 2:15 PM:
"Demo not returned (due 1:53 PM). Out with Demo Lakshmi Lanka, 9876501299." Marking her returned recorded "51 min late".
The earlier checks that said "no alert yet" were looking for her full name. The alert uses the first name, which is "Demo" in
this demo data. With real names it reads "Meghana not returned …". No ID is reused for another defect.

---

### CAMPUS2-05 · P3 · Outing passes page says parents are told while no channel can send

**Steps** (Hostel Warden, `cems.warden`)
1. Settings, SMS, WhatsApp & Email: WhatsApp **Off**, SMS **Off**, Email **Off** (checked as `cems.admin`).
2. Hostel Management, Outing & Visitors (`/hostel-management/outings`). Read the line under the passes list.

**What the screen said:** "… New outings are back by 6:00 PM unless you change it. **Parents are told when their child
goes out and comes back.**"

**Expected:** no claim that parents are told while no channel is connected. For example: "Messages to parents are
switched on in Hostel Settings, but no WhatsApp or SMS is connected, so nothing is sent. Connect one in Settings, SMS,
WhatsApp & Email." The Inventory purchase-order email gets this right: "Email is switched off for this school
(Settings, Messaging). Download the PDF and send it yourself."

**Cause:** `src/app/(school)/hostel-management/outings/page.tsx:201` builds the sentence only from the hostel's
own switches (`s.messageOnOut || s.messageOnReturn`) and never checks whether a channel can send.

**Suggested fix:** read the school's channel state (the same source the purchase-order email uses) and show the
"nothing is sent" wording when WhatsApp and SMS are both off or in test mode. Check the other hostel words that promise a
parent message the same way (incident "Inform parent", late-return message).

---

### CAMPUS2-06 · P3 · Allocation scrolls sideways on a phone

**Steps:** sign in as `cems.warden` at 375 × 740 and open Hostel Management, Allocation (`/hostel-management/allocation`)
when the warden has two hostels.

**What the screen showed:** the page scrolls sideways (387px wide on a 375px screen). The overflowing element is the
hostel switcher link "QA Demo Girls Hostel".

**Expected:** no sideways scroll at 375px (00-global.md, phones).

**Cause:** `src/app/(school)/hostel-management/allocation/page.tsx:158` puts `SegLinks` ("All", each hostel's name)
beside the chips. `SegLinks` (`src/components/ui/blocks.tsx:72-77`) is `inline-flex` with `whitespace-nowrap` links,
so long hostel names cannot wrap or shrink.

**Suggested fix:** on phones let the switcher scroll inside itself (`max-w-full overflow-x-auto` on the nav, as
`data-scroll-x` lists do), or use a `UrlSelect` for the hostel when there are two or more. Rooms & Beds and Roll Call
use the same switcher and fit only because their rows are laid out differently.

---

### CAMPUS2-07 · P4 · Staff List count wording

**Steps:** `cems.hr`, Staff & HR Management (Staff List), scroll to the foot of the list.

**What the screen said:** "Showing 25 of 48" (with Show more).

**Expected:** 09-staff-hr-management.md, Staff List: count "Showing 1 to 24 of 43". 00-global.md §9 says every list
has a count "Showing 1 to 25 of 432". The app has three wordings:
`src/components/ui/blocks.tsx:260` ("Showing 25 of 340"), `src/components/ui/data-list.tsx:158`
("Showing 1–25 of 140") and `data-list.tsx:181` ("Showing 1 to 25 of 140").

**Suggested fix:** use one wording, "Showing 1 to 25 of 48", in all three footers.

---

## Checked and working (highlights)

- Inventory: duplicate item code ("Code ST-0002 belongs to …. Use the next code: ST-0003."), duplicate item name, a
  120-character limit checked on the server, stock out and transfer above stock blocked with the stock shown, the low-stock
  banner and notification, issues to staff (returnable, return), to a student (₹45 to fees) and a book set (₹135 to fees),
  both seen in the student's fee ledger. Also checked: vendor phone and GSTIN checks, duplicate phone and GSTIN (lower case too) showing
  the existing vendor; a purchase request above ₹5,000 waiting in Approvals, approved by the Principal, ordered, part
  received, over-receipt asking for a reason; a bill needing a photo above ₹2,000, a duplicate bill number warning; the bill
  paid by the Accountant and shown in the Day Book; a direct order above the limit waiting for approval; the duplicate
  asset tag; disposal needing approval; a stock audit changing stock only after approval; maintenance requests.
- Hostel: hostels are added by the School Admin and a warden is assigned. The warden adds rooms (a duplicate room number
  is refused). One bed per student, and only beds of the right hostel are offered. An outing pass can't be marked
  out before approval, a late return shows "not returned (due 1:33 PM) · 2 min late", and returned late is recorded.
  Night roll call absence alerts the Principal (the warden who saved it is not notified about their own action,
  by design: `src/lib/notifications.ts:21`). Also checked: the visitor must name the student, and a person not on the
  authorised list needs the warden's approval; a maintenance incident raises MR-0002; the mess expense reaches Finance;
  move, block (an occupied bed is refused), check out.
- Staff & HR: phone 5, 12 and 10 digits not starting 6 to 9, a future birth date, under 16, a 152-letter name, a name with no
  letters, and the duplicate phone warning ("This phone belongs to QA Demo Staff 8853 (Support Staff)") were all
  caught. Also checked: leave overlap, leave beyond balance and to-before-from refused; leave approved by the Principal and the
  balance updated; HR not offered their own leave to approve; document upload refusing no file and .txt; Expiring
  soon status; resignation with handover.
- Roles: Teacher has no Inventory or Hostel menu and is refused every page and sheet by URL. The Accountant has
  Inventory read-only (no change sheets) and no Hostel. For both, Staff & HR is their own profile and leave only. School B's admin
  never saw a CEMS item, asset, order, staff member, exit or hostel, by URL or in lists.
- Library leftover: scanning 99999 in a stock check says "99999 is not in the catalogue. Kept as extra."
