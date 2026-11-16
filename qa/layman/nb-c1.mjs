// Night B: open Collect Fee for a student by typing the name; try layman amount formats (no save).
import { asRole, go, mainText, sleep, snap, log, flat } from "./nb-h.mjs";
const L = log("c1");
const q = process.argv[2] ?? "Vihaan Kumar";
const p = await asRole("accountant");
await go(p, "/fee-management"); await sleep(1000);
const box = p.getByPlaceholder(/student|name|search/i).first();
await box.click(); await box.pressSequentially(q, { delay: 50 }); await sleep(2500);
L("SEARCH", flat((await mainText(p, 2500))).slice(0, 600));
await p.locator("main").getByText(q, { exact: true }).first().click();
await p.waitForURL(/collect\//, { timeout: 30000 }).catch(() => {});
await p.getByText("How is it paid?").waitFor({ timeout: 60000 });
L("URL", p.url());
const t0 = await mainText(p, 5000); L("PAGE", flat(t0).slice(0, 2500));
await snap(p, "c1-collect-page");
const amt = p.locator("#pay-amt");
const btn = p.getByRole("button", { name: /^(Collect ₹|Enter the amount|Saving|Collect)/ }).first();
for (const v of ["₹1,000", "1,000", "Rs.1000", "1000/-", "1 000", "1000.5", "0.001", "₹ 500.75"]) {
  await amt.fill(v); await sleep(400);
  const help = (await p.locator("main").innerText()).split("\n").filter((l) => /Type the amount|Enter an amount|Part payment|More than|advance|stays due/i.test(l)).slice(0, 3).join(" || ");
  L(`AMT "${v}" button="${await btn.innerText().catch(() => "?")}" help: ${help}`);
}
process.exit(0);
