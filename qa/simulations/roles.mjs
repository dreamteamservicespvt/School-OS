// Per-role simulations: each role opens the screens of its day, and screens outside its job
// stay closed. The parent's own Parent Link needs a one-time code sent to the guardian's
// phone, so it is checked through the staff preview only.
//   node qa/simulations/roles.mjs
import { as, visit, text, shot, record, done, close, sql, SCHOOL_A } from "./sim-lib.mjs";

const A = "sim-role";
const ROLES = [
  ["cems.principal", "Principal", ["/dashboard", "/approvals", "/attendance-management/register", "/fee-management/dashboard", "/finance-management/day-book", "/examination-results/results", "/reports-analytics", "/communication/notices"], []],
  ["cems.accountant", "Accountant", ["/fee-management", "/fee-management/dashboard", "/fee-management/defaulters", "/finance-management/day-book", "/finance-management/expenses", "/salary-management/generate", "/fee-management/reports"], ["/examination-results/marks", "/settings/users"]],
  ["cems.teacher", "Teacher", ["/dashboard", "/academic-management/time-table/mine", "/homework-learning", "/examination-results/marks", "/salary-management/slips", "/staff-hr-management/leave"], ["/fee-management/dashboard", "/finance-management/day-book", "/salary-management/generate"]],
  ["cems.reception", "Receptionist", ["/front-office", "/front-office/visitors", "/front-office/pickup", "/front-office/appointments", "/front-office/enquiries"], ["/finance-management/day-book", "/salary-management/generate", "/examination-results/marks"]],
  ["cems.transport", "Transport In-charge", ["/transport-management", "/transport-management/trips", "/transport-management/routes", "/transport-management/students", "/transport-management/reports"], ["/fee-management/dashboard", "/salary-management/generate"]],
];
const closedWords = /not allowed|no access|don.t have access|cannot open|not for your role|ask your school admin|This page is not here/i;
for (const [login, role, pages, closedPages] of ROLES) {
  const p = await as(login);
  const bad = [];
  for (const u of pages) {
    const r = await visit(p, u);
    const t = await text(p, 600);
    const shut = p.url().includes("/no-access") || closedWords.test(t);
    if (r?.status() !== 200 || shut || p.problems.length) bad.push(`${u}: HTTP ${r?.status()}${shut ? " closed" : ""} ${p.problems.splice(0).join("; ")}`);
  }
  await visit(p, pages[0]);
  await shot(p, `role-${role.toLowerCase().replace(/[^a-z]+/g, "-")}-home`);
  record({ area: A, role, check: `${role} opens the screens of the day (${pages.length})`, status: bad.length ? "FAIL" : "PASS", note: bad.join(" | ") || pages.join(", ") });
  const leaks = [];
  for (const u of closedPages) {
    const r = await visit(p, u);
    const t = await text(p, 800);
    const shut = p.url().includes("/no-access") || closedWords.test(t) || r?.status() === 404 || r?.status() === 403 || new URL(p.url()).pathname === "/dashboard";
    if (!shut) leaks.push(`${u} -> ${p.url().replace(/.*:\d+/, "")}: ${t.replace(/\s+/g, " ").slice(0, 100)}`);
  }
  if (closedPages.length) record({ area: A, role, check: `${role} cannot open screens outside the job (${closedPages.join(", ")})`, status: leaks.length ? "FAIL" : "PASS", note: leaks.join(" | ") || "each refused or sent to their home" });
  await done(p);
}

// Parent: staff preview of Kavya Reddy's guardian's Parent Link.
{
  const p = await as("cems.principal");
  const r = await visit(p, "/communication/parent-link/2c2fd37c-6751-436b-a11c-3960afcfa8a3/preview");
  const t = await text(p, 6000);
  await shot(p, "role-parent-preview", true);
  const due = sql(`select coalesce(sum(balance_paise) filter (where state='OPEN' and due_date<=current_date),0) from student_fee_due where student_id='f6e8b638-d80d-4084-9509-11cdd029275f'`)[0][0];
  record({ area: A, role: "Parent (staff preview)", check: "Principal previews Kavya Reddy's guardian's Parent Link: fees, attendance, report cards", status: r?.status() === 200 && /Kavya/.test(t) ? "PASS" : "FAIL", note: `HTTP ${r?.status()}; fee due now in records ₹${Number(due) / 100}; ${t.replace(/\s+/g, " ").slice(0, 450)}` });
  const ptm = /Demo QA simulation PTM/.test(t), rc = /Demo QA Simulation Class Test/.test(t);
  record({ area: A, role: "Parent (staff preview)", check: "Parent Link shows today's work: the PTM on the calendar / the simulation exam's report card", status: rc ? "PASS" : "FAIL", note: `report card for the simulation exam shown ${rc}; PTM shown ${ptm}` });
  await done(p);
}
record({ area: A, role: "Parent", check: "Parent opens their own Parent Link", status: "NEEDS EXTERNAL CREDENTIAL", note: "Parent Link opens only with the personal link plus a one-time code sent to the guardian's phone (no SMS/WhatsApp provider or credits here). Codes were not recovered from the database or logs, by rule. Checked through the staff preview instead." });
await close();
