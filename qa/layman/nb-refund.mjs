// Night B: New refund for Vihaan Kumar's UPI payment; wrong values first, then ₹200.
import { asRole, go, mainText, sleep, snap, log, flat } from "./nb-h.mjs";
const L = log("refund");
const p = await asRole("accountant");
const dlg = () => p.getByRole("dialog").last();
await go(p, "/fee-management/concessions"); await sleep(1000);
await p.getByRole("button", { name: "New refund" }).or(p.getByRole("link", { name: "New refund" })).first().click(); await sleep(2500);
L("SHEET", flat(await dlg().innerText()).slice(0, 600));
await dlg().getByPlaceholder("Name, admission no. or phone").pressSequentially("Vihaan Kumar", { delay: 40 }); await sleep(3000);
await dlg().getByText("Vihaan Kumar").first().click(); await sleep(2500);
L("FORM", flat(await dlg().innerText()).slice(0, 1500));
const opts = await dlg().locator("select[name=paymentId] option").allInnerTexts(); L("PAYMENTS", opts.join(" ; "));
const o = opts.find((x) => /00354/.test(x)); if (o) { await dlg().locator("select[name=paymentId]").selectOption({ label: o }); await sleep(800); }
L("AMOUNT HELP", flat(await dlg().innerText()).match(/Not more than[^|]*/)?.[0]);
const amt = dlg().locator("input[name=amount]");
await dlg().locator("textarea[name=reason]").fill("NB- night test refund, paid twice");
const save = dlg().getByRole("button", { name: /Send|Request|Refund|Save/ }).last();
L("BTN", await save.innerText());
for (const v of ["600", "-5", "0", "abc", "200.555"]) {
  await amt.fill(v); await sleep(300); await save.click(); await sleep(2500);
  L(`AMT "${v}" open=${await dlg().isVisible()} ->`, (await dlg().innerText().catch(() => "")).split("\n").filter((l) => /more than|Enter|must|least|paise|rupees|Type|amount/i.test(l) && l.length < 160).join(" || "));
  if (!(await dlg().isVisible().catch(() => false))) { L("!! SAVED with", v); break; }
}
await snap(p, "refund-bad", false);
if (await dlg().isVisible().catch(() => false)) {
  await amt.fill("200"); await save.dblclick();
  for (let i = 0; i < 40 && await dlg().isVisible().catch(() => false); i++) await sleep(1000);
  L("AFTER 200 open=", await dlg().isVisible().catch(() => false), flat(await mainText(p, 2500)).match(/Waiting for approval[^|]*\|[^|]*\|[^|]*/)?.[0]);
}
await go(p, "/fee-management/concessions?tab=refunds"); await sleep(1000);
L("LIST", flat(await mainText(p, 6000)).match(/Vihaan[\s\S]{0,300}/g)?.join(" ### "));
await snap(p, "refund-list");
process.exit(0);
