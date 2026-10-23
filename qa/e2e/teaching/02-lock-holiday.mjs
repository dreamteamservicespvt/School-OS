// Take Attendance on a locked past day, a holiday, a Sunday, a future day; as the class teacher on a phone.
import { as, visit, text, report, shot, VIEWPORTS, sql, sleep, messages } from "./h.mjs";
import { close } from "../../lib.mjs";

const SEC = "b07ca58e-2716-4729-ab56-3cdf783e5598"; // Class 5 A 2026-27
const page = await as("teacher", VIEWPORTS.phone390);
for (const [d, why] of [["2026-10-16", "past working day, after the lock"], ["2026-10-17", "Saturday inside Dasara holidays"], ["2026-10-02", "Gandhi Jayanti"], ["2026-10-11", "Sunday"], ["2026-10-10", "second Saturday (school has second Saturday off)"], ["2026-10-26", "future school day"], ["2026-10-19", "Monday inside Dasara holidays"]]) {
  await visit(page, `/attendance-management?section=${SEC}&date=${d}`, 1200);
  console.log(`\n== ${d} (${why})`);
  console.log((await text(page, 700)));
  const save = page.getByRole("button", { name: /^Save attendance|^Saved/ });
  console.log("save button:", await save.count() ? `${(await save.innerText()).replace(/\s+/g, " ")} enabled=${await save.isEnabled()}` : "none");
  const p = page.getByRole("radiogroup", { name: "Attendance for Akshara Pillai" }).getByRole("radio", { name: "Absent" });
  console.log("Absent radio for Akshara:", await p.count() ? `enabled=${await p.isEnabled()}` : "none");
  await report(page, d);
  await shot(page, `lock-${d}`, false);
}
console.log("marks 16 Oct Class 5 A:", sql(`select status_key, count(*) from attendance_mark where section_id='${SEC}' and date='2026-10-16' and archived_at is null group by 1`));
console.log("marks 10 Oct Class 5 A:", sql(`select status_key, count(*) from attendance_mark where section_id='${SEC}' and date='2026-10-10' and archived_at is null group by 1`));
await close();
