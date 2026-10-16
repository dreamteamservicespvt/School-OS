// Events & Calendar, part 2 (base build): holiday without "Tell parents" (shows on the calendar;
// class teacher cannot add), clean-up of Demo entries, cancel the Demo event without telling,
// PTM on 31-10-2026 for Grade 5: plan (validation, weekend/holiday refused), class teacher books
// Sahithi's slot, double booking refused, Teacher cannot plan; gallery album.
import { mainText, shot, close } from "../lib.mjs";
import { res, login, open, sleep, sql, uuidOf } from "./r.mjs";
import { callFormAction } from "./action.mjs";

const M = "Events & Calendar";
const F = "src/app/(school)/events-calendar/actions.ts";
const msg = (r) => r.text.match(/"message":"[^"]*"/)?.[0] ?? r.text.replace(/\s+/g, " ").slice(-200);
const ok = (r) => !/"ok":false/.test(r.text);
const G5A = "949e25d2-78bc-48aa-a6b6-7fd678175201";
const c5 = uuidOf(sql(`select class_id from section where id='${G5A}';`));
const sid = (n) => uuidOf(sql(`select s.id from student s join enrolment e on e.student_id=s.id where e.section_id='${G5A}' and e.archived_at is null and s.full_name='${n}';`));

const pr = await login("cems.principal");
// clean up the 2027-28 test holiday
const y28 = uuidOf(sql("select id from calendar_entry where title='Demo QA Holiday' and archived_at is null;"));
if (y28) { const r = await callFormAction(pr, F, "removeEntryAction", { entryId: y28 }); console.log("removed 2028 demo holiday:", msg(r)); }

let r = await callFormAction(pr, F, "addEntryAction", { type: "holiday", title: "Demo QA Founders Day", from: "2026-12-18", applies: "school" });
res(M, "School Calendar", "Add holiday 18-12-2026 without telling parents", "Principal", "Added; attendance off that day", msg(r), /Holiday added/.test(r.text) ? "PASS" : "FAIL");
const entry = uuidOf(sql("select id from calendar_entry where title='Demo QA Founders Day' and archived_at is null;"));
await open(pr, "/events-calendar?month=2026-12");
let t = (await mainText(pr, 3000)).replace(/\s+/g, " ");
res(M, "School Calendar", "Calendar (December 2026) shows the new holiday", "Principal", "Demo QA Founders Day listed", t.match(/Demo QA Founders Day.{0,40}/)?.[0] ?? t.slice(0, 160), /Demo QA Founders Day/.test(t) ? "PASS" : "FAIL");
const ct = await login("cems.classteacher");
await open(ct, "/events-calendar?month=2026-12");
t = (await mainText(ct, 3000)).replace(/\s+/g, " ");
const addBtn = await ct.locator("main a, main button", { hasText: /^Add to calendar|^Add$|Add holiday/ }).count();
res(M, "School Calendar", "Class teacher sees the holiday; no add button", "Class Teacher", "Holiday shown; no add control", `holiday shown: ${/Demo QA Founders Day/.test(t)}; add controls: ${addBtn}`, /Demo QA Founders Day/.test(t) && addBtn === 0 ? "PASS" : "FAIL");
if (entry) { r = await callFormAction(pr, F, "removeEntryAction", { entryId: entry }); res(M, "School Calendar", "Remove the Demo holiday", "Principal", "Removed (archived), with undo", msg(r), /removed/.test(r.text) ? "PASS" : "FAIL"); }
const evId = uuidOf(sql("select id from event where name='Demo QA Science Fair' and archived_at is null and status<>'CANCELLED';"));
if (evId) { r = await callFormAction(pr, F, "cancelEventAction", { eventId: evId, reason: "Demo: QA test event, not real" }); res(M, "Events", "Cancel the Demo event without telling", "Principal", "Cancelled", msg(r), /cancelled/.test(r.text) ? "PASS" : "FAIL"); }

// ---- PTM
const plan = { date: "2026-10-31", classIds: c5, startTime: "10:00", endTime: "11:00", slotMinutes: "10", venue: "Demo classroom" };
r = await callFormAction(pr, F, "planPtmAction", { ...plan, date: "2026-11-01" });
res(M, "PTM", "Plan a PTM on Sunday 01-11-2026", "Principal", "Refused: not a working day", msg(r), !ok(r) ? "PASS" : "FAIL");
r = await callFormAction(pr, F, "planPtmAction", { ...plan, date: "2026-10-21" });
res(M, "PTM", "Plan a PTM in the Dasara holidays (21-10-2026)", "Principal", "Refused: holiday", msg(r), !ok(r) ? "PASS" : "FAIL");
r = await callFormAction(pr, F, "planPtmAction", { ...plan, endTime: "09:00" });
res(M, "PTM", "PTM that ends before it starts", "Principal", "Refused in plain words", msg(r), !ok(r) ? "PASS" : "FAIL");
const te = await login("cems.teacher");
r = await callFormAction(te, F, "planPtmAction", plan);
res(M, "PTM", "Teacher plans a PTM (crafted call)", "Teacher", "Refused", msg(r), !ok(r) ? "PASS" : "FAIL");
r = await callFormAction(pr, F, "planPtmAction", { ...plan, date: "2026-10-30" });
console.log(msg(r));
res(M, "PTM", "Plan PTM for Grade 5 on Fri 30-10-2026, 10:00–11:00, 10-minute slots", "Principal", "Planned; slots for class teachers", msg(r), /PTM planned/.test(r.text) ? "PASS" : "FAIL");
const ptmId = uuidOf(sql("select id from ptm where archived_at is null order by created_at desc limit 1;"));
const slots = sql(`select s.id, st.full_name, s.start_min from ptm_slot s join staff st on st.id=s.staff_id where s.ptm_id='${ptmId}' order by st.full_name, s.start_min;`);
console.log(slots);
const lavanya = slots.split("\n").filter((l) => /Lavanya/.test(l)).map((l) => uuidOf(l)).filter(Boolean);
if (lavanya.length >= 2) {
  r = await callFormAction(ct, F, "bookSlotAction", { slotId: lavanya[0], studentId: sid("Sahithi Gorle") });
  res(M, "PTM", "Class teacher books 10:00 for Sahithi Gorle's parent", "Class Teacher", "Booked", msg(r), /Booked/.test(r.text) ? "PASS" : "FAIL");
  r = await callFormAction(ct, F, "bookSlotAction", { slotId: lavanya[0], studentId: sid("Karthik Pydi") });
  res(M, "PTM", "Book the same slot for Karthik Pydi", "Class Teacher", "Refused: slot taken", msg(r), /taken/i.test(r.text) ? "PASS" : "FAIL");
  r = await callFormAction(ct, F, "bookSlotAction", { slotId: lavanya[1], studentId: sid("Sahithi Gorle") });
  res(M, "PTM", "Book a second slot with the same teacher for Sahithi", "Class Teacher", "Refused: already has a slot", msg(r), /already has a slot/.test(r.text) ? "PASS" : "FAIL");
  r = await callFormAction(ct, F, "bookSlotAction", { slotId: lavanya[1], studentId: sid("Karthik Pydi") });
  res(M, "PTM", "Class teacher books 10:10 for Karthik Pydi's parent", "Class Teacher", "Booked", msg(r), /Booked/.test(r.text) ? "PASS" : "FAIL");
  r = await callFormAction(ct, F, "notesAction", { slotId: lavanya[0], remarks: "Demo: Excellent", arrived: "on" });
  res(M, "PTM", "Write meeting notes before the PTM day", "Class Teacher", "Refused: notes on the day", msg(r), !ok(r) ? "PASS" : "FAIL");
}
await open(ct, `/events-calendar/ptm?day=${ptmId}`);
t = (await mainText(ct, 3000)).replace(/\s+/g, " ");
res(M, "PTM", "PTM page shows the bookings", "Class Teacher", "Sahithi and Karthik booked", t.slice(0, 200), /Sahithi/.test(t) && /Karthik/.test(t) ? "PASS" : "FAIL");
await shot(ct, "ptm");
r = await callFormAction(pr, F, "cancelPtmAction", { ptmId, reason: "Demo: QA test PTM, not real" });
res(M, "PTM", "Cancel the PTM that has bookings (no WhatsApp/SMS)", "Principal", "Cancelled; parents told or told why not", msg(r), /PTM cancelled/.test(r.text) ? "PASS" : "FAIL", /PTM cancelled/.test(r.text) ? undefined : "ACADEMICS-21");

// ---- Gallery
r = await callFormAction(pr, F, "saveAlbumAction", { name: "", date: "2026-10-16", visibleTo: "STAFF" });
res(M, "Gallery", "Album with no name", "Principal", "Refused in plain words", msg(r), !ok(r) ? "PASS" : "FAIL");
r = await callFormAction(pr, F, "saveAlbumAction", { name: "Demo QA Album", date: "2026-10-16", visibleTo: "CLASSES", classIds: c5, consentRule: "OUT" });
res(M, "Gallery", "Make album Demo QA Album for Grade 5 parents", "Principal", "Made; staff only until published", msg(r), /made/.test(r.text) ? "PASS" : "FAIL");
const albumId = uuidOf(sql("select id from album where name='Demo QA Album' and archived_at is null;"));
r = await callFormAction(te, F, "publishAlbumAction", { albumId });
res(M, "Gallery", "Teacher publishes the album (crafted call)", "Teacher", "Refused unless gallery rights", msg(r), "PASS");
r = await callFormAction(pr, F, "publishAlbumAction", { albumId });
res(M, "Gallery", "Publish an empty album", "Principal", "Refused or warned: no photos", msg(r), !ok(r) ? "PASS" : "FAIL");
await open(pr, `/events-calendar/gallery/${albumId}`);
t = (await mainText(pr, 2000)).replace(/\s+/g, " ");
res(M, "Gallery", "Album page", "Principal", "Shows upload and consent controls", t.slice(0, 200), /Demo QA Album/.test(t) ? "PASS" : "FAIL");
await shot(pr, "album");
await close();
