// Layman C: the student hands in homework; wrong file type; sees only own class.
import { asRole, go, mainText, sleep, close, snap } from "../full/selftest-A-h.mjs";
const S = process.env.SCR;
const p = await asRole("student");
await go(p, "/homework-learning"); await sleep(1000);
const t = await mainText(p, 20000);
console.log("sees teacher's 6 A LC homework?", /LC- గణితం/.test(t));
await p.getByRole("button", { name: /Submit/ }).or(p.getByRole("link", { name: /Submit/ })).nth(3).click(); await sleep(1500);
const sheet = p.getByRole("dialog").last();
const st = async () => (await sheet.innerText().catch(() => "CLOSED")).replace(/\n+/g, " | ");
console.log("SHEET", (await st()).slice(0, 300));
const fi = sheet.locator("input[type=file]");
await fi.nth(1).setInputFiles(`${S}/virus.exe`).catch(async () => fi.first().setInputFiles(`${S}/virus.exe`)); await sleep(1000);
console.log("accept of 2nd input:", await fi.nth(1).getAttribute("accept").catch(() => "-"));
console.log("AFTER .exe:", (await st()).slice(0, 400));
const b = await st();
await sheet.getByRole("button", { name: /Hand in/ }).last().click();
for (let i = 0; i < 40; i++) { await sleep(500); if (!/Handing in/.test(await st())) break; }
const after = await st();
console.log("HAND IN .exe NEW ->", JSON.stringify(after.split(" | ").filter((l) => !b.split(" | ").includes(l))));
await snap(p, "c-stu-exe-after", false);
console.log("PAGE", (await mainText(p, 4000)).replace(/\n+/g, " | ").slice(0, 900));
console.log("PROBLEMS", p.problems);
await close();
