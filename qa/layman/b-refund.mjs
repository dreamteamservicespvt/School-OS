// Layman B: New refund for Sravya Joshi with more than she paid, negative and decimals (check only; withdraws anything sent).
import { asRole, go, mainText, sleep, snap } from "../full/selftest-A-h.mjs";
const p = await asRole("accountant");
const dlg = () => p.getByRole("dialog").last();
const v = process.argv[2];
await go(p, "/fee-management/concessions"); await sleep(1500);
await p.getByRole("button", { name: "New refund" }).or(p.getByRole("link", { name: "New refund" })).first().click({ timeout: 90000 }); await sleep(2500);
const search = dlg().getByPlaceholder(/Name, admission/);
if (await search.count()) { await search.pressSequentially("Sravya Joshi", { delay: 40 }); await sleep(3000); await dlg().getByText("Sravya Joshi").first().click(); await sleep(2500); }
console.log("SHEET", (await dlg().innerText()).replace(/\n+/g, " | ").slice(0, 1500));
await snap(p, "refund-sheet", false);
if (v) {
  const amt = dlg().locator("#money-value, input[name=amount]").first(); await amt.fill(v);
  await dlg().locator("textarea").first().fill("LB- layman refund check").catch(() => {});
  await dlg().getByRole("button", { name: /Send|Ask|Request|Save|Refund/ }).last().click(); 
  for (let i = 0; i < 40 && /…/.test(await dlg().innerText().catch(() => "")); i++) await sleep(1000); await sleep(1500);
  console.log("AFTER", v, "open:", await dlg().isVisible().catch(() => false), "|", (await dlg().innerText().catch(() => "")).split(/\n/).filter((l) => /must|more than|cannot|least|only|needed|Type the|Enter|Choose|paid/i.test(l) && l.length < 200).join(" || "));
  await snap(p, `refund-${v}`, false);
}
process.exit(0);
