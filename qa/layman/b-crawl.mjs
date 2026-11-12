// Layman B: open every money screen as a role at laptop and phone size, record words, problems, screenshots.
//   QA_OUT=D:/all/Projects/School-OS/qa-output/layman-b node qa/layman/b-crawl.mjs <role> [phone]
import { asRole, go, mainText, sleep, close, snap } from "../full/selftest-A-h.mjs";
import { writeFileSync } from "node:fs";
const role = process.argv[2] ?? "accountant";
const phone = process.argv[3] === "phone";
const routes = (process.env.ROUTES ?? `/fee-management /fee-management/dashboard /fee-management/structure /fee-management/concessions /fee-management/defaulters /fee-management/ledger /fee-management/ledger/import /fee-management/reports /fee-management/settings
/finance-management /finance-management/accounts /finance-management/budget /finance-management/cash-bank /finance-management/day-book /finance-management/expenses /finance-management/expenses/import /finance-management/income /finance-management/reports /finance-management/settings
/salary-management /salary-management/advances /salary-management/generate /salary-management/history /salary-management/settings /salary-management/slips /salary-management/structures /salary-management/structures/import`).split(/\s+/).filter(Boolean);
const p = await asRole(role);
if (phone) await p.setViewportSize({ width: 390, height: 844 });
const errs = [];
p.on("pageerror", (e) => errs.push(`${p.url()} PAGEERROR ${e.message}`));
p.on("console", (m) => { if (m.type() === "error") errs.push(`${p.url()} CONSOLE ${m.text().slice(0, 200)}`); });
const out = [];
for (const r of routes) {
  const t0 = Date.now();
  let status = 0;
  try { const res = await go(p, r); status = res?.status() ?? 0; } catch (e) { status = -1; }
  await sleep(1500);
  const t = await mainText(p, 20000);
  const bad = [];
  if (/\bundefined\b|\bnull\b|\bNaN\b|Invalid Date|\[object Object\]/.test(t)) bad.push("bad-word:" + (t.match(/.{0,40}(\bundefined\b|\bnull\b|\bNaN\b|Invalid Date|\[object Object\]).{0,40}/) ?? [""])[0]);
  if (/Something went wrong|Application error|Internal Server Error|could not be found/i.test(t)) bad.push("broken");
  if (/Loading…|Loading\.\.\./.test(t)) bad.push("loading-text");
  if (/\d{4}-\d{2}-\d{2}/.test(t)) bad.push("iso-date:" + (t.match(/.{0,30}\d{4}-\d{2}-\d{2}.{0,20}/) ?? [""])[0]);
  if (/₹\s?\d{4,}(?!,)/.test(t.replace(/₹\s?\d{1,3}(,\d{2,3})+/g, ""))) bad.push("rupee-no-comma:" + (t.match(/.{0,20}₹\s?\d{4,}.{0,10}/) ?? [""])[0]);
  const hscroll = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
  if (hscroll) bad.push("horizontal-scroll");
  const name = `${role}${phone ? "-phone" : ""}${r.replace(/\//g, "_")}`;
  await snap(p, name);
  out.push({ r, final: new URL(p.url()).pathname, status, ms: Date.now() - t0, bad, text: t.slice(0, 6000) });
  console.log(status, r, "->", new URL(p.url()).pathname, Date.now() - t0 + "ms", bad.join(" ; "));
}
writeFileSync(`${process.env.QA_OUT}/crawl-${role}${phone ? "-phone" : ""}.json`, JSON.stringify({ out, errs }, null, 2));
console.log("ERRORS:\n" + [...new Set(errs)].join("\n"));
await close?.(p).catch?.(() => {});
process.exit(0);
