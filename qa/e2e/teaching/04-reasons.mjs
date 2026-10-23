// Absence reasons: the principal switches them on (Attendance Settings, More options); the class teacher picks a
// reason in Take Attendance on a phone, then sets one later from the Absent list in the register.
import { as, visit, text, report, shot, VIEWPORTS, sql, sleep, messages, SUNRISE } from "./h.mjs";
import { close } from "../../lib.mjs";

const SEC = "b07ca58e-2716-4729-ab56-3cdf783e5598";
const D = "2026-10-18";
if (!process.env.SKIP_ON) {
  const p = await as("principal", VIEWPORTS.phone390);
  await visit(p, "/attendance-management/settings", 1200);
  const row = p.locator("li, div").filter({ hasText: /^Absence reasons/ }).last();
  const btn = p.getByRole("button", { name: /Switch on/ }).filter({ hasText: /Switch on/ });
  // find the Switch on next to "Absence reasons"
  const block = p.locator(":is(li,div)").filter({ hasText: "Absence reasons" }).filter({ has: p.getByRole("button", { name: /Switch (on|off)/ }) });
  const n = await block.count();
  const target = block.nth(n - 1);
  console.log("block:", (await target.innerText()).replace(/\s+/g, " ").slice(0, 200));
  await target.getByRole("button", { name: /Switch on/ }).click(); await sleep(1500);
  const dlg = p.getByRole("dialog");
  if (await dlg.count()) { console.log("dialog:", (await dlg.innerText()).replace(/\s+/g, " ")); await dlg.getByRole("button", { name: /Switch on|Yes|Confirm/ }).last().click(); await sleep(2000); }
  console.log("after switch:", await messages(p));
  console.log("feature:", sql(`select feature_key, is_on from school_feature where school_id='${SUNRISE}' and feature_key='attendance-absence-reasons'`));
  await report(p, "settings switch");
  await shot(p, "reasons-switched", false);
}
// Teacher: Take Attendance, today's absent rows show a reason
const t = await as("teacher", VIEWPORTS.phone390);
await visit(t, `/attendance-management?section=${SEC}&date=${D}`, 1500);
console.log("take:", (await text(t, 900)));
const ana = t.locator("li", { hasText: "Ananya Verma" });
console.log("Ananya row:", (await ana.innerText()).replace(/\s+/g, " "));
await ana.getByRole("button").filter({ hasText: /Reason|Not known/ }).first().click().catch((e) => console.log("no reason button", e.message.slice(0, 80)));
await sleep(800);
const dlg = t.getByRole("dialog");
console.log("reason dialog:", (await dlg.innerText().catch(() => "none")).replace(/\s+/g, " ").slice(0, 700));
await shot(t, "reasons-take-dialog", false);
const rg = dlg.getByRole("radiogroup", { name: /Reason for the absence/ });
console.log("reason choices:", await rg.getByRole("radio").allInnerTexts().catch(() => []));
await rg.getByRole("radio", { name: /Sick/ }).click().catch((e) => console.log("no Sick", e.message.slice(0, 80)));
await dlg.getByRole("button", { name: /Save note|Done|Save/ }).last().click().catch(() => {});
await sleep(600);
console.log("Ananya row now:", (await ana.innerText()).replace(/\s+/g, " "));
const save = t.getByRole("button", { name: /^Save attendance|^Saved/ });
console.log("save:", (await save.innerText()).replace(/\s+/g, " "));
await save.click(); await sleep(4000);
console.log("saved:", await messages(t));
console.log("db reasons:", sql(`select s.full_name, m.status_key, m.absence_reason, m.absence_reason_source, m.absence_note from attendance_mark m join student s on s.id=m.student_id where m.section_id='${SEC}' and m.date='${D}' and m.archived_at is null and m.status_key='absent'`));
await report(t, "take with reasons");

// Absent list in the register: set Bhavya's reason later (parent called back)
await visit(t, `/attendance-management/register/absences?date=${D}`, 1500);
console.log("\nabsent list:", (await text(t, 1500)));
await report(t, "absent list");
await shot(t, "reasons-absent-list", true);
await close();
