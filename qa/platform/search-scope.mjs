// What the search API returns to each login (counts by group), for scope checks.
//   node qa/platform/search-scope.mjs <words> <login...>
import { close, BASE } from "../lib.mjs";
import { as } from "./util.mjs";
const [q, ...logins] = process.argv.slice(2);
for (const login of logins) {
  const p = await as(login);
  const r = await p.context().request.get(`${BASE}/api/v1/search?q=${encodeURIComponent(q)}`);
  const body = r.status() === 200 ? await r.json() : await r.text();
  const summary = typeof body === "string" ? body.slice(0, 120) : Object.fromEntries(Object.entries(body).map(([k, v]) => [k, Array.isArray(v) ? v.map((x) => x.name ?? x.label ?? x.title).slice(0, 4) : v]));
  console.log(`${login} "${q}": ${r.status()} ${JSON.stringify(summary)}`);
  await p.context().close();
}
await close();
