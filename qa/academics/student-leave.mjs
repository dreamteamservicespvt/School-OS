// Student Leave: the class teacher records medical leave for Aditya Kumar (Grade 5 A), with validation;
// a student of another class cannot be chosen; a Teacher who is not class teacher cannot record it.
import { mainText, shot, close } from "../lib.mjs";
import { res, login, open, messages, sleep, sql } from "./r.mjs";

const M = "Attendance Management", P = "Student Leave", R = "Class Teacher";
const page = await login("cems.classteacher");
await open(page, "/attendance-management/student-leave");

async function openForm() {
  await page.getByRole("button", { name: "Record leave" }).first().click();
  await sleep(500);
  return page.getByRole("dialog");
}
async function pick(dlg, q, label) {
  const box = dlg.getByRole("combobox", { name: "Student" });
  if (!(await box.count())) { await dlg.getByRole("button", { name: "Change" }).click(); }
  await dlg.getByRole("combobox", { name: "Student" }).fill(q);
  await sleep(1500);
  const opts = await dlg.getByRole("listbox").getByRole("option").allInnerTexts().catch(() => []);
  if (label) await dlg.getByRole("listbox").getByRole("option", { name: new RegExp(label) }).first().getByRole("button").click();
  return opts;
}
async function save(dlg) {
  await dlg.getByRole("button", { name: "Record leave" }).click();
  await sleep(2500);
  return (await dlg.isVisible().catch(() => false)) ? (await dlg.innerText()).replace(/\s+/g, " ") : "(closed) " + (await messages(page));
}

let dlg = await openForm();
// a student of another class (Grade 6) should not be offered
const other = await pick(dlg, "Grade 6");
const g6name = sql("select s.full_name from student s join enrolment e on e.student_id=s.id join section x on x.id=e.section_id join school_class c on c.id=x.class_id where c.name='Grade 6' and e.archived_at is null limit 1;").split("\n")[2].trim();
const opts6 = await pick(dlg, g6name);
res(M, P, `Search a Grade 6 student (${g6name})`, R, "Not offered: only own class", JSON.stringify(opts6).slice(0, 200), opts6.length === 0 || !opts6.some((o) => o.includes(g6name)) ? "PASS" : "FAIL");
await pick(dlg, "Aditya", "Aditya Kumar");
// to date before from date
await dlg.locator("#rl-from").fill("2026-10-17");
await dlg.locator("#rl-to").fill("2026-10-16");
await dlg.locator("#rl-reason").fill("Demo: fever, doctor's advice");
let out = await save(dlg);
res(M, P, "To date before From date", R, "Refused in plain words", out.slice(0, 200), /before|after|earlier|later/i.test(out) && !/closed/.test(out) ? "PASS" : "FAIL");
// empty reason
await dlg.locator("#rl-from").fill("2026-10-16");
await dlg.locator("#rl-to").fill("2026-10-17");
await dlg.locator("#rl-reason").fill("   ");
out = await save(dlg);
res(M, P, "Reason only spaces", R, "Refused: reason needed", out.slice(0, 200), /reason/i.test(out) && !/closed/.test(out) ? "PASS" : "FAIL");
// valid: 16 Oct (Fri) to 17 Oct (Sat) medical; the 18th is Sunday.
await dlg.locator("#rl-reason").fill("Demo: fever, parent called at 8:10 AM (synthetic)");
await sleep(2500);
const preview = (await dlg.innerText()).replace(/\s+/g, " ");
console.log("preview:", preview.slice(0, 800));
out = await save(dlg);
res(M, P, "Record medical leave for Aditya Kumar 16-17 Oct (approve now)", R, "Saved and approved (within 3 days)", out.slice(0, 250), /closed/.test(out) && !/could not|error/i.test(out) ? "PASS" : "FAIL");
await sleep(1000);
await shot(page, "student-leave-saved");
console.log(sql("select lr.status, lr.from_date, lr.to_date, lr.days, s.full_name from leave_request lr join student s on s.id=lr.student_id order by lr.created_at desc limit 3;"));
// duplicate overlapping leave
dlg = await openForm();
await pick(dlg, "Aditya", "Aditya Kumar");
await dlg.locator("#rl-from").fill("2026-10-17");
await dlg.locator("#rl-to").fill("2026-10-17");
await dlg.locator("#rl-reason").fill("Demo duplicate");
out = await save(dlg);
res(M, P, "Overlapping leave for the same student", R, "Refused: already on leave those days", out.slice(0, 250), /already|overlap/i.test(out) && !/closed/.test(out) ? "PASS" : "FAIL");
await close();
