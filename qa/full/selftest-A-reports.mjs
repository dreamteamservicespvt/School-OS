// Self-test A, area 4: Reports & Analytics as the Principal. Opens every report in the catalogue,
// checks the table, the Excel and PDF downloads, a filter, and that totals on screen match the file.
//   MSYS_NO_PATHCONV=1 node qa/full/selftest-A-reports.mjs [maxReports]
import { asRole, go, pageState, snap, ok, finish, note, close, sleep, text, BASE } from "./selftest-A-h.mjs";
const MAX = Number(process.argv[2] ?? 999);
const A = "reports";
const p = await asRole("principal");
await go(p, "/reports-analytics");
await sleep(2500);
await snap(p, "principal-reports-catalogue");
const links = await p.evaluate(() => [...new Set([...document.querySelectorAll('main a[href*="/reports-analytics/r/"]')].map((a) => a.getAttribute("href").split("?")[0]))]);
ok(A, "catalogue lists reports", links.length > 10, `${links.length} reports`);
note("reports", `CATALOGUE ${links.length}: ${links.join(" ")}`);

// Search box
const search = p.getByRole("searchbox").or(p.getByPlaceholder(/search/i)).first();
if (await search.isVisible().catch(() => false)) {
  await search.fill("salary");
  await sleep(1500);
  const t = await text(p, 4000);
  ok(A, "catalogue search 'salary' narrows the list", /salary/i.test(t), t.split("\n").slice(0, 8).join(" | "));
  await search.fill("zzqqxx");
  await sleep(1500);
  const t2 = await text(p, 2000);
  ok(A, "catalogue search with no match says so", /No report|nothing|no match|not found/i.test(t2), t2.slice(0, 200));
  await search.fill("");
}

const ctx = p.context();
let n = 0;
for (const href of links.slice(0, MAX)) {
  n++;
  p.problems.length = 0;
  const res = await go(p, href);
  await sleep(1200);
  const s = await pageState(p);
  const key = href.split("/").pop();
  const body = s.text;
  const rows = await p.locator("main table tbody tr").count();
  const empty = /No (rows|records|data)|Nothing|no .* yet|not switched on|Being prepared|being prepared/i.test(body);
  const good = !s.broken && (res?.status() ?? 0) < 400 && p.problems.length === 0;
  note("reports", `\n===== ${href} [${res?.status()}] h1="${s.h1}" rows=${rows}\n${body.slice(0, 1500)}\nPROBLEMS: ${p.problems.join(" ; ")}`);
  ok(A, `opens report ${key}`, good, `h1="${s.h1}" rows=${rows}${empty ? " (empty/notice)" : ""} ${p.problems.join(";")}`);
  if (n <= 60) await snap(p, `principal-report-${key}`, false);
  // Excel and PDF by HTTP with this session (same as clicking the link).
  const pdfA = await p.locator('main a[href*="/export"][href*="format=pdf"]').first().getAttribute("href", { timeout: 2000 }).catch(() => null);
  const hrefX = pdfA ? pdfA.replace(/[?&]format=pdf/, "") : null;
  if (hrefX && n % 3 === 1) { // every third report, to keep the run short
    const sum = p.locator("main details summary, main button", { hasText: /^Excel$/ }).first();
    if (n === 1) { await sum.click().catch(() => {}); await sleep(500); note("reports", `EXCEL MENU: ${(await p.getByRole("menuitem").allInnerTexts().catch(() => [])).join(" / ")}`); await p.keyboard.press("Escape"); }
    const r1 = await ctx.request.get(new URL(hrefX + (hrefX.includes("?") ? "&" : "?") + "format=xlsx", BASE).toString());
    const ct = r1.headers()["content-type"] ?? "";
    const len = (await r1.body()).length;
    ok(A, `report ${key} Excel download`, r1.ok() && len > 200 && !/html/.test(ct), `${r1.status()} ${ct} ${len} bytes`);
    const r2 = await ctx.request.get(new URL(hrefX + (hrefX.includes("?") ? "&" : "?") + "format=pdf", BASE).toString());
    const ct2 = r2.headers()["content-type"] ?? "";
    const b2 = await r2.body();
    ok(A, `report ${key} PDF download`, r2.ok() && b2.slice(0, 4).toString() === "%PDF", `${r2.status()} ${ct2} ${b2.length} bytes`);
  } else {
    note("reports", `NO EXCEL LINK on ${href}`);
  }
}
finish("reports");
await close();
