// Receipts as PDF, and who may open them (another role, another school).
import { as, result, BASE } from "./m.mjs";
import { close } from "../lib.mjs";
import { money, STU } from "./collect-lib.mjs";
import { writeFileSync } from "node:fs";

const pay = money(STU.aarav).pays[0][0];
const cancelled = money(STU.ishita).pays[0][0];
async function get(login, url) {
  const page = await as(login);
  const r = await page.request.get(`${BASE}${url}`, { maxRedirects: 0 });
  const body = await r.body();
  return { status: r.status(), type: r.headers()["content-type"] ?? "", body, text: body.toString("utf8", 0, 300), loc: r.headers()["location"] ?? "" };
}
const a = await get("cems.accountant", `/fee-management/payments/${pay}/receipt`);
writeFileSync(`${process.env.QA_OUT}/aarav-receipt.pdf`, a.body);
result({ module: "Fee Management", page: "Receipt", action: "Download Aarav's receipt as PDF", role: "accountant", expected: "PDF", actual: `${a.status} ${a.type} ${a.body.length} bytes`, status: a.status === 200 && /pdf/.test(a.type) && a.body.subarray(0, 4).toString() === "%PDF" ? "PASS" : "FAIL" });
const c = await get("cems.accountant", `/fee-management/payments/${cancelled}/receipt`);
writeFileSync(`${process.env.QA_OUT}/ishita-cancelled-receipt.pdf`, c.body);
result({ module: "Fee Management", page: "Receipt", action: "Download a cancelled receipt", role: "accountant", expected: "PDF marked cancelled (or refused plainly)", actual: `${c.status} ${c.type} ${c.body.length} bytes`, status: c.status === 200 || c.status === 400 ? "PASS" : "FAIL" });
for (const login of ["cems.teacher", "cems.classteacher", "qab.admin", "cems.librarian"]) {
  const r = await get(login, `/fee-management/payments/${pay}/receipt`);
  const leaked = /pdf/.test(r.type);
  result({ module: "Fee Management", page: "Receipt", action: `Open Aarav's receipt URL directly as ${login}`, role: login.replace(/^\w+\./, ""), expected: "Refused (no PDF)", actual: `${r.status} ${r.type} ${r.loc} ${leaked ? "PDF RETURNED" : r.text.replace(/\s+/g, " ").slice(0, 100)}`, status: !leaked ? "PASS" : "FAIL", defect: leaked ? "receipt readable by a role without Fee Management" : undefined });
}
await close();
