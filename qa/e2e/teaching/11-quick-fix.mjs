// A teacher marks Ishaan Mehta absent by mistake and fixes it 2 minutes later, inside the 15-minute wait
// (05-attendance A4: "after a short wait ... so a teacher's quick correction does not send a wrong message").
import { as, visit, VIEWPORTS, sql, sleep, messages } from "./h.mjs";
import { close, BASE } from "../../lib.mjs";
const SEC = "b07ca58e-2716-4729-ab56-3cdf783e5598";
const D = "2026-10-18";
const t = await as("teacher", VIEWPORTS.phone390);
const set = async (status) => {
  await visit(t, `/attendance-management?section=${SEC}&date=${D}`, 1500);
  await t.getByRole("radiogroup", { name: "Attendance for Ishaan Mehta" }).getByRole("radio", { name: status }).click();
  await t.getByRole("button", { name: /^Save attendance/ }).click(); await sleep(4000);
  console.log(new Date().toISOString(), `saved Ishaan ${status}:`, await messages(t));
};
await set("Absent");
const alert = () => sql(`select a.status, a.created_at from attendance_alert a join student s on s.id=a.student_id where s.full_name='Ishaan Mehta' and a.date='${D}'`);
for (let i = 0; i < 4; i++) {
  await sleep(30000);
  // a scheduler's call (deploy/vercel README: called every few minutes); takes no input
  const r = await fetch(`${BASE}/api/v1/jobs/tick`).then((x) => x.json()).catch((e) => ({ err: String(e) }));
  console.log(new Date().toISOString(), "tick:", JSON.stringify(r), "alert:", JSON.stringify(alert()));
}
await set("Present");
console.log("jobs:", sql(`select status, run_after, finished_at, result::text from background_job where kind='attendance-after-save' order by created_at desc limit 3`));
console.log("alert at end:", alert());
await close();
