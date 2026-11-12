// Layman B: can a role open money pages by typing the address?  node qa/layman/b-roles.mjs <role>
import { asRole, go, mainText, sleep, snap, pageState } from "../full/selftest-A-h.mjs";
const role = process.argv[2];
const urls = `/fee-management /fee-management/dashboard /fee-management/collect/c8d371f4-01ae-48e6-ba03-cff70d0a1b5a /fee-management/ledger/c8d371f4-01ae-48e6-ba03-cff70d0a1b5a /fee-management/payments/e95511fd-e9c8-4134-9e90-02e21d889e27 /fee-management/payments/e95511fd-e9c8-4134-9e90-02e21d889e27/receipt?download=1 /fee-management/defaulters /fee-management/reports /fee-management/reports/export?r=collection-details&format=xlsx /fee-management/structure /fee-management/concessions /fee-management/settings /finance-management/day-book /finance-management/expenses /finance-management/income /finance-management/cash-bank /finance-management/reports /finance-management/reports/export?r=profit-loss&format=xlsx /finance-management/settings /salary-management/generate /salary-management/structures /salary-management/slips /salary-management/history /salary-management/advances /salary-management/settings`.split(" ").filter((u) => !process.env.FROM || true);
const p = await asRole(role);
const m = await p.evaluate(() => [...document.querySelectorAll('nav[aria-label="Main menu"] a[href]')].map((a) => a.innerText.trim().split("\n")[0]));
console.log("MENU", m.join(", "));
for (const u of urls) {
  if (/export|receipt\?/.test(u)) { const r = await p.request.get("http://localhost:3000" + u, { maxRedirects: 0 }); console.log(r.status(), u, r.headers()["content-type"], r.headers()["location"] ?? ""); continue; }
  let s; for (let k = 0; k < 3; k++) { try { await go(p, u); await sleep(1500); s = await pageState(p); break; } catch (e) { if (k === 2) { console.log("ERR", u, e.message.slice(0, 80)); } await sleep(2000); } } if (!s) continue;
  const money = (s.text.match(/₹[\d,.]+( L| Cr)?/g) ?? []).length;
  console.log(s.refused ? "REFUSED" : s.broken ? "BROKEN" : "OPEN", u, "->", s.path, "| h1:", s.h1, "| ₹ count", money, "|", s.text.slice(0, 120).replace(/\n/g, " / "));
}
process.exit(0);
