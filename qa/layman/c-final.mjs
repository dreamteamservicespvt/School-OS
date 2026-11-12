import { asRole, go, mainText, sleep, close, snap } from "../full/selftest-A-h.mjs";
const t = await asRole("teacher");
await go(t, "/dashboard"); await sleep(1500);
const cw = t.getByRole("link", { name: "Check work" }).or(t.getByRole("button", { name: "Check work" })).first();
console.log("check work href", await cw.getAttribute("href").catch(() => "-"));
await cw.click(); await t.waitForLoadState("load"); await sleep(2500);
console.log("CHECK WORK ->", t.url(), (await mainText(t, 3000)).replace(/\n+/g, " | ").slice(0, 700));
await snap(t, "c-final-checkwork", false);
await go(t, "/homework-learning"); await sleep(1200);
console.log("HW TOP", (await mainText(t, 1500)).replace(/\n+/g, " | ").match(/Waiting for you to check \| [^|]* \| [^|]*/)?.[0]);
// archive LC homework
await go(t, "/homework-learning/homework/f9373a57-3d30-4848-8a37-fac752befb5b"); await sleep(1200);
const more = t.getByRole("button", { name: /More for this homework|Archive/ }).first();
if (await more.isVisible().catch(() => false)) { await more.click(); await sleep(600); const ar = t.getByRole("menuitem", { name: /Archive/ }).or(t.getByRole("button", { name: /^Archive/ })).first(); if (await ar.isVisible().catch(() => false)) { await ar.click(); await sleep(1000); const d = t.getByRole("dialog").last(); if (await d.isVisible().catch(() => false)) await d.getByRole("button", { name: /Archive/ }).last().click(); await sleep(2500); } }
console.log("HW after archive", (await mainText(t, 500)).replace(/\n+/g, " | ").slice(0, 200));
await t.context().close();
const a = await asRole("admin");
await go(a, "/communication/notices/343443c8-7b6d-4dda-921f-b7b125ddc77e"); await sleep(1000);
await a.getByRole("button", { name: "Archive" }).click().catch(() => {}); await sleep(1200);
const d = a.getByRole("dialog").last();
console.log("ARCH DLG", (await d.innerText().catch(() => "none")).replace(/\n+/g, " | ").slice(0, 200));
if (await d.isVisible().catch(() => false)) { await d.getByRole("button", { name: /Archive/ }).last().click(); await sleep(2500); }
await go(a, "/communication/notices/343443c8-7b6d-4dda-921f-b7b125ddc77e"); await sleep(1000);
console.log("NOTICE", (await mainText(a, 300)).replace(/\n+/g, " | ").slice(0, 150));
await close();
