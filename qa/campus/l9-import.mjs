// Library: Import books — template download, a file with good and bad rows, the check, the import, skipped rows.
import { asUser, go, close, result, sleep, mainText } from "./util.mjs";
import { writeFileSync } from "node:fs";
const M = "Library Management", P = "Import books", R = "Librarian";
const OUT = process.env.QA_OUT ?? "/home/claude/qa-out/campus";
const rec = (action, expected, actual, ok, st) => result({ module: M, page: P, action, role: R, expected, actual: actual.slice(0, 700), status: st ?? (ok ? "PASS" : "FAIL") });
const page = await asUser("cems.librarian");

// 1. Template.
await go(page, "/library-management/books/import");
const res = await page.request.get(page.url().replace(/\/books\/import.*/, "/books/import/template"));
const tpl = await res.text();
const header = tpl.split(/\r?\n/)[0];
rec("Download the template", "A CSV with the column names and an example row", `HTTP ${res.status()} · ${header}`, res.status() === 200 && /title/i.test(header));
console.log(tpl.slice(0, 600));

// 2. A file: the template's own columns, two good rows and three bad ones.
const cols = header.split(",").map((c) => c.replace(/"/g, "").trim());
const row = (v) => cols.map((c) => { const k = c.toLowerCase(); const x = Object.entries(v).find(([key]) => k.startsWith(key))?.[1] ?? ""; return /[,"]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x; }).join(",");
const lines = [header,
  row({ title: "Demo Import Atlas", author: "Demo Mapmaker", cop: "2", price: "300" }),
  row({ title: "Demo Import Poems", author: "Demo Poet; Demo Second Poet", cop: "1", isbn: "9780306406157" }),
  row({ title: "", author: "Demo Nobody", cop: "1" }),
  row({ title: "Demo Import Bad ISBN", author: "Demo Author", cop: "1", isbn: "9780306406158" }),
  row({ title: "Demo Import Bad Copies", author: "Demo Author", cop: "-3" }),
];
const file = `${OUT}/library-import.csv`;
writeFileSync(file, lines.join("\n") + "\n");
await page.locator("input[name=file]").setInputFiles(file);
await page.getByRole("button", { name: "Upload" }).click();
for (let i = 0; i < 60 && !(await page.getByRole("button", { name: "Check rows" }).count()); i++) await sleep(1000);
await page.getByRole("button", { name: "Check rows" }).click();
for (let i = 0; i < 60 && !(await page.getByRole("button", { name: /^Import \d+ book/ }).count()); i++) await sleep(1000);
let t = (await mainText(page, 4000)).replace(/\s+/g, " ");
const i2 = t.indexOf("4. Preview");
rec("Upload a file with 2 good rows and 3 bad rows (no title, wrong ISBN check digit, -3 copies)", "2 ready; each bad row named with its problem in plain words", t.slice(i2, i2 + 900), /Import 2 books/.test(t) && /title/i.test(t) && /ISBN/i.test(t) && /cop/i.test(t));
const btn = page.getByRole("button", { name: /^Import \d+ book/ });
if (await btn.count()) {
  await btn.click();
  for (let i = 0; i < 60; i++) { await sleep(1000); t = (await mainText(page, 4000)).replace(/\s+/g, " "); if (/imported|Open Books/i.test(t)) break; }
  const k = t.search(/imported/i);
  rec("Import the 2 good rows", "2 books added with 3 copies; skipped rows can be downloaded", t.slice(Math.max(0, k - 200), k + 500), /imported/i.test(t) && /Download skipped rows/i.test(t));
}
console.log("done");
await close();
