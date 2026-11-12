import { asRole, go, mainText, sleep, close, snap } from "../full/selftest-A-h.mjs";
const URL_ = "/examination-results/marks/dceaeaa4-bd1d-445d-9f50-56e5614ddc19/3f6b76ae-e96a-4b9d-917b-c977c3b649fc";
const p = await asRole("teacher");
await go(p, URL_); await sleep(1500);
const th = p.getByLabel(/^Theory for .*, out of 80/);
const cell = th.nth(4);
const base = await mainText(p, 12000);
for (const v of ["45.25", "a", "-"]) {
  await cell.click(); await cell.fill(""); await cell.pressSequentially(v, { delay: 30 }); await p.keyboard.press("Tab"); await sleep(600);
  const t = await mainText(p, 12000);
  const newLines = t.split("\n").filter((l) => !base.includes(l)).slice(0, 6);
  console.log(`"${v}" -> "${await cell.inputValue()}" invalid=${await cell.getAttribute("aria-invalid")} NEW: ${JSON.stringify(newLines)}`);
}
await snap(p, "c-marks-4525");
await cell.fill(""); await p.keyboard.press("Tab"); await sleep(500);
await p.getByRole("button", { name: /Submit marks/ }).first().click(); await sleep(1500);
const t = await mainText(p, 12000);
console.log("SUBMIT BLANKS NEW:", JSON.stringify(t.split("\n").filter((l) => !base.includes(l)).slice(0, 8)));
console.log("DIALOGS", await p.getByRole("dialog").count());
await snap(p, "c-marks-submit-blanks2", false);
await p.getByRole("button", { name: /Save now/ }).first().click(); await sleep(2000);
console.log("PROBLEMS", p.problems);
await close();
