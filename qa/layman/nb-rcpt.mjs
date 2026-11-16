// Night B: ledger, receipt page, receipt PDF; look for Cancel and Refund like a clerk would.
import { asRole, go, mainText, sleep, snap, log, flat, OUT } from "./nb-h.mjs";
import { writeFileSync, mkdirSync } from "node:fs";
const L = log("rcpt");
const [sid, ...pids] = process.argv.slice(2);
const p = await asRole("accountant");
mkdirSync(`${OUT}/dl`, { recursive: true });
if (sid !== "skip") { await go(p, `/fee-management/ledger/${sid}`); await sleep(1500); }
const lt = await mainText(p, 9000); L("LEDGER", flat(lt).slice(0, 4000));
await snap(p, "ledger-vihaan");
const btns = await p.locator("main").locator("a,button").evaluateAll((es) => es.map((e) => e.innerText.trim()).filter(Boolean));
L("LEDGER BUTTONS", btns.join(" ; ").slice(0, 1500));
for (const id of pids) {
  await go(p, `/fee-management/payments/${id}`); await sleep(1500);
  L("PAYMENT", id, new URL(p.url()).pathname, flat(await mainText(p, 3000)).slice(0, 1500));
  const b2 = await p.locator("main, [role=dialog]").locator("a,button").evaluateAll((es) => es.map((e) => e.innerText.trim()).filter(Boolean));
  L("PAYMENT BUTTONS", b2.join(" ; "));
  await snap(p, `payment-${id.slice(0, 6)}`);
  for (const q of ["", "?download=1", "?copy=parent&download=1"]) {
    const r = await p.request.get(`http://localhost:3000/fee-management/payments/${id}/receipt${q}`);
    const buf = await r.body(); const f = `${OUT}/dl/receipt-${id.slice(0, 6)}${q ? "-" + q.replace(/[^a-z]/g, "") : ""}.${(r.headers()["content-type"] ?? "").includes("pdf") ? "pdf" : "html"}`;
    writeFileSync(f, buf); L("RECEIPT", q, r.status(), r.headers()["content-type"], buf.length, f);
  }
}
process.exit(0);
