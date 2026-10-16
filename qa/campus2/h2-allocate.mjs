// Hostel: the warden gives beds — a boy to the boys' hostel, the same boy again (blocked), a girl to the boys' hostel
// (refused), the girl to the girls' hostel; blocks a bed for repair.
import { asUser, go, mainText, close, record, openDialog, send, said, sleep } from "./util.mjs";
const M = "Hostel Management", R = "Hostel Warden";
const rec = (pg, action, expected, actual, status, defect) => record({ module: M, page: pg, action, role: R, expected, actual, status, ...(defect ? { defect } : {}) });
const ONLY = process.env.ONLY?.split(",");
const step = async (name, fn) => { if (ONLY && !ONLY.some((o) => name.includes(o))) return; try { await fn(); } catch (e) { console.log("ERR", name, e.message.split("\n")[0]); } };
const page = await asUser("cems.warden");
async function allocate(q, bedText) {
  await openDialog(page, "/hostel-management/allocation?allocate=1");
  const box = page.locator("dialog[open] input[type=search]").first();
  await box.pressSequentially(q, { delay: 70 }); await sleep(2500);
  const opt = page.locator("dialog[open] [role=option]").first();
  if (!(await opt.count())) return { open: 1, s: `no student found for "${q}": ${(await page.locator("dialog[open]").innerText()).slice(0, 200)}` };
  await opt.click(); await sleep(500);
  const bed = page.locator("dialog[open] select[name=bedId]");
  if (bedText && await bed.count()) { const v = await bed.locator("option", { hasText: bedText }).first().getAttribute("value").catch(() => null); if (v) await bed.selectOption(v); else console.log("bed options:", await bed.locator("option").allInnerTexts()); }
  const plan = page.locator("dialog[open] select[name=feePlanId]"); if (await plan.count()) console.log("plans:", await plan.locator("option").allInnerTexts());
  const b = (await page.locator("dialog[open] button[type=submit]").last().innerText()).trim();
  console.log("dialog:", (await page.locator("dialog[open]").innerText()).replace(/\n/g, " / ").slice(0, 600));
  return send(page, b);
}
await step("boy", async () => {
  const r = await allocate("Demo Varun", "B-101");
  rec("Allocation", "Give Demo Varun Teja a bed in QA Demo Boys Hostel, room B-101", "Bed given; Varun in the residents list", r.s, !r.open ? "PASS" : "FAIL");
});
await step("again", async () => {
  const r = await allocate("Demo Varun", "B-102");
  rec("Allocation", "Give Demo Varun Teja a second bed (B-102)", "Blocked: 'Varun already has Bed …, Room B-101'", r.s, r.open && /already/i.test(r.s) ? "PASS" : "FAIL");
});
await step("girl", async () => {
  const r = await allocate("Demo మేఘన", "B-102");
  rec("Allocation", "Give Demo మేఘన Lanka a bed in the boys' hostel (B-102)", "Refused: 'Boys' hostel. Choose the girls' hostel.'", r.s, r.open && /hostel/i.test(r.s) ? "PASS" : "FAIL");
  const r2 = await allocate("Demo మేఘన", "G-101");
  rec("Allocation", "Give Demo మేఘన Lanka a bed in QA Demo Girls Hostel, G-101", "Bed given", r2.s, !r2.open ? "PASS" : "FAIL");
});
await step("list", async () => {
  await go(page, "/hostel-management/allocation"); const t = await mainText(page, 5000);
  rec("Allocation", "Residents list", "Both students listed, Checked in", t.slice(0, 600).replace(/\n/g, " / "), t.includes("Varun") && t.includes("మేఘన") ? "PASS" : "FAIL");
});
await page.context().close(); await close();
