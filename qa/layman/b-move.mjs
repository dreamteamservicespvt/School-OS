// Layman B: can I move more cash to the bank than the cash box holds? (reverses it if it goes through)
//   node qa/layman/b-move.mjs [look|keep]
import { asRole, go, mainText, sleep, snap } from "../full/selftest-A-h.mjs";
const p = await asRole("accountant");
const dlg = () => p.getByRole("dialog").last();
const num = (s) => Number(String(s ?? "").replace(/[^\d.]/g, "") || NaN);
const books = async () => { await go(p, "/finance-management/cash-bank"); await sleep(1500); const t = await mainText(p, 2500); return { cash: (t.match(/Cash in hand\n([^\n]+)/) ?? [])[1], bank: (t.match(/Main bank account\n([^\n]+)/) ?? [])[1] }; };
const waitSave = async () => { for (let i = 0; i < 60 && /Saving/.test(await dlg().innerText().catch(() => "")); i++) await sleep(1000); await sleep(1000); };
const b0 = await books(); console.log("BOOKS NOW", JSON.stringify(b0));
if (process.argv[2] === "look") process.exit(0);
const over = num(b0.cash) + 1000;
console.log("trying", over);
await go(p, "/finance-management/cash-bank?do=move"); await sleep(2000);
await dlg().getByLabel(/Amount/).first().fill(String(over));
await dlg().getByLabel(/Reference/).fill("LB-over-test").catch(() => {});
await sleep(500);
await dlg().getByRole("button", { name: /^Move ₹/ }).click();
await waitSave();
const open = await dlg().isVisible().catch(() => false);
console.log("AFTER open:", open, open ? (await dlg().innerText()).replace(/\n+/g, " | ").slice(0, 700) : "");
await snap(p, "move-over-cash", false);
const b1 = await books(); console.log("BOOKS AFTER", JSON.stringify(b1));
if (!open && process.argv[2] !== "keep") {
  await go(p, "/finance-management/cash-bank?do=move"); await sleep(2000);
  await dlg().getByLabel("From").selectOption({ label: "Main bank account" }).catch(() => console.log("from select failed"));
  await dlg().getByLabel("To").selectOption({ label: "Cash in hand" }).catch(() => console.log("to select failed"));
  await dlg().getByLabel(/Amount/).first().fill(String(over));
  await dlg().getByLabel(/Reference/).fill("LB-undo over test").catch(() => {});
  await sleep(500); console.log("UNDO SHEET", (await dlg().innerText()).replace(/\n+/g, " | ").slice(0, 400));
  await dlg().getByRole("button", { name: /^Move ₹/ }).click(); await waitSave();
  console.log("UNDO open:", await dlg().isVisible().catch(() => false));
  console.log("BOOKS AFTER UNDO", JSON.stringify(await books()));
}
process.exit(0);
