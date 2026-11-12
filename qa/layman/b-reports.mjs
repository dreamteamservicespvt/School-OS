// Layman B: open every Fee and Finance report, download its Excel and PDF, read the Excel totals.
//   QA_OUT=D:/all/Projects/School-OS/qa-output/layman-b node qa/layman/b-reports.mjs
import { asRole, go, mainText, sleep, snap } from "../full/selftest-A-h.mjs";
import ExcelJS from "exceljs";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
const OUT = process.env.QA_OUT; const DL = path.join(OUT, "dl"); mkdirSync(DL, { recursive: true });
const p = await asRole("accountant");
const errs = []; p.on("pageerror", (e) => errs.push(`${p.url()} ${e.message}`));
const res = [];
async function readXlsx(file) {
  const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(file);
  return wb.worksheets.map((ws) => ({ name: ws.name, rows: ws.getSheetValues().filter(Boolean).slice(0, 400).map((r) => (Array.isArray(r) ? r.slice(1) : []).map((c) => (c && typeof c === "object" ? (c.result ?? c.text ?? JSON.stringify(c)) : c))) }));
}
for (const base of (process.env.BASES ?? "/fee-management/reports /finance-management/reports").split(" ")) {
  await go(p, base); await sleep(1500);
  const links = await p.evaluate(() => [...document.querySelectorAll("main a[href*='r=']")].filter((a) => !a.getAttribute("href").includes("/export")).map((a) => ({ t: a.innerText.split("\n")[0].trim(), h: a.getAttribute("href") })));
  const seen = new Set();
  for (const l of links) {
    const key = new URL(l.h, "http://x").searchParams.get("r"); if (seen.has(key)) continue; seen.add(key);
    await go(p, l.h); await sleep(1500);
    const t = await mainText(p, 15000);
    const bad = [];
    if (/\bundefined\b|\bnull\b|\bNaN\b|Invalid Date|\[object Object\]/.test(t)) bad.push("bad-word:" + (t.match(/.{0,40}(\bundefined\b|\bnull\b|\bNaN\b|Invalid Date|\[object Object\]).{0,40}/) ?? [""])[0]);
    if (/Something went wrong|Application error/i.test(t)) bad.push("broken");
    if (/\d{4}-\d{2}-\d{2}/.test(t)) bad.push("iso-date:" + (t.match(/.{0,30}\d{4}-\d{2}-\d{2}.{0,20}/) ?? [""])[0]);
    const name = `rep-${base.split("/")[1].split("-")[0]}-${key}`;
    await snap(p, name);
    // Excel
    let xl = null, pdf = null;
    const xh = await p.evaluate(() => [...document.querySelectorAll("main a[href*='/export']")].map((a) => a.getAttribute("href")).find((h) => !/format=pdf/.test(h)));
    if (xh) { try { const r = await p.request.get(new URL(xh, p.url()).href); const f = path.join(DL, `${name}.xlsx`); writeFileSync(f, await r.body());
      const sh = await readXlsx(f); xl = { file: f, sheets: sh.map((s) => ({ name: s.name, n: s.rows.length, head: s.rows.slice(0, 4), tail: s.rows.slice(-3) })) }; } catch (e) { xl = { err: e.message.slice(0, 200) }; } } else xl = { err: "no export link" };
    // PDF via Print link
    const pr = await p.locator("main a", { hasText: /^Print$/ }).first().getAttribute("href").catch(() => null);
    if (pr) { const r = await p.request.get(new URL(pr, p.url()).href); pdf = { status: r.status(), type: r.headers()["content-type"] }; if (r.ok()) writeFileSync(path.join(DL, `${name}.pdf`), await r.body()); }
    res.push({ base, key, title: l.t, url: l.h, bad, text: t.slice(0, 3000), xl, pdf });
    console.log(key, "|", l.t, "|", bad.join(";"), "| xl:", xl?.err ?? xl?.sheets?.map((s) => `${s.name}:${s.n}`).join(","), "| pdf:", pdf?.status, pdf?.type);
  }
}
writeFileSync(path.join(OUT, "reports.json"), JSON.stringify({ res, errs }, null, 2));
console.log("ERRS", errs.join("\n"));
process.exit(0);
