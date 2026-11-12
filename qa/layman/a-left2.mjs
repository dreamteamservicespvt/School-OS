import { asRole, go, mainText, sleep, close, snap } from "../full/selftest-A-h.mjs";
const p = await asRole("admin");
await go(p, "/student-management?q=Ananya%20Verma"); await sleep(800);
const t = await mainText(p, 4000); console.log("LIST", t.slice(t.indexOf("Reset all"), t.indexOf("Reset all") + 500).replace(/\n/g, " | "));
await go(p, "/student-management?q=Ananya%20Verma&removed=1"); await sleep(800);
const href = await p.locator("main a[href*='/students/']", { hasText: "Ananya Verma" }).first().getAttribute("href").catch(() => null);
console.log("HREF", href);
if (href) { await go(p, href); await sleep(800); const x = await mainText(p, 9000); console.log("PAGE", x.slice(0, 700).replace(/\n/g, " | ")); console.log("TIMELINE?", (x.match(/[^\n]*(section|Section|moved|Moved|left|Left)[^\n]*/g) ?? []).slice(0, 12).join(" / ")); await snap(p, "ananya"); }
await go(p, "/attendance-management/register?section=47cfe8fa-64c4-4d99-8225-91808e82644c"); await sleep(800);
console.log("ADMIN REG", ((await mainText(p, 1200)).match(/Class 5 A[^\n]*students[^\n]*/) ?? [""])[0]);
await close();
