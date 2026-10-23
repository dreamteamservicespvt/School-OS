// Early Warnings as the class teacher on a phone: open Pooja Verma's attendance flag (basis, reason mix, numbers vs the
// register), review with an empty note (refused), mark reviewed; close Vivek Yadav's marks flag as not a concern.
import { as, visit, text, report, shot, VIEWPORTS, sql, sleep, messages, SUNRISE } from "./h.mjs";
import { close } from "../../lib.mjs";

const t = await as("teacher", VIEWPORTS[process.env.VP ?? "phone390"]);
await visit(t, "/reports-analytics/early-warnings", 1500);
await t.locator(":text('Pooja Verma'):visible").first().click(); await sleep(1500);
let d = t.getByRole("dialog");
console.log("flag:", (await d.innerText().catch(async () => await text(t, 2000))).replace(/\s+/g, " ").slice(0, 1500));
await shot(t, "ew-pooja-flag", false);
await report(t, "flag detail");
const rv = d.getByRole("link", { name: /Review/ }).or(d.getByRole("button", { name: /Review/ })).first();
console.log("review control:", await rv.count());
await rv.click(); await sleep(1500);
d = t.getByRole("dialog");
console.log("review sheet:", (await d.innerText()).replace(/\s+/g, " ").slice(0, 800));
await d.getByRole("button", { name: /Mark reviewed/ }).click(); await sleep(1500);
console.log("empty note ->", await messages(t), "|", (await d.innerText()).match(/(Write|note|needed)[^.]*\./gi)?.slice(0, 2));
await d.getByLabel("Note").fill("Spoke to the mother: Pooja had chickenpox in August (12 days). Attendance fine since.");
await d.getByRole("button", { name: /Mark reviewed/ }).click(); await sleep(2500);
console.log("reviewed ->", await messages(t));
console.log("db:", sql(`select f.area, f.status, left(f.basis::text,200), (select left(r.note,50)||' / '||r.decision from flag_review r where r.flag_id=f.id order by r.created_at desc limit 1) from risk_flag f join student s on s.id=f.student_id where s.full_name='Pooja Verma' and f.school_id='${SUNRISE}'`).slice(0, 3));
// Vivek: not a concern
await visit(t, "/reports-analytics/early-warnings", 1500);
await t.locator(":text('Vivek Yadav'):visible").first().click(); await sleep(1500);
d = t.getByRole("dialog");
console.log("\nvivek flag:", (await d.innerText()).replace(/\s+/g, " ").slice(0, 700));
await d.getByRole("link", { name: /Review/ }).or(d.getByRole("button", { name: /Review/ })).first().click(); await sleep(1500);
d = t.getByRole("dialog");
await d.getByRole("radio", { name: /Not a concern/i }).or(d.getByRole("button", { name: /Not a concern/i })).first().click();
await d.getByLabel("Note").fill("Was unwell on the Hindi exam day; doctor's note seen.");
await d.getByRole("button", { name: /Close the flag/ }).click(); await sleep(2500);
console.log("not a concern ->", await messages(t));
await visit(t, "/reports-analytics/early-warnings", 1500);
console.log("\nlist now:", (await text(t, 1500)));
await close();
