// Receipts, files, letters, passes and exports of Sunrise Public School,
// asked for by a CEMS login (and by nobody signed in). Every one must be refused.
//   node qa/platform/cross-files.mjs
import { close, BASE } from "../lib.mjs";
import { as, page } from "./util.mjs";

const ID = {
  payment: "fbeb7354-126e-475e-ad52-ceec7e48831b", file: "fc6479e2-19ab-4e22-a312-9baa0cf66938", income: "3253b17f-8970-4704-823a-11bc80a4435b",
  student: "3ef672b0-2ec1-4acd-9015-468bfcb5f894", visitor: "bf0d0a58-4830-442b-819a-4dc14ff40691", staff: "7efce31c-6593-4227-9a8b-893c2235528d",
  exit: "56800796-5dca-4528-a2ce-81de4876db2f", po: "62655067-9773-4305-a7fb-55a3310f228a", exam: "e1accacf-16e4-446b-aceb-1421db7e69b1", pass: "ae9da609-ca2c-43fc-ba27-f31268a46c9d",
};
const urls = [
  `/fee-management/payments/${ID.payment}/receipt`, `/fee-management/payments/${ID.payment}/tax-invoice`,
  `/fee-management/ledger/${ID.student}/export`, `/finance-management/income/${ID.income}/receipt`,
  `/api/v1/files/${ID.file}`, `/staff-hr-management/files/${ID.file}`, `/admission-management/files/${ID.file}`,
  `/examination-results/report-cards/file/${ID.file}`, `/front-office/visitors/${ID.visitor}/pass`, `/hostel-management/outings/pass/${ID.pass}`,
  `/staff-hr-management/exit/${ID.exit}/letter`, `/inventory-management/purchases/orders/${ID.po}/pdf`, `/examination-results/datesheet/${ID.exam}/print`,
  `/student-management/students/${ID.student}`, `/staff-hr-management/${ID.staff}`,
  `/student-management/certificates/id-cards/print?ids=${ID.student}`, `/student-management/export?format=csv`,
];
async function check(p, who) {
  for (const u of urls) {
    const r = await p.context().request.get(BASE + u, { maxRedirects: 0 });
    const ct = r.headers()["content-type"] ?? "";
    const body = await r.text();
    const binary = /pdf|octet|image|spreadsheet|csv/.test(ct);
    const leak = (binary && r.status() === 200 && !/student-management\/export/.test(u)) || /Riya Bhat|Sunrise Public/.test(body.replace(/<script[\s\S]*?<\/script>/g, ""));
    const sunriseInCsv = /student-management\/export/.test(u) && /Riya Bhat|SPS\//.test(body);
    console.log(`${leak || sunriseInCsv ? "FAIL " : "PASS "} ${who.padEnd(12)} ${r.status()} ${ct.split(";")[0].padEnd(24)} ${u} ${r.headers().location ?? ""} ${body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 70)}`);
  }
}
let p = await as("cems.admin");
await check(p, "cems.admin");
await p.context().close();
p = await page();
await check(p, "signed-out");
await p.context().close();
await close();
