import { writeFileSync } from "node:fs";
import { as } from "./look.mjs";
import { close } from "./h.mjs";
const p = await as(process.argv[2]);
for (const id of process.argv.slice(3)) {
  const r = await p.request.get(`http://localhost:3000/fee-management/payments/${id}/receipt`);
  const b = await r.body();
  console.log(id, r.status(), r.headers()["content-type"], b.length);
  if (/pdf/.test(r.headers()["content-type"] ?? "")) writeFileSync(`qa-output/full/receipt-${id.slice(0, 8)}.pdf`, b);
}
await close();
