// Layman E: download Excel and CSV of library/inventory reports and the library/inventory list exports; open and check them.
process.env.QA_OUT ??= "D:/all/Projects/School-OS/qa-output/layman-e";
const { asRole, go, close, sleep, mainText, BASE } = await import("../full/selftest-A-h.mjs");
const ExcelJS = (await import("exceljs")).default;
const fs = await import("node:fs"); const path = await import("node:path");
const p = await asRole("admin");
const DL = path.join(process.env.QA_OUT, "downloads"); fs.mkdirSync(DL, { recursive: true });
const keys = ["lib-issued", "lib-overdue", "lib-fines", "inv-stock", "inv-low", "inv-purchases"];
for (const k of keys) {
  for (const f of ["xlsx", "csv"]) {
    const r = await p.request.get(`${BASE}/reports-analytics/r/${k}/export?format=${f}`);
    const buf = await r.body(); const file = path.join(DL, `${k}.${f}`); fs.writeFileSync(file, buf);
    let info = `${r.status()} ${r.headers()["content-type"]} ${buf.length}B`;
    if (f === "xlsx" && r.ok()) {
      try {
        const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf);
        const ws = wb.worksheets[0]; const rows = [];
        ws.eachRow((row) => rows.push(row.values.slice(1).map((v) => (v instanceof Date ? `DATE:${v.toISOString().slice(0, 10)}` : typeof v === "object" && v ? JSON.stringify(v).slice(0, 40) : String(v ?? "")))));
        const all = rows.flat().join(" ");
        const odd = [/\bundefined\b|\bNaN\b|\bnull\b|\[object Object\]/.test(all) ? "CODE WORD" : "", /\b20\d\d-\d\d-\d\d\b/.test(all) ? "ISO date " + all.match(/.{0,15}\b20\d\d-\d\d-\d\d\b/)[0] : ""].filter(Boolean);
        info += ` sheets=${wb.worksheets.map((w) => w.name).join("/")} rows=${rows.length} odd=${odd.join(",")}\n    ` + rows.slice(0, 7).map((r) => r.join(" | ").slice(0, 220)).join("\n    ");
      } catch (e) { info += " OPEN FAILED " + e.message; }
    }
    if (f === "csv") info += "\n    " + buf.toString("utf8").split("\n").slice(0, 4).join("\n    ").slice(0, 600);
    console.log(`${k}.${f}: ${info}`);
  }
}
// Page list exports (library books, members, fines, inventory items)
for (const u of ["/library-management/books", "/library-management/members", "/library-management/fines", "/inventory-management/items"]) {
  await go(p, u); await sleep(800);
  const hrefs = await p.evaluate(() => [...document.querySelectorAll('a[href*="format="]')].map((a) => a.getAttribute("href")));
  const x = hrefs.find((h) => /format=xlsx/.test(h));
  if (!x) { console.log(u, "no export link in page; buttons:", (await p.getByRole("button", { name: /Export/ }).count())); continue; }
  const r = await p.request.get(x.startsWith("http") ? x : BASE + x); const buf = await r.body();
  const wb = new ExcelJS.Workbook(); let info = "";
  try { await wb.xlsx.load(buf); const ws = wb.worksheets[0]; const rows = []; ws.eachRow((row) => rows.push(row.values.slice(1).map((v) => (v instanceof Date ? `DATE:${v.toISOString().slice(0, 10)}` : String(v ?? ""))))); info = `rows=${rows.length}\n    ` + rows.slice(0, 5).map((r) => r.join(" | ").slice(0, 220)).join("\n    "); } catch (e) { info = "OPEN FAILED " + e.message; }
  console.log(`${u} export ${x} -> ${r.status()} ${buf.length}B ${info}`);
}
await close();
