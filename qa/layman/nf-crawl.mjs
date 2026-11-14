// Self-test 14 Nov: open every fixed page as one role and list crashes, page errors and broken words.
//   QA_SERVER_LOG=tools/app.log node qa/layman/nf-crawl.mjs <role> <routes.json>
import { readFileSync, writeFileSync } from "node:fs";
import { asRole, close, sleep, mainText, OUTA } from "./nc-h.mjs";
const role = process.argv[2];
const routes = JSON.parse(readFileSync(process.argv[3], "utf8"));
const p = await asRole(role);
let errs = [];
p.on("pageerror", (e) => errs.push("PAGEERROR " + e.message.split("\n")[0].slice(0, 160)));
p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|favicon|net::ERR_ABORTED/.test(m.text())) errs.push("CONSOLE " + m.text().slice(0, 160)); });
const out = [];
for (const r of routes) {
  errs = [];
  let status = 0;
  try { const res = await p.goto(new URL(r, p.url()).href, { timeout: 60000 }); status = res?.status() ?? 0; await p.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {}); } catch (e) { status = -1; }
  await sleep(400);
  const to = new URL(p.url()).pathname;
  const t = await mainText(p, 8000).catch(() => "");
  const bad = [];
  if (/Something went wrong|Application error|Internal Server Error/i.test(t)) bad.push("CRASH");
  const w = t.match(/.{0,40}(\bundefined\b|\bNaN\b|Invalid Date|\[object Object\]).{0,40}/);
  if (w) bad.push("WORD: " + w[0].replace(/\n/g, " "));
  if (status >= 500 || status < 0) bad.push("HTTP " + status);
  bad.push(...errs.slice(0, 3));
  if (bad.length) out.push({ r, to, bad });
}
const file = `${OUTA}/crawl-${role}.json`;
writeFileSync(file, JSON.stringify(out, null, 1));
console.log(`${role}: ${routes.length} pages, ${out.length} with problems`);
for (const o of out) console.log(` ${o.r}${o.to !== o.r ? " -> " + o.to : ""}: ${o.bad.join(" | ")}`);
await p.context().close();
await close();
