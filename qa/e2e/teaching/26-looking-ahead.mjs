// Looking ahead on Early Warnings: the Principal (phone) adds one suggestion for review and marks one "not a concern";
// what the class teacher sees; the Dashboard card.
import { as, visit, text, report, shot, VIEWPORTS, sql, sleep, messages, SUNRISE } from "./h.mjs";
import { close } from "../../lib.mjs";


async function tag(page, phrase, btn) {
  return page.evaluate(([phrase, btn]) => {
    const bs = [...document.querySelectorAll("button")].filter((b) => b.textContent.trim() === btn && b.offsetParent);
    for (const b of bs) { let a = b.parentElement; for (let i = 0; i < 6 && a; i++, a = a.parentElement) { if (a.textContent.includes(phrase)) { if (a.textContent.split(" may ").length <= 6) { b.setAttribute("data-qa", "hit"); return a.textContent.replace(/\s+/g, " ").slice(0, 300); } break; } } }
    return null;
  }, [phrase, btn]);
}
const p = await as("principal", VIEWPORTS.phone390);
await visit(p, "/reports-analytics/early-warnings", 2000);
const sec = p.locator("section, div").filter({ hasText: /^Looking ahead/ }).first();
await report(p, "ew principal phone");
await shot(p, "ahead-principal-phone", true);
console.log("item:", await tag(p, "Harini Mishra (Class 1 A) may", "Add for review"));
await p.locator("[data-qa=hit]").click(); await sleep(2500);
console.log("add for review ->", await messages(p));
await p.evaluate(() => document.querySelectorAll("[data-qa]").forEach((e) => e.removeAttribute("data-qa")));
console.log("item2:", await tag(p, "Class 2 may do worse", "Not a concern"));
await p.locator("[data-qa=hit]").click(); await sleep(2500);
console.log("not a concern ->", await messages(p));
await visit(p, "/reports-analytics/early-warnings", 2000);
console.log("item3:", await tag(p, "Vihaan Varma (Class 1 B) may", "Not a concern"));
await p.locator("[data-qa=hit]").click(); await sleep(2500);
console.log("not a concern (leaving) ->", await messages(p));
await p.evaluate(() => document.querySelectorAll("[data-qa]").forEach((e) => e.removeAttribute("data-qa")));
console.log("item4:", await tag(p, "Harini Mishra (Class 1 A) may end the year", "Add for review"));
await p.locator("[data-qa=hit]").click(); await sleep(2500);
console.log("add for review (attendance) ->", await messages(p));
console.log("flags for Harini (students area):", sql(`select f.area, f.status, left(f.reason,80) from risk_flag f join student s on s.id=f.student_id where s.full_name='Harini Mishra' and f.school_id='${SUNRISE}' order by f.raised_at desc limit 4`));
console.log("audit:", sql(`select action, record_type, left(after::text,160) from audit_log_entry where school_id='${SUNRISE}' and (record_type ilike '%forecast%' or action ilike '%forecast%' or action ilike '%ahead%') order by at desc limit 3`));
await visit(p, "/dashboard", 2000);
console.log("\ndashboard looking ahead:", ((await text(p, 20000)).match(/Looking ahead.{0,600}/) ?? ["(none)"])[0]);
await p.context().close();
const t = await as("teacher", VIEWPORTS.phone390);
await visit(t, "/reports-analytics/early-warnings", 2000);
console.log("\nteacher looking ahead:", ((await text(t, 20000)).match(/Looking ahead.{0,800}/) ?? ["(none)"])[0]);
await visit(t, "/dashboard", 2000);
console.log("\nteacher dashboard looking ahead:", ((await text(t, 20000)).match(/Looking ahead.{0,400}/) ?? ["(none)"])[0]);
await close();
