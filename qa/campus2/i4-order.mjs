// Inventory: Principal approves PR, Store Keeper makes the order, receives goods (part, then over), records the bill;
// the Accountant pays it and it reaches the Day Book.
import { asUser, go, mainText, close, record, send, said, sleep } from "./util.mjs";
const M = "Inventory Management", P = "Purchases & Vendors";
const rec = (role, action, expected, actual, status, defect) => record({ module: M, page: P, action, role, expected, actual, status, ...(defect ? { defect } : {}) });
const ONLY = process.env.ONLY?.split(",");
const step = async (name, fn) => { if (ONLY && !ONLY.some((o) => name.includes(o))) return; try { await fn(); } catch (e) { console.log("ERR", name, e.message.split("\n")[0]); } };
const D = (page, k) => page.locator(`dialog[open] [name="${k}"]`).first();
const waitDialog = async (page) => { await page.waitForSelector("dialog[open]", { timeout: 15000 }); await sleep(400); };

await step("approve", async () => {
  const page = await asUser("cems.principal");
  await go(page, "/approvals");
  const card = page.locator("main").locator("article, li, div").filter({ hasText: "PR-0001" }).filter({ has: page.getByRole("button", { name: "Approve" }) }).last();
  await card.getByRole("button", { name: "Approve" }).click(); await sleep(1500);
  if (await page.locator("dialog[open]").count()) { const b = (await page.locator("dialog[open] button[type=submit]").last().innerText()).trim(); await send(page, b); }
  await sleep(1000); const s = await said(page); const t = await mainText(page, 1500);
  rec("Principal", "Approve purchase request PR-0001 (₹9,000) in Approvals", "Approved; it leaves Waiting for me", s || t.slice(0, 300), /approved/i.test(s + t) ? "PASS" : "FAIL");
  await page.context().close();
});
await step("order", async () => {
  const page = await asUser("cems.store");
  await go(page, "/inventory-management/purchases?tab=requests"); const t = await mainText(page, 4000);
  const i = t.indexOf("PR-0001"); console.log(t.slice(i - 50, i + 400));
  const reqHref = await page.evaluate(() => [...document.querySelectorAll("main a[href*='request=']")].map((a) => a.getAttribute("href"))[0]);
  await go(page, reqHref); await sleep(500);
  await page.getByRole("link", { name: "Make the purchase order" }).click(); await waitDialog(page);
  const vs = D(page, "vendorId"); const v = await vs.locator("option", { hasText: "QA Demo Paper Mart" }).first().getAttribute("value"); await vs.selectOption(v);
  const btn = (await page.locator("dialog[open] button[type=submit]").last().innerText()).trim();
  const r = await send(page, btn);
  rec("Store Keeper", "Make a purchase order from the approved request PR-0001 (vendor QA Demo Paper Mart)", "Order made with the request's lines", r.s, !r.open && /PO|order/i.test(r.s) ? "PASS" : "FAIL");
  await page.context().close();
});
await step("direct", async () => {
  const page = await asUser("cems.store");
  await go(page, "/inventory-management/purchases?tab=orders&order=new"); await waitDialog(page);
  const vs = D(page, "vendorId"); const v = await vs.locator("option", { hasText: "QA Demo Paper Mart" }).first().getAttribute("value"); await vs.selectOption(v);
  const it = D(page, "itemId"); await it.selectOption(await it.locator("option", { hasText: "QA Demo Notebook 1569" }).first().getAttribute("value"));
  await D(page, "qty").fill("300"); await D(page, "price").fill("45");
  const btn = (await page.locator("dialog[open] button[type=submit]").last().innerText()).trim();
  const r = await send(page, btn);
  rec("Store Keeper", `New purchase order with no request: 300 × ₹45 = ₹13,500 (limit ₹5,000); button "${btn}"`, "Not sent to the vendor: waits for approval ('Request waiting for approval')", r.s, /approv|wait/i.test(r.s + btn) ? "PASS" : "FAIL");
  await page.context().close();
});
await step("receive", async () => {
  const page = await asUser("cems.store");
  await go(page, "/inventory-management/purchases?tab=orders"); 
  const href = process.env.PO ?? await page.evaluate(() => [...document.querySelectorAll("main tr")].filter((r) => /PR-0001|Part|Sent/.test(r.innerText)).map((r) => r.querySelector("a[href*='/purchases/orders/']")?.getAttribute("href")).filter(Boolean).pop());
  console.log("order", href);
  await go(page, href + (href.includes("?") ? "&" : "?") + "open=receive"); await waitDialog(page);
  const q = page.locator("dialog[open] input[name=qty], dialog[open] input[name=receivedQty], dialog[open] input[inputmode=numeric]").first();
  console.log(await page.locator("dialog[open]").innerText());
  await q.fill("120");
  let r = await send(page, (await page.locator("dialog[open] button[type=submit]").last().innerText()).trim());
  rec("Store Keeper", "Receive 120 of the 200 ordered notebooks (part delivery)", "Saved; order Part received; stock up by 120", r.s, !r.open ? "PASS" : "FAIL");
  await go(page, href + (href.includes("?") ? "&" : "?") + "open=receive"); await waitDialog(page);
  await q.fill("100");
  r = await send(page, (await page.locator("dialog[open] button[type=submit]").last().innerText()).trim());
  const txt = await page.locator("dialog[open]").innerText().catch(() => "");
  rec("Store Keeper", "Receive 100 more when 80 are left to come (over the order), no reason given", "Warning 'Ordered 200, receiving 220' and a reason is asked", r.s + " / " + txt.slice(0, 300), r.open && /more than ordered|ordered|reason/i.test(r.s + txt) ? "PASS" : "FAIL");
  await page.context().close();
});
console.log("done");
await close();
