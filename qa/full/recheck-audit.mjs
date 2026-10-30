// Delivery audit 2026-10-31: re-checks the fixes in the rebuilt app.
//   MSYS_NO_PATHCONV=1 node qa/full/recheck-audit.mjs
import { as } from "./look.mjs";
import { BASE, go, close, layoutIssues, pageState } from "./h.mjs";

const results = [];
const check = (name, ok, note = "") => { results.push({ name, ok, note }); console.log(`${ok ? "PASS" : "FAIL"}\t${name}${note ? "\t" + note : ""}`); };

const wide = [
  ["principal", 1024, "/admission-management"],
  ["principal", 320, "/fee-management/settings"],
  ["principal", 320, "/transport-management/settings"],
  ["principal", 320, "/library-management/settings"],
  ["principal", 320, "/reports-analytics/custom"],
  ["accountant", 320, "/fee-management/settings"],
  ["teacher", 320, "/attendance-management"],
];
for (const [login, w, url] of wide) {
  const p = await as(login, { width: w, height: 800 });
  await go(p, url);
  await p.waitForTimeout(600);
  const st = await pageState(p);
  const side = (await layoutIssues(p)).filter((x) => x.startsWith("page scrolls"));
  check(`${login} ${w}px ${url}: no sideways scroll`, !st.broken && side.length === 0, side.join(" ") || st.h1);
  await p.context().close();
}

for (const login of ["teacher", "reception", "transport"]) {
  const p = await as(login);
  const r = await p.request.get(`${BASE}/communication/settings/log/export?format=csv`, { failOnStatusCode: false });
  check(`${login}: automation log download refused`, r.status() === 403, String(r.status()));
  await p.context().close();
}
const pp = await as("principal");
const r = await pp.request.get(`${BASE}/communication/settings/log/export?format=csv`, { failOnStatusCode: false });
check("principal: automation log download works", r.status() === 200 && /Automation log/.test(await r.text()), String(r.status()));
await pp.context().close();

console.log(`${results.filter((x) => x.ok).length}/${results.length} passed`);
await close();
