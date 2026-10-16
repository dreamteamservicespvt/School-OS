// JavaScript a browser downloads for each page (bytes on the wire), and the time to the page being usable.
//   node qa/platform/js-weight.mjs <login> <url...>
import { close, BASE } from "../lib.mjs";
import { as } from "./util.mjs";
const [login, ...urls] = process.argv.slice(2);
const p = await as(login);
for (const url of urls) {
  const seen = new Map();
  const on = async (r) => { if (r.request().resourceType() === "script") { const len = Number(r.headers()["content-length"] ?? 0) || (await r.body().catch(() => Buffer.alloc(0))).length; seen.set(r.url(), len); } };
  p.on("response", on);
  const s = Date.now();
  await p.goto(BASE + url, { waitUntil: "load" });
  const loadMs = Date.now() - s;
  await p.waitForTimeout(500);
  p.off("response", on);
  const total = [...seen.values()].reduce((a, b) => a + b, 0);
  const nav = await p.evaluate(() => { const n = performance.getEntriesByType("navigation")[0]; return n ? { ttfb: Math.round(n.responseStart), dcl: Math.round(n.domContentLoadedEventEnd) } : {}; });
  console.log(`${url}: ${seen.size} scripts, ${Math.round(total / 1024)}KB (as sent); first byte ${nav.ttfb}ms, DOM ready ${nav.dcl}ms, load ${loadMs}ms`);
}
await close();
