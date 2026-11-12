// Layman B: open the receipt from the ledger, get its PDF; UPI wrong number message; day book 31-10-2026.
import { asRole, go, mainText, sleep, snap } from "../full/selftest-A-h.mjs";
import { writeFileSync } from "node:fs";
const OUT = process.env.QA_OUT;
const p = await asRole("accountant");
const sid = "c8d371f4-01ae-48e6-ba03-cff70d0a1b5a", rno = "SPS/2026-27/00352";
await go(p, `/fee-management/ledger/${sid}`); await sleep(1500);
await p.getByRole("link", { name: `Open ${rno}` }).first().click(); await sleep(3000);
console.log("AFTER CLICK RECEIPT", p.url());
const t = (await p.getByRole("dialog").last().innerText().catch(() => "")) || await mainText(p, 4000); console.log(t.slice(0, 1500).replace(/\n/g, " | "));
await snap(p, "receipt-open");
const hrefs = await p.evaluate(() => [...document.querySelectorAll("a[href]")].map((a) => `${a.innerText.trim().slice(0, 30)} => ${a.getAttribute("href")}`).filter((s) => /pdf|receipt|print/i.test(s)));
console.log("LINKS", hrefs.join("\n"));
const pdf = await p.evaluate(() => [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")).find((h) => /pdf/i.test(h)));
if (pdf) { const r = await p.request.get(new URL(pdf, p.url()).href); console.log("PDF", r.status(), r.headers()["content-type"]); if (r.ok()) writeFileSync(`${OUT}/dl/receipt-352.pdf`, await r.body()); }
// UPI with a short number
await go(p, `/fee-management/collect/${sid}`); await p.getByText("How is it paid?").waitFor({ timeout: 60000 });
await p.locator("#pay-amt").fill("5"); await p.getByRole("radio", { name: "UPI" }).click(); await p.locator("#pay-ref").fill("123");
const b = p.getByRole("button", { name: /^(Collect ₹|Enter the amount)/ }); console.log("UPI btn", await b.innerText(), await b.isEnabled());
await b.click(); await sleep(2500);
console.log("UPI 123 msg:", await p.evaluate(() => [...document.querySelectorAll("main [id$='-error']")].map((e) => `${e.id}: ${e.innerText}`).join(" | ")), "| dialog:", await p.getByRole("dialog").count());
await snap(p, "collect-upi-123", false);
// Day Book 31-10-2026
await go(p, "/finance-management/day-book?period=custom&from=2026-10-31&to=2026-10-31"); await sleep(2000);
const d = await mainText(p, 20000); console.log("DAYBOOK 31-10", d.slice(d.indexOf("Total income"), d.indexOf("Total income") + 4000));
await snap(p, "daybook-31-10");
process.exit(0);
