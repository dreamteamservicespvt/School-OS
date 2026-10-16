// Inventory: Store Keeper records the vendor's bill (and a duplicate bill number); the Accountant pays it
// and the payment shows in the Finance Day Book.
import { asUser, go, mainText, close, record, send, said, sleep } from "./util.mjs";
const M = "Inventory Management", P = "Purchases & Vendors";
const rec = (role, action, expected, actual, status, defect) => record({ module: M, page: P, action, role, expected, actual, status, ...(defect ? { defect } : {}) });
const D = (page, k) => page.locator(`dialog[open] [name="${k}"]`).first();
const waitDialog = async (page) => { await page.waitForSelector("dialog[open]", { timeout: 15000 }); await sleep(400); };
import { writeFileSync } from "node:fs";
const PNG = "/home/claude/qa-out/campus2/qa-demo-bill.png";
writeFileSync(PNG, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"));
const billNo = `QA-B-${Date.now().toString().slice(-5)}`;
async function bill(page, no) {
  await go(page, "/inventory-management/purchases?tab=bills&bill=new"); await waitDialog(page);
  const o = D(page, "orderId"); await o.selectOption(await o.locator("option", { hasText: "PO/2026-27/0001" }).first().getAttribute("value")); await sleep(500);
  await D(page, "billNo").fill(no); await D(page, "amount").fill("5400"); await page.locator("dialog[open] input[name=bill]").setInputFiles(PNG); await sleep(300);
  return send(page, (await page.locator("dialog[open] button[type=submit]").last().innerText()).trim());
}
let page = await asUser("cems.store");
try {
  let r = await bill(page, billNo);
  rec("Store Keeper", `Record vendor bill ${billNo} for ₹5,400 against PO/2026-27/0001`, "Saved as Unpaid; goes to Finance Expenses", r.s, !r.open ? "PASS" : "FAIL");
  r = await bill(page, billNo);
  rec("Store Keeper", `Record the same bill number ${billNo} again`, "Warning 'Bill already recorded'", r.s, r.open && /already/i.test(r.s) ? "PASS" : "FAIL");
  await go(page, "/inventory-management/purchases?tab=bills"); const t = await mainText(page, 4000);
  rec("Store Keeper", "Bills tab as the Store Keeper", "No Pay button (paying is Finance work)", t.includes(billNo) ? (/\bPay\b/.test(t) ? "Pay shown" : "listed, no Pay") : "bill not listed", t.includes(billNo) && !/\bPay\b/.test(t) ? "PASS" : "FAIL");
} catch (e) { console.log("ERR", e.message.split("\n")[0]); }
await page.context().close();
page = await asUser("cems.accountant");
try {
  await go(page, "/inventory-management/purchases?tab=bills");
  const href = await page.evaluate((n) => [...document.querySelectorAll("main tr, main li")].filter((r) => r.innerText.includes(n)).map((r) => r.querySelector("a[href*='pay=']")?.getAttribute("href")).find(Boolean), billNo);
  if (!href) throw new Error("no Pay link for the accountant");
  await go(page, href); await waitDialog(page);
  await page.locator("dialog[open]").getByRole("radio", { name: "Cash" }).or(page.locator("dialog[open]").getByRole("button", { name: "Cash", exact: true })).first().click().catch(() => {});
  const r = await send(page, "Record payment");
  rec("Accountant", `Pay bill ${billNo} (₹5,400, cash)`, "Paid; bill shows Paid", r.s, !r.open && /paid|payment/i.test(r.s) ? "PASS" : "FAIL");
  await go(page, "/finance-management/day-book"); const t = await mainText(page, 8000);
  rec("Accountant", "Day Book after paying the vendor bill", "The ₹5,400 payment to QA Demo Paper Mart shows", t.includes("Paper Mart") || t.includes(billNo) ? "found" : t.slice(0, 300), t.includes("Paper Mart") || t.includes(billNo) ? "PASS" : "FAIL");
} catch (e) { console.log("ERR", e.message.split("\n")[0]); rec("Accountant", `Pay bill ${billNo}`, "Pay link on Bills tab", e.message.split("\n")[0], "FAIL"); }
await page.context().close(); await close();
