// Absent list: the class teacher sets Bhavya's reason after the parent calls back (Family function + note);
// Other with a too-long and an empty note; principal sees "Fees dispute".
import { as, visit, text, report, shot, VIEWPORTS, sql, sleep, messages, SUNRISE } from "./h.mjs";
import { close } from "../../lib.mjs";

const SEC = "b07ca58e-2716-4729-ab56-3cdf783e5598";
const D = "2026-10-18";
const t = await as("teacher", VIEWPORTS.phone390);
async function openFor(page, name) {
  await visit(page, `/attendance-management/register/absences?date=${D}`, 1500);
  const row = page.locator("li", { hasText: name }).last();
  await row.getByRole("button", { name: /Set reason|Change/ }).first().click();
  await sleep(1200);
  return page.getByRole("dialog");
}
let dlg = await openFor(t, "Bhavya Bhat");
console.log("options:", await dlg.getByLabel("Reason").locator("option").allInnerTexts());
await dlg.getByLabel("Reason").selectOption({ label: "Family function" });
await dlg.getByLabel("Short note").fill("Mother called at 10: cousin's wedding in Guntur");
await dlg.getByRole("button", { name: "Save reason" }).click(); await sleep(2500);
console.log("after set:", await messages(t));
console.log((await text(t, 900)));
console.log("db:", sql(`select s.full_name, m.absence_reason, m.absence_reason_source, m.absence_note from attendance_mark m join student s on s.id=m.student_id where m.section_id='${SEC}' and m.date='${D}' and m.archived_at is null and m.status_key='absent'`));
console.log("audit:", sql(`select action, left(before::text,120), left(after::text,160) from audit_log_entry where school_id='${SUNRISE}' and record_type ilike '%attendance%' order by at desc limit 2`));
await report(t, "absent list set");
await shot(t, "reasons-after-set", false);

dlg = await openFor(t, "Ananya Verma");
await dlg.getByLabel("Reason").selectOption({ label: "Other" });
await dlg.getByLabel("Short note").fill("");
await dlg.getByRole("button", { name: "Save reason" }).click(); await sleep(2000);
console.log("other+empty ->", (await dlg.innerText().catch(() => "closed")).replace(/\s+/g, " ").slice(0, 400), "|", await messages(t));
await dlg.getByLabel("Short note").fill("y".repeat(140)).catch(() => {});
console.log("note length kept:", (await dlg.getByLabel("Short note").inputValue().catch(() => "")).length);
await dlg.getByRole("button", { name: "Cancel" }).click().catch(() => {});

// Principal: does "Fees dispute" appear?
const p = await as("principal", VIEWPORTS.phone390);
dlg = await openFor(p, "Ananya Verma");
console.log("principal options:", await dlg.getByLabel("Reason").locator("option").allInnerTexts().catch(() => "no dialog"));
await dlg.getByRole("button", { name: "Cancel" }).click().catch(() => {});
console.log("principal absent list:", (await text(p, 1500)));
await report(p, "principal absent list");
await close();
