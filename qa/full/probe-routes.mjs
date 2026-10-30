// Delivery audit 2026-10-31: every school download route (src/app/(school)/**/route.ts) without
// an id in its path, opened directly by each role. A route of a module the role cannot open
// must not send a file (status 200 with a file type is a leak).
//   MSYS_NO_PATHCONV=1 node qa/full/probe-routes.mjs teacher librarian reception transport store warden
import { readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { as } from "./look.mjs";
import { BASE, OUT, close } from "./h.mjs";
import { readFileSync, existsSync } from "node:fs";

const root = "src/app/(school)";
const routes = [];
(function walk(d) { for (const e of readdirSync(d)) { const p = path.join(d, e); if (statSync(p).isDirectory()) walk(p); else if (e === "route.ts") routes.push("/" + path.relative(root, d).replace(/\\/g, "/")); } })(root);
const plain = routes.filter((r) => !r.includes("["));
const logins = process.argv.slice(2);
const rows = [];
for (const login of logins) {
  const page = await as(login);
  // The modules in this role's own menu (round 1's crawl); a file from any other module is a leak.
  const crawl = path.join(OUT, `crawl-${login}-laptop1280.json`);
  const allowed = existsSync(crawl) ? JSON.parse(readFileSync(crawl, "utf8")).menu.map((m) => m.href.split("/")[1]) : [];
  for (const r of plain) {
    const mod = r.split("/")[1];
    for (const q of ["", "?format=csv", "?format=xlsx", "?format=pdf"]) {
      if (q && !/export|tally/.test(r)) continue;
      const res = await page.request.get(`${BASE}${r}${q}`, { maxRedirects: 0, failOnStatusCode: false });
      const type = res.headers()["content-type"] ?? "";
      const file = res.status() === 200 && !/text\/html/.test(type);
      const verdict = file ? (allowed.includes(mod) ? "file (module allowed)" : "LEAK? file for a module this role cannot open") : `${res.status()} ${type.split(";")[0]}`;
      rows.push({ login, route: r + q, status: res.status(), type, verdict });
      if (/LEAK/.test(verdict)) console.log(login, r + q, res.status(), type, (await res.body()).length, "bytes");
      if (!q || !file) { /* one format is enough when refused */ }
    }
  }
  await page.context().close();
  console.log(login, "done:", rows.filter((x) => x.login === login && /LEAK/.test(x.verdict)).length, "possible leaks of", rows.filter((x) => x.login === login).length);
}
writeFileSync(path.join(OUT, "probe-routes.json"), JSON.stringify(rows, null, 1));
await close();
