// Replays real, valid server action calls as roles that must NOT be allowed
// to make them, and checks the database did not change.
//   node qa/platform/replay.mjs
import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync } from "node:fs";
import { close } from "../lib.mjs";
import { as } from "./util.mjs";
import { callAction, words } from "./action-call.mjs";

const SCHOOL = "fbe1c0d0-cc45-4512-908c-70436e3fd47f";
const OWNER = process.env.QA_OWNER_URL; // the owner database URL, for read-only before/after counts
if (!OWNER) throw new Error("Set QA_OWNER_URL to the owner database URL (read-only counts).");
function count(sql) {
  const out = execFileSync("psql", [OWNER, "-At", "-c", "begin", "-c", `select set_config('app.school_id','${SCHOOL}',true)`, "-c", sql, "-c", "rollback"]).toString().trim().split("\n");
  return out[2];
}
const S = "src/app/(school)";
const IDS = { teacherRole: "215a895a-d487-4d5a-97a9-d8ab11ac0264", campus: "0d00db81-5336-42d0-8de3-7a19af14f397", head: "b12bf952-7e28-4f6c-88f9-a9676162aaa0", gateUser: "9c60e398-413e-4033-b728-c4be005a84c2", g5Aarav: "981866cc-45e3-4fc5-94a8-c82f9f745116" };

const cases = [
  { login: "cems.viceprincipal", label: "Settings: invite a new login", file: "settings/users/actions.ts", name: "inviteAction", args: [null, { __form: { displayName: "Demo Replay User", phone: "9000000101", email: "", username: "demo.replay1", scope: "WHOLE_SCHOOL", campusId: "", staffId: "", roleIds: [IDS.teacherRole] } }], sql: "select count(*) from user_login where username like 'demo.replay%'" },
  { login: "cems.hr", label: "Settings: invite a new login", file: "settings/users/actions.ts", name: "inviteAction", args: [null, { __form: { displayName: "Demo Replay User", phone: "9000000102", email: "", username: "demo.replay2", scope: "WHOLE_SCHOOL", campusId: "", staffId: "", roleIds: [IDS.teacherRole] } }], sql: "select count(*) from user_login where username like 'demo.replay%'" },
  { login: "cems.office", label: "Settings: disable the gate login", file: "settings/users/actions.ts", name: "disableAction", args: [IDS.gateUser], sql: "select status from user_login where username='cems.gate'" },
  { login: "cems.accountant", label: "Settings: switch Hostel off", file: "settings/modules/actions.ts", name: "moduleAction", args: ["hostel-management", false], sql: "select is_on from school_module where module_key='hostel-management'" },
  { login: "cems.viceprincipal", label: "Settings: switch Library off", file: "settings/modules/actions.ts", name: "moduleAction", args: ["library-management", false], sql: "select is_on from school_module where module_key='library-management'" },
  { login: "cems.accountant", label: "Settings: add a Razorpay account", file: "settings/payment-gateways/actions.ts", name: "saveGateway", args: [null, { __form: { provider: "RAZORPAY", label: "Demo replay", keyId: "rzp_test_demo000000", keySecret: "demo-secret-not-real", webhookSecret: "demo-hook", mode: "TEST" } }], sql: "select count(*) from payment_gateway_account" },
  { login: "cems.viceprincipal", label: "Settings: change the school name", file: "settings/school-profile/actions.ts", name: "saveDetailsAction", args: [null, { __form: { name: "Demo Hacked School", shortName: "DHS", address: "Demo", city: "Demo", state: "Andhra Pradesh", pinCode: "530001", phone: "9000000000", email: "demo@example.com", website: "", motto: "", affiliationNumber: "", gstin: "", brandColor: "#1f4fd1" } }], sql: "select name from school" },
  { login: "cems.teacher", label: "Finance: record an expense", file: "finance-management/expenses/actions.ts", name: "recordExpenseAction", args: [null, { __form: { amount: "500", date: "2026-10-16", accountHeadId: IDS.head, what: "Demo replay expense", mode: "CASH" } }], sql: "select count(*) from expense" },
  { login: "cems.hr", label: "Salary: open a month (HR has View only)", file: "salary-management/generate/actions.ts", name: "openMonthAction", args: [null, { __form: { month: "2026-10", campusId: IDS.campus } }], sql: "select count(*) from payroll_run" },
  { login: "cems.gate", label: "Students: change contact details (Gate has View)", file: "student-management/_actions/students.ts", name: "saveContactAction", args: [IDS.g5Aarav, null, { __form: { address: "Demo replay street", city: "", state: "", pinCode: "", permanentAddress: "", studentPhone: "", studentEmail: "" } }], sql: `select coalesce(address,'') from student where id='${IDS.g5Aarav}'` },
  { login: "cems.librarian", label: "Students: change contact details (Librarian has View)", file: "student-management/_actions/students.ts", name: "saveContactAction", args: [IDS.g5Aarav, null, { __form: { address: "Demo replay street", city: "", state: "", pinCode: "", permanentAddress: "", studentPhone: "", studentEmail: "" } }], sql: `select coalesce(address,'') from student where id='${IDS.g5Aarav}'` },
  { login: "cems.driver", label: "Dashboard: add a task (Driver has no Dashboard)", file: "dashboard/actions.ts", name: "saveTaskAction", args: [null, { __form: { title: "Demo replay task", assigneeId: "", dueOn: "", priority: "NORMAL", note: "" } }], sql: "select count(*) from task" },
  { login: "cems.store", label: "Communication: send a notice (Store Keeper has Own)", file: "communication/notices/actions.ts", name: "saveNoticeAction", args: [null, { __form: { title: "Demo replay notice", body: "Demo replay body text", audience: "ALL_PARENTS", intent: "publish" } }], sql: "select count(*) from notice" },
  { login: "cems.counsellor", label: "Front Office: register a visitor (Counsellor has none)", file: "front-office/actions.ts", name: "registerVisitorAction", args: [null, { __form: { name: "Demo Replay Visitor", phone: "9000000103", purpose: "Meeting", whomToMeet: "Office", count: "1" } }], sql: "select count(*) from visitor_entry" },
  { login: "cems.warden", label: "Academic: add a class (Warden has none)", file: "academic-management/class-actions.ts", name: "addClassAction", args: [null, { __form: { yearId: "00000000-0000-4000-8000-000000000000", name: "Demo Replay Class", position: "end", level: "", sections: "A", seats: "40", board: "" } }], sql: "select count(*) from school_class" },
];

mkdirSync("qa/results", { recursive: true });
const logins = new Map();
for (const c of cases.filter((c) => !process.env.ONLY || c.label.includes(process.env.ONLY))) {
  let p = logins.get(c.login);
  if (!p) { p = await as(c.login); logins.set(c.login, p); }
  const before = count(c.sql);
  const r = await callAction(p.context(), `${S}/${c.file}`, c.name, c.args);
  const after = count(c.sql);
  const w = words(r.text).replace(/\{"a":"\$@1"[^}]*\} ?/, "");
  const refused = /does not allow|Only |cannot|not allowed|No access|not one of your|digest/i.test(w) || /no-access/.test(r.redirect);
  const status = before === after && refused ? "PASS" : before !== after ? "FAIL" : "CHECK";
  console.log(`${status.padEnd(5)} ${c.login.padEnd(18)} ${c.label} | db ${before} -> ${after} | ${w.slice(0, 140)}`);
  c.result = { status, before, after, reply: w.slice(0, 200) };
}
for (const p of logins.values()) await p.context().close();
await close();
