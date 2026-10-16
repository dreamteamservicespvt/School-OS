// Staff attendance effect on salary: Demo Pavan Seela marked Absent on 14 and 15 October (by hand, School Admin),
// then the October salary is recalculated by the Accountant and loss of pay checked.
import { as, visit, sql, SCHOOL_A, result } from "./m.mjs";
import { close } from "../lib.mjs";

const admin = await as("cems.admin");
for (const date of ["2026-10-14", "2026-10-15"]) {
  await visit(admin, `/attendance-management/staff?view=mark&date=${date}`);
  await admin.getByRole("searchbox", { name: "Search staff" }).fill("CEMS-ST-009");
  const btn = admin.getByRole("button", { name: /^Demo Pavan Seela:/ });
  for (let i = 0; i < 8; i++) {
    const label = await btn.getAttribute("aria-label");
    if (/: Absent\./.test(label)) break;
    await btn.click();
  }
  await admin.getByRole("button", { name: /^Save/ }).last().click();
  await admin.waitForTimeout(4000);
  console.log(date, (await admin.getByRole("alert").allInnerTexts()).join(" | ").slice(0, 200));
}
const acc = await as("cems.accountant");
const runId = sql(`select id from payroll_run where school_id='${SCHOOL_A}' and month='2026-10-01'`)[0][0];
await visit(acc, `/salary-management/generate?run=${runId}`);
await acc.getByRole("button", { name: /Work out again|Recalculate|Calculate/ }).first().click();
await acc.waitForTimeout(6000);
const l = sql(`select l.absent_days, l.lop_days, l.lop_paise, l.gross_paise, l.net_paise, l.days_in_month from payroll_line l join staff s on s.id=l.staff_id where s.staff_code='CEMS-ST-009' and l.run_id='${runId}'`)[0];
const expectLop = Math.round((2350000 * 2) / Number(l[5]));
result({ module: "Salary Management", page: "Generate Salary", action: "Mark Demo Pavan Seela absent 14 and 15 Oct, then work out October again", role: "admin + accountant", expected: `2 days loss of pay ≈ ₹${(expectLop / 100).toFixed(0)} (gross ₹23,500 × 2 / ${l[5]})`, actual: `absent=${l[0]} lop days=${l[1]} lop=₹${Number(l[2]) / 100} gross=₹${Number(l[3]) / 100} net=₹${Number(l[4]) / 100}`, status: Number(l[1]) === 2 && Math.abs(Number(l[2]) - expectLop) <= 100 ? "PASS" : "FAIL" });
await close();
