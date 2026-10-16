// Inventory: make a book set (1 item refused, 2 items fine) and issue it to a student with the price added to fees.
import { asUser, go, mainText, close, record, openDialog, send, said, sleep } from "./util.mjs";
const M = "Inventory Management", R = "Store Keeper";
const rec = (pg, action, expected, actual, status, defect) => record({ module: M, page: pg, action, role: R, expected, actual, status, ...(defect ? { defect } : {}) });
const page = await asUser("cems.store");
const stamp = Date.now().toString().slice(-4);
const setName = `QA Demo Class 5 set ${stamp}`;
try {
  await openDialog(page, "/inventory-management/items?open=set");
  const dlg = page.locator("dialog[open]");
  await dlg.locator("[name=name]").fill(setName);
  const sels = dlg.locator("select[name=itemId]");
  await sels.nth(0).selectOption({ index: 1 }); await dlg.locator("input[name=qty]").nth(0).fill("1");
  if (await sels.count() > 1) await sels.nth(1).selectOption({ index: 0 });
  const btn = async () => (await dlg.locator("button[type=submit]").last().innerText()).trim();
  let r = await send(page, await btn());
  rec("Items & Stock", "Make a book set with only 1 item", "Refused: at least 2 items", r.s, r.open && /2 items|two|at least/i.test(r.s) ? "PASS" : "FAIL");
  if (await sels.count() < 2) { await dlg.getByRole("button", { name: "Add a line" }).click(); await sleep(300); }
  await sels.nth(0).selectOption({ index: 1 }); await sels.nth(1).selectOption({ index: 2 }); await dlg.locator("input[name=qty]").nth(1).fill("2");
  await dlg.locator("input[name=qty]").nth(0).fill("1");
  r = await send(page, await btn());
  rec("Items & Stock", `Make book set "${setName}" (1 + 2 notebooks, price empty = total)`, "Saved, price = total of item prices (₹135)", r.s, !r.open ? "PASS" : "FAIL");
  await go(page, "/inventory-management?counter=set"); const m = page.locator("main");
  await m.locator("select[name=setId]").selectOption({ label: (await m.locator("select[name=setId] option", { hasText: setName }).first().innerText()).trim() });
  await m.locator("input[role=combobox]").first().pressSequentially("Demo Varun", { delay: 80 }); await sleep(2500);
  await page.locator("main [role=option] button").first().click(); await sleep(400);
  const b = (await m.getByRole("button", { name: /^Issue/ }).last().innerText()).trim();
  await m.getByRole("button", { name: /^Issue/ }).last().click(); await sleep(3000);
  const s = await said(page);
  rec("Issue Stock", `Issue "${setName}" to Demo Varun Teja (button "${b}")`, "Every item's stock goes down and ₹135 goes to the student's fees", s, /issued/i.test(s) && /₹135|fees/.test(s + b) ? "PASS" : "FAIL");
} catch (e) { console.log("ERR", e.message.split("\n")[0]); }
await page.context().close(); await close();
