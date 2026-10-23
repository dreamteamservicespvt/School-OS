// The cancelled receipt PDF.
import { as, BASE, note } from "./h.mjs";
import { close } from "../../lib.mjs";
import { writeFileSync } from "node:fs";
const page = await as("accountant");
const r = await page.request.get(`${BASE}/fee-management/payments/d93ed9d5-2d16-4c35-823e-84da234417e9/receipt?download=1`);
note(r.status(), r.headers()["content-type"]);
writeFileSync(`${process.env.QA_OUT}/receipt-cancelled-00346.pdf`, await r.body());
await close();
