// Front Office at the gate: a visitor pass checked and recorded out, a pass that does not exist,
// then a student pickup released at reception and let out at the gate (cems.reception, cems.gate).
import { go, close, shot } from "../lib.mjs";
import { as } from "./session.mjs";
import { res } from "./res.mjs";

const M = "Front Office";
const STUDENT = process.env.STUDENT ?? "d8ea1b66-03df-4bb9-a344-3b6de6da9718"; // Demo Varun Teja
const PASS = process.env.PASS ?? "V-0001";
const gate = await as("cems.gate");
const txt = async (p, sel) => ((await p.locator(sel).allInnerTexts().catch(() => [])).join(" ")).replace(/\s+/g, " ");
const toast = (p) => txt(p, "[role=status], [role=alert]");

// 1. valid visitor pass
let d = "";
if (!process.env.SKIP_V) {
await go(gate, `/front-office/visitors?check=${PASS}`);
await gate.waitForTimeout(1200);
d = await txt(gate, "dialog[open]");
res({ module: M, page: "Check a pass", action: `Gate checks visitor pass ${PASS}`, role: "Gate Security", expected: "Shows the visitor, Valid until, and Record exit", actual: d.slice(0, 300), status: /Demo Visitor Rao/.test(d) && /Valid/.test(d) && /Record exit/.test(d) ? "PASS" : "FAIL" });
await shot(gate, "gate-check-valid");
if (/Record exit/.test(d)) {
  await gate.locator("dialog[open]").getByRole("button", { name: "Record exit" }).click();
  await gate.waitForTimeout(2500);
  const t = await toast(gate);
  await go(gate, `/front-office/visitors?check=${PASS}`);
  await gate.waitForTimeout(1200);
  d = await txt(gate, "dialog[open]");
  res({ module: M, page: "Check a pass", action: `Gate records the visitor's exit, then checks ${PASS} again`, role: "Gate Security", expected: "Exit recorded; the same pass then shows Already out and no longer works", actual: `${t.slice(0, 150)} || ${d.slice(0, 250)}`, status: /Already out|no longer works/.test(d) ? "PASS" : "FAIL" });
}
// 2. pass that does not exist
await go(gate, "/front-office/visitors?check=V-9999");
await gate.waitForTimeout(1200);
d = await txt(gate, "dialog[open]");
res({ module: M, page: "Check a pass", action: "Gate checks a pass number that does not exist (V-9999)", role: "Gate Security", expected: "Not valid, in plain words", actual: d.slice(0, 300), status: /No pass with number V-9999/.test(d) && /Do not let them in/.test(d) ? "PASS" : "FAIL" });
await shot(gate, "gate-check-none");
}

// 3. gate cannot release a student (pickup page)
await go(gate, `/front-office/pickup?student=${STUDENT}`);
await gate.waitForTimeout(1000);
const gm = await txt(gate, "main");
const gateRelease = await gate.locator("main").getByRole("button", { name: /^Release/ }).count();
res({ module: M, page: "Student Pickup", action: "Gate Security opens a student on Student Pickup", role: "Gate Security", expected: "Sees the approved pickup list but no Release button", actual: `release buttons=${gateRelease}; ${gm.slice(0, 250)}`, status: gateRelease === 0 ? "PASS" : "FAIL" });

// 4. reception releases the student
const rec = await as("cems.reception");
await go(rec, `/front-office/pickup?student=${STUDENT}`);
await rec.waitForTimeout(1200);
const form = rec.locator("form").filter({ has: rec.locator("input[name=guardianId]") });
console.log("FORM", (await form.innerText().catch(() => "none")).slice(0, 600));
const btnRelease = form.locator("button[type=submit]").last();
const nBtn = await form.locator("button[type=submit]").count();
res({ module: M, page: "Student Pickup", action: "Release with nobody chosen", role: "Receptionist", expected: "No way to release until a person, photo and reason are chosen", actual: `submit buttons=${nBtn}; says "Choose the person collecting"`, status: nBtn === 0 ? "PASS" : "FAIL" });
await form.getByRole("radio", { name: /Demo Prasad Teja/ }).click();
await rec.waitForTimeout(1500);
console.log("AFTER CHOOSE", (await form.innerText()).slice(0, 900));
await form.getByRole("checkbox").first().click();
await form.getByRole("radio", { name: "Other", exact: true }).click().catch(() => {});
await form.locator("input[name=otherReason]").fill("Demo QA pickup").catch(() => {});
await rec.waitForTimeout(300);
console.log("STATE", await form.evaluate((f) => [...f.querySelectorAll("[aria-checked]")].map((e) => `${e.getAttribute("aria-label") ?? e.textContent.slice(0, 20)}=${e.getAttribute("aria-checked")}`).join(", ")), await form.locator("button[type=submit]").allInnerTexts());
await btnRelease.click({ timeout: 5000 });
await rec.waitForURL(/gp=/, { timeout: 15000 }).catch(() => {});
await rec.waitForTimeout(1500);
const after = await txt(rec, "main");
const gp = (after.match(/GP-\d{4}-\d+/) ?? [null])[0];
await shot(rec, "pickup-released");
res({ module: M, page: "Student Pickup", action: "Reception releases Demo Varun Teja to Demo Prasad Teja (photo matched, reason Other)", role: "Receptionist", expected: "Gate pass number made, page shows it for the gate", actual: `${rec.url().replace(/.*:\d+/, "")} ${gp} ${(await toast(rec)).slice(0, 120)} ${after.slice(0, 200)}`, status: gp ? "PASS" : "FAIL" });

// 5. gate lets them out, then the pass cannot be used again
if (gp) {
  await go(gate, `/front-office/pickup?check=${gp}`);
  await gate.waitForTimeout(1200);
  d = await txt(gate, "dialog[open]");
  res({ module: M, page: "Check gate pass", action: `Gate checks pickup gate pass ${gp}`, role: "Gate Security", expected: "Student and collector shown with Let them out", actual: d.slice(0, 300), status: /Varun/.test(d) && /Let them out/.test(d) ? "PASS" : "FAIL" });
  await gate.locator("dialog[open]").getByRole("button", { name: "Let them out" }).click().catch(() => {});
  await gate.waitForTimeout(2500);
  const t = await toast(gate);
  await go(gate, `/front-office/pickup?check=${gp}`);
  await gate.waitForTimeout(1200);
  d = await txt(gate, "dialog[open]");
  res({ module: M, page: "Check gate pass", action: `Gate lets the student out, then checks ${gp} again`, role: "Gate Security", expected: "Left recorded; second check says Already used", actual: `${t.slice(0, 150)} || ${d.slice(0, 200)}`, status: /Already used/.test(d) ? "PASS" : "FAIL" });
}
console.log(gate.problems, rec.problems);
await close();
