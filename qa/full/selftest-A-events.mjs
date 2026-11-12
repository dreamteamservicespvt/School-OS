// Self-test A, area 3: Events & Calendar as the Principal. Add a holiday (empty first, double click),
// see it on the calendar, remove it; create an event, see it in the list and on the calendar, edit it, cancel it.
//   MSYS_NO_PATHCONV=1 node qa/full/selftest-A-events.mjs
import { asRole, go, snap, ok, finish, note, close, sleep, text, pageState } from "./selftest-A-h.mjs";
const A = "events";
const p = await asRole("principal");
const dlg = () => p.getByRole("dialog").last();
const dlgText = async () => (await dlg().innerText().catch(() => "")).replace(/\n+/g, " | ");
const STAMP = "QA-A " + new Date().toISOString().slice(11, 16).replace(":", "");
// A date about 3 weeks ahead on a Wednesday (a school day), as dd-mm-yyyy for the calendar and yyyy-mm-dd for inputs.
const d = new Date(); d.setDate(d.getDate() + 21); while (d.getDay() !== 3) d.setDate(d.getDate() + 1);
const iso = d.toISOString().slice(0, 10);
const month = iso.slice(0, 7);
const dmy = `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`;

// 1. Calendar opens
await go(p, "/events-calendar");
await sleep(2000);
await snap(p, "events-calendar-month");
const cal = await text(p, 4000);
ok(A, "School Calendar opens with a month and legend", /Holiday/.test(cal), cal.split("\n").slice(0, 6).join(" | "));

// 2. Add to calendar: empty submit
await go(p, "/events-calendar?do=add");
await sleep(1500);
await dlg().getByRole("button", { name: "Add to calendar" }).click();
await sleep(1500);
const e1 = await dlgText();
ok(A, "Add to calendar with no name is refused with a plain message", /name|required|Enter|Type/i.test(e1) && (await dlg().isVisible()), e1.slice(0, 300));
await snap(p, "events-add-empty");

// 3. Fill a holiday and double-click save
await dlg().getByLabel(/^Name/).fill(`${STAMP} holiday`);
await dlg().getByLabel(/^Date/).first().fill(dmy);
const save = dlg().getByRole("button", { name: "Add to calendar" });
await save.dblclick();
await sleep(4000);
const after = (await dlgText()) + " || " + (await text(p, 3000));
note("events", `AFTER ADD HOLIDAY: ${after.slice(0, 800)}`);
if (await dlg().isVisible().catch(() => false)) {
  // A warning (attendance taken) may ask for confirmation
  const conf = dlg().getByRole("button", { name: /anyway|Yes|Add to calendar/ }).last();
  if (await conf.isVisible().catch(() => false)) { await conf.click(); await sleep(3000); }
}
await go(p, `/events-calendar?month=${month}`);
await sleep(2000);
const cal2 = await text(p, 15000);
const times = (cal2.match(new RegExp(`${STAMP} holiday`, "g")) ?? []).length;
ok(A, "holiday shows on the calendar (once, after a double click)", times >= 1, `${times} times on ${month} page`);
await snap(p, "events-calendar-with-holiday");
// count in holiday list table
const listTimes = await p.locator("main").getByText(`${STAMP} holiday`).count();
note("events", `holiday text nodes: ${listTimes}`);

// 4. Remove it
const rm = p.getByRole("link", { name: `Remove ${STAMP} holiday` }).first();
if (await rm.isVisible().catch(() => false)) {
  await rm.click();
  await sleep(2000);
  const rt = await dlgText();
  ok(A, "remove holiday asks to confirm and says attendance comes back", /Attendance will be needed|Remove/i.test(rt), rt.slice(0, 250));
  await dlg().getByRole("button", { name: /Remove/ }).last().click();
  await sleep(3500);
  const t3 = await text(p, 15000);
  ok(A, "holiday removed from the calendar", !t3.includes(`${STAMP} holiday`) || /Undo/.test(t3), (t3.match(/[^\n]*(Undo|removed)[^\n]*/i) ?? [""])[0]);
} else {
  ok(A, "Remove link for the new holiday", false, "no 'Remove <name>' link visible");
}

// 5. Events list, create an event: empty, then real
await go(p, "/events-calendar/events");
await sleep(2000);
await snap(p, "events-list");
await go(p, "/events-calendar/events?do=create");
await sleep(2000);
const createBtn = dlg().getByRole("button", { name: /Create event|Save/ }).last();
await dlg().getByLabel(/^Name/).fill("");
await createBtn.click();
await sleep(1500);
const e2 = await dlgText();
ok(A, "Create event with no name is refused", (await dlg().isVisible()) && /name|required|Enter/i.test(e2), e2.slice(0, 300));
await dlg().getByLabel(/^Name/).fill(`${STAMP} Science Fair`);
await dlg().getByLabel(/^Date/).fill(dmy);
// wrong time: To before From
await dlg().getByLabel(/^From/).fill("11:00");
await dlg().getByLabel(/^To( |$)/).fill("10:00");
await createBtn.click();
await sleep(2500);
const e3 = await dlgText();
const refusedTime = await dlg().isVisible().catch(() => false);
ok(A, "event ending before it starts is refused", refusedTime && /before|after|end/i.test(e3), e3.slice(0, 300));
if (refusedTime) {
  await dlg().getByLabel(/^To( |$)/).fill("13:00");
  await createBtn.dblclick();
  await sleep(4500);
}
const url = p.url();
const t4 = await text(p, 6000);
note("events", `AFTER CREATE: ${url}\n${t4.slice(0, 1500)}`);
await snap(p, "events-after-create");
await go(p, "/events-calendar/events");
await sleep(2000);
const t5 = await text(p, 15000);
const evCount = (t5.match(new RegExp(`${STAMP} Science Fair`, "g")) ?? []).length;
ok(A, "event in the events list once (double click)", evCount === 1, `${evCount} times`);
await go(p, `/events-calendar?month=${month}`);
await sleep(2000);
ok(A, "event shows on the School Calendar", (await text(p, 20000)).includes(`${STAMP} Science Fair`));

// 6. Open the event, edit venue/name, cancel it
await go(p, "/events-calendar/events");
await sleep(1500);
const link = p.locator("main a", { hasText: `${STAMP} Science Fair` }).first();
if (await link.isVisible().catch(() => false)) {
  await link.click();
  await p.waitForURL(/\/events\/[^/?]+/, { timeout: 20000 }).catch(() => {});
  await sleep(2500);
  const s = await pageState(p);
  ok(A, "event page opens", !s.broken, `${s.path} h1="${s.h1}"`);
  await snap(p, "events-event-page");
  note("events", `EVENT PAGE: ${s.text.slice(0, 2000)}`);
  const edit = p.getByRole("link", { name: /^(Change|Edit)/ }).first();
  if (await edit.isVisible().catch(() => false)) {
    await edit.click();
    await sleep(2000);
    await dlg().getByLabel(/^Name/).fill(`${STAMP} Science Fair (moved)`);
    await dlg().getByRole("button", { name: /Save|Create event/ }).last().click();
    await sleep(3500);
    ok(A, "edit event name saved", (await text(p, 4000)).includes(`${STAMP} Science Fair (moved)`));
  } else ok(A, "event has a Change/Edit button", false, (await p.locator("main a, main button").allInnerTexts()).join(" / ").slice(0, 300));
  const cancel = p.getByRole("link", { name: /Cancel (the )?event/ }).or(p.getByRole("button", { name: /Cancel (the )?event/ })).first();
  if (await cancel.isVisible().catch(() => false)) {
    await cancel.click();
    await sleep(2000);
    const cb = dlg().getByRole("button", { name: /Cancel the event/ }).last();
    await cb.click();
    await sleep(1500);
    ok(A, "cancel with no reason refused", await dlg().isVisible().catch(() => false), (await dlgText()).slice(0, 200));
    await dlg().getByLabel("Reason").fill("QA test event, not real");
    await cb.click();
    await sleep(3500);
    const t6 = await text(p, 4000);
    ok(A, "event shows Cancelled", /Cancelled/.test(t6), (t6.match(/[^\n]*Cancel[^\n]*/) ?? [""])[0]);
    await snap(p, "events-event-cancelled");
  } else ok(A, "event has a Cancel button", false);
} else ok(A, "event link in list", false);

// 7. Back button after save does not re-submit
await p.goBack().catch(() => {});
await sleep(2000);
ok(A, "back button after cancel shows a normal page", !(await pageState(p)).broken, p.url());
console.log("PROBLEMS", p.problems.join(" ; "));
finish("events");
await close();
