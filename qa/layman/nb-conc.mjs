// Night B: New concession for Vihaan Kumar. node nb-conc.mjs "<amt1,amt2,..>" [pct] [submit]
import { asRole, go, mainText, sleep, snap, log, flat } from "./nb-h.mjs";
const L = log("conc");
const vals = process.argv[2].split(","); const pct = process.argv.includes("pct"); const submit = process.argv.includes("submit");
const p = await asRole("accountant");
const dlg = () => p.getByRole("dialog").last();
await go(p, "/fee-management/concessions"); await sleep(1000);
await p.getByRole("button", { name: "New concession" }).or(p.getByRole("link", { name: "New concession" })).first().click(); await sleep(2500);
await dlg().getByPlaceholder("Name, admission no. or phone").pressSequentially("Vihaan Kumar", { delay: 40 }); await sleep(3000);
await dlg().getByText("Vihaan Kumar").first().click(); await sleep(2500);
L("FORM", flat(await dlg().innerText()).slice(0, 1400));
await dlg().locator("textarea[name=reason]").fill(`NB- night test concession ${vals.join("/")}`);
if (pct) { await dlg().getByText("%", { exact: true }).first().click(); await sleep(500); }
const box = dlg().locator('input[name="value"]');
const save = dlg().getByRole("button", { name: /Apply|Send/ }).last();
for (const v of vals) {
  await box.fill(v); await sleep(600);
  const typed = (await dlg().innerText()).split("\n").filter((l) => /Not more than|at most|Up to|more than|must|Approvals/i.test(l)).join(" || ");
  L(`TYPED "${v}" btn="${await save.innerText()}" :: ${typed}`);
  if (!submit) { await save.click(); await sleep(3000);
    L(`  SENT "${v}" open=${await dlg().isVisible().catch(() => false)} :: ${(await dlg().innerText().catch(() => "")).split("\n").filter((l) => /Not more than|at most|more than|must|least|Type|Enter/i.test(l) && l.length < 200).join(" || ")}`);
    if (!(await dlg().isVisible().catch(() => false))) { L("!! SAVED", v); break; } }
}
await snap(p, `conc-${pct ? "pct" : "amt"}-${vals.at(-1)}`, false);
if (submit) { const t0 = Date.now(); await save.dblclick(); for (let i = 0; i < 40 && await dlg().isVisible().catch(() => false); i++) await sleep(1000);
  L("SUBMITTED", Date.now() - t0, "ms open=", await dlg().isVisible().catch(() => false), flat(await dlg().innerText().catch(() => "")).slice(0, 300));
  await go(p, "/fee-management/concessions"); await sleep(1000);
  L("LIST", flat(await mainText(p, 6000)).match(/Vihaan Kumar[\s\S]{0,260}/g)?.join(" ### "));
  await snap(p, `conc-list-${vals.at(-1)}`); }
process.exit(0);
