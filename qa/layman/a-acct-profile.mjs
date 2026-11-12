// Layman A: what an Accountant (View, for fees only) sees on a student's profile; and student list export.
import { asRole, go, mainText, sleep, close, snap } from "../full/selftest-A-h.mjs";
const p = await asRole("accountant");
const ID = "7fb68bce-c215-4acf-a55f-8e0790ac7b03";
await go(p, `/student-management/students/${ID}`); await sleep(1000);
const t = await mainText(p, 6000);
console.log("TABS/TOP", t.slice(0, 900).replace(/\n/g, " | "));
for (const tab of ["Exams", "Behaviour", "Documents", "Communication", "Timeline"]) {
  const b = p.getByRole("tab", { name: tab }).or(p.locator("main a, main button").filter({ hasText: new RegExp(`^${tab}$`) })).first();
  if (!(await b.count())) { console.log(`TAB ${tab}: not offered`); continue; }
  await b.click(); await sleep(1800);
  console.log(`TAB ${tab}:`, (await mainText(p, 9000)).split("Personal details")[0].slice(-500).replace(/\n/g, " | "));
}
await snap(p, "acct-profile");
console.log("PROBLEMS", p.problems);
await close();
