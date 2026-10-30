// Delivery audit 2026-10-31: for every download a role got in probe-routes.mjs, opens the page the
// download belongs to (the address without /export). A page refused to the role while its
// download is served is a leak (found: Communication automation log and templates).
//   MSYS_NO_PATHCONV=1 node qa/full/probe-export-vs-page.mjs
import { readFileSync } from "node:fs";
import path from "node:path";
import { as } from "./look.mjs";
import { OUT, go, close, pageState } from "./h.mjs";

const rows = JSON.parse(readFileSync(path.join(OUT, "probe-routes.json"), "utf8")).filter((r) => r.verdict.startsWith("file"));
const byLogin = {};
for (const r of rows) (byLogin[r.login] ??= new Set()).add(r.route.split("?")[0]);
for (const [login, set] of Object.entries(byLogin)) {
  const page = await as(login);
  for (const route of set) {
    if (!/\/export$/.test(route)) continue;
    const pagePath = route.replace(/\/export$/, "") || "/";
    await go(page, pagePath);
    const st = await pageState(page);
    console.log(`${st.refused ? "PAGE REFUSED, EXPORT SERVED" : "ok"}\t${login}\t${route}\t-> ${st.path}`);
  }
  await page.context().close();
}
await close();
