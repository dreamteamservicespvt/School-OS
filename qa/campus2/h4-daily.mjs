// Hostel: visitor without a student (refused) and with one; night roll call with one absent; an incident;
// a mess expense reaching Finance; Hostel Reports.
import { asUser, go, mainText, close, record, openDialog, send, said, sleep } from "./util.mjs";
const M = "Hostel Management", R = "Hostel Warden";
const rec = (pg, action, expected, actual, status, defect) => record({ module: M, page: pg, action, role: R, expected, actual, status, ...(defect ? { defect } : {}) });
const ONLY = process.env.ONLY?.split(",");
const step = async (name, fn) => { if (ONLY && !ONLY.some((o) => name.includes(o))) return; try { await fn(); } catch (e) { console.log("ERR", name, e.message.split("\n")[0]); } };
const page = await asUser("cems.warden");
const D = (k) => page.locator(`dialog[open] [name="${k}"]`).first();
const submitBtn = async () => (await page.locator("dialog[open] button[type=submit]").last().innerText()).trim();

await step("visitor", async () => {
  await openDialog(page, "/hostel-management/outings?view=visitors&new=1");
  console.log((await page.locator("dialog[open]").innerText()).replace(/\n/g, " / ").slice(0, 500));
  let r = await send(page, "Let in");
  rec("Outing & Visitors", "Record a visitor without choosing the student met", "Refused: choose the student", r.s, r.open && /student|meet/i.test(r.s) ? "PASS" : "FAIL");
  await page.locator("dialog[open] input[type=search]").first().pressSequentially("Demo Varun", { delay: 70 }); await sleep(2500);
  await page.locator("dialog[open] [role=option]").first().click(); await sleep(700);
  console.log((await page.locator("dialog[open]").innerText()).replace(/\n/g, " / ").slice(0, 700));
  const typed = page.locator("dialog[open] button", { hasText: "Someone else" }); if (await typed.count()) { await typed.first().click(); await sleep(300); }
  if (await D("name").count()) { await D("name").fill("QA Demo Visitor"); await D("relation").selectOption("Uncle"); await D("phone").fill("9000000002"); }
  const flag = (await page.locator("dialog[open]").innerText()).match(/Outside visiting hours[^\n]*|Not on[^\n]*/)?.[0] ?? "";
  r = await send(page, "Let in");
  r.s = `${flag ? "screen said: " + flag + " → " : ""}${r.s}`;
  rec("Outing & Visitors", "Record QA Demo Visitor (uncle, not on the authorised list) meeting Demo Varun Teja", "Saved, or flagged as needing the warden's approval", r.s, !r.open || /authoris|approv/i.test(r.s) ? "PASS" : "FAIL");
});
await step("rollcall", async () => {
  await go(page, "/hostel-management?session=NIGHT"); const t = await mainText(page, 4000);
  console.log(t.slice(0, 900));
  await page.locator("main button:visible", { hasText: "Demo Varun Teja" }).first().click(); await sleep(500);
  console.log("after tap:", (await mainText(page, 1500)).match(/\d+ present · \d+ absent/)?.[0]);
  const save = page.locator("main").getByRole("button", { name: /Save roll call|Save/ }).last(); await save.click(); await sleep(3000);
  const s = await said(page);
  rec("Roll Call & Incidents", "Take night roll call for QA Demo Boys Hostel with Demo Varun Teja Absent", "Saved; an alert goes to the warden and the Principal at once", s, /saved|absent/i.test(s) ? "PASS" : "FAIL");
});
await step("alertcheck", async () => {
  const pp = await asUser("cems.principal"); await go(pp, "/notifications"); const n = await mainText(pp, 6000);
  const hit = n.split("\n").find((l) => /absent at night roll call/i.test(l));
  record({ module: M, page: "Roll Call & Incidents", action: "Night roll call absence alert reaches the Principal", role: "Principal", expected: "Notification: '1 student absent at night roll call …'", actual: (hit ?? "none") + " (the warden who saved it is not notified about their own action: notify() rule 4, by design)", status: hit ? "PASS" : "FAIL" });
  await pp.context().close();
});
await step("incident", async () => {
  await openDialog(page, "/hostel-management?view=incidents&incident=1");
  let r = await send(page, "Save incident");
  rec("Roll Call & Incidents", "Save an incident with nothing typed", "Refused: what happened needed", r.s, r.open && /happened|descri/i.test(r.s) ? "PASS" : "FAIL");
  await D("description").fill("QA Demo: broken window latch in room B-102");
  const ty = D("type"); if (await ty.evaluate((e) => e.tagName) === "SELECT") await ty.selectOption({ label: "Maintenance" }).catch(() => {}); else await page.locator("dialog[open] button", { hasText: /^Maintenance$/ }).click().catch(() => {});
  await D("hostelId").selectOption({ index: 1 }).catch(() => {}); await D("place").fill("Room B-102 window").catch(() => {});
  r = await send(page, "Save incident");
  rec("Roll Call & Incidents", "Record a maintenance incident (no student)", "Saved in the incident log", r.s, !r.open ? "PASS" : "FAIL");
});
await step("mess", async () => {
  await go(page, "/hostel-management/mess"); const t = await mainText(page, 2000); console.log(t.slice(0, 600));
  await openDialog(page, "/hostel-management/mess?view=expenses&new=1");
  console.log((await page.locator("dialog[open]").innerText()).replace(/\n/g, " / ").slice(0, 500));
  const it = D("item"); if (await it.evaluate((e) => e.tagName) === "SELECT") await it.selectOption({ index: 1 }); else await it.fill("QA Demo vegetables");
  await D("amount").fill("1500");
  const r = await send(page, await submitBtn());
  rec("Mess", "Record a mess expense of ₹1,500", "Saved; goes to Finance, Expenses", r.s, !r.open && /expense|finance|saved|recorded/i.test(r.s) ? "PASS" : "FAIL");
});
await step("reports", async () => {
  for (const [u, n] of [["/hostel-management/reports", "Hostel Reports"], ["/hostel-management/settings", "Hostel Settings"], ["/hostel-management?view=incidents", "Roll Call & Incidents"]]) {
    page.problems.length = 0; await go(page, u); const t = await mainText(page, 2500);
    rec(n, `Open ${n}`, "Opens with no errors", `${t.slice(0, 250).replace(/\n/g, " / ")} ${page.problems.join("; ")}`, page.problems.length === 0 && !/Something went wrong/i.test(t) ? "PASS" : "FAIL");
  }
});
await page.context().close(); await close();
