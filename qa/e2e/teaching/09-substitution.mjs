// Workflow 7, steps 6 to 8 on a phone as the School Admin (office): assign a substitute for one period, then
// "Arrange all"; the suggestions must be free teachers; the Time Table and the substitute see the cover.
import { as, visit, text, report, shot, VIEWPORTS, sql, sleep, messages, SUNRISE } from "./h.mjs";
import { close } from "../../lib.mjs";

const D = "2026-10-28";
const who = process.env.WHO ?? "admin";
const a = await as(who, VIEWPORTS.phone390);
await visit(a, `/academic-management/substitutions?date=${D}`, 1500);
const p2 = a.locator("li, div").filter({ hasText: /^Period 2/ }).filter({ has: a.getByRole("button", { name: /Assign substitute/ }) }).last();
await a.getByRole("button", { name: /Assign substitute/ }).first().click(); await sleep(1500);
let dlg = a.getByRole("dialog");
console.log("assign dialog:", (await dlg.innerText()).replace(/\s+/g, " ").slice(0, 1500));
await shot(a, "subs-assign-phone", false);
await report(a, "assign dialog");
// pick the first suggestion
const radios = dlg.getByRole("radio");
console.log("radio count:", await radios.count());
const sel = dlg.locator("select");
if (await sel.count()) console.log("select options:", await sel.first().locator("option").allInnerTexts());
const submit = dlg.getByRole("button", { name: /^Assign|^Save/ }).last();
console.log("submit:", await submit.innerText().catch(() => "?"));
await submit.click(); await sleep(3000);
console.log("after assign:", await messages(a));
console.log((await text(a, 1500)));
console.log("db:", sql(`select p.period_no, s.status, st.full_name from substitution s left join staff st on st.id=s.substitute_staff_id left join timetable_period p on p.id=s.period_id where s.date='${D}' and s.archived_at is null and s.school_id='${SUNRISE}' order by 1`));

// Arrange all remaining
const all = a.getByRole("button", { name: /Arrange all/ });
if (await all.count()) {
  await all.first().click(); await sleep(1500);
  dlg = a.getByRole("dialog");
  console.log("\narrange all dialog:", (await dlg.innerText()).replace(/\s+/g, " ").slice(0, 1500));
  await shot(a, "subs-arrange-all-phone", false);
  await dlg.getByRole("button", { name: /^Assign|^Save|^Arrange|^Confirm/ }).last().click(); await sleep(3500);
  console.log("after arrange all:", await messages(a));
}
await visit(a, `/academic-management/substitutions?date=${D}`, 1500);
console.log("\nlist:", (await text(a, 2000)));
console.log("db:", sql(`select p.period_no, s.status, st.full_name from substitution s left join staff st on st.id=s.substitute_staff_id left join timetable_period p on p.id=s.period_id where s.date='${D}' and s.archived_at is null and s.school_id='${SUNRISE}' order by 1`));
await report(a, "after");
await shot(a, "subs-after-phone", true);
await close();
