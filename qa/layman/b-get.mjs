// Layman B: fetch a signed-in URL (PDF/Excel) to a file.  node qa/layman/b-get.mjs <role> <url> <file>
import { asRole } from "../full/selftest-A-h.mjs";
import { writeFileSync } from "node:fs";
const p = await asRole(process.argv[2]);
const r = await p.request.get(new URL(process.argv[3], "http://localhost:3000").href);
console.log(r.status(), r.headers()["content-type"], r.headers()["content-disposition"] ?? "");
writeFileSync(process.argv[4], await r.body());
process.exit(0);
