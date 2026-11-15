// Checks docs/qa/layman-loop-progress.html before every republish: the script parses, the page shows
// its "Now doing" line and rows, and no page error. (15 Nov: a row text with "{school}" broke the data
// and the owner saw an empty page.)   node qa/loop/check-progress.mjs
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(process.env.APPDATA, "npm", "node_modules", "playwright"));
const b = await chromium.launch();
const p = await b.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
await p.goto("file:///" + path.resolve("docs/qa/layman-loop-progress.html").split(path.sep).join("/"));
await p.waitForTimeout(400);
const now = (await p.textContent("#now")) ?? "";
const rows = await p.locator(".row").count();
await b.close();
if (errs.length || !now.trim() || rows === 0) { console.error("PROGRESS PAGE BROKEN", { errs, now, rows }); process.exit(1); }
console.log(`progress page ok: ${rows} rows`);
