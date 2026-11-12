// Layman E: the new LE item: stock in bad values, stock out above stock, issue above stock, archive with stock, write off, archive.
process.env.QA_OUT ??= "D:/all/Projects/School-OS/qa-output/layman-e";
const { asRole, go, snap, note, close, sleep } = await import("../full/selftest-A-h.mjs");
const p = await asRole("store");
const settle = async () => { await sleep(600); for (let i = 0; i < 40; i++) { const busy = await p.locator('button[aria-busy="true"], button:has(.animate-spin)').count(); if (!busy) break; await sleep(500); } await sleep(800); };
const dlg = () => p.getByRole("dialog").last();
const step = async (label, where) => { await settle(); const loc = where ?? (await dlg().count() ? dlg() : p.locator("main")); const t = ((await loc.evaluate((el) => { const c = el.cloneNode(true); c.querySelectorAll("select,option").forEach((x) => x.remove()); document.body.appendChild(c); const s = c.innerText; c.remove(); return s; }).catch(() => "")) || "").replace(/\n{2,}/g, "\n"); note("inv3", `\n--- ${label}\n${t.slice(0, 3000)}\nPROBLEMS: ${p.problems.join(" ; ")}`); await snap(p, `inv3-${label}`, false); console.log(`--- ${label}\n${t.slice(0, 700)}`); return t; };
await go(p, "/inventory-management/items");
await p.getByPlaceholder(/Search name, code/i).fill("LE-"); await p.keyboard.press("Enter"); await settle();
const href = await p.locator("main tr").filter({ hasText: "LE-" }).first().locator("a[href]").first().getAttribute("href").catch(() => null);
console.log("item href", href);
if (!href) { await step("00-search"); await close(); process.exit(); }
const item = href.split("?")[0];
await go(p, item); await step("01-item", p.locator("main"));
const submit = () => dlg().getByRole("button").last();
// stock in
await go(p, item + "?open=in"); await settle();
const qty = () => dlg().getByLabel(/^Quantity/i).first();
await qty().fill("-2"); await submit().click(); await step("12-stockin-neg");
await qty().fill("1.5"); await submit().click(); await step("13-stockin-decimal");
await qty().fill("0"); await submit().click(); await step("11-stockin-zero");
await qty().fill("5"); await dlg().getByLabel(/Where it came from/).fill("LE- donated by a parent"); await submit().dblclick(); await step("14-stockin-5-dbl", p.locator("main"));
// stock out above stock
await go(p, item + "?open=out"); await settle();
await qty().fill("999"); await submit().click(); await step("21-out-999");
await qty().fill("15"); await submit().click(); await step("22-out-15");
// archive with stock
await go(p, item + "?open=archive"); await settle();
await submit().click(); await step("30-archive-empty-reason");
await dlg().getByLabel(/Reason/).fill("LE- test item"); await submit().click(); await step("31-archive-with-stock");
await go(p, item); await step("40-item-after", p.locator("main"));
note("inv3", "ITEM " + item);
await close();
