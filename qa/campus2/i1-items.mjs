// Inventory: Items & Stock as the Store Keeper — add item (validation, duplicate code),
// stock in, stock out above stock, low stock, item page.
import { asUser, go, mainText, close, record, openDialog, send, said, sleep } from "./util.mjs";
const M = "Inventory Management", P = "Items & Stock", R = "Store Keeper";
const rec = (action, expected, actual, status, defect) => record({ module: M, page: P, action, role: R, expected, actual, status, ...(defect ? { defect } : {}) });
const page = await asUser("cems.store");
const D = (k) => page.locator(`dialog[open] [name="${k}"]`).first();
async function cat(name) { const v = await page.locator(`dialog[open] select[name=categoryId] option`, { hasText: name }).first().getAttribute("value"); await D("categoryId").selectOption(v); }
const step = async (name, fn) => { try { await fn(); } catch (e) { console.log("ERR", name, e.message.split("\n")[0]); rec(name, "Step runs", `script error: ${e.message.split("\n")[0]}`, "BLOCKED"); } };
const stamp = Date.now().toString().slice(-4);

await step("Add item with nothing typed", async () => {
  await openDialog(page, "/inventory-management/items?open=add");
  const r = await send(page, "Add item");
  rec("Add item with nothing typed", "Refused in plain words (the server names the first missing field: item name)", r.s, r.open && /name/i.test(r.s) ? "PASS" : "FAIL");
});
await step("Add item with negative numbers", async () => {
  await D("name").fill(`QA Demo Bad ${stamp}`); await cat("Stationery");
  await D("reorderLevel").fill("-5"); await D("price").fill("-1"); await D("openQty").fill("-2");
  const r = await send(page, "Add item");
  rec("Add item with reorder -5, price -1, opening stock -2", "Refused in plain words", r.s, r.open && /reorder|price|stock/i.test(r.s) ? "PASS" : "FAIL");
});
let code = "";
await step("Add good item", async () => {
  await openDialog(page, "/inventory-management/items?open=add");
  await D("name").fill(`QA Demo Notebook ${stamp}`); await cat("Stationery");
  await D("reorderLevel").fill("20"); await D("price").fill("45"); await D("openQty").fill("30");
  const r = await send(page, "Add item");
  code = (r.s.match(/\b([A-Z]{2,4}-\d{3,5})\b/) ?? [])[1] ?? "";
  rec("Add QA Demo Notebook (Stationery, reorder 20, ₹45, opening 30)", "Added with a code and 30 in stock", r.s, !r.open && /30/.test(r.s) ? "PASS" : "FAIL");
});
await step("Add item with a code in use", async () => {
  await go(page, "/inventory-management/items"); const t = await mainText(page, 8000);
  if (!code) code = (t.match(/\b([A-Z]{2,4}-\d{3,5})\b/) ?? [])[1] ?? "";
  await openDialog(page, "/inventory-management/items?open=add");
  await D("name").fill(`QA Demo Dup Code ${stamp}`); await cat("Stationery"); await D("code").fill(code);
  const r = await send(page, "Add item");
  rec(`Add item with code ${code} already in use`, "Blocked: names the item that has the code", r.s, r.open && /belongs|already|in use/i.test(r.s) ? "PASS" : "FAIL");
});
await step("Add item same name", async () => {
  await openDialog(page, "/inventory-management/items?open=add");
  await D("name").fill(`QA Demo Notebook ${stamp}`); await cat("Stationery");
  const r = await send(page, "Add item");
  rec("Add an item with the same name as an existing one", "Duplicate check: warns or blocks", r.s, r.open && /already|same name|exists/i.test(r.s) ? "PASS" : "FAIL");
  if (!r.open) console.log("NOTE duplicate name was saved");
});
await step("Add item long name", async () => {
  await openDialog(page, "/inventory-management/items?open=add");
  const long = "QA Demo " + "Long".repeat(40);
  await D("name").evaluate((e, v) => { e.removeAttribute("maxlength"); e.value = v; e.dispatchEvent(new Event("input", { bubbles: true })); }, long);
  await cat("Stationery");
  const r = await send(page, "Add item");
  rec("Add item with a 168-letter name (maxlength removed)", "Refused on the server in plain words", r.s, r.open && /long|120|characters|letters/i.test(r.s) ? "PASS" : "FAIL");
});
await step("Stock in", async () => {
  await openDialog(page, "/inventory-management/items?open=in");
  const v = await page.locator("dialog[open] select[name=itemId] option", { hasText: `QA Demo Notebook ${stamp}` }).first().getAttribute("value");
  await D("itemId").selectOption(v); await D("qty").fill("5"); await D("source").fill("QA Demo donation");
  const r = await send(page, "Stock in").catch(async () => send(page, /stock in|save|add/i));
  rec("Stock in 5 notebooks (donation)", "Saved; stock goes to 35", r.s, !r.open ? "PASS" : "FAIL");
});
await step("Stock out with the optional note empty", async () => {
  await openDialog(page, "/inventory-management/items?open=out");
  const v = await page.locator("dialog[open] select[name=itemId] option", { hasText: `QA Demo Notebook ${stamp}` }).first().getAttribute("value");
  await D("itemId").selectOption(v); await sleep(300); await D("qty").fill("1");
  const ph = await D("reason").getAttribute("placeholder"); const req = await D("reason").getAttribute("required");
  const r = await send(page, "Record stock out");
  rec(`Stock out 1 with "What it was used for" left empty (placeholder "${ph}", required=${req !== null})`, "Saved, since the form marks the box Optional", r.s, !r.open ? "PASS" : "FAIL", r.open ? "CAMPUS2-01" : undefined);
});
await step("Stock out above stock", async () => {
  await openDialog(page, "/inventory-management/items?open=out");
  const v = await page.locator("dialog[open] select[name=itemId] option", { hasText: `QA Demo Notebook ${stamp}` }).first().getAttribute("value");
  await D("itemId").selectOption(v); await sleep(300); await D("qty").fill("500"); await D("reason").fill("QA Demo class use");
  const btn = await page.locator("dialog[open] button[type=submit]").last().innerText();
  const r = await send(page, btn.trim());
  rec("Stock out 500 when 35 in stock", "Blocked: 'Only 35 in the main store'", r.s, r.open && /35/.test(r.s) ? "PASS" : "FAIL");
});
await step("Stock out to low", async () => {
  await openDialog(page, "/inventory-management/items?open=out");
  const v = await page.locator("dialog[open] select[name=itemId] option", { hasText: `QA Demo Notebook ${stamp}` }).first().getAttribute("value");
  await D("itemId").selectOption(v); await sleep(300); await D("qty").fill("20"); await D("reason").fill("QA Demo class use");
  const btn = await page.locator("dialog[open] button[type=submit]").last().innerText();
  const r = await send(page, btn.trim());
  rec("Stock out 20 (used), leaving 15 under reorder level 20", "Saved", r.s, !r.open ? "PASS" : "FAIL");
  await go(page, "/inventory-management/items"); const t = await mainText(page, 8000);
  const line = t.split("\n").findIndex((l) => l.includes(`QA Demo Notebook ${stamp}`));
  const near = t.split("\n").slice(Math.max(0, line - 2), line + 8).join(" / ");
  rec("Items list after falling under reorder level", "Item shows Low and the Low stock count is at least 1", near, /Low/.test(near) ? "PASS" : "FAIL");
  await go(page, "/notifications"); const n = await mainText(page, 3000);
  rec("Low-stock alert reaches the Store Keeper (A15)", "A notification about low stock for the item", n.slice(0, 300), /low|reorder/i.test(n) && n.includes("Notebook") ? "PASS" : "FAIL");
});
await step("Item page", async () => {
  await go(page, "/inventory-management/items");
  const href = await page.evaluate((n) => [...document.querySelectorAll("tr, li, article")].filter((r) => r.innerText.includes(n)).map((r) => r.querySelector("a[href*='/items/']")?.getAttribute("href")).find(Boolean), `QA Demo Notebook ${stamp}`);
  await go(page, href);
  const t = await mainText(page, 4000);
  rec("Open the item: stock by store and movements", "Shows opening 30, in 5, out 20 movements", t.slice(0, 400), /30/.test(t) && /\b5\b/.test(t) && /20/.test(t) ? "PASS" : "FAIL");
  console.log(t.slice(0, 1500));
});
console.log("PROBLEMS", page.problems);
await page.context().close(); await close();
