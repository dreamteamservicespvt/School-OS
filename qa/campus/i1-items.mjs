// Inventory: add items (validation), stock in and out, expiry, low stock — as the Store Keeper in CEMS.
import { asUser, go, close, result, sleep } from "./util.mjs";
const M = "Inventory Management", P = "Items & Stock", R = "Store Keeper";
const page = await asUser("cems.store");
const said = async () => (await page.evaluate(() => [...document.querySelectorAll("dialog[open] [id$=-error], dialog[open] p.text-bad, dialog[open] [role=alert], [role=status]")].map((e) => e.innerText.trim()).filter(Boolean).join(" | ")).catch(() => "")).replace(/\s+/g, " ");
const rec = (action, expected, actual, ok, extra = {}) => result({ module: M, page: P, action, role: R, expected, actual: String(actual).slice(0, 600), status: ok ? "PASS" : "FAIL", ...extra });
const D = (k) => page.locator(`dialog[open] [name="${k}"]`);
async function open(url) { await go(page, url); for (let i = 0; i < 40 && !(await page.locator("dialog[open]").count()); i++) await sleep(800); }
async function send(label) {
  await page.locator("dialog[open]").getByRole("button", { name: label }).last().click();
  for (let i = 0; i < 50; i++) { await sleep(800); if (!(await page.locator("dialog[open]").count())) break; if (await page.locator("dialog[open] [aria-invalid=true], dialog[open] [role=alert]").count()) break; }
  await sleep(600);
  return { open: await page.locator("dialog[open]").count(), s: await said() };
}
async function cat(name) { const v = await page.locator(`dialog[open] select[name=categoryId] option`, { hasText: name }).first().getAttribute("value"); await D("categoryId").selectOption(v); }

// 1. Empty form.
await open("/inventory-management/items?open=add");
let r = await send("Add item");
rec("Add item with nothing typed", "Refused: item name and category needed", r.s, r.open && /name/i.test(r.s) && /categor/i.test(r.s));
// 2. Bad numbers.
await D("name").fill("Demo Bad Numbers"); await cat("Stationery");
await D("reorderLevel").fill("-5"); await D("price").fill("-1");
r = await send("Add item");
rec("Add item with reorder level -5 and price -1", "Refused in plain words", r.s, r.open && /reorder|price/i.test(r.s));
await D("reorderLevel").fill(""); await D("price").fill("");
await page.locator("dialog[open] [name=openQty]").first().fill("-2");
r = await send("Add item");
rec("Add item with opening stock -2", "Refused in plain words (shown even though the box has no error line of its own)", r.s, r.open && /opening stock/i.test(r.s));
// 3. A good item.
await open("/inventory-management/items?open=add");
await D("name").fill("Demo A4 Notebook 200 pages"); await cat("Stationery");
await D("reorderLevel").fill("20"); await D("price").fill("45");
await page.locator("dialog[open] [name=openQty]").first().fill("30");
r = await send("Add item");
rec("Add Demo A4 Notebook (Stationery, reorder 20, ₹45, opening 30)", "Added with a code and 30 in stock", r.s, !r.open && /added as .* with 30/i.test(r.s));
// 4. Expiry tracked, no expiry date.
await open("/inventory-management/items?open=add");
await D("name").fill("Demo Lab Ethanol 500 ml"); await cat("Lab");
await sleep(400);
const tracks = await page.locator("dialog[open] input[name=tracksExpiry]").isChecked();
await page.locator("dialog[open] [name=openQty]").first().fill("5");
r = await send("Add item");
rec("Add a Lab item with opening stock but no expiry date", "Expiry tracking on by default for Lab; refused until the expiry date is typed", `tracks=${tracks}; ${r.s}`, tracks && r.open && /expiry/i.test(r.s));
await D("batchNo").fill("DEMO-B1"); await D("expiresOn").fill("2027-03-31");
r = await send("Add item");
rec("Add Demo Lab Ethanol with batch DEMO-B1, expiry 31-03-2027", "Added with 5 in stock", r.s, !r.open && /added/i.test(r.s));
console.log("done");
await close();
