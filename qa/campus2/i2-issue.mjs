// Inventory: Issue Stock as the Store Keeper — over-stock issue blocked, issue to staff (returnable),
// issue to a student charged to fees, return, transfer between stores.
import { asUser, go, mainText, close, record, openDialog, send, said, sleep } from "./util.mjs";
const M = "Inventory Management", R = "Store Keeper";
const rec = (page_, action, expected, actual, status, defect) => record({ module: M, page: page_, action, role: R, expected, actual, status, ...(defect ? { defect } : {}) });
const page = await asUser("cems.store");
const ONLY = process.env.ONLY?.split(",");
const step = async (name, fn) => { if (ONLY && !ONLY.some((o) => name.includes(o))) return; try { await fn(); } catch (e) { console.log("ERR", name, e.message.split("\n")[0]); rec("Issue Stock", name, "Step runs", `script error: ${e.message.split("\n")[0]}`, "BLOCKED"); } };
const main = page.locator("main");
async function pickItem(name, qty) {
  const sel = main.locator("select[name=itemId]").first();
  const v = await sel.locator("option", { hasText: name }).first().getAttribute("value");
  await sel.selectOption(v); await main.locator("input[name=qty]").first().fill(String(qty));
}
async function issue() {
  await main.getByRole("button", { name: /^Issue/ }).last().click();
  for (let i = 0; i < 20; i++) { await sleep(600); const s = await said(page); if (s && !/Issuing/.test(s)) break; }
  await sleep(500); return await said(page);
}
// Find the item made by i1 (the newest QA Demo Notebook).
await go(page, "/inventory-management/items");
const item = process.env.ITEM ?? ((await mainText(page, 9000)).match(/QA Demo Notebook \d{4}/g) ?? []).pop();
console.log("item", item);

await step("Issue more than in stock", async () => {
  await go(page, "/inventory-management");
  await main.getByRole("radio", { name: "Staff" }).or(main.getByRole("button", { name: "Staff", exact: true })).first().click(); await sleep(400);
  const st = main.locator("select[name=staffId]"); const o = await st.locator("option").nth(1).getAttribute("value"); await st.selectOption(o);
  await pickItem(item, 999);
  const s = await issue();
  rec("Issue Stock", `Issue 999 of ${item} to a staff member`, "Blocked with the stock shown", s, /only|in stock|\b1[0-9]\b/i.test(s) && !/issued/i.test(s) ? "PASS" : "FAIL");
});
await step("Issue to staff returnable", async () => {
  await go(page, "/inventory-management");
  await main.getByRole("radio", { name: "Staff" }).or(main.getByRole("button", { name: "Staff", exact: true })).first().click(); await sleep(400);
  const st = main.locator("select[name=staffId]"); const o = await st.locator("option").nth(1).getAttribute("value"); await st.selectOption(o);
  await pickItem(item, 2);
  await main.getByRole("switch", { name: "To be returned" }).click();
  const s = await issue();
  rec("Issue Stock", `Issue 2 of ${item} to a staff member, to be returned`, "Issued; shows in the issues list as to be returned", s, /issued/i.test(s) ? "PASS" : "FAIL");
});
await step("Issue to student charged to fees", async () => {
  await go(page, "/inventory-management");
  await main.getByRole("radio", { name: "Student" }).or(main.getByRole("button", { name: "Student", exact: true })).first().click().catch(() => {}); await sleep(300);
  await main.locator("input[role=combobox]").first().pressSequentially("Demo Varun", { delay: 80 }); await sleep(2500);
  const opt = page.locator("main [role=option] button").first(); const who = (await opt.innerText()).split("\n")[0]; await opt.click(); await sleep(300);
  await pickItem(item, 1);
  const btn = (await main.getByRole("button", { name: /^Issue/ }).last().innerText()).trim();
  const s = await issue();
  rec("Issue Stock", `Issue 1 ${item} to student ${who} with "Charge to fees" on`, "Issued and ₹45 added to the student's fees", `button "${btn}" → ${s}`, /₹45/.test(btn + s) && /issued|fees/i.test(s) ? "PASS" : "FAIL");
});
await step("Issues list and return", async () => {
  await go(page, "/inventory-management?tab=return"); let t = await mainText(page, 5000);
  const listed = t.includes(item);
  rec("Issue Stock", "Issues list, To return tab", "The returnable staff issue is listed", t.slice(t.indexOf("Issues"), t.indexOf("Issues") + 400), listed ? "PASS" : "FAIL");
  const ret = page.locator("main a:visible", { hasText: /^Return / }).first();
  if (await ret.count()) {
    await ret.click(); await page.waitForSelector("dialog[open]", { timeout: 10000 });
    const r = await send(page, (await page.locator("dialog[open] button[type=submit]").last().innerText()).trim());
    rec("Issue Stock", "Record the return of the 2 notebooks", "Saved; stock goes back up", r.s, !r.open ? "PASS" : "FAIL");
  } else rec("Issue Stock", "Record the return of the 2 notebooks", "A Return button on the returnable issue", "no Return button found on the To return tab", "FAIL");
});
await step("Transfer", async () => {
  await openDialog(page, "/inventory-management/items?open=transfer");
  const sel = page.locator("dialog[open] select[name=itemId]"); const v = await sel.locator("option", { hasText: item }).first().getAttribute("value"); await sel.selectOption(v); await sleep(300);
  const to = page.locator("dialog[open] select[name=toLocationId]"); const o = await to.locator("option", { hasText: "Sports room" }).first().getAttribute("value"); await to.selectOption(o);
  await page.locator("dialog[open] [name=qty]").fill("3");
  const r = await send(page, /Transfer|Move|Send/);
  rec("Items & Stock", `Transfer 3 ${item} from Main store to Sports room`, "Moved, or sent for approval if transfers need it", r.s, !r.open ? "PASS" : "FAIL");
  await openDialog(page, "/inventory-management/items?open=transfer");
  await sel.selectOption(v); await sleep(300); await to.selectOption(o); await page.locator("dialog[open] [name=qty]").fill("900");
  const r2 = await send(page, /Transfer|Move|Send/);
  rec("Items & Stock", `Transfer 900 ${item} (more than in the store)`, "Blocked with the stock shown", r2.s, r2.open && /only|in stock/i.test(r2.s) ? "PASS" : "FAIL");
});
console.log("PROBLEMS", page.problems);
await page.context().close(); await close();
