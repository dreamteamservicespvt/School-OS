// Fetches an address as someone and saves it if it is a PDF.  node qa/full/getpdf.mjs <login> <path> <outName>
import { writeFileSync } from "node:fs";
import { as } from "./look.mjs";
import { close } from "./h.mjs";
const [login, url, out] = process.argv.slice(2);
const p = await as(login);
const r = await p.request.get(`http://localhost:3000${url}`, { timeout: 180000 });
const b = await r.body();
console.log(login, url, r.status(), r.headers()["content-type"], b.length);
if (/pdf/.test(r.headers()["content-type"] ?? "")) writeFileSync(`qa-output/full/${out}`, b); else console.log(b.toString().slice(0, 300));
await close();
