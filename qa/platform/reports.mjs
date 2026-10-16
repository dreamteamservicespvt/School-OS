// Every report in the catalogue: the page renders and each export (CSV, Excel,
// PDF) downloads, as each login; reports outside the role's reach are refused.
//   node qa/platform/reports.mjs <login> [formats=csv,xlsx,pdf]
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { close, BASE, OUT } from "../lib.mjs";
import { as } from "./util.mjs";

const [login, formats = "csv,xlsx,pdf"] = process.argv.slice(2);
const reports = JSON.parse(readFileSync("qa/platform/report-keys.json", "utf8"));
const p = await as(login);
// Which reports the index lists for this person.
await p.goto(`${BASE}/reports-analytics`);
await p.waitForTimeout(800);
const listed = new Set(await p.$$eval("main a[href*='/reports-analytics/r/']", (as) => as.map((a) => a.getAttribute("href").split("/r/")[1].split("?")[0])));
const rows = [];
for (const r of reports) {
  const s = Date.now();
  const page = await p.context().request.get(`${BASE}/reports-analytics/r/${r.key}`, { maxRedirects: 0, timeout: 120000 });
  const html = page.status() === 200 ? await page.text() : "";
  const pageMs = Date.now() - s;
  const redirect = page.headers().location ?? (html.match(/id="__next-page-redirect"[^>]*content="[^"]*url=([^"]+)"/) ?? [])[1] ?? "";
  const body = html.replace(/<script[\s\S]*?<\/script>/g, "");
  const denied = /no-access/.test(redirect) || /not open to your role|This page is not here/.test(body);
  const crashed = page.status() >= 500 || /Something went wrong|Application error/.test(body);
  const files = {};
  for (const f of formats.split(",")) {
    const t0 = Date.now();
    const res = await p.context().request.get(`${BASE}/reports-analytics/r/${r.key}/export?format=${f}`, { maxRedirects: 0, timeout: 120000 });
    const ct = res.headers()["content-type"] ?? "";
    const buf = await res.body();
    files[f] = `${res.status()} ${ct.split(";")[0].replace("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx")} ${buf.length}B ${Date.now() - t0}ms${res.status() !== 200 ? ` "${buf.toString().slice(0, 80)}"` : ""}`;
  }
  rows.push({ key: r.key, name: r.name, category: r.category, listed: listed.has(r.key), page: `${page.status()} ${pageMs}ms${redirect ? ` -> ${redirect}` : ""}`, denied, crashed, files });
  const fileBad = Object.values(files).some((x) => /^5/.test(x));
  const mismatch = listed.has(r.key) === denied; // listed but refused, or not listed but opens
  if (crashed || fileBad || mismatch || pageMs > 1500) console.log(`${crashed || fileBad ? "ERROR" : mismatch ? "MISMATCH" : "SLOW"} ${r.key} (${r.name}) listed=${listed.has(r.key)} denied=${denied} page=${rows.at(-1).page} ${JSON.stringify(files)}`);
}
writeFileSync(path.join(OUT, `reports-${login}.json`), JSON.stringify(rows, null, 1));
const opened = rows.filter((r) => !r.denied);
console.log(`${login}: ${reports.length} reports; index lists ${listed.size}; page opens ${opened.length}; refused ${rows.length - opened.length}; exports ok ${opened.filter((r) => Object.values(r.files).every((x) => /^200/.test(x))).length}/${opened.length}; crashes ${rows.filter((r) => r.crashed).length}`);
await close();
