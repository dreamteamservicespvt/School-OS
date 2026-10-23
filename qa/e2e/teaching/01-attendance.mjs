// Workflow 5 on a phone: Class Teacher (teacher, Sunrise, Class 5 A) opens Take Attendance from
// the home screen, marks all present, two absent and one late with a note, saves; saves again;
// checks the database has one mark per student and the absence alerts are queued once.
import { as, visit, text, report, shot, VIEWPORTS, sql, one, sleep, messages, finding, SUNRISE } from "./h.mjs";
import { close } from "../../lib.mjs";

const SEC = "b07ca58e-2716-4729-ab56-3cdf783e5598"; // Class 5 A 2026-27
const DATE = process.env.DATE ?? "2026-10-18";
const vp = process.env.VP ?? "phone390";
const page = await as("teacher", VIEWPORTS[vp]);

await visit(page, "/dashboard", 1500);
// The home screen's Take attendance button for Class 5 A
const takeLinks = page.getByRole("link", { name: /take attendance/i });
console.log("take attendance links on home:", await takeLinks.count());
for (let i = 0; i < (await takeLinks.count()); i++) console.log("  ", await takeLinks.nth(i).getAttribute("href"), (await takeLinks.nth(i).innerText()).replace(/\s+/g, " "));
await takeLinks.first().click();
await page.waitForLoadState("load"); await sleep(1500);
console.log("landed:", page.url());
console.log((await text(page, 900)));
await report(page, "take from home");

// Before: marks in the DB for that day
console.log("marks before:", sql(`select status_key, count(*) from attendance_mark where section_id='${SEC}' and date='${DATE}' and archived_at is null group by 1`));

// Mark all present
const allBtn = page.getByRole("button", { name: /all present/i });
console.log("All present button:", await allBtn.count(), await allBtn.first().isEnabled().catch(() => "?"));
if (await allBtn.first().isEnabled()) { await allBtn.first().click(); await sleep(600); } else console.log("All present is disabled: everyone already starts present");
console.log("after all present:", await messages(page));
// confirm prompt?
const confirm = page.getByRole("button", { name: /yes|mark all|confirm/i });
if (await confirm.count()) { console.log("confirm prompt:", (await confirm.first().innerText())); }

const absent = ["Ananya Verma", "Bhavya Bhat"], late = "Dhruv Bhat";
for (const n of absent) await page.getByRole("radiogroup", { name: `Attendance for ${n}` }).getByRole("radio", { name: "Absent" }).click();
await page.getByRole("radiogroup", { name: `Attendance for ${late}` }).getByRole("radio", { name: "Late" }).click();
// Note on the late student
const lateRow = page.locator("li", { hasText: late });
await lateRow.getByRole("button", { name: /add note/i }).click(); await sleep(600);
const dlg = page.getByRole("dialog");
console.log("note dialog:", (await dlg.innerText().catch(() => "none")).replace(/\s+/g, " ").slice(0, 600));
await shot(page, `att-${vp}-note-dialog`, false);
const ta = dlg.locator("textarea, input[type=text]").first();
if (await ta.count()) {
  await ta.fill("Came at 9:15, bus late");
  const done = dlg.getByRole("button", { name: /done|save|keep|ok/i }).first();
  console.log("note done button:", await done.innerText().catch(() => "?"));
  await done.click(); await sleep(500);
}
await report(page, "after marking");
const saveBtn = page.getByRole("button", { name: /^Save attendance|^Saved|^Saving/ });
const label = (await saveBtn.innerText()).replace(/\s+/g, " ");
console.log("save label:", label);
await shot(page, `att-${vp}-before-save`, false);
const box = await saveBtn.boundingBox();
console.log("save button box:", box, "viewport", page.viewportSize());
// Double-tap the Save button like a hurried teacher
await saveBtn.dblclick();
await sleep(5000);
console.log("after save:", await messages(page));
console.log((await text(page, 600)));
await shot(page, `att-${vp}-saved`, false);
await report(page, "after save");
console.log("marks after save:", sql(`select status_key, count(*), count(distinct student_id) from attendance_mark where section_id='${SEC}' and date='${DATE}' and archived_at is null group by 1`));
console.log("all rows incl archived:", one(`select count(*) from attendance_mark where section_id='${SEC}' and date='${DATE}'`));
console.log("submissions:", sql(`select outcome, count(*) from attendance_submission where section_id='${SEC}' and date='${DATE}' group by 1`));
console.log("alerts:", sql(`select a.kind, a.status, count(*) from attendance_alert a join student s on s.id=a.student_id where a.date='${DATE}' and a.school_id='${SUNRISE}' group by 1,2`));
console.log("note:", sql(`select s.full_name, m.status_key, m.note from attendance_mark m join student s on s.id=m.student_id where m.section_id='${SEC}' and m.date='${DATE}' and m.archived_at is null and m.status_key<>'present'`));

// Save again: reload, change Bhavya to present and back to absent, save
await visit(page, `/attendance-management?section=${SEC}&date=${DATE}`, 1500);
console.log("reopen:", (await text(page, 500)));
await page.getByRole("radiogroup", { name: `Attendance for Bhavya Bhat` }).getByRole("radio", { name: "Present" }).click();
await page.getByRole("radiogroup", { name: `Attendance for Bhavya Bhat` }).getByRole("radio", { name: "Absent" }).click();
const s2 = page.getByRole("button", { name: /^Save attendance|^Saved/ });
console.log("second save label:", (await s2.innerText()).replace(/\s+/g, " "), "enabled", await s2.isEnabled());
await s2.click(); await sleep(5000);
console.log("after second save:", await messages(page));
console.log("marks after 2nd save:", sql(`select status_key, count(*), count(distinct student_id) from attendance_mark where section_id='${SEC}' and date='${DATE}' and archived_at is null group by 1`));
console.log("all rows incl archived:", one(`select count(*) from attendance_mark where section_id='${SEC}' and date='${DATE}'`));
console.log("alerts:", sql(`select s.full_name, a.kind, a.status, a.channels, a.created_at from attendance_alert a join student s on s.id=a.student_id where a.date='${DATE}' and a.school_id='${SUNRISE}' order by 1`));
console.log("jobs:", sql(`select kind, status, run_after, count(*) from background_job where school_id='${SUNRISE}' and created_at > now() - interval '15 minutes' group by 1,2,3`));
console.log("problems:", page.problems);
await close();
