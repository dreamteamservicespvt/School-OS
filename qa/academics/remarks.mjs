// Report card remarks (server actions on the base build): the class teacher writes remarks for
// Sahithi Gorle and Karthik Pydi; the class teacher cannot write the Principal's remark; a subject
// teacher of another section cannot write remarks; the Principal writes principal remarks; a
// remark over 500 characters is refused.
import { close } from "../lib.mjs";
import { res, login, sql, uuidOf } from "./r.mjs";
import { callAction } from "./action.mjs";

const M = "Examination & Results", P = "Report Cards (remarks)";
const G5A = "949e25d2-78bc-48aa-a6b6-7fd678175201";
const F = "src/app/(school)/examination-results/report-cards/actions.ts";
const exam = uuidOf(sql("select id from exam where title='Demo Unit Test 2 (QA)';"));
const period = `exam:${exam}`;
const sid = (n) => uuidOf(sql(`select s.id from student s join enrolment e on e.student_id=s.id where e.section_id='${G5A}' and e.archived_at is null and s.full_name='${n}';`));
const sah = sid("Sahithi Gorle"), kar = sid("Karthik Pydi");
const out = (r) => r.text.replace(/\s+/g, " ").slice(-220);

const ct = await login("cems.classteacher");
let r = await callAction(ct, F, "saveRemarksAction", [G5A, period, [
  { studentId: sah, classTeacherRemark: "Demo: Excellent work in every subject. Keep it up." },
  { studentId: kar, classTeacherRemark: "Demo: Needs regular practice in Maths, English and Science. Extra help planned." },
]]);
res(M, P, "Class teacher saves remarks for Sahithi and Karthik", "Class Teacher", "Saved", out(r), /"ok":true|saved/i.test(r.text) && !/"ok":false/.test(r.text) ? "PASS" : "FAIL");
r = await callAction(ct, F, "saveRemarksAction", [G5A, period, [{ studentId: sah, principalRemark: "Demo: forged principal remark" }]]);
res(M, P, "Class teacher writes the Principal's remark (crafted call)", "Class Teacher", "Refused", out(r), /"ok":false/.test(r.text) ? "PASS" : "FAIL");
r = await callAction(ct, F, "saveRemarksAction", [G5A, period, [{ studentId: sah, classTeacherRemark: "x".repeat(501) }]]);
res(M, P, "Remark of 501 characters (crafted call)", "Class Teacher", "Refused in plain words", out(r), /"ok":false/.test(r.text) ? "PASS" : "FAIL");
const te = await login("cems.teacher");
r = await callAction(te, F, "saveRemarksAction", [G5A, period, [{ studentId: sah, classTeacherRemark: "Demo: not my class" }]]);
res(M, P, "Subject teacher writes Grade 5 A class teacher remarks (crafted call)", "Teacher", "Refused", out(r), /"ok":false/.test(r.text) ? "PASS" : "FAIL");
const pr = await login("cems.principal");
r = await callAction(pr, F, "saveRemarksAction", [G5A, period, [{ studentId: sah, principalRemark: "Demo: Proud of you, Sahithi." }, { studentId: kar, principalRemark: "Demo: Meet me with your parents at the PTM." }]]);
res(M, P, "Principal writes principal remarks", "Principal", "Saved", out(r), !/"ok":false/.test(r.text) ? "PASS" : "FAIL");
console.log(sql(`select s.full_name, c.class_teacher_remark, c.principal_remark, c.status from report_card c join student s on s.id=c.student_id where c.period='${period}' and c.student_id in ('${sah}','${kar}');`));
await close();
