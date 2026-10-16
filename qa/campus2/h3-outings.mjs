// Hostel: outing pass — validation, saved as Waiting (Gate Pass, Hostel Outing), cannot be marked out before approval,
// approved, marked out, not back by the return time shows Late; visitor without a student is refused.
import { asUser, go, mainText, close, record, openDialog, send, said, sleep } from "./util.mjs";
const M = "Hostel Management", P = "Outing & Visitors";
const rec = (role, action, expected, actual, status, defect) => record({ module: M, page: P, action, role, expected, actual, status, ...(defect ? { defect } : {}) });
const ONLY = process.env.ONLY?.split(",");
const step = async (name, fn) => { if (ONLY && !ONLY.some((o) => name.includes(o))) return; try { await fn(); } catch (e) { console.log("ERR", name, e.message.split("\n")[0]); } };
const hm = (d) => d.toTimeString().slice(0, 5);
const ist = () => new Date(Date.now() + (330 + new Date().getTimezoneOffset()) * 60000);
const page = await asUser("cems.warden");
const D = (k) => page.locator(`dialog[open] [name="${k}"]`).first();

await step("empty", async () => {
  await openDialog(page, "/hostel-management/outings?new=1");
  const r = await send(page, "Save and send for approval");
  rec("Hostel Warden", "Save an outing pass with nothing chosen", "Refused: student, going with and reason needed", r.s, r.open && /student/i.test(r.s) ? "PASS" : "FAIL");
});
await step("pass", async () => {
  await openDialog(page, "/hostel-management/outings?new=1");
  await page.locator("dialog[open] input[type=search]").first().pressSequentially("Demo Varun", { delay: 70 }); await sleep(2500);
  await page.locator("dialog[open] [role=option]").first().click(); await sleep(700);
  console.log((await page.locator("dialog[open]").innerText()).replace(/\n/g, " / ").slice(0, 900));
  const now = ist(); const back = new Date(now.getTime() + 2 * 60000);
  await D("fromTime").fill(hm(now)); await D("toTime").fill(hm(back));
  const typed = page.locator("dialog[open] button", { hasText: /someone else|type|other/i }).first();
  if (await D("withName").count() === 0 && await typed.count()) { await typed.click(); await sleep(300); }
  if (await D("withName").count()) { await D("withName").fill("QA Demo Uncle"); await D("withRelation").fill("Uncle").catch(() => {}); await D("withPhone").fill("9000000001").catch(() => {}); }
  else { const g = page.locator("dialog[open] [role=radio], dialog[open] input[type=radio]").first(); if (await g.count()) await g.click(); }
  await D("reason").fill("QA Demo family function");
  const r = await send(page, "Save and send for approval");
  rec("Hostel Warden", `Outing pass for Demo Varun Teja, back by ${hm(back)} today, going with QA Demo Uncle`, "Saved as Waiting, sent for approval", r.s, !r.open ? "PASS" : "FAIL");
});
await step("markout", async () => {
  await go(page, "/hostel-management/outings"); const t = await mainText(page, 5000);
  const i = t.indexOf("Varun"); console.log("LIST", t.slice(Math.max(0, i - 200), i + 500).replace(/\n/g, " / "));
  const out = page.locator("main button:visible, main a:visible").filter({ hasText: /^Mark out|^Out$|Going out/ }).first();
  rec("Hostel Warden", "Waiting pass: is 'Mark out' offered before approval?", "No Mark out until approved ('Outing waiting for approval')", (await out.count()) ? "Mark out button shown" : "no Mark out button; status " + (t.slice(i, i + 300).match(/Waiting|Approved|Out|Late/) ?? ["?"])[0], (await out.count()) === 0 ? "PASS" : "FAIL");
});
await step("approve", async () => {
  // The warden raised it; the Principal decides in Approvals (own requests cannot be approved by oneself).
  const pp = await asUser("cems.warden");
  await go(pp, "/approvals"); let t = await mainText(pp, 3000);
  let who = "Hostel Warden";
  let card = pp.locator("main div, main li, main article").filter({ hasText: "Varun" }).filter({ has: pp.getByRole("button", { name: "Approve" }) }).last();
  if (!(await card.count())) { await pp.context().close(); who = "Principal"; }
  const ap = who === "Principal" ? await asUser("cems.principal") : pp;
  if (who === "Principal") { await go(ap, "/approvals"); card = ap.locator("main div, main li, main article").filter({ hasText: "Varun" }).filter({ has: ap.getByRole("button", { name: "Approve" }) }).last(); }
  await card.getByRole("button", { name: "Approve" }).click(); await sleep(1500);
  if (await ap.locator("dialog[open]").count()) await send(ap, (await ap.locator("dialog[open] button[type=submit]").last().innerText()).trim());
  const s = await said(ap);
  rec(who, "Approve the outing pass in Approvals", "Approved", s, /approved/i.test(s) ? "PASS" : "FAIL");
  await ap.context().close();
});
await step("out", async () => {
  await go(page, "/hostel-management/outings");
  const out = page.locator("main button:visible, main a:visible").filter({ hasText: /Mark out/ }).first();
  await out.click(); await sleep(1500); if (await page.locator("dialog[open]").count()) await send(page, (await page.locator("dialog[open] button[type=submit]").last().innerText()).trim());
  const s = await said(page);
  rec("Hostel Warden", "Mark Demo Varun Teja out", "Status Out", s, /out/i.test(s) ? "PASS" : "FAIL");
});
await step("late", async () => {
  await sleep(200000);
  await go(page, "/hostel-management/outings"); const t = await mainText(page, 6000);
  const i = t.indexOf("Varun");
  rec("Hostel Warden", "Outings list 3 minutes after the back-by time (student not returned)", "Shown as Late, in red", t.slice(Math.max(0, i - 150), i + 300).replace(/\n/g, " / "), /Late|overdue|not back|not returned/i.test(t) ? "PASS" : "FAIL");
  await go(page, "/notifications"); const n = await mainText(page, 3000);
  rec("Hostel Warden", "Late-return alert (notifications)", "An alert: 'Varun not returned (due …)'", n.slice(0, 400).replace(/\n/g, " / "), /Varun/.test(n) && /return|late|back/i.test(n) ? "PASS" : "FAIL");
  const ret = page.locator("main button:visible, main a:visible").filter({ hasText: /Mark returned|Returned|Back/ });
  await go(page, "/hostel-management/outings");
  if (await ret.count()) { await ret.first().click(); await sleep(1500); if (await page.locator("dialog[open]").count()) await send(page, (await page.locator("dialog[open] button[type=submit]").last().innerText()).trim()); }
  const s = await said(page);
  rec("Hostel Warden", "Mark Demo Varun Teja returned (late)", "Saved as Returned late", s, /return/i.test(s) ? "PASS" : "FAIL");
});
await step("visitor", async () => {
  await go(page, "/hostel-management/outings"); 
  const v = page.locator("main a:visible, main button:visible").filter({ hasText: /visitor/i }).first(); await v.click(); await page.waitForSelector("dialog[open]");
  await D("name").fill("QA Demo Visitor"); await D("relation").fill("Uncle").catch(() => {}); await D("phone").fill("9000000002").catch(() => {});
  const r = await send(page, "Let in");
  rec("Hostel Warden", "Record a visitor without choosing the student met", "Refused: choose the student", r.s, r.open && /student|meet/i.test(r.s) ? "PASS" : "FAIL");
});
await page.context().close(); await close();
