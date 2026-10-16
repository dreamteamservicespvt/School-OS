// Salary run for October 2026: open → send → (accountant cannot approve own) → Principal approves → mark paid (double click) → Day Book.
//   node qa/money/19-payroll.mjs open|send|approve|pay
import { as, visit, sql, SCHOOL_A, result, mainText, shot } from "./m.mjs";
import { close } from "../lib.mjs";

const M = "Salary Management", P = "Generate Salary";
const step = process.argv[2];
const run = () => sql(`select id, status, staff_count, gross_paise, net_paise, deductions_paise, paid_on from payroll_run where school_id='${SCHOOL_A}' and month='2026-10-01'`)[0];
const pavan = () => sql(`select l.gross_paise, l.net_paise, l.pf_paise, l.esi_paise, l.cut_paise, l.lop_days, l.absent_days, l.not_marked_days from payroll_line l join staff s on s.id=l.staff_id where s.staff_code='CEMS-ST-009' and l.run_id='${run()?.[0]}'`)[0];
const dbk = () => sql(`select direction, amount_paise, date, section from day_book_entry where school_id='${SCHOOL_A}' and source_id='${run()?.[0]}'`);
const toast = async (page) => (await page.locator("[role=status], [role=alert]").allInnerTexts()).join(" ").replace(/\s+/g, " ").slice(0, 300);
const confirmIn = async (page, name) => { const d = page.getByRole("dialog").last(); await d.getByRole("button", { name }).click(); await page.waitForTimeout(6000); };

if (step === "open") {
  const page = await as("cems.accountant");
  await visit(page, "/salary-management/generate?do=open-month");
  const d = page.getByRole("dialog").last();
  await d.locator("select[name=month]").selectOption("2026-10").catch(() => {});
  await d.getByRole("button", { name: "Open month" }).click();
  await page.waitForTimeout(8000);
  const r = run();
  result({ module: M, page: P, action: "Open October 2026 and calculate", role: "accountant", expected: "Run calculated for staff with structures; library fine as a deduction", actual: `${await toast(page)} | run=${JSON.stringify(r)} | Pavan line=${JSON.stringify(pavan())}`, status: r?.[1] === "CALCULATED" ? "PASS" : "FAIL" });
  console.log((await mainText(page, 2500)).slice(0, 2500));
}
if (step === "send") {
  const page = await as("cems.accountant");
  await visit(page, "/salary-management/generate?do=send");
  await confirmIn(page, "Send for approval");
  result({ module: M, page: P, action: "Send October salary for approval", role: "accountant", expected: "Waiting for approval", actual: `${await toast(page)} | ${run()[1]}`, status: run()[1] === "WAITING" ? "PASS" : "FAIL" });
  await visit(page, "/salary-management/generate?do=approve");
  const t = await mainText(page, 3000);
  const can = await page.getByRole("button", { name: /^Approve salary/ }).count();
  result({ module: M, page: P, action: "Accountant (who sent it) tries to approve the October salary", role: "accountant", expected: "Not offered", actual: can ? "Approve offered" : `No approve button; ${(t.match(/Waiting for [^.\n]*/) ?? [""])[0]}`, status: can ? "FAIL" : "PASS" });
}
if (step === "approve") {
  const page = await as("cems.principal");
  await visit(page, "/salary-management/generate?do=approve");
  await confirmIn(page, /^Approve salary/);
  const slips = sql(`select count(*) from payslip where run_id='${run()[0]}'`)[0][0];
  const fine = sql(`select status, paid_how from library_fine where id='d315b868-4146-467e-bf8c-84b17d96bad3'`)[0];
  result({ module: M, page: P, action: "Principal approves October salary", role: "principal", expected: "Approved; slips made; not in Day Book yet; library fine paid by salary", actual: `${await toast(page)} | run=${run()[1]} slips=${slips} daybook=${dbk().length} fine=${fine}`, status: run()[1] === "APPROVED" && Number(slips) > 0 && dbk().length === 0 ? "PASS" : "FAIL" });
}
if (step === "pay") {
  const page = await as("cems.accountant");
  await visit(page, "/salary-management/generate?do=pay");
  const d = page.getByRole("dialog").last();
  await d.locator("input[name=reference]").fill("DEMOSALBATCH1026");
  await d.getByRole("button", { name: /^Mark paid/ }).dblclick();
  await page.waitForTimeout(7000);
  const b = dbk();
  await shot(page, "salary-paid");
  result({ module: M, page: P, action: "Mark October salary paid by bank transfer (double click)", role: "accountant", expected: "Paid; exactly one Day Book OUT for net pay", actual: `${await toast(page)} | run=${JSON.stringify(run())} daybook=${JSON.stringify(b)}`, status: run()[1] === "PAID" && b.length === 1 && b[0][1] === run()[4] ? "PASS" : "FAIL" });
}
await close();
