// Server actions called directly (no screen), signed in as a role that must be refused.
// Action ids come from the running build's server-reference manifest. Nothing may change (checked by SQL).
import { as, sql, SCHOOL_A, result, BASE } from "./m.mjs";
import { close } from "../lib.mjs";
import { readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync(process.env.QA_MANIFEST ?? "/home/claude/school-os/.next/server/server-reference-manifest.json", "utf8")).node;
const idOf = (file, name) => Object.entries(manifest).find(([, v]) => v.filename.endsWith(file) && v.exportedName === name)?.[0];
const pages = {};

/** Calls a server action like the browser does: Next-Action header and a React reply body. */
async function call(login, path, file, name, args, fields = {}) {
  pages[login] ??= await as(login);
  const id = idOf(file, name);
  if (!id) throw new Error(`no action ${file} ${name}`);
  // Fields first and the root "0" last: React reads the field names when it decodes the root.
  const multipart = new FormData();
  for (const [k, v] of Object.entries(fields)) multipart.append(`_1_${k}`, v);
  multipart.append("0", JSON.stringify(args));
  const r = await pages[login].request.post(`${BASE}${path}`, { headers: { "Next-Action": id, Accept: "text/x-component" }, multipart, maxRedirects: 0, timeout: 300000 });
  const text = (await r.text()).replace(/\s+/g, " ");
  const msg = text.match(/"message":"([^"]*)"/)?.[1] ?? text.slice(-200);
  return { status: r.status(), msg };
}
const FD = ["$undefined", "$K1"]; // (prevState, formData)
const n = (q) => sql(q)[0][0];
const STU = "c2435b36-c0e6-4703-89ba-e80d86add96e"; // Vihaan Rao (Demo)

const cases = [
  ["cems.accountant", "Student Management", "Edit a student's personal details", `/student-management/students/${STU}/edit/personal`, "student-management/_actions/students.ts", "savePersonalAction", [STU, "$undefined", "$K1"], { fullName: "QAHACK Rao", gender: "MALE", dateOfBirth: "2015-05-05" }, `select full_name from student where id='${STU}'`],
  ["cems.accountant", "Academic Management", "Add a subject", "/academic-management/subjects", "academic-management/subjects/actions.ts", "addSubjectAction", FD, { name: "QA Hack Subject", code: "QAH1", type: "CORE", periodsPerWeek: "4", fromDate: "2026-10-16" }, `select count(*) from subject where school_id='${SCHOOL_A}' and name='QA Hack Subject'`],
  ["cems.accountant", "Staff & HR Management", "Add a staff member", "/staff-hr-management/add", "staff-hr-management/add/actions.ts", "createStaffAction", FD, { firstName: "QAHack", lastName: "Staff", fullName: "QAHack Staff", designation: "Teacher", mobile: "9000000001", joiningDate: "2026-10-16" }, `select count(*) from staff where school_id='${SCHOOL_A}' and full_name like 'QAHack%'`],
  ["cems.accountant", "Settings", "Change the school's details", "/settings/school-profile", "settings/school-profile/actions.ts", "saveDetailsAction", FD, { name: "Chaitanya EM School — QA Demo", address: "Chekkapalli, Andhra Pradesh", phone: "9000000002", email: "chaitanyaemschool27@gmail.com", website: "", affiliationNumber: "", gstin: "", brandColor: "" }, `select coalesce(phone,'(none)') from school where id='${SCHOOL_A}'`],
  ["cems.accountant", "Attendance Management", "Save a staff attendance day", "/attendance-management/staff?view=mark", "attendance-management/staff/actions.ts", "saveStaffDay", [{ date: "2026-10-16", entries: [{ staffId: "ce3e4363-72ee-4875-a9de-fde29295ff22", statusKey: "absent", inTime: null, outTime: null, note: "qa" }] }], {}, `select count(*) from attendance_mark where school_id='${SCHOOL_A}' and note='qa'`],
  ["cems.teacher", "Fee Management", "Collect a fee", `/fee-management/collect/${STU}`, "fee-management/collect/[studentId]/actions.ts", "collectFee", FD, { studentId: STU, mode: "CASH", amount: "100" }, `select count(*) from payment where school_id='${SCHOOL_A}' and student_id='${STU}'`],
  ["cems.classteacher", "Fee Management", "Collect a fee", `/fee-management/collect/${STU}`, "fee-management/collect/[studentId]/actions.ts", "collectFee", FD, { studentId: STU, mode: "CASH", amount: "100" }, `select count(*) from payment where school_id='${SCHOOL_A}' and student_id='${STU}'`],
  ["cems.teacher", "Finance Management", "Record an expense", "/finance-management/expenses", "finance-management/expenses/actions.ts", "recordExpenseAction", FD, { amount: "100", date: "2026-10-16", what: "QA hack expense", accountHeadId: n(`select id from account_head where school_id='${SCHOOL_A}' and name='Stationery'`), paid: "on", mode: "CASH" }, `select count(*) from expense where school_id='${SCHOOL_A}' and note='QA hack expense'`],
  ["cems.classteacher", "Finance Management", "Record income", "/finance-management/income", "finance-management/income/actions.ts", "recordIncomeAction", FD, { amount: "100", date: "2026-10-16", receivedFrom: "QA hack", accountHeadId: n(`select id from account_head where school_id='${SCHOOL_A}' and name='Hall rent'`), post: "on", mode: "CASH" }, `select count(*) from income where school_id='${SCHOOL_A}' and received_from='QA hack'`],
  ["cems.classteacher", "Finance Management", "Mark an approved expense paid", "/finance-management/expenses", "finance-management/expenses/actions.ts", "payExpenseAction", FD, { expenseId: n(`select id from expense where school_id='${SCHOOL_A}' and number='EXP/2026-27/00002'`), date: "2026-10-16", mode: "CASH" }, `select paid_paise from expense where school_id='${SCHOOL_A}' and number='EXP/2026-27/00002'`],
  ["cems.accountant", "Salary Management", "Approve own salary run (already paid month)", "/salary-management/generate", "salary-management/generate/actions.ts", "decideRunAction", FD, { runId: n(`select id from payroll_run where school_id='${SCHOOL_A}' and month='2026-10-01'`), decision: "approve" }, `select status from payroll_run where school_id='${SCHOOL_A}' and month='2026-10-01'`],
];
for (const [login, M, what, path, file, name, args, fields, check] of cases) {
  const before = n(check);
  const r = await call(login, path, file, name, args, fields);
  const after = n(check);
  const changed = before !== after;
  result({ module: M, page: `${name} (called directly)`, action: `${what} by calling the server action directly`, role: login.replace(/^\w+\./, ""), expected: "Refused in plain words; nothing changes", actual: `HTTP ${r.status}: ${r.msg.slice(0, 160)} | before=${before} after=${after}`, status: changed ? "FAIL" : "PASS" });
}
// Control: the same way of calling works for a role that is allowed (accountant, empty amount → field error).
const ctl = await call("cems.accountant", "/finance-management/expenses", "finance-management/expenses/actions.ts", "recordExpenseAction", FD, { amount: "250", date: "2026-10-16", what: "x" });
result({ module: "Finance Management", page: "recordExpenseAction (called directly)", action: "Control: allowed role, amount and date sent, no expense head", role: "accountant", expected: "Reaches the action, reads the fields and asks for the head (proves the calls above carried their fields)", actual: `HTTP ${ctl.status}: ${ctl.msg.slice(0, 160)}`, status: /head/i.test(ctl.msg) ? "PASS" : "FAIL" });
await close();
