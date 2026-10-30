import "./h.mjs";
import { launch } from "../lib.mjs";
const b = await launch();
const ctx = await b.newContext({ storageState: "qa-output/full/state/parent-sanjay.json" });
const L = "/p/cVoyoCWcLVpneoloLluBfCweirdTv9Ixr6W2rdQtyqk";
for (const u of [`${L}/fees/f25c86a0-19e6-48d0-9350-284fb6db3430?doc=receipt`, `${L}/report-card?child=89f4d170-576a-4ad1-903f-921339f1b2e7&year=6383a920-d5f3-4317-aa39-57a2a1b77232&period=exam%3A8c88c728-651e-4bfb-91d8-df48ec5883f5`, `${L}/report-card?child=17182f62-5887-4f92-8dc3-060778389362&year=6383a920-d5f3-4317-aa39-57a2a1b77232&period=exam%3A8c88c728-651e-4bfb-91d8-df48ec5883f5`, `${L}/fees/00000000-0000-0000-0000-000000000000?doc=receipt`]) {
  const r = await ctx.request.get(`http://localhost:3000${u}`);
  const body = await r.body();
  console.log(r.status(), r.headers()["content-type"], body.length, u.slice(L.length, L.length + 60), /pdf/.test(r.headers()["content-type"]) ? (body.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length + " pages" : body.toString().slice(0, 80).replace(/\s+/g, " "));
}
const fresh = await b.newContext();
const r = await fresh.request.get(`http://localhost:3000${L}/fees/f25c86a0-19e6-48d0-9350-284fb6db3430?doc=receipt`, { maxRedirects: 0 });
console.log("no device:", r.status(), r.headers()["content-type"]);
await b.close();
