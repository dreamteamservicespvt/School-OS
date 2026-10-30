// Journey E3: part payment in cash at the counter, mistakes first, then the receipt PDF.
//   node qa/full/j3-fee.mjs <studentId> <amount>
import { writeFileSync } from "node:fs";
import path from "node:path";
import { as } from "./look.mjs";
import { go, mainText, shot, close, OUT } from "./h.mjs";
const [SID, AMT] = process.argv.slice(2);
const rec = (c, pass, note = "") => console.log(`${pass ? "PASS" : "FAIL"} ${c}${note ? " :: " + note : ""}`);
const p = await as("accountant");
const url = `/fee-management/collect/${SID}`;
const amount = p.locator("#pay-amt");
const collect = () => p.getByRole("button", { name: /^Collect ₹/ });
async function tryAmount(v) {
  await go(p, url);
  await amount.fill(""); await amount.pressSequentially(v, { delay: 5 });
  await p.getByRole("radio", { name: "Cash", exact: true }).click();
  const label = await collect().innerText().catch(() => "(no collect button)");
  const disabled = await collect().isDisabled().catch(() => true);
  if (!disabled) { await collect().click(); await p.waitForTimeout(2500); }
  return { label, disabled, text: (await mainText(p, 3000)).match(/[^\n]*(more than|cannot|can't|too|must|enter|zero|left)[^\n]*/gi)?.slice(0, 3).join(" / ") };
}
const big = await tryAmount("99999999");
rec("Amount above what is due is refused or capped", big.disabled || /more|cannot|can't/i.test(big.text ?? ""), JSON.stringify(big));
const zero = await tryAmount("0");
rec("Zero amount refused", zero.disabled || /zero|enter|more than/i.test(zero.text ?? ""), JSON.stringify(zero));
await go(p, url);
await amount.fill(""); await amount.pressSequentially(AMT, { delay: 5 });
await p.getByRole("radio", { name: "Cash", exact: true }).click();
console.log("BUTTON", await collect().innerText());
await collect().click(); await collect().click({ timeout: 800 }).catch(() => {});
await p.waitForTimeout(1500);
const d = p.getByRole("dialog").last();
if (await d.count()) { console.log("DIALOG", (await d.innerText()).replace(/\n+/g, " | ").slice(0, 600)); const b = d.getByRole("button", { name: /Collect|Confirm|Yes/ }).last(); await b.click(); await b.click({ timeout: 800 }).catch(() => {}); }
await p.waitForTimeout(5000);
const after = (await mainText(p, 1500)).replace(/\n+/g, " | ");
console.log("AFTER", after.slice(0, 900));
const links = await p.locator("main a[href]").evaluateAll((as) => as.map((a) => a.getAttribute("href")).filter((h) => /receipt/i.test(h)));
console.log("RECEIPT LINKS", links);
if (links[0]) {
  const r = await p.request.get(new URL(links[0], p.url()).toString());
  const body = await r.body();
  const ct = r.headers()["content-type"];
  if (/pdf/.test(ct)) writeFileSync(path.join(OUT, "j3-receipt.pdf"), body);
  rec("Receipt opens", r.status() === 200, `${r.status()} ${ct} ${body.length} bytes`);
}
await shot(p, "j3-after", false);
if (p.problems.length) console.log("PROBLEMS", p.problems);
await close();
