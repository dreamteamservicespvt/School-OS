// After leave is approved for a day already saved, does saving Take Attendance again turn the mark into Leave?
import { as, visit, text, VIEWPORTS, sql, sleep, messages } from "./h.mjs";
import { close } from "../../lib.mjs";
const SEC = "b07ca58e-2716-4729-ab56-3cdf783e5598";
const t = await as("teacher", VIEWPORTS.phone390);
await visit(t, `/attendance-management?section=${SEC}&date=2026-10-18`, 1500);
console.log((await text(t, 500)));
const kab = t.locator("li", { hasText: "Kabir Sharma" });
console.log("Kabir row:", (await kab.innerText()).replace(/\s+/g, " "));
const save = t.getByRole("button", { name: /^Save attendance|^Saved/ });
console.log("save:", (await save.innerText()).replace(/\s+/g, " "), await save.isEnabled());
// Change Ishaan Mehta to Late then back to Present to make the sheet dirty, then save
await t.getByRole("radiogroup", { name: "Attendance for Ishaan Mehta" }).getByRole("radio", { name: "Late" }).click();
await t.getByRole("radiogroup", { name: "Attendance for Ishaan Mehta" }).getByRole("radio", { name: "Present" }).click();
console.log("save now:", (await save.innerText()).replace(/\s+/g, " "), await save.isEnabled());
if (await save.isEnabled()) { await save.click(); await sleep(4000); console.log("after:", await messages(t)); }
console.log("Kabir mark:", sql(`select m.status_key, m.leave_request_id is not null from attendance_mark m join student s on s.id=m.student_id where s.full_name='Kabir Sharma' and m.date='2026-10-18' and m.archived_at is null and m.section_id='${SEC}'`));
await visit(t, `/attendance-management/register`, 1500);
const row = t.locator("tr", { hasText: "Kabir Sharma" });
console.log("register Kabir:", (await row.innerText()).replace(/\s+/g, " "));
await close();
