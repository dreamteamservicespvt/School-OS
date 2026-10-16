// In-app notifications made by the people workflows, as each recipient sees them, and that the link opens the right record.
import { go, close } from "../lib.mjs";
import { as } from "./session.mjs";
import { res } from "./res.mjs";

const CASES = [
  { login: "cems.classteacher", role: "Class Teacher", match: /Demo Varun Teja leaves early at 9:30 AM with Demo Prasad Teja/, event: "early pickup (Front Office release)", opens: /Demo Varun Teja/ },
  { login: "cems.principal", role: "Principal", match: /New appointment: Demo Appointment Lakshmi/, event: "appointment booked with the Principal", opens: null },
  { login: "cems.principal", role: "Principal", match: /Waive Fees clearance for Harini Inti \(CEMS\/2026\/0181\): ₹30,600/, event: "fee clearance waiver to approve", opens: /Harini Inti/ },
  { login: "cems.office", role: "Office Staff", match: /Transfer certificate \(TC\) for Harini Inti .*approved/, event: "TC approved, back to the office", opens: /Harini Inti/ },
];
for (const c of CASES) {
  const page = await as(c.login);
  await go(page, "/notifications");
  await page.waitForTimeout(1200);
  const main = page.locator("main");
  const t = (await main.innerText()).replace(/\s+/g, " ");
  const found = c.match.test(t);
  let opened = "";
  if (found && c.opens) {
    const item = main.locator("button[type=submit]").filter({ hasText: c.match }).first();
    if (await item.count()) { await item.click(); await page.waitForTimeout(2000); opened = `${page.url().replace(/.*:\d+/, "")} ${(await page.locator("main").innerText()).replace(/\s+/g, " ").slice(0, 120)}`; }
  }
  const ok = found && (!c.opens || c.opens.test(opened));
  res({ module: "Communication", page: "Notifications", action: `In-app notification: ${c.event}`, role: c.role, expected: "Right person; names the student, amount or time; the link opens the record", actual: `${(t.match(new RegExp(`.{0,40}${c.match.source}.{0,80}`)) ?? [t.slice(0, 160)])[0]} || opened: ${opened || "-"}`, status: ok ? "PASS" : "FAIL" });
}
await close();
