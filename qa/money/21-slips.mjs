// Salary slips: PDF download (Accountant), who may open whose slip, and sending without a WhatsApp account.
import { as, visit, sql, SCHOOL_A, result, BASE, mainText, shot } from "./m.mjs";
import { close } from "../lib.mjs";
import { writeFileSync } from "node:fs";

const M = "Salary Management", P = "Salary Slips";
const slip = (code) => sql(`select p.id, p.status from payslip p join staff s on s.id=p.staff_id where s.staff_code='${code}' and p.school_id='${SCHOOL_A}' order by p.created_at desc limit 1`)[0];
const pavan = slip("CEMS-ST-009"), lavanya = slip("CEMS-ST-008");
const pages = {};
async function get(login, url) {
  pages[login] ??= await as(login);
  const r = await pages[login].request.get(`${BASE}${url}`, { maxRedirects: 0, timeout: 300000 });
  const body = await r.body();
  return { status: r.status(), type: r.headers()["content-type"] ?? "", body };
}
const a = await get("cems.accountant", `/salary-management/slips/pdf?ids=${pavan[0]}`);
writeFileSync(`${process.env.QA_OUT}/pavan-slip.pdf`, a.body);
result({ module: M, page: P, action: "Download Demo Pavan Seela's October slip as PDF", role: "accountant", expected: "PDF", actual: `${a.status} ${a.type} ${a.body.length} bytes`, status: a.status === 200 && a.body.subarray(0, 4).toString() === "%PDF" ? "PASS" : "FAIL" });
const own = await get("cems.teacher", `/salary-management/slips/pdf?ids=${pavan[0]}`);
result({ module: M, page: "My Salary Slips", action: "Demo Pavan Seela (cems.teacher) downloads his own slip", role: "teacher", expected: "PDF of his own slip", actual: `${own.status} ${own.type} ${own.body.length} bytes`, status: own.status === 200 && /pdf/.test(own.type) ? "PASS" : "FAIL" });
for (const [login, id, who] of [["cems.teacher", lavanya[0], "Demo Lavanya Teki's"], ["cems.classteacher", pavan[0], "Demo Pavan Seela's"], ["qab.admin", pavan[0], "School A's"]]) {
  const r = await get(login, `/salary-management/slips/pdf?ids=${id}`);
  const leaked = /pdf/.test(r.type);
  result({ module: M, page: P, action: `${login} opens ${who} slip by its address`, role: login.replace(/^\w+\./, ""), expected: "Refused, no PDF", actual: `${r.status} ${r.type} ${leaked ? "PDF RETURNED" : r.body.toString().slice(0, 100)}`, status: leaked ? "FAIL" : "PASS" });
}
// Send by WhatsApp (no WhatsApp account connected in this school).
const acc = await as("cems.accountant");
const run = sql(`select id from payroll_run where school_id='${SCHOOL_A}' and month='2026-10-01'`)[0][0];
await visit(acc, `/salary-management/slips?run=${run}&do=send-unsent`);
await acc.getByRole("dialog").last().getByRole("button", { name: /^Send to/ }).click();
await acc.waitForTimeout(6000);
const msg = (await acc.locator("[role=status], [role=alert]").allInnerTexts()).join(" | ").replace(/\s+/g, " ").slice(0, 300);
await shot(acc, "slips-sent");
const after = slip("CEMS-ST-009")[1];
const delivered = sql(`select count(*) from message where school_id='${SCHOOL_A}' and created_at > now() - interval '5 minutes' and body like '%salary slip%'`)[0]?.[0];
const claimsSent = /slips? sent by WhatsApp/i.test(msg);
result({ module: M, page: P, action: "Send unsent slips by WhatsApp (no WhatsApp account connected)", role: "accountant", expected: "Not claimed as sent; says WhatsApp is not set up (NEEDS EXTERNAL CREDENTIAL for real delivery)", actual: `${msg} | slip status=${after} messages=${delivered}`, status: claimsSent ? "FAIL" : "NEEDS EXTERNAL CREDENTIAL" });
await close();
