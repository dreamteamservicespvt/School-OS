import { asRole, go, mainText, sleep, close, snap } from "../full/selftest-A-h.mjs";
const p = await asRole("admin");
// Archive the waiting LC notice
await go(p, "/communication/notices/343443c8-7b6d-4dda-921f-b7b125ddc77e"); await sleep(800);
const arch = p.getByRole("button", { name: /Archive|Withdraw|Cancel/ }).first();
console.log("archive btn visible", await arch.isVisible().catch(() => false), await arch.innerText().catch(() => ""));
if (await arch.isVisible().catch(() => false)) { await arch.click(); await sleep(1200); const d = p.getByRole("dialog").last(); if (await d.count()) { console.log("DLG", (await d.innerText()).replace(/\n+/g, " | ").slice(0, 300)); const r = d.locator("textarea, input[type=text]").first(); if (await r.count()) await r.fill("LC test cleanup"); await d.getByRole("button", { name: /Archive|Withdraw|Yes|Confirm/ }).last().click(); await sleep(2500); } console.log("AFTER ARCHIVE", (await mainText(p, 600)).replace(/\n+/g, " | ").slice(0, 300)); }
// New draft: date only
await go(p, "/communication/notices/new"); await sleep(800);
await p.locator("#n-title").fill("LC- publish date test");
await p.locator("#n-body").fill("LC- test only");
await p.locator("label", { hasText: /^A$/ }).nth(3).locator("input").check();
const pa = p.locator("#n-publishAt");
await pa.click(); await pa.fill("20-11-2026"); await p.keyboard.press("Escape"); await p.keyboard.press("Tab"); await sleep(400);
console.log("date box:", await pa.inputValue(), "| time box value:", JSON.stringify(await p.locator("#n-publishAt-time").inputValue().catch(() => "?")), "placeholder:", await p.locator("#n-publishAt-time").getAttribute("placeholder").catch(() => "?"), "| hidden:", JSON.stringify(await p.locator("input[name=publishAt]").inputValue()));
await snap(p, "c-notice-dateonly", false);
await p.locator("#n-publishAt").scrollIntoViewIfNeeded(); await snap(p, "c-notice-dateonly-view", false);
await p.getByRole("button", { name: "Save draft" }).click(); await sleep(4000);
const id = new URL(p.url()).pathname.split("/")[3];
console.log("saved", id, (await mainText(p, 3000)).replace(/\n+/g, " | ").match(/Published \| [^|]*/)?.[0]);
await go(p, `/communication/notices/${id}/edit`); await sleep(1000);
console.log("REOPEN publishAt:", JSON.stringify(await pa.inputValue().catch(() => "?")));
console.log("PROBLEMS", p.problems);
await close();
