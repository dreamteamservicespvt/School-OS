import { asRole, go, mainText, sleep, close, snap } from "../full/selftest-A-h.mjs";
const p = await asRole("admin");
await go(p, "/student-management/leaving/left?q=Ananya"); await sleep(800);
const t = await mainText(p, 4000); console.log("LEFT LIST", t.slice(t.indexOf("Ananya") - 200, t.indexOf("Ananya") + 400).replace(/\n/g, " | "));
const href = await p.locator("main a", { hasText: "Ananya Verma" }).first().getAttribute("href").catch(() => null);
console.log("HREF", href);
if (href) { await go(p, href); await sleep(800); console.log("PAGE", (await mainText(p, 3000)).replace(/\n/g, " | ")); }
await go(p, "/attendance-management/register?section=47cfe8fa-64c4-4d99-8225-91808e82644c"); await sleep(800);
console.log("ADMIN REG", ((await mainText(p, 900)).match(/Class 5 A ·[^\n]*/) ?? [""])[0]);
await close();
