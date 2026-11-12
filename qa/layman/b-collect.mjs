// Layman B: collect a small fee at the desk like an office worker; wrong values first; then cross-check everywhere.
//   QA_OUT=D:/all/Projects/School-OS/qa-output/layman-b node qa/layman/b-collect.mjs "<student search>"
import { asRole, go, mainText, sleep, snap } from "../full/selftest-A-h.mjs";
import { writeFileSync, appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
const OUT = process.env.QA_OUT; const DL = path.join(OUT, "dl"); mkdirSync(DL, { recursive: true });
const LOG = path.join(OUT, "collect.log");
const log = (...a) => { const s = a.join(" "); console.log(s); appendFileSync(LOG, s + "\n"); };
const q = process.argv[2] ?? "Sravya";
const AMT = process.argv[3] ?? "101";
const p = await asRole("accountant");
const errs = []; p.on("pageerror", (e) => errs.push(`${p.url()} ${e.message}`));
const num = (s) => Number(String(s ?? "").replace(/[^\d.]/g, "") || NaN);
async function baseline() {
  await go(p, "/fee-management/dashboard"); await sleep(1500);
  const d = await mainText(p, 3000);
  const today = num((d.match(/Collected today\n(₹[\d,.]+)/) ?? [])[1]); const pays = num((d.match(/\n(\d+) payments?/) ?? [])[1]);
  await go(p, "/finance-management/day-book"); await sleep(1500);
  const b = await mainText(p, 3000);
  const inc = num((b.match(/Total income\n(₹[\d,]+)/) ?? [])[1]);
  await go(p, "/finance-management/cash-bank"); await sleep(1500);
  const c = await mainText(p, 2000);
  const cash = num((c.match(/Cash in hand\n(₹[\d,]+)/) ?? [])[1]);
  return { today, pays, inc, cash };
}
const b0 = await baseline(); log("BASE", JSON.stringify(b0));
// find the student by typing
await go(p, "/fee-management"); await sleep(1500);
const box = p.getByRole("combobox").or(p.getByRole("searchbox")).or(p.getByPlaceholder(/student|name|search/i)).first();
await box.click(); await box.pressSequentially(q, { delay: 60 }); await sleep(2500);
await snap(p, "collect-search");
await p.keyboard.press("Enter"); await sleep(2000); log("ENTER on search ->", new URL(p.url()).pathname);
if (!/collect\//.test(p.url())) await p.locator("main").getByText(process.argv[4] ?? q, { exact: true }).first().click();
await p.waitForURL(/collect\//, { timeout: 30000 }).catch(() => {});
await sleep(2000);
log("URL", p.url());
const sid = p.url().split("/collect/")[1]?.split(/[?#]/)[0];
await p.getByText("How is it paid?").waitFor({ timeout: 60000 });
await snap(p, "collect-page");
const t0 = await mainText(p, 5000); log("PAGE", t0.slice(0, 1500).replace(/\n/g, " | "));
const amt = p.locator("#pay-amt");
const btn = p.getByRole("button", { name: /^(Collect ₹|Enter the amount|Saving)/ });
const errOf = async () => (await p.locator("main").innerText()).split("\n").filter((l) => /Enter|Type the amount|More than|look like|bank|amount/i.test(l)).slice(0, 4).join(" || ");
for (const v of ["", "0", "-100", "100.555", "abc", "12,34,56,78,901", "99999999999"]) {
  await amt.fill(v); await sleep(300);
  const label = await btn.innerText().catch(() => "?");
  await btn.click().catch(() => {}); await sleep(1200);
  log(`AMT "${v}" button="${label}" ->`, await errOf(), "| url", new URL(p.url()).pathname);
}
await snap(p, "collect-bad-amount");
// more than due
const due = num((t0.match(/Collect (₹[\d,.]+)/) ?? [])[1]);
log("DUE BUTTON", due);
await amt.fill(String(due + 50000)); await sleep(500);
await btn.click(); await sleep(1500);
log("OVER DUE ->", await errOf(), "|", (await mainText(p, 4000)).match(/[^\n]*(advance|more than)[^\n]*/i)?.[0]);
// UPI without and wrong UTR
await amt.fill(AMT);
await p.getByRole("radio", { name: "UPI" }).click(); await sleep(300);
await btn.click(); await sleep(1000); log("UPI empty ->", await errOf());
await p.locator("#pay-ref").fill("123"); await btn.click(); await sleep(1000); log("UPI 123 ->", await errOf());
await p.getByRole("radio", { name: "Cheque" }).click(); await sleep(300); await btn.click(); await sleep(1000); log("CHEQUE empty ->", await errOf());
await snap(p, "collect-cheque-empty");
await p.getByRole("radio", { name: "Cash" }).click(); await sleep(300);
// note with LB-
const more = p.getByText("Discount, waiver, date or note"); if (await more.count()) { await more.click(); await sleep(300); await p.locator("#pay-note").fill("LB- layman test " + "x".repeat(320)); }
const nv = await p.locator("#pay-note").inputValue().catch(() => ""); log("NOTE length kept", nv.length);
await amt.fill(AMT); await sleep(400);
log("BUTTON", await btn.innerText());
await btn.dblclick();
let sheet = "";
for (let i = 0; i < 60; i++) { const d = p.getByRole("dialog"); if (await d.count()) { sheet = (await d.last().innerText()).replace(/\n+/g, " | "); break; } await sleep(500); }
log("RECEIPT SHEET", sheet.slice(0, 1500));
await snap(p, "collect-receipt-sheet", false);
const rno = (sheet.match(/[A-Z]{2,}\/\d{4}-\d{2}\/\d+/) ?? [])[0]; log("RECEIPT NO", rno);
const links = await p.evaluate(() => [...document.querySelectorAll("[role=dialog] a, [role=dialog] button")].map((a) => `${a.innerText.trim()} => ${a.getAttribute("href") ?? ""}`));
log("SHEET LINKS", links.join(" ; "));
const pdfHref = await p.evaluate(() => [...document.querySelectorAll("[role=dialog] a[href]")].map((a) => a.getAttribute("href")).find((h) => /pdf|receipt/i.test(h)));
if (pdfHref) { const r = await p.request.get(new URL(pdfHref, p.url()).href); log("RECEIPT PDF", r.status(), r.headers()["content-type"]); if (r.ok()) writeFileSync(path.join(DL, "receipt.pdf"), await r.body()); }
writeFileSync(path.join(OUT, "collect-state.json"), JSON.stringify({ sid, rno, AMT, b0 }));
// reload: no second payment
await p.reload(); await sleep(3000);
await snap(p, "collect-after-reload");
// ledger
await go(p, `/fee-management/ledger/${sid}`); await sleep(2000);
const lt = await mainText(p, 12000); await snap(p, "collect-ledger");
log("LEDGER has receipt", rno && lt.includes(rno), "| count of receipt", rno ? lt.split(rno).length - 1 : "-");
log("LEDGER", lt.slice(0, 2500).replace(/\n/g, " | "));
const b1 = await baseline(); log("AFTER", JSON.stringify(b1));
log("DIFF today", b1.today - b0.today, "pays", b1.pays - b0.pays, "daybook", b1.inc - b0.inc, "cash", b1.cash - b0.cash, "(expected", AMT, ", others may collect too)");
await go(p, "/finance-management/day-book"); await sleep(1500);
const dbt = await mainText(p, 30000); log("DAYBOOK has receipt", rno && dbt.includes(rno));
log("ERRS", errs.join(" ; "));
process.exit(0);
