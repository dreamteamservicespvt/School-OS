// Layman D: open every screen in Staff/HR, Front Office, Events, Transport, Hostel as one role at 1440 and 390.
//   QA_OUT=D:/all/Projects/School-OS/qa-output/layman-d node qa/layman/d-crawl.mjs [role]
import { asRole, go, mainText, sleep, close, snap, OUTA } from "./d-h.mjs";
import { writeFileSync } from "node:fs";
import path from "node:path";
const role = process.argv[2] ?? "admin";
const p = await asRole(role);
const errs = [];
p.on("pageerror", (e) => errs.push(`${p.url()} :: ${e.message.slice(0, 200)}`));
p.on("console", (m) => { if (m.type() === "error") errs.push(`${p.url()} :: console ${m.text().slice(0, 200)}`); });
const base = [
  "/staff-hr-management", "/staff-hr-management/add", "/staff-hr-management/documents", "/staff-hr-management/leave",
  "/staff-hr-management/exit", "/staff-hr-management/exit/new", "/staff-hr-management/import", "/staff-hr-management/recruitment", "/staff-hr-management/settings",
  "/front-office", "/front-office/visitors", "/front-office/enquiries", "/front-office/appointments", "/front-office/pickup", "/front-office/postal",
  "/events-calendar", "/events-calendar/events", "/events-calendar/daily", "/events-calendar/ptm", "/events-calendar/cocurricular", "/events-calendar/gallery", "/events-calendar/import", "/events-calendar/settings",
  "/transport-management", "/transport-management/routes", "/transport-management/students", "/transport-management/trips", "/transport-management/vehicles", "/transport-management/reports", "/transport-management/settings",
  "/hostel-management", "/hostel-management/rooms", "/hostel-management/allocation", "/hostel-management/mess", "/hostel-management/outings", "/hostel-management/reports", "/hostel-management/settings", "/hostel-management/rooms/import",
];
const rows = [];
const seen = new Set();
const queue = [...base];
let dump = "";
async function check(url, vp) {
  const t0 = Date.now();
  const res = await go(p, url).catch((e) => ({ status: () => "ERR " + e.message.slice(0, 80) }));
  const ms = Date.now() - t0;
  await sleep(600);
  const t = await mainText(p, 20000);
  const h1 = (await p.locator("h1").first().innerText().catch(() => "")).trim();
  const bad = [...new Set((t.match(/\b(undefined|null|NaN|Invalid Date|\[object Object\])\b/g) ?? []))];
  const iso = [...new Set((t.match(/\b20\d\d-\d\d-\d\d\b|\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2},? 20\d\d\b|\b\d{1,2}\/\d{1,2}\/20\d\d\b/g) ?? []))].slice(0, 4);
  const broken = /Something went wrong|Application error|Internal Server Error|could not be found|Unhandled Runtime/i.test(t);
  const loading = /Loading…|Loading\.\.\./.test(t);
  const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  const final = new URL(p.url()).pathname + new URL(p.url()).search;
  const name = (vp + url).replace(/[^a-z0-9]+/gi, "_").slice(0, 90);
  if (vp === "1440" || over > 2 || broken || bad.length) await snap(p, `crawl-${role}-${name}`);
  rows.push({ url, vp, status: res?.status?.(), final, ms, h1, bad, iso, broken, loading, over });
  if (vp === "1440") dump += `\n\n===== ${url} -> ${final} (${ms} ms) h1=${h1}\n${t.slice(0, 5000)}`;
  console.log(vp, url, "->", final, res?.status?.(), ms + "ms", h1, bad.join(","), iso.join(","), broken ? "BROKEN" : "", loading ? "LOADING" : "", over > 2 ? `OVERFLOW ${over}` : "");
  if (vp === "1440") {
    const links = await p.evaluate(() => [...document.querySelectorAll("main a[href]")].map((a) => a.getAttribute("href")));
    for (const l of links) {
      if (!l || !l.startsWith("/")) continue;
      const m = l.match(/^\/(staff-hr-management\/[a-z0-9]{20,}|events-calendar\/(events|gallery)\/[a-z0-9]{10,}|transport-management\/routes\/[a-z0-9]{10,}|front-office\/visit\/[a-z0-9]{10,})/i);
      if (m) { const k = m[0].replace(/[a-z0-9]{10,}$/i, "*"); if (!seen.has(k)) { seen.add(k); queue.push(l); } }
    }
  }
}
for (let i = 0; i < queue.length; i++) await check(queue[i], "1440");
await p.setViewportSize({ width: 390, height: 844 });
for (const u of queue) await check(u, "390");
writeFileSync(path.join(OUTA, `crawl-${role}.json`), JSON.stringify({ rows, errs }, null, 2));
writeFileSync(path.join(OUTA, `crawl-${role}-text.txt`), dump);
console.log("\nERRORS:\n" + [...new Set(errs)].join("\n"));
await close();
