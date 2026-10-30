// Journey E4, part 1: a subject teacher enters Half Yearly Science marks for Class 6 A, with mistakes, then submits.
//   node qa/full/j4-marks.mjs
import { as } from "./look.mjs";
import { go, mainText, shot, close } from "./h.mjs";
const URL_ = "/examination-results/marks/7c44d8a3-7ad2-468b-8143-485fa374f5fc/f47ce52a-4e82-47fe-9387-e13e3d1e9454";
const rec = (c, pass, note = "") => console.log(`${pass ? "PASS" : "FAIL"} ${c}${note ? " :: " + note : ""}`);
const p = await as("subjectteacher");
await go(p, URL_);
const boxes = p.locator('main input[aria-label^="Theory for"], main input[aria-label^="Practical for"]');
const n = await boxes.count();
console.log("boxes", n);
// Mistakes on the first student
const th0 = boxes.nth(0);
await th0.fill("71"); await th0.press("Tab"); await p.waitForTimeout(800);
const msg71 = await p.evaluate(() => [...document.querySelectorAll("main [role=alert], main [aria-live], main .text-destructive, main [id$=-error]")].map((e) => e.innerText.trim()).filter(Boolean).join(" / "));
const inv71 = await th0.getAttribute("aria-invalid");
rec("71 out of 70 refused", inv71 === "true" || /70/.test(msg71), `aria-invalid=${inv71} msg=${msg71.slice(0, 200)}`);
await th0.fill("abc"); await th0.press("Tab"); await p.waitForTimeout(500);
rec("Letters refused", (await th0.getAttribute("aria-invalid")) === "true" || (await th0.inputValue()) !== "abc", `value=${await th0.inputValue()}`);
// Real marks: AB for student 2, ML for student 3, numbers for the rest
for (let i = 0; i < n; i += 2) {
  const s = i / 2;
  const t = s === 1 ? "AB" : s === 2 ? "ML" : String(40 + ((s * 7) % 30));
  const pr = s === 1 || s === 2 ? "" : String(15 + ((s * 5) % 15));
  await boxes.nth(i).fill(t);
  if (pr) await boxes.nth(i + 1).fill(pr);
}
await boxes.nth(n - 1).press("Tab");
await p.waitForTimeout(3000);
console.log("SUMMARY", (await mainText(p, 900)).replace(/\n+/g, " | ").match(/Entered.{0,200}/)?.[0]);
await p.getByRole("button", { name: "Submit marks" }).click();
await p.waitForTimeout(1500);
const d = p.getByRole("dialog").last();
if (await d.count()) {
  console.log("DIALOG", (await d.innerText()).replace(/\n+/g, " | ").slice(0, 700));
  const b = d.getByRole("button", { name: /Submit/ }).last();
  await b.click(); await b.click({ timeout: 800 }).catch(() => {});
}
await p.waitForTimeout(4000);
console.log("AFTER", (await mainText(p, 900)).replace(/\n+/g, " | ").slice(0, 900));
await shot(p, "j4-marks", false);
if (p.problems.length) console.log("PROBLEMS", p.problems);
await close();
