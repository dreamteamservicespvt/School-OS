import { asRole, go, mainText, sleep, close, snap } from "../full/selftest-A-h.mjs";
const ID = "343443c8-7b6d-4dda-921f-b7b125ddc77e";
const p = await asRole("admin");
// A: only a date in "Publish at", Save draft, reopen.
await go(p, `/communication/notices/${ID}/edit`); await sleep(1000);
const pa = p.locator("#n-publishAt");
await pa.click(); await pa.fill("20-11-2026"); await p.keyboard.press("Escape"); await p.keyboard.press("Tab"); await sleep(400);
console.log("time box value:", JSON.stringify(await p.locator("#n-publishAt-time").inputValue().catch(() => "?")), "placeholder:", await p.locator("#n-publishAt-time").getAttribute("placeholder").catch(() => "?"));
await snap(p, "c-notice-dateonly", false);
await p.getByRole("button", { name: "Save draft" }).click(); await sleep(4000);
console.log("after draft save url", new URL(p.url()).pathname);
console.log("DETAIL:", (await mainText(p, 4000)).replace(/\n+/g, " | ").slice(0, 600));
await go(p, `/communication/notices/${ID}/edit`); await sleep(1000);
console.log("REOPEN publishAt:", JSON.stringify(await pa.inputValue()), "time:", JSON.stringify(await p.locator("#n-publishAt-time").inputValue().catch(() => "?")));
// B: date and time typed
await pa.click(); await pa.fill("20-11-2026"); await p.keyboard.press("Escape");
const tm = p.locator("#n-publishAt-time"); await tm.click(); await tm.fill("10:00 AM"); await p.keyboard.press("Escape"); await p.keyboard.press("Tab"); await sleep(400);
console.log("hidden now:", await p.locator("input[name=publishAt]").inputValue());
await p.getByRole("button", { name: "Save draft" }).click(); await sleep(4000);
console.log("DETAIL B:", (await mainText(p, 4000)).replace(/\n+/g, " | ").slice(0, 600));
await snap(p, "c-notice-datetime", false);
console.log("PROBLEMS", p.problems);
await close();
