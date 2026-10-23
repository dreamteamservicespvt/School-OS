// Permissions: a Teacher (subjectteacher = Prakash Kulkarni, class teacher of 5 B, Science in 6-10) opening Class 5 A's
// attendance, register, absent list, marks and homework by URL and by crafted server calls; the Class Teacher opening fees.
import { as, visit, text, VIEWPORTS, sql, sleep, shot, SUNRISE } from "./h.mjs";
import { close } from "../../lib.mjs";
process.env.QA_MANIFEST = "C:/Users/chala/Desktop/School-OS/.next/server/server-reference-manifest.json";
const { callAction, callFormAction } = await import("../../academics/action.mjs");

const S5A = "b07ca58e-2716-4729-ab56-3cdf783e5598", S5B = "107d3acf-e40c-45f6-bcaf-3ee1e1ec3e9c";
const ENTRY = "31218111-601c-49d2-b3b9-c8cbdf28bd7c"; // Class Test October QA, Mathematics, Class 5
const HW = "dd2720d9-0ad1-474d-aba3-322cf1c40a6f";
const ANANYA = sql(`select id from student where full_name='Ananya Verma' and school_id='${SUNRISE}'`)[0][0];
const st = await as("subjectteacher", VIEWPORTS.phone390);
const tests = [
  ["Take Attendance 5 A", `/attendance-management?section=${S5A}&date=2026-10-18`, /Ananya Verma|Bhavya Bhat/],
  ["Register 5 A", `/attendance-management/register?section=${S5A}`, /Ananya Verma|Akshara Pillai/],
  ["Absent list 18 Oct", `/attendance-management/register/absences?date=2026-10-18`, /Ananya Verma|Bhavya Bhat/],
  ["Correction for 5 A", `/attendance-management/register/correction?section=${S5A}&date=2026-10-16`, /Akshara Pillai/],
  ["Marks 5 A Maths (Ravi's paper)", `/examination-results/marks/${ENTRY}/${S5A}`, /Akshara Pillai/],
  ["Marks 5 B Maths (his own class, not his subject)", `/examination-results/marks/${ENTRY}/${S5B}`, /Marks \/ 20 open|Submit marks/],
  ["Results 5 A", `/examination-results/results?section=${S5A}&exam=648fbf69-345c-4543-aafe-1e9d75419866`, /Akshara Pillai|Meghana Nair/],
  ["Report cards 5 A", `/examination-results/report-cards?section=${S5A}`, /Akshara Pillai/],
  ["Homework submissions (Ravi's)", `/homework-learning/submissions?hw=${HW}`, /Akshara Pillai|Bhavya Bhat/],
  ["Student leave", `/attendance-management/student-leave?status=all`, /Kabir Sharma|Meghana Nair/],
  ["Early warnings", `/reports-analytics/early-warnings`, /Class 5 A/],
];
for (const [what, url, leak] of tests) {
  const r = await visit(st, url, 1200);
  const t = await text(st, 1500);
  console.log(`\n[${what}] ${r?.status()} -> ${st.url().replace("http://localhost:3000", "")}\n  ${t.slice(0, 260)}\n  LEAK=${leak.test(t)}`);
}
await shot(st, "perm-subjectteacher-last", false);
console.log("\nproblems:", st.problems);
// Crafted calls
let r = await callAction(st, "src/app/(school)/attendance-management/actions.ts", "saveSheet", [{ sectionId: S5A, date: "2026-10-18", periodNo: 0, entries: [{ studentId: ANANYA, statusKey: "present" }], clientId: "qa-perm-" + Date.now() }], "/attendance-management");
console.log("\ncrafted saveSheet 5 A:", r.status, r.text.slice(-220).replace(/\s+/g, " "));
console.log("Ananya mark now:", sql(`select status_key from attendance_mark where student_id='${ANANYA}' and date='2026-10-18' and archived_at is null`));
r = await callAction(st, "src/app/(school)/examination-results/marks/actions.ts", "saveMarksAction", [ENTRY, S5B, [{ studentId: sql(`select e.student_id from enrolment e where e.section_id='${S5B}' and e.archived_at is null limit 1`)[0][0], parts: { Marks: 19 }, absent: false }]], "/examination-results/marks");
console.log("crafted saveMarks 5 B Maths:", r.status, r.text.slice(-220).replace(/\s+/g, " "));
console.log("5 B maths marks:", sql(`select count(*) from marks where entry_id='${ENTRY}' and section_id='${S5B}'`));
r = await callFormAction(st, "src/app/(school)/attendance-management/register/actions.ts", "setAbsenceReasonAction", { studentId: ANANYA, date: "2026-10-18", reason: "travel", note: "" }, "/attendance-management/register/absences");
console.log("crafted absence reason 5 A:", r.status, r.text.slice(-220).replace(/\s+/g, " "));
console.log("Ananya reason now:", sql(`select absence_reason from attendance_mark where student_id='${ANANYA}' and date='2026-10-18' and archived_at is null`));
r = await callAction(st, "src/app/(school)/attendance-management/student-leave/actions.ts", "findStudents", ["Ananya"], "/attendance-management/student-leave");
console.log("crafted findStudents 'Ananya':", r.status, r.text.slice(-300).replace(/\s+/g, " "));
await st.context().close();

// The class teacher opens fee pages
const t = await as("teacher", VIEWPORTS.phone390);
for (const u of ["/fee-management", "/fee-management/collect", "/fee-management/defaulters", "/finance-management", "/salary-management/payroll"]) {
  const res = await visit(t, u, 1000);
  console.log(`\n[teacher ${u}] ${res?.status()} -> ${t.url().replace("http://localhost:3000", "")} | ${(await text(t, 300))}`);
}
console.log("problems:", t.problems);
await close();
