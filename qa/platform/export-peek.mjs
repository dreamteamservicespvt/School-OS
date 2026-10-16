// node qa/platform/export-peek.mjs <login> <report-key> [format=csv] [query] — prints the export's first lines.
import { close, BASE } from "../lib.mjs";
import { as } from "./util.mjs";
const [login, key, format = "csv", q = ""] = process.argv.slice(2);
const p = await as(login);
const res = await p.context().request.get(`${BASE}/reports-analytics/r/${key}/export?format=${format}${q ? "&" + q : ""}`);
console.log(res.status(), res.headers()["content-type"], res.headers()["content-disposition"]);
const b = await res.body();
console.log(format === "csv" || res.status() !== 200 ? b.toString().split("\n").slice(0, 14).join("\n") : `${b.length} bytes, starts ${JSON.stringify(b.subarray(0, 8).toString("latin1"))}`);
await close();
