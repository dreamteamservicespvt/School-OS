// Layman A: class teacher on Take Attendance tries other dates (future, holiday, past unmarked, 31 Feb), search box, phone view.
import { asRole, go, mainText, sleep, close, snap } from "../full/selftest-A-h.mjs";
const p = await asRole("teacher");
const log = (k, v) => console.log(`== ${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`);
const dateBox = () => p.getByLabel("Date", { exact: true });
const head = async () => (await mainText(p, 1500)).replace(/\n/g, " | ").slice(0, 700);
await go(p, "/attendance-management"); await sleep(800);
log("count rows", await p.locator("main").getByRole("button", { name: "P", exact: true }).count());
await snap(p, "att-t-today");
for (const d of ["20-11-2026", "08-11-2026", "11-11-2026", "31-02-2026", "01-04-2025"]) {
  await dateBox().click(); await p.keyboard.press("Control+A"); await p.keyboard.press("Backspace");
  await dateBox().pressSequentially(d, { delay: 20 }); await p.keyboard.press("Enter"); await sleep(2500);
  log(`date ${d} url`, p.url().replace("http://localhost:3000", ""));
  log(`date ${d} page`, await head());
  await snap(p, `att-t-${d}`, false);
}
// search
await go(p, "/attendance-management"); await sleep(800);
await p.getByLabel("Find a student by name or roll number").fill("zzzz"); await sleep(800);
log("search zzzz", (await mainText(p, 2500)).match(/No [^\n]*|Nobody[^\n]*/g));
await p.getByLabel("Find a student by name or roll number").fill("7"); await sleep(800);
log("search 7", (await mainText(p, 2500)).match(/\n\d+\n[A-Z]{2}\n[^\n]+/g)?.slice(0, 5));
await p.setViewportSize({ width: 390, height: 844 }); await sleep(600); await snap(p, "att-t-390");
log("phone sideways", await p.evaluate(() => document.documentElement.scrollWidth));
console.log("PROBLEMS", p.problems);
await close();
