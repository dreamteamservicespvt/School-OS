// Staff & HR: leave — the teacher applies (overlap and beyond-balance blocked, a good one saved), HR approves it;
// HR cannot approve their own leave.
import { asUser, go, mainText, close, record, send, said, sleep } from "./util.mjs";
const M = "Staff & HR Management", P = "Staff Leave";
const rec = (role, action, expected, actual, status, defect) => record({ module: M, page: P, action, role, expected, actual, status, ...(defect ? { defect } : {}) });
const ONLY = process.env.ONLY?.split(",");
const step = async (name, fn) => { if (ONLY && !ONLY.some((o) => name.includes(o))) return; try { await fn(); } catch (e) { console.log("ERR", name, e.message.split("\n")[0]); } };
async function apply(page, { type = "Casual", from, to, reason = "QA Demo personal work" }) {
  await go(page, "/staff-hr-management/leave");
  await page.locator("main").getByRole("button", { name: "Apply for leave" }).click(); await sleep(800);
  const root = (await page.locator("dialog[open]").count()) ? page.locator("dialog[open]") : page.locator("main");
  const lt = root.locator("[name=leaveTypeId]"); const opts = await lt.locator("option").allInnerTexts(); await lt.selectOption({ label: opts.find((o) => o.includes(type)) });
  await root.locator("[name=from]").fill(from); await root.locator("[name=to]").fill(to); await root.locator("[name=reason]").fill(reason);
  const b = root.locator("button[type=submit]").last(); const bt = (await b.innerText()).trim(); await b.click();
  for (let i = 0; i < 20; i++) { await sleep(600); if (!(await page.locator("dialog[open]").count())) break; if (await page.locator("dialog[open] [aria-invalid=true], dialog[open] [role=alert]").count()) break; }
  await sleep(600);
  return { open: await page.locator("dialog[open]").count(), s: await said(page), bt };
}
await step("teacher", async () => {
  const t = await asUser("cems.teacher");
  let r = await apply(t, { from: "2026-11-05", to: "2026-11-05" });
  rec("Teacher", "Apply for casual leave on 05-11-2026 (already approved leave that day)", "Blocked: 'You already have leave on 05-11-2026'", r.s, r.open && /already/i.test(r.s) ? "PASS" : "FAIL");
  r = await apply(t, { from: "2026-12-01", to: "2026-12-20" });
  rec("Teacher", "Apply for 20 days of casual leave (9 left)", "Blocked: 'Casual leave left: 9 days. You asked for …'", r.s, r.open && /left/i.test(r.s) ? "PASS" : "FAIL");
  r = await apply(t, { from: "2026-11-12", to: "2026-11-11" });
  rec("Teacher", "Apply with To date before From date", "Refused in plain words", r.s, r.open && /before|after|to date/i.test(r.s) ? "PASS" : "FAIL");
  r = await apply(t, { from: "2026-11-12", to: "2026-11-12", reason: "QA Demo bank work" });
  rec("Teacher", "Apply for casual leave on 12-11-2026", "Saved as Waiting; goes to the approver", r.s, !r.open && /sent|applied|waiting|approv/i.test(r.s) ? "PASS" : "FAIL");
  await go(t, "/staff-hr-management/leave?view=requests"); const txt = await mainText(t, 2000);
  rec("Teacher", "Open the approvers' Requests view by URL", "Only their own leave (no other staff's requests, no Approve buttons)", txt.slice(0, 200).replace(/\n/g, " / "), !/Approve\b/.test(txt) ? "PASS" : "FAIL");
  await t.context().close();
});
await step("approve", async () => {
  // Leave approvers (Forms & Approvals) send a teacher's leave to the Principal, not HR.
  const h = await asUser("cems.hr"); await go(h, "/staff-hr-management/leave?view=requests"); const ht = await mainText(h, 3000);
  rec("HR", "HR's Requests view while the teacher's leave waits for the Principal", "Not shown as HR's decision (approver is the Principal)", ht.includes("QA Demo bank work") ? "listed for HR" : "Nothing waiting for you", ht.includes("QA Demo bank work") ? "FAIL" : "PASS");
  await h.context().close();
  const p = await asUser("cems.principal"); await go(p, "/approvals");
  const card = p.locator("main div, main li, main article").filter({ hasText: "QA Demo bank work" }).filter({ has: p.getByRole("button", { name: "Approve" }) }).last();
  await card.getByRole("button", { name: "Approve" }).click(); await sleep(1500);
  if (await p.locator("dialog[open]").count()) await send(p, (await p.locator("dialog[open] button[type=submit]").last().innerText()).trim());
  const s = await said(p);
  rec("Principal", "Approve the teacher's leave of 12-11-2026 in Approvals", "Approved", s, /approved/i.test(s) ? "PASS" : "FAIL");
  await p.context().close();
  const t = await asUser("cems.teacher"); await go(t, "/staff-hr-management/leave"); const tt = await mainText(t, 3000);
  const bal = (tt.match(/Casual Leave\n([^\n]*left)/) ?? [])[1]; const i = tt.indexOf("QA Demo bank work");
  rec("Teacher", "My leave after approval", "Request shows Approved; casual leave 8 of 12 left", `${bal} · ${tt.slice(i, i + 60).replace(/\n/g, " ")}`, /8 of 12/.test(bal ?? "") && /Approved/.test(tt.slice(i, i + 60)) ? "PASS" : "FAIL");
  await t.context().close();
});
await step("own", async () => {
  const h = await asUser("cems.hr");
  const r = await apply(h, { from: "2026-11-19", to: "2026-11-19", reason: "QA Demo own leave" });
  console.log("hr apply:", r.s);
  await go(h, "/staff-hr-management/leave?view=requests"); const txt = await mainText(h, 6000);
  const row = h.locator("main li, main article, main tr, main div.rounded-2xl").filter({ hasText: "QA Demo own leave" }).filter({ has: h.getByRole("button", { name: /^Approve/ }) });
  rec("HR", "HR's own leave in the Requests view", "No Approve button on their own request (next approver decides)", (await row.count()) ? "Approve button shown on own request" : (txt.includes("QA Demo own leave") ? "listed without Approve" : "own request not listed in Requests"), (await row.count()) ? "FAIL" : "PASS");
  await h.context().close();
});
await close();
