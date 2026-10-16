// Inventory: stock audit — count 5 fewer notebooks, send for approval; stock must not change until approved.
import { asUser, go, mainText, close, record, sleep, said } from "./util.mjs";
const M = "Inventory Management", P = "Items & Stock", R = "Store Keeper";
const rec = (role, action, expected, actual, status, defect) => record({ module: M, page: P, action, role, expected, actual, status, ...(defect ? { defect } : {}) });
const page = await asUser("cems.store");
const stock = async () => { await go(page, "/inventory-management/items"); const t = await mainText(page, 6000); return Number((t.match(/QA Demo Notebook 1569\s*\n?Stationery\s*\n?\s*piece\s+(\d+)/) ?? [])[1]); };
try {
  const before = await stock(); console.log("before", before);
  await go(page, "/inventory-management/items?view=audits");
  const href = await page.evaluate(() => [...document.querySelectorAll("main a[href*='/items/audits/']")].map((a) => a.getAttribute("href"))[0]);
  await go(page, href);
  let sysMain = 0; const inputs = page.locator("main input[name^=count-]"); const n = await inputs.count();
  for (let i = 0; i < n; i++) {
    const row = await inputs.nth(i).evaluate((e) => e.closest("tr, li, div.rounded-xl, div")?.innerText ?? "");
    console.log("ROW", JSON.stringify(row.slice(0, 200)));
    const sys = Number((row.replace(/ST-\d+|Notebook \d+/g, "").match(/(\d+)/) ?? [])[1]);
    if (row.includes("1569")) sysMain = sys;
    await inputs.nth(i).fill(row.includes("1569") ? String(sys - 5) : String(sys));
  }
  for (const nm of await page.locator("main [name^=note-]").all()) await nm.fill("QA Demo count");
  await page.getByRole("button", { name: /^Send \d+ difference/ }).click(); await sleep(2500);
  const s = await said(page); const t = await mainText(page, 2000);
  const after = await stock();
  rec(R, `Stock audit: count QA Demo Notebook 1569 in Main store as ${sysMain - 5} (system ${sysMain}) and send for approval`, "Sent for approval; stock stays the same until approved", `${s || t.slice(0, 200)} / stock before ${before}, after ${after}`, /approv/i.test(s + t) && after === before ? "PASS" : "FAIL");
} catch (e) { console.log("ERR", e.message.split("\n")[0]); }
await page.context().close(); await close();
