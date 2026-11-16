// Night B: download receipts (screen html, office PDF, parent PDF).  node nb-dl.mjs <paymentId>...
import { asRole, log, OUT } from "./nb-h.mjs";
import { writeFileSync, mkdirSync } from "node:fs";
const L = log("dl"); mkdirSync(`${OUT}/dl`, { recursive: true });
const p = await asRole("accountant");
for (const id of process.argv.slice(2)) for (const q of ["", "?download=1", "?copy=parent&download=1"]) {
  const t0 = Date.now(); const r = await p.request.get(`http://localhost:3000/fee-management/payments/${id}/receipt${q}`);
  const buf = await r.body(); const f = `${OUT}/dl/receipt-${id.slice(0, 6)}${q ? "-" + q.replace(/[^a-z]/g, "") : ""}.${(r.headers()["content-type"] ?? "").includes("pdf") ? "pdf" : "html"}`;
  writeFileSync(f, buf); L("RECEIPT", id.slice(0, 6), q, r.status(), r.headers()["content-type"], buf.length, Date.now() - t0, "ms", f);
}
process.exit(0);
