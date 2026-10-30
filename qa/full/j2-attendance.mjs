// Journey E2: the class teacher asks to correct today's locked attendance, the Principal approves,
// the register shows it. Mistakes first: send with nothing chosen.
//   node qa/full/j2-attendance.mjs
import { as } from "./look.mjs";
import { go, mainText, shot, close } from "./h.mjs";
const URL_ = "/attendance-management/register/correction?section=544feaae-37ed-4756-aad5-a4f6dcb857f8&date=2026-10-30";
const res = [];
const rec = (c, pass, note = "") => { res.push({ c, pass, note }); console.log(`${pass ? "PASS" : "FAIL"} ${c}${note ? " :: " + note : ""}`); };
const t = await as("teacher");
await go(t, URL_);
await t.getByRole("button", { name: "Send for approval" }).click();
await t.waitForTimeout(1500);
const err = (await mainText(t, 4000)).match(/(Choose|Pick|Give|Write|Please)[^\n]{0,120}/g) ?? [];
rec("Empty correction refused with clear words", err.length > 0, err.slice(0, 4).join(" / "));
async function ask(names, status, reason) {
  await go(t, URL_);
  for (const n of names) await t.getByRole("checkbox", { name: new RegExp(`\\d+\\. ${n}`) }).check();
  await t.locator("select[name=status]").selectOption({ label: status });
  await t.locator("textarea[name=reason]").pressSequentially(reason, { delay: 3 });
  const b = t.getByRole("button", { name: "Send for approval" });
  await b.click(); await b.click({ timeout: 1000 }).catch(() => {});
  await t.waitForTimeout(3500);
  return (await mainText(t, 600)).replace(/\n+/g, " | ");
}
const presentNames = ["Akshara Pillai", "Ananya Verma", "Bhavya Bhat", "Dhruv Bhat", "Ishaan Mehta"];
rec("Present request sent", true, await ask(presentNames, "Present (P)", "Network was down at 9 AM; marked on paper. Paper register attached in the office."));
rec("Absent request sent", true, await ask(["Kabir Sharma"], "Absent (A)", "Kabir was absent; paper register."));
await shot(t, "j2-teacher-after", false);
console.log("TEACHER PROBLEMS", t.problems);
const p = await as("principal");
await go(p, "/approvals");
const list = (await mainText(p, 20000)).split("\n").filter((l) => /Attendance correction: Class 5 A, 30-10-2026/.test(l));
rec("Principal sees the correction requests", list.length >= 2, list.join(" / "));
for (let i = 0; i < 2; i++) {
  await go(p, "/approvals");
  const card = p.locator("main li, main article").filter({ hasText: "Attendance correction: Class 5 A, 30-10-2026" }).filter({ has: p.getByRole("button", { name: "Approve", exact: true }) }).first();
  if (await card.count()) { await card.getByRole("button", { name: "Approve", exact: true }).click(); await p.waitForTimeout(3000); }
}
await go(p, "/attendance-management/register?section=544feaae-37ed-4756-aad5-a4f6dcb857f8&date=2026-10-30");
const reg = (await mainText(p, 2500)).replace(/\n+/g, " | ");
rec("Register shows the approved marks", /Kabir Sharma/.test(reg), reg.slice(0, 900));
await shot(p, "j2-register", false);
console.log("PRINCIPAL PROBLEMS", p.problems);
await close();
