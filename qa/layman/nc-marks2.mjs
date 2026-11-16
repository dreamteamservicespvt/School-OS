import { asRole, go, sleep, close, snap, one, timed, watch } from "./nc-h.mjs";
const p = watch(await asRole("teacher"));
await go(p, "/examination-results/marks/dceaeaa4-bd1d-445d-9f50-56e5614ddc19/3f6b76ae-e96a-4b9d-917b-c977c3b649fc"); await sleep(1500);
const box = (w, n) => p.getByLabel(`${w} for ${n}, out of ${w === "Theory" ? 80 : 20}`);
const status = async () => one((await p.locator("main").innerText()).split("Marks for Mathematics")[0].split("Entered")[1] ?? "", 200);
const rowMsg = async () => one(await p.locator("[role=alert], .text-danger, [aria-live]").allInnerTexts().then(a => a.filter(Boolean).join(" || ")), 500);
const tryVal = async (who, w, v) => {
  const b = box(w, who); await b.click(); await b.press("Control+a"); await b.pressSequentially(v, { delay: 30 }); await b.press("Tab"); await sleep(1500);
  console.log(`${who} ${w} typed "${v}" -> box "${await b.inputValue()}" | msgs: ${await rowMsg()} | counts: ${await status()}`);
};
for (const v of ["85", "abc", "ab", "-5", "1e2", "12.5", "12.25", "AB", "ml", "٧٥", "౭౫", "79.5"]) await tryVal("Harini Gupta", "Theory", v);
await snap(p, "marks-tries");
// clear back
const b = box("Theory", "Harini Gupta"); await b.click(); await b.press("Control+a"); await b.press("Backspace"); await b.press("Tab"); await sleep(2500);
console.log("cleared ->", await b.inputValue(), await status());
// Submit with blanks
await p.getByRole("button", { name: "Submit marks" }).click(); await sleep(1500);
console.log("SUBMIT", one(await p.locator("[role=dialog], [role=alertdialog]").last().innerText().catch(() => "no dialog"), 1200));
await snap(p, "marks-submit-blanks");
await p.getByRole("button", { name: "Cancel" }).last().click().catch(() => {});
await p.reload(); await sleep(2000);
console.log("after reload Harini theory:", await box("Theory", "Harini Gupta").inputValue(), await status());
console.log("PROBLEMS", p.problems);
await close();
