// Layman B: Salary screens as the accountant: counts agree, a slip PDF, advance form with wrong values, structure form, open-a-month sheet.
import { asRole, go, mainText, sleep, snap } from "../full/selftest-A-h.mjs";
import { writeFileSync, appendFileSync } from "node:fs";
const OUT = process.env.QA_OUT; const log = (...a) => { const s = a.join(" "); console.log(s); appendFileSync(`${OUT}/salary.log`, s + "\n"); };
const p = await asRole(process.argv[2] ?? "accountant");
const errs = []; p.on("pageerror", (e) => errs.push(`${p.url()} ${e.message}`));
const dlg = () => p.getByRole("dialog").last();
const dt = async () => (await dlg().innerText().catch(() => "")).replace(/\n+/g, " | ");
const errsIn = async () => (await p.evaluate(() => [...document.querySelectorAll("[role=dialog] [id$='-error'], [role=dialog] [role=alert], main [id$='-error']")].map((e) => e.innerText.trim()).filter(Boolean).join(" || ")));
// 1. counts on two pages
await go(p, "/salary-management/generate"); await sleep(1500);
const g = await mainText(p, 1500); log("GEN COUNT", (g.match(/Salary structures\n[^\n]+\n[^\n]+/) ?? [""])[0].replace(/\n/g, " / "));
await go(p, "/salary-management/structures"); await sleep(1500);
const s = await mainText(p, 20000); log("STR COUNT", (s.match(/Active structures\n[^\n]+\n[^\n]+\nWithout a structure\n[^\n]+\n[^\n]+/) ?? [""])[0].replace(/\n/g, " / "));
log("STR TABLE", s.slice(s.indexOf("Salary structures\n\tStaff"), s.indexOf("Salary structures\n\tStaff") + 1500).replace(/\n/g, " / "));
// open first structure
const firstOpen = p.locator("main table a, main table button").filter({ hasText: /Open/ }).first();
if (await firstOpen.count()) { await firstOpen.click(); await sleep(2500); log("STR OPEN", (await dt() || await mainText(p, 2000)).slice(0, 1500)); await snap(p, "sal-structure-open", false); }
const edit = dlg().getByRole("button", { name: /Revise|Change|Edit/ }).first();
if (await edit.count()) { await edit.click(); await sleep(2000); log("STR EDIT", (await dt()).slice(0, 1500)); await snap(p, "sal-structure-edit", false);
  const basic = dlg().getByLabel(/Basic/).first();
  if (await basic.count()) { for (const v of ["-1000", "0", "35000.555", "abc", "99999999999"]) { await basic.fill(v); await sleep(300); const sb = dlg().getByRole("button", { name: /Save|Send|Revise/ }).last(); await sb.click().catch(() => {}); await sleep(1500); log(`STR basic "${v}" ->`, await errsIn(), "| open:", await dlg().isVisible().catch(() => false), "|", (await dt()).match(/Gross[^|]*\|[^|]*\|[^|]*/)?.[0] ?? ""); if (!(await dlg().isVisible().catch(() => false))) { log("!! SAVED a structure with", v); break; } } }
  await snap(p, "sal-structure-bad", false);
}
await p.keyboard.press("Escape"); await sleep(500); await p.keyboard.press("Escape");
// 2. slips: Priya Sharma
await go(p, "/salary-management/slips"); await sleep(1500);
const sl = await mainText(p, 4000); log("SLIPS", sl.slice(0, 500).replace(/\n/g, " / "));
const hrefs = await p.evaluate(() => [...document.querySelectorAll("main a[href]")].map((a) => a.getAttribute("href")).filter((h) => /slip|pdf/i.test(h)).slice(0, 8));
log("SLIP LINKS", hrefs.join(" "));
await p.getByRole("link", { name: /Open/ }).nth(2).click().catch(() => p.getByRole("button", { name: /Open/ }).nth(2).click()); await sleep(2500);
log("SLIP OPEN", (await dt() || await mainText(p, 3000)).slice(0, 1500));
await snap(p, "sal-slip-open", false);
const pdf = await p.evaluate(() => [...document.querySelectorAll("[role=dialog] a[href], main a[href]")].map((a) => a.getAttribute("href")).find((h) => /pdf|download|slip/i.test(h ?? "")));
log("SLIP PDF href", pdf);
if (pdf) { const r = await p.request.get(new URL(pdf, p.url()).href); log("SLIP PDF", r.status(), r.headers()["content-type"]); if (r.ok()) writeFileSync(`${OUT}/dl/slip.pdf`, await r.body()); }
await p.keyboard.press("Escape");
// 3. Advance form
await go(p, "/salary-management/advances"); await sleep(1500);
await p.getByRole("button", { name: /Give advance or loan/ }).or(p.getByRole("link", { name: /Give advance or loan/ })).first().click(); await sleep(2000);
log("ADV SHEET", (await dt()).slice(0, 1500)); await snap(p, "sal-adv-sheet", false);
const ab = () => dlg().getByRole("button", { name: /Send|Save|Give|Approval/ }).last();
await ab().click().catch(() => {}); await sleep(1500); log("ADV empty ->", await errsIn());
const amt = dlg().getByLabel(/^Amount/).first(); const each = dlg().getByLabel(/month|instal|recover/i).first();
for (const [a, e] of [["-5000", "500"], ["0", "500"], ["100.555", "10"], ["5000", "0"], ["5000", "9000"], ["99999999999", "100"]]) {
  await amt.fill(a).catch(() => {}); await each.fill(e).catch(() => {}); await sleep(300); await ab().click().catch(() => {}); await sleep(1500);
  log(`ADV amount "${a}" each "${e}" ->`, await errsIn(), "| open:", await dlg().isVisible().catch(() => false));
  if (!(await dlg().isVisible().catch(() => false))) { log("!! ADV SAVED with", a, e); break; }
}
await snap(p, "sal-adv-bad", false);
await p.keyboard.press("Escape");
// 4. Open a month
await go(p, "/salary-management/generate"); await sleep(1500);
await p.getByRole("button", { name: /Open a month/ }).or(p.getByRole("link", { name: /Open a month/ })).first().click().catch(() => {}); await sleep(2000);
log("OPEN MONTH", (await dt()).slice(0, 1200)); await snap(p, "sal-open-month", false);
await p.keyboard.press("Escape");
// 5. History by staff
await go(p, "/salary-management/history"); await sleep(1500);
await p.getByRole("tab", { name: "By staff member" }).or(p.getByRole("link", { name: "By staff member" })).first().click().catch(() => {}); await sleep(2500);
const hs = await mainText(p, 6000); log("HIST STAFF", hs.slice(0, 2000).replace(/\n/g, " / ")); await snap(p, "sal-history-staff");
await p.getByRole("tab", { name: "Reports" }).or(p.getByRole("link", { name: "Reports" })).first().click().catch(() => {}); await sleep(2500);
const hr = await mainText(p, 6000); log("HIST REPORTS", hr.slice(0, 2500).replace(/\n/g, " / ")); await snap(p, "sal-history-reports");
log("ERRS", errs.join(" ; "));
process.exit(0);
