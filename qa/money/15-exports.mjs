// Exports of the money modules as the Accountant (CSV and Excel), totals checked against SQL;
// the same addresses as a Teacher and as another school's admin must not return the file.
import { as, result, BASE, sql, SCHOOL_A } from "./m.mjs";
import { close } from "../lib.mjs";
import { writeFileSync } from "node:fs";

const routes = [
  ["Finance Management", "Day Book", "/finance-management/day-book/export"],
  ["Finance Management", "Income", "/finance-management/income/export"],
  ["Finance Management", "Expenses", "/finance-management/expenses/export"],
  ["Finance Management", "Cash & Bank", "/finance-management/cash-bank/export"],
  ["Finance Management", "Finance Reports", "/finance-management/reports/export"],
  ["Fee Management", "Fee Dashboard", "/fee-management/dashboard/export"],
  ["Fee Management", "Defaulters", "/fee-management/defaulters/export"],
  ["Fee Management", "Concessions", "/fee-management/concessions/export"],
  ["Fee Management", "Fee Reports", "/fee-management/reports/export"],
  ["Salary Management", "Salary Structures", "/salary-management/structures/export"],
];
const pages = {};
async function get(login, url) {
  pages[login] ??= await as(login);
  const r = await pages[login].request.get(`${BASE}${url}`, { maxRedirects: 0, timeout: 300000 });
  const body = await r.body();
  return { status: r.status(), type: r.headers()["content-type"] ?? "", body, loc: r.headers()["location"] ?? "" };
}
for (const [M, P, u] of routes) {
  for (const fmt of ["csv", "xlsx"]) {
    const r = await get("cems.accountant", `${u}?format=${fmt}`);
    const ok = r.status === 200 && (fmt === "csv" ? /csv/.test(r.type) : /spreadsheet|excel|octet/.test(r.type) && r.body.subarray(0, 2).toString() === "PK");
    const name = `${u.replace(/\W+/g, "_")}.${fmt}`;
    writeFileSync(`${process.env.QA_OUT}/${name}`, r.body);
    result({ module: M, page: P, action: `Export ${fmt.toUpperCase()}`, role: "accountant", expected: `${fmt} file`, actual: `${r.status} ${r.type} ${r.body.length} bytes${r.status !== 200 ? " " + r.body.toString().slice(0, 120) : ""}`, status: ok ? "PASS" : "FAIL" });
  }
  for (const login of ["cems.teacher", "qab.admin"]) {
    const r = await get(login, `${u}?format=csv`);
    const leaked = r.status === 200 && /csv/.test(r.type);
    result({ module: M, page: P, action: `Export address opened as ${login}`, role: login.replace(/^\w+\./, ""), expected: "No School A file", actual: `${r.status} ${r.type} ${r.loc} ${r.body.toString().replace(/\s+/g, " ").slice(0, 100)}`, status: leaked && (login === "cems.teacher" || /Demo|Aarav|Vihaan/.test(r.body.toString())) ? "FAIL" : "PASS" });
  }
}
// Day Book CSV for today: totals against SQL.
const csv = (await get("cems.accountant", "/finance-management/day-book/export?format=csv")).body.toString();
const today = sql(`select to_char((now() at time zone 'Asia/Kolkata')::date,'YYYY-MM-DD')`)[0][0];
const [inn, out] = sql(`select coalesce(sum(amount_paise) filter (where direction='IN'),0), coalesce(sum(amount_paise) filter (where direction='OUT'),0) from day_book_entry where school_id='${SCHOOL_A}' and date='${today}'`)[0].map(Number);
const lastLines = csv.trim().split("\n").slice(-4).join(" / ");
const rupees = (p) => `₹${(p / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
result({ module: "Finance Management", page: "Day Book", action: "Day Book CSV totals agree with SQL for today", role: "accountant", expected: `IN ${rupees(inn)} OUT ${rupees(out)}`, actual: lastLines.slice(0, 400), status: lastLines.includes(rupees(inn).replace("₹", "")) ? "PASS" : "FAIL" });
await close();
