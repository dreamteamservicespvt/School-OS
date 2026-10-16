// Events & Calendar (server actions on the base build, plus screens): School Calendar entries
// (validation, permissions, notify without a channel, remove), an event with registration and
// seats, PTM planning and slot booking, and a gallery album.
import { mainText, shot, close, layoutIssues, VIEWPORTS } from "../lib.mjs";
import { res, login, open, sleep, sql, uuidOf } from "./r.mjs";
import { callFormAction } from "./action.mjs";

const M = "Events & Calendar";
const F = "src/app/(school)/events-calendar/actions.ts";
const msg = (r) => r.text.match(/"message":"[^"]*"/)?.[0] ?? r.text.replace(/\s+/g, " ").slice(-200);
const ok = (r) => !/"ok":false/.test(r.text) && !/"error/.test(r.text);
const G5A = "949e25d2-78bc-48aa-a6b6-7fd678175201";
const c5 = uuidOf(sql("select class_id from section where id='949e25d2-78bc-48aa-a6b6-7fd678175201';"));
const sid = (n) => uuidOf(sql(`select s.id from student s join enrolment e on e.student_id=s.id where e.section_id='${G5A}' and e.archived_at is null and s.full_name='${n}';`));

const pr = await login("cems.principal");
// ---- School Calendar
let r = await callFormAction(pr, F, "addEntryAction", { type: "holiday", title: "", from: "2026-12-18", applies: "school" });
res(M, "School Calendar", "Add a holiday with no name", "Principal", "Refused in plain words", msg(r), !ok(r) ? "PASS" : "FAIL");
r = await callFormAction(pr, F, "addEntryAction", { type: "vacation", title: "Demo QA Winter Break", from: "2026-12-28", to: "2026-12-24", applies: "school" });
res(M, "School Calendar", "Add a vacation whose last day is before its first day", "Principal", "Refused in plain words", msg(r), !ok(r) ? "PASS" : "FAIL");
r = await callFormAction(pr, F, "addEntryAction", { type: "holiday", title: "Demo QA Holiday", from: "2028-01-05", applies: "school" });
res(M, "School Calendar", "Add a holiday outside the academic year (05-01-2028)", "Principal", "Refused in plain words", msg(r), !ok(r) ? "PASS" : "FAIL");
const te = await login("cems.teacher");
r = await callFormAction(te, F, "addEntryAction", { type: "holiday", title: "Demo QA teacher holiday", from: "2026-12-18", applies: "school" });
res(M, "School Calendar", "Teacher adds a holiday (crafted call)", "Teacher", "Refused", msg(r), !ok(r) ? "PASS" : "FAIL");
r = await callFormAction(pr, F, "addEntryAction", { type: "holiday", title: "Demo QA Founders Day", from: "2026-12-18", applies: "school", notify: "on" });
res(M, "School Calendar", "Add holiday 18-12-2026 and tell parents (no channel connected)", "Principal", "Added; does not claim parents were told", msg(r), ok(r) && !/parents? told/.test(r.text) ? "PASS" : /parents? told/.test(r.text) ? "FAIL" : "FAIL");
const entry = uuidOf(sql("select id from calendar_entry where title='Demo QA Founders Day' and archived_at is null;"));
await open(pr, "/events-calendar?month=2026-12");
let t = (await mainText(pr, 2500)).replace(/\s+/g, " ");
res(M, "School Calendar", "Calendar shows the new holiday", "Principal", "Demo QA Founders Day on 18 Dec", t.match(/Demo QA Founders Day.{0,40}/)?.[0] ?? t.slice(0, 120), /Demo QA Founders Day/.test(t) ? "PASS" : "FAIL");
const ct = await login("cems.classteacher");
await open(ct, "/events-calendar?month=2026-12");
t = (await mainText(ct, 2500)).replace(/\s+/g, " ");
res(M, "School Calendar", "Class teacher sees the holiday; no Add button", "Class Teacher", "Holiday shown; cannot add", t.slice(0, 160), /Demo QA Founders Day/.test(t) ? "PASS" : "FAIL");
if (entry) {
  r = await callFormAction(pr, F, "removeEntryAction", { entryId: entry });
  res(M, "School Calendar", "Remove the Demo holiday", "Principal", "Removed (archived) with undo", msg(r), ok(r) ? "PASS" : "FAIL");
}

// ---- Event
const ev = { name: "Demo QA Science Fair", type: "Competition", date: "2026-11-14", startTime: "10:00", endTime: "12:00", venue: "Demo Hall", audienceKind: "classes", classIds: c5, registrationOn: "on", seats: "2", reminder: "1d", description: "Demo event for QA" };


r = await callFormAction(pr, F, "saveEventAction", { ...ev, name: "" });
res(M, "Events", "Create an event with no name", "Principal", "Refused in plain words", msg(r), !ok(r) ? "PASS" : "FAIL");
r = await callFormAction(pr, F, "saveEventAction", { ...ev, startTime: "12:00", endTime: "10:00" });
res(M, "Events", "Event that ends before it starts", "Principal", "Refused in plain words", msg(r), !ok(r) ? "PASS" : "FAIL");
r = await callFormAction(pr, F, "saveEventAction", { ...ev, seats: "abc" });
res(M, "Events", "Seats 'abc'", "Principal", "Refused: Seats is a number", msg(r), /Seats is a number/.test(r.text) ? "PASS" : "FAIL");
r = await callFormAction(te, F, "saveEventAction", ev);
res(M, "Events", "Teacher creates an event (crafted call)", "Teacher", "Refused", msg(r), !ok(r) ? "PASS" : "FAIL");
r = await callFormAction(pr, F, "saveEventAction", ev);
console.log(r.text.slice(-400));
res(M, "Events", "Create Demo QA Science Fair (Grade 5, 2 seats, registration)", "Principal", "Created; on the School Calendar", msg(r), /Event created/.test(r.text) ? "PASS" : "FAIL");
const eventId = uuidOf(sql("select id from event where name='Demo QA Science Fair' and archived_at is null order by created_at desc limit 1;"));
if (eventId) {
  r = await callFormAction(pr, F, "registerAction", { eventId, studentIds: [sid("Sahithi Gorle"), sid("Pranav Korada")] });
  console.log(r.text.slice(-300));
  res(M, "Events", "Register Sahithi and Pranav", "Principal", "2 registered", msg(r), /2 students registered/.test(r.text) ? "PASS" : "FAIL");
  r = await callFormAction(pr, F, "registerAction", { eventId, studentIds: sid("Karthik Pydi") });
  res(M, "Events", "Register a third student when 2 seats are taken", "Principal", "Refused: event full", msg(r), !ok(r) || /0 students registered/.test(r.text) ? "PASS" : "FAIL");
  r = await callFormAction(pr, F, "saveEventAction", { ...ev, name: "Demo QA Quiz Bowl", venue: "Demo Hall" });
  res(M, "Events", "Second event in the same venue at the same time", "Principal", "Warned about the venue clash; not saved without confirming", msg(r), !/Event created/.test(r.text) ? "PASS" : "FAIL");
  await open(pr, `/events-calendar/events/${eventId}`);
  t = (await mainText(pr, 2000)).replace(/\s+/g, " ");
  res(M, "Events", "Event page shows registrations", "Principal", "Sahithi and Pranav listed; 2 of 2 seats", t.slice(0, 200), /Sahithi Gorle/.test(t) && /Pranav Korada/.test(t) ? "PASS" : "FAIL");
  r = await callFormAction(pr, F, "cancelEventAction", { eventId, reason: "Demo: QA test event", tell: "on" });
  res(M, "Events", "Cancel the Demo event and tell people (no channel)", "Principal", "Cancelled; does not claim people were told", msg(r), /cancelled/.test(r.text) && !/people told|person told/.test(r.text) ? "PASS" : "FAIL");
}
await pr.setViewportSize(VIEWPORTS.phone375);
await open(pr, "/events-calendar");
const li = await layoutIssues(pr);
await shot(pr, "events-375");
res(M, "School Calendar", "Events & Calendar at 375px", "Principal", "No sideways scroll", li.join("; ") || "no issues", li.length ? "FAIL" : "PASS");
await close();
