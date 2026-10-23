// Workflow 6 on a phone as the class teacher (teacher, Class 5 A): record leave (mistakes first), approve own short
// leave, send a long one to the Principal, an overlap; Take Attendance and the register show Leave.
import { as, visit, text, report, shot, VIEWPORTS, sql, sleep, messages, SUNRISE } from "./h.mjs";
import { close } from "../../lib.mjs";

const SEC = "b07ca58e-2716-4729-ab56-3cdf783e5598";
const vp = process.env.VP ?? "phone390";
const t = await as("teacher", VIEWPORTS[vp]);

async function openForm() {
  await visit(t, "/attendance-management/student-leave", 1500);
  await t.getByRole("button", { name: "Record leave" }).first().click();
  await sleep(1000);
  return t.getByRole("dialog");
}
async function pick(dlg, name) {
  const box = dlg.getByRole("combobox", { name: "Student" });
  await box.fill(name.split(" ")[0]); await sleep(1500);
  const opt = dlg.getByRole("option").filter({ hasText: name }).first();
  console.log("  options:", (await dlg.getByRole("listbox").innerText().catch(() => "none")).replace(/\s+/g, " ").slice(0, 200));
  await opt.getByRole("button").click(); await sleep(1200);
}
async function save(dlg, label) {
  await dlg.getByRole("button", { name: "Record leave", exact: true }).click(); await sleep(2500);
  const open = await dlg.isVisible().catch(() => false);
  console.log(`${label} -> dialog ${open ? "still open: " + (await dlg.innerText()).replace(/\s+/g, " ").slice(0, 500) : "closed"} | ${await messages(t)}`);
}

// 1. Empty save
let dlg = await openForm();
console.log("form:", (await dlg.innerText()).replace(/\s+/g, " ").slice(0, 600));
await shot(t, `leave-${vp}-form`, false);
await report(t, "leave form");
await save(dlg, "empty");
// 2. Kabir Sharma, Medical, today only, approve now (class teacher within 3 days)
await pick(dlg, "Kabir Sharma");
console.log("preview:", (await dlg.innerText()).replace(/\s+/g, " ").slice(0, 700));
// to before from
await dlg.locator("#rl-from").fill("2026-10-27");
await dlg.locator("#rl-to").fill("2026-10-26");
await dlg.locator("#rl-reason").fill("Fever, doctor advised rest");
await sleep(1500);
console.log("to<from preview:", (await dlg.innerText()).replace(/\s+/g, " ").slice(0, 900));
await save(dlg, "to before from");
await dlg.locator("#rl-from").fill("2026-10-18");
await dlg.locator("#rl-to").fill("2026-10-18");
await sleep(1500);
console.log("today preview:", (await dlg.innerText()).replace(/\s+/g, " ").slice(0, 900));
await shot(t, `leave-${vp}-kabir`, false);
await save(dlg, "Kabir today medical");
console.log("db:", sql(`select s.full_name, r.status, r.from_date, r.to_date, r.days from leave_request r join student s on s.id=r.student_id where r.school_id='${SUNRISE}' and s.full_name='Kabir Sharma' order by r.created_at desc limit 2`));

// 3. Overlap: Kabir again on 18 Oct
dlg = await openForm();
await pick(dlg, "Kabir Sharma");
await dlg.locator("#rl-from").fill("2026-10-18"); await dlg.locator("#rl-to").fill("2026-10-18");
await dlg.locator("#rl-reason").fill("Duplicate by mistake");
await sleep(1500);
console.log("overlap preview:", (await dlg.innerText()).replace(/\s+/g, " ").slice(0, 700));
await save(dlg, "overlap");
await dlg.getByRole("button", { name: /Cancel|Close/ }).first().click().catch(() => {});

// 4. Long leave (holiday, 4 school days) for Meghana Nair goes to the Principal
dlg = await openForm();
await pick(dlg, "Meghana Nair");
const types = await dlg.locator("#rl-type").locator("option").allInnerTexts();
console.log("types:", types);
await dlg.locator("#rl-type").selectOption({ label: types.find((x) => /holiday/i.test(x)) ?? types[0] });
await dlg.locator("#rl-from").fill("2026-10-27"); await dlg.locator("#rl-to").fill("2026-11-02");
await dlg.locator("#rl-reason").fill("Family trip to Tirupati");
await sleep(1500);
console.log("long preview:", (await dlg.innerText()).replace(/\s+/g, " ").slice(0, 900));
await save(dlg, "Meghana long");
console.log("db:", sql(`select s.full_name, r.status, r.from_date, r.to_date, r.days, r.approval_id from leave_request r join student s on s.id=r.student_id where r.school_id='${SUNRISE}' and s.full_name='Meghana Nair' order by r.created_at desc limit 2`));

// 5. List and Take Attendance
await visit(t, "/attendance-management/student-leave?status=all", 1500);
console.log("\nlist:", (await text(t, 1800)));
await report(t, "leave list");
await shot(t, `leave-${vp}-list`, true);
await visit(t, `/attendance-management?section=${SEC}&date=2026-10-18`, 1500);
console.log("\nKabir in Take Attendance:", (await t.locator("li", { hasText: "Kabir Sharma" }).innerText()).replace(/\s+/g, " "));
console.log("mark:", sql(`select m.status_key, m.leave_request_id is not null from attendance_mark m join student s on s.id=m.student_id where s.full_name='Kabir Sharma' and m.date='2026-10-18' and m.archived_at is null and m.section_id='${SEC}'`));
console.log("problems", t.problems);
await close();
