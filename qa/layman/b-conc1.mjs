// Layman B: one concession try per fresh sheet (slow server safe).  node qa/layman/b-conc1.mjs <amount> [pct] [submit]
import { asRole, go, mainText, sleep, snap } from "../full/selftest-A-h.mjs";
const p = await asRole("accountant");
const dlg = () => p.getByRole("dialog").last();
const v = process.argv[2]; const pct = process.argv[3] === "pct"; const submit = process.argv.includes("submit");
await go(p, "/fee-management/concessions"); await sleep(1500);
await p.getByRole("button", { name: "New concession" }).or(p.getByRole("link", { name: "New concession" })).first().click({ timeout: 90000 }); await sleep(2500);
await dlg().getByPlaceholder("Name, admission no. or phone").pressSequentially("Sravya Joshi", { delay: 40 }); await sleep(3000);
await dlg().getByText("Sravya Joshi").first().click(); await sleep(2500);
await dlg().getByPlaceholder(/father/).fill("LB- layman test concession (check only)");
if (pct) { await dlg().getByText("%", { exact: true }).first().click(); await sleep(500); }
const box = dlg().locator("input:visible").filter({ hasNot: p.locator("[type=file]") });
const ids = await dlg().locator("input:visible").evaluateAll((es) => es.map((e) => `${e.id}|${e.name}|${e.placeholder}|${e.type}`));
const amtInput = dlg().locator(`input[name="${pct ? "percent" : "amount"}"]`).or(dlg().getByPlaceholder(pct ? /%|10/ : "2,000")).first();
await amtInput.fill(v);
await sleep(500);
const helpText = (await dlg().innerText()).split(/\n/).filter((l) => /₹|%|due|more|less|cannot|must/i.test(l) && l.length < 200).join(" || ");
console.log("INPUTS", ids.join(" ; "));
console.log("BEFORE", helpText);
if (!submit) { await dlg().getByRole("button", { name: /Apply|Send/ }).last().click(); for (let i = 0; i < 40 && /…/.test(await dlg().innerText().catch(() => "")); i++) await sleep(1000); await sleep(1500);
  console.log("AFTER open:", await dlg().isVisible().catch(() => false), "|", (await dlg().innerText().catch(() => "")).split(/\n/).filter((l) => /must|more than|cannot|least|limit|over|between|only|needed|Type the/i.test(l) && l.length < 200).join(" || "));
  await snap(p, `conc1-${pct ? "pct" : "amt"}-${v}`, false); }
process.exit(0);
