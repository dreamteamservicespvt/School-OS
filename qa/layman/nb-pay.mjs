// Night B: one payment at the desk.  node qa/layman/nb-pay.mjs <studentId> <mode CASH|UPI|CHEQUE> <amount> [ref] [dbl]
import { asRole, go, mainText, sleep, snap, log, flat, num } from "./nb-h.mjs";
const L = log("pay");
const [sid, mode, amount, ref] = process.argv.slice(2);
const dbl = process.argv.includes("dbl");
const p = await asRole("accountant");
const posts = []; p.on("response", (r) => { if (r.request().method() === "POST") posts.push(`${r.status()} ${new URL(r.url()).pathname}`); });
async function base() {
  await go(p, "/fee-management/dashboard"); const d = await mainText(p, 3000);
  await go(p, "/finance-management/day-book"); const b = await mainText(p, 3000);
  await go(p, "/finance-management/cash-bank"); const c = await mainText(p, 2000);
  return { today: (d.match(/Collected today\n([^\n]+)\n([^\n]+)/) ?? []).slice(1).join(" / "), inc: (b.match(/Total income\n([^\n]+)\n([^\n]+)/) ?? []).slice(1).join(" / "), cash: (c.match(/Cash in hand\n([^\n]+)/) ?? [])[1] };
}
L("BASE", await base());
await go(p, `/fee-management/collect/${sid}`); await p.getByText("How is it paid?").waitFor({ timeout: 60000 });
L("BEFORE", flat((await mainText(p, 600)).match(/Year[\s\S]*?Left this year\n[^\n]+/)?.[0]));
await p.locator("#pay-amt").fill(amount);
await p.getByRole("radio", { name: { CASH: "Cash", UPI: "UPI", CHEQUE: "Cheque", CARD: "Card", BANK_TRANSFER: "Bank transfer" }[mode] }).click(); await sleep(300);
if (mode === "UPI" || mode === "CARD" || mode === "BANK_TRANSFER") await p.locator("#pay-ref").fill(ref);
if (mode === "CHEQUE") { await p.locator("#chq-no").fill(ref); await p.locator("#chq-bank").fill("NB- SBI Kukatpally"); }
await p.getByText("Discount, waiver, date or note").click(); await sleep(400);
await p.locator("#pay-note").fill(`NB- night test ${mode} ${amount}`);
const btn = p.getByRole("button", { name: /^Collect ₹/ }).first();
L("BUTTON", await btn.innerText(), "| help:", (await p.locator("main").innerText()).split("\n").filter((l) => /Part payment|advance|wait/i.test(l)).join(" || "));
const t0 = Date.now();
if (dbl) await btn.dblclick(); else await btn.click();
const dlg = p.getByRole("dialog").last();
await dlg.waitFor({ timeout: 60000 }).catch(() => {});
await sleep(1500);
L("AFTER", Date.now() - t0, "ms", "| url", new URL(p.url()).pathname);
const sh = await dlg.innerText().catch(() => null); L("SHEET", flat(sh ?? "(no dialog) " + await mainText(p, 1500)).slice(0, 1500));
await snap(p, `pay-${mode}-${amount.replace(/[^\d.]/g, "")}`, false);
const links = await dlg.locator("a").evaluateAll((as) => as.map((a) => `${a.innerText.trim()} -> ${a.getAttribute("href")}`)).catch(() => []);
L("LINKS", links.join(" ; "));
L("POSTS", posts.join(" ; "));
await sleep(2000);
L("AFTERBASE", await base());
process.exit(0);
