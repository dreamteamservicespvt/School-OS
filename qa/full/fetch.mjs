// Fetches an address as someone (their session), prints status, type and size; saves PDFs.
//   MSYS_NO_PATHCONV=1 node qa/full/fetch.mjs <login> <path> [outName]
import { as } from "./look.mjs";
import { BASE, OUT, close } from "./h.mjs";
import { writeFileSync } from "node:fs";
import path from "node:path";
const [login, url, name] = process.argv.slice(2);
const p = await as(login);
const r = await p.request.get(`${BASE}${url}`);
const body = await r.body();
console.log(r.status(), r.headers()["content-type"], body.length, "bytes", body.subarray(0, 5).toString());
if (name) { writeFileSync(path.join(OUT, name), body); console.log("saved", path.join(OUT, name)); }
await close();
