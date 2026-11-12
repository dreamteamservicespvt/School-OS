// Layman C: wrong values in the marks grid (teacher, Half Yearly Maths 6 A).
import { asRole, go, mainText, sleep, close, snap } from "../full/selftest-A-h.mjs";
const URL_ = "/examination-results/marks/dceaeaa4-bd1d-445d-9f50-56e5614ddc19/3f6b76ae-e96a-4b9d-917b-c977c3b649fc";
const p = await asRole("teacher");
await go(p, URL_); await sleep(1500);
const grid = p.getByText("Grid", { exact: true }).first();
if (await grid.isVisible().catch(() => false)) { await grid.click(); await sleep(800); }
const top = await mainText(p, 4000);
console.log("TOP\n", top.replace(/\n+/g, " | ").slice(0, 1500));
const th = p.getByLabel(/^Theory for .*, out of 80/);
const names = await th.evaluateAll((xs) => xs.map((x) => x.getAttribute("aria-label")));
const vals0 = await th.evaluateAll((xs) => xs.map((x) => x.value));
console.log("ROWS", names.length, names.slice(0, 4), "VALUES", vals0.join(","));
const cell = th.nth(4);
const orig = vals0[4];
async function tryVal(v) {
  await cell.click(); await cell.fill(""); await cell.pressSequentially(v, { delay: 30 }); await p.keyboard.press("Tab"); await sleep(600);
  const inv = await cell.getAttribute("aria-invalid");
  const shown = await cell.inputValue();
  const t = await mainText(p, 12000);
  const msgs = (t.match(/[^\n]*(too high|out of 80|not a mark|cannot|must be|between|number|Check|negative|below 0|invalid)[^\n]*/gi) ?? []).slice(0, 4);
  console.log(`VALUE "${v}" -> box shows "${shown}" invalid=${inv} msgs=${JSON.stringify(msgs)}`);
}
for (const v of ["85", "-5", "abc", "45.5", "45.25", "0", "80", "AB", "ML", "1e2", " 7 "]) await tryVal(v);
await cell.fill("85"); await p.keyboard.press("Tab"); await sleep(400);
await snap(p, "c-marks-85");
// Save with a bad value
const save = p.getByRole("button", { name: /Save now/ }).first();
await save.click(); await sleep(2500);
console.log("AFTER SAVE WITH 85:", (await mainText(p, 12000)).match(/[^\n]*(saved|Saved|too high|cannot|fix|Fix)[^\n]*/g)?.slice(0, 5));
await snap(p, "c-marks-save-85");
// Submit with blanks
const sub = p.getByRole("button", { name: /Submit marks/ }).first();
await sub.click(); await sleep(1500);
const subT = await mainText(p, 12000);
console.log("SUBMIT WITH BLANKS:", subT.match(/[^\n]*(blank|missing|no mark|not entered|fix|Fix|Submit \d+)[^\n]*/gi)?.slice(0, 6));
await snap(p, "c-marks-submit-blank");
const dlg = p.getByRole("dialog");
if (await dlg.count()) { console.log("DIALOG OPENED!", (await dlg.last().innerText()).slice(0, 300)); await p.keyboard.press("Escape"); }
// Restore
await cell.fill(orig ?? ""); await p.keyboard.press("Tab"); await save.click(); await sleep(2500);
await go(p, URL_); await sleep(1500);
if (await grid.isVisible().catch(() => false)) { await grid.click(); await sleep(800); }
console.log("VALUES AFTER RESTORE", (await p.getByLabel(/^Theory for .*, out of 80/).evaluateAll((xs) => xs.map((x) => x.value))).join(","));
console.log("PROBLEMS", p.problems);
await close();
