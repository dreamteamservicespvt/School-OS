// Role matrix: for each login, signs in through the real screen, records the
// menu, then opens every page of the school app by direct URL and compares
// what happened with the role's permissions (qa/platform/cems-perms.json,
// copied from the database roles, which come from docs/blueprint/05-roles.md).
//
//   QA_OUT=/home/claude/qa-out/platform node qa/platform/role-matrix.mjs [login ...]
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { BASE, OUT, close } from "../lib.mjs";
import { as } from "./util.mjs";

const perms = JSON.parse(readFileSync("qa/platform/cems-perms.json", "utf8"));
const pages = readFileSync("qa/platform/pages.txt", "utf8").trim().split("\n");
const logins = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(perms);
const OPTIONAL_ON = new Set(["transport-management", "library-management", "inventory-management", "hostel-management"]);
const MODULE_KEYS = Object.keys(perms["cems.admin"]);

const result = {};
for (const login of logins) {
  const t0 = Date.now();
  let page;
  try { page = await as(login); } catch (e) { console.log(login, "SIGN-IN FAILED", e.message); continue; }
  const landing = page.url().replace(BASE, "");
  const menu = await page.$$eval('nav[aria-label="Main menu"] a', (as) => as.map((a) => `${a.innerText.trim().split("\n")[0]}=${a.getAttribute("href")}`)).catch(() => []);
  const rows = [];
  for (const p of pages) {
    const mod = p.split("/")[1];
    const level = MODULE_KEYS.includes(mod) ? perms[login]?.[mod] ?? "none" : "n/a";
    const s = Date.now();
    let status, location = "", err = "";
    try {
      const r = await page.context().request.get(BASE + p, { maxRedirects: 0, timeout: 60000 });
      status = r.status();
      location = r.headers()["location"] ?? "";
      if (status === 200) {
        const body = await r.text();
        if (/Something went wrong|Application error|This page could not be found|Internal Server Error/i.test(body)) err = (body.match(/Something went wrong[^<]{0,80}|Application error[^<]{0,80}|This page could not be found|Internal Server Error/i) ?? [""])[0];
        if (/NEXT_REDIRECT/.test(body) || /<meta[^>]+id="__next-page-redirect"[^>]+content="[^"]*url=([^"]+)"/.test(body)) {
          const m = body.match(/id="__next-page-redirect"[^>]*content="[^"]*url=([^"]+)"/) ?? body.match(/content="0;url=([^"]+)"[^>]*id="__next-page-redirect"/);
          location = m ? m[1].replace(/&amp;/g, "&") : "streamed-redirect";
        }
      }
    } catch (e) { status = "ERR"; err = String(e.message).slice(0, 120); }
    const ms = Date.now() - s;
    const deniedLike = /no-access|sign-in|\/driver|\/paused/.test(location);
    const expected = level === "n/a" ? "?" : level === "none" || (OPTIONAL_ON.has(mod) ? false : false) ? "deny" : "allow";
    let verdict = "ok";
    if (status === "ERR" || status >= 500 || err) verdict = "ERROR";
    else if (expected === "deny" && status === 200 && !location && p !== "/inventory-management/report-problem") verdict = "LEAK";
    else if (expected === "allow" && deniedLike) verdict = "denied-subpage";
    rows.push({ page: p, mod, level, status, location: location.replace(BASE, ""), ms, err, verdict });
  }
  result[login] = { landing, menu, signInMs: Date.now() - t0, rows };
  const bad = rows.filter((r) => r.verdict === "LEAK" || r.verdict === "ERROR");
  console.log(`${login}: landing ${landing}; menu ${menu.length}; leaks ${rows.filter((r) => r.verdict === "LEAK").length}; errors ${rows.filter((r) => r.verdict === "ERROR").length}; denied-subpages ${rows.filter((r) => r.verdict === "denied-subpage").length}; slow>1.5s ${rows.filter((r) => r.ms > 1500).length}`);
  for (const b of bad) console.log("   ", b.verdict, b.page, b.status, b.location, b.err);
  writeFileSync(path.join(OUT, `role-matrix-${login}.json`), JSON.stringify(result[login], null, 1));
  await page.context().close();
}
await close();
