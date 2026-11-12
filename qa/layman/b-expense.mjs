// Layman B: Record expense / Record income / Move money with wrong values, then one small real one each.
import { asRole, go, mainText, sleep, snap } from "../full/selftest-A-h.mjs";
import { appendFileSync } from "node:fs";
const OUT = process.env.QA_OUT; const log = (...a) => { const s = a.join(" "); console.log(s); appendFileSync(`${OUT}/expense.log`, s + "\n"); };
const p = await asRole("accountant");
const errs = []; p.on("pageerror", (e) => errs.push(`${p.url()} ${e.message}`));
const dlg = () => p.getByRole("dialog").last();
const dt = async () => (await dlg().innerText().catch(() => "")).replace(/\n+/g, " | ");
const errsIn = async () => (await p.evaluate(() => [...document.querySelectorAll("[role=dialog] [id$='-error'], [role=dialog] [role=alert]")].map((e) => e.innerText.trim()).filter(Boolean).join(" || ")));
const num = (s) => Number(String(s ?? "").replace(/[^\d.]/g, "") || NaN);
const S = new Date().toTimeString().slice(0, 5).replace(":", "");
async function totals() { await go(p, "/finance-management/day-book"); await sleep(1500); const b = await mainText(p, 3000); return { inc: num((b.match(/Total income\n(₹[\d,]+)/) ?? [])[1]), exp: num((b.match(/Total expense\n(₹[\d,]+)/) ?? [])[1]) }; }
const t0 = await totals(); log("T0", JSON.stringify(t0));
// ---- Expense
await go(p, "/finance-management/expenses?do=new"); await sleep(2000);
await snap(p, "exp-sheet", false);
log("EXP SHEET", (await dt()).slice(0, 1200));
const save = () => dlg().getByRole("button", { name: /^(Save|Send to|Record|Pay)/ }).last();
log("EXP save button", await save().innerText().catch(() => "none"));
await dlg().getByLabel("What was it for").fill(`LB-${S} chalk box`);
await dlg().getByLabel("Expense head").selectOption({ index: 1 });
for (const v of ["-50", "0", "100.555", "abc", "99999999999", "1e5"]) {
  await dlg().getByLabel("Amount").fill(v); await sleep(300);
  await save().click().catch(() => {}); await sleep(1500);
  log(`EXP amount "${v}" ->`, await errsIn(), "| open:", await dlg().isVisible().catch(() => false));
}
await snap(p, "exp-bad-amount", false);
await dlg().getByLabel("Amount").fill("55");
await dlg().getByLabel("What was it for").fill(`LB-${S} chalk box ` + "y".repeat(600));
log("EXP long text kept", (await dlg().getByLabel("What was it for").inputValue()).length);
await dlg().getByLabel("What was it for").fill(`LB-${S} chalk box`);
await sleep(300);
log("EXP before save", (await dt()).slice(0, 900));
await save().dblclick(); await sleep(5000);
log("EXP after save open:", await dlg().isVisible().catch(() => false), (await dt()).slice(0, 500), "| page:", (await mainText(p, 800)).slice(0, 300).replace(/\n/g, " / "));
await snap(p, "exp-after-save", false);
await p.keyboard.press("Escape");
await go(p, "/finance-management/expenses"); await sleep(2000);
const el = await mainText(p, 20000);
log("EXP rows with LB", (el.match(new RegExp(`LB-${S} chalk box`, "g")) ?? []).length, "|", (el.match(new RegExp(`[^\n]*\n[^\n]*LB-${S} chalk box[^\n]*\n[^\n]*\n[^\n]*\n[^\n]*`)) ?? [""])[0].replace(/\n/g, " / "));
// ---- Income
await go(p, "/finance-management/income?do=new"); await sleep(2000);
await snap(p, "inc-sheet", false);
log("INC SHEET", (await dt()).slice(0, 900));
const ib = () => dlg().getByRole("button", { name: /Post to Day Book|Save as draft|Save|Record/ }).last();
await dlg().getByLabel("Income head").selectOption({ index: 1 });
await dlg().getByLabel("Received from").fill(`LB-${S} scrap paper`);
for (const v of ["-77", "0", "77.777", "99999999999"]) {
  await dlg().getByLabel("Amount").fill(v); await sleep(300); await ib().click().catch(() => {}); await sleep(1500);
  log(`INC amount "${v}" ->`, await errsIn(), "| open:", await dlg().isVisible().catch(() => false));
}
await dlg().getByLabel("Amount").fill("77");
await dlg().getByRole("radio", { name: "Cash" }).or(dlg().getByRole("button", { name: "Cash", exact: true })).first().click().catch(() => {});
await ib().dblclick(); await sleep(5000);
log("INC after save open:", await dlg().isVisible().catch(() => false), (await dt()).slice(0, 500));
await snap(p, "inc-after-save", false);
await p.keyboard.press("Escape");
await go(p, "/finance-management/income"); await sleep(2000);
const il = await mainText(p, 20000);
log("INC rows with LB", (il.match(new RegExp(`LB-${S} scrap paper`, "g")) ?? []).length);
const t1 = await totals(); log("T1", JSON.stringify(t1), "diff inc", t1.inc - t0.inc, "exp", t1.exp - t0.exp);
// ---- Move money: wrong values only (no real move)
await go(p, "/finance-management/cash-bank?do=move"); await sleep(2000);
log("MOVE SHEET", (await dt()).slice(0, 900));
await snap(p, "move-sheet", false);
const amt = dlg().getByLabel(/Amount/).first();
for (const v of ["-10", "0", "10.555", "99999999999"]) { await amt.fill(v).catch(() => {}); await sleep(300); await dlg().getByRole("button", { name: /Move|Save/ }).last().click().catch(() => {}); await sleep(1500); log(`MOVE "${v}" ->`, await errsIn(), "| open:", await dlg().isVisible().catch(() => false)); }
await snap(p, "move-bad", false);
log("ERRS", errs.join(" ; "));
process.exit(0);
