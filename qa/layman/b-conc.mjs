// Layman B: New concession and New refund with wrong values; one ₹10 concession and one ₹50 refund request for Sravya Joshi.
import { asRole, go, mainText, sleep, snap } from "../full/selftest-A-h.mjs";
import { appendFileSync } from "node:fs";
const OUT = process.env.QA_OUT; const log = (...a) => { const s = a.join(" "); console.log(s); appendFileSync(`${OUT}/conc.log`, s + "\n"); };
const p = await asRole("accountant");
const errs = []; p.on("pageerror", (e) => errs.push(e.message));
const dlg = () => p.getByRole("dialog").last();
const dt = async () => (await dlg().innerText().catch(() => "")).replace(/\n+/g, " | ");
const msgs = async () => (await dlg().innerText().catch(() => "")).split(/\n/).filter((l) => /must|more than|cannot|Enter|least|Choose|limit|over|Type|between|only/i.test(l) && l.length < 160).join(" || ");
const mode = process.argv[2] ?? "both";
const SID = "c8d371f4-01ae-48e6-ba03-cff70d0a1b5a";
if (mode !== "refund") {
  await go(p, "/fee-management/concessions"); await sleep(1500);
  await p.getByRole("button", { name: "New concession" }).or(p.getByRole("link", { name: "New concession" })).first().click({ timeout: 90000 }); await sleep(2500);
  log("CONC SHEET", (await dt()).slice(0, 1500)); await snap(p, "conc-sheet", false);
  const save = () => dlg().getByRole("button", { name: /Apply|Send|Save|Give/ }).last();
  log("CONC button", await save().innerText().catch(() => "?"));
  await save().click().catch(() => {}); await sleep(2000); log("CONC empty ->", await msgs());
  const st = dlg().getByPlaceholder("Name, admission no. or phone");
  await st.pressSequentially("Sravya Joshi", { delay: 50 }); await sleep(3000);
  log("CONC results", (await dt()).slice(0, 600));
  await dlg().getByText("Sravya Joshi").first().click(); await sleep(2500);
  log("CONC form", (await dt()).slice(0, 2500)); await snap(p, "conc-form", false);
  log("CONC button", await save().innerText().catch(() => "?"));
  await save().click().catch(() => {}); await sleep(2500); log("CONC empty ->", await msgs());
  await snap(p, "conc-empty", false);
  const amt = dlg().getByLabel("Amount", { exact: true }).or(dlg().getByPlaceholder("2,000")).first();
  const reason = dlg().getByPlaceholder(/father/);
  await reason.fill("LB- layman test concession");
  for (const v of ["-10", "0", "10.555", "50000", "abc"]) { await amt.fill(v); await sleep(300); await save().click().catch(() => {}); await sleep(2500); log(`CONC ₹ "${v}" ->`, await msgs(), "| open:", await dlg().isVisible().catch(() => false)); if (!(await dlg().isVisible().catch(() => false))) { log("!! CONC SAVED", v); process.exit(0); } }
  await dlg().getByRole("button", { name: "%", exact: true }).or(dlg().getByText("%", { exact: true })).first().click(); await sleep(500);
  const pct = dlg().getByLabel(/Percent|%/).or(dlg().locator("input[inputmode=decimal], input[type=number]")).first();
  for (const v of ["150", "-5", "100", "12.555"]) { await pct.fill(v).catch(() => {}); await sleep(300); await save().click().catch(() => {}); await sleep(2500); log(`CONC % "${v}" ->`, await msgs(), "| open:", await dlg().isVisible().catch(() => false)); if (!(await dlg().isVisible().catch(() => false))) { log("!! CONC SAVED %", v); process.exit(0); } }
  await snap(p, "conc-bad", false);
  if (process.argv[3] === "real") { await dlg().getByRole("button", { name: "₹", exact: true }).or(dlg().getByText("₹", { exact: true })).first().click(); await sleep(400); await amt.fill("10"); await save().dblclick(); for (let i = 0; i < 30 && await dlg().isVisible().catch(() => false); i++) await sleep(1000); log("CONC real ->", await dlg().isVisible().catch(() => false) ? await dt() : "closed", "|", (await mainText(p, 600)).replace(/\n/g, " / ").slice(0, 400)); }
  process.exit(0);
}
