// Verification: a student who joined Grade 5 A after Maths was submitted has no mark, so results
// cannot be published. The Exam In-charge sends the paper back; the class teacher adds the mark and
// sets Aditya Kumar to ML; resubmits; the Exam In-charge locks the exam. Then a locked mark is
// changed only through moderation with approval.
import { mainText, shot, close } from "../lib.mjs";
import { res, login, open, messages, sleep, sql, uuidOf } from "./r.mjs";

const M = "Examination & Results", P = "Marks verification";
const G5A = "949e25d2-78bc-48aa-a6b6-7fd678175201";
const maths = uuidOf(sql("select d.id from datesheet_entry d join exam e on e.id=d.exam_id join subject s on s.id=d.subject_id where e.title='Demo Unit Test 2 (QA)' and s.name='Mathematics';"));
const exam = uuidOf(sql("select id from exam where title='Demo Unit Test 2 (QA)';"));
const ex = await login("cems.exam");
await open(ex, `/examination-results/marks/${maths}/${G5A}`);
await ex.locator("button", { hasText: "Send back to teacher" }).click();
let dlg = ex.getByRole("dialog");
await dlg.getByLabel("Reason").fill("ok");
await dlg.getByRole("button", { name: "Send back" }).click();
await sleep(2000);
await sleep(500);
let out = (await dlg.isVisible().catch(() => false)) ? (await dlg.innerText()).replace(/\s+/g, " ") : "(closed)";
res(M, P, "Send back with a 2-letter reason", "Exam In-charge", "Refused: reason of at least 5 characters", out.slice(0, 160), /at least 5/.test(out) ? "PASS" : "FAIL");
await dlg.getByLabel("Reason").fill("Demo: a new student (Demo Varun Teja) joined; enter his mark. Aditya was on medical leave: mark ML.");
await dlg.getByRole("button", { name: "Send back" }).click();
await sleep(3000);
let m = await messages(ex);
res(M, P, "Send Maths Grade 5 A back to the teacher", "Exam In-charge", "Paper open again; teacher told why", m.slice(0, 160), /back/i.test(m) ? "PASS" : "FAIL");

const ct = await login("cems.classteacher");
await open(ct, `/examination-results/marks/${maths}/${G5A}`);
const newcomer = sql(`select s.full_name from student s join enrolment e on e.student_id=s.id where e.section_id='${G5A}' and e.archived_at is null and s.full_name like 'Demo%';`).split("\n")[2]?.trim();
for (const [n, v] of [[newcomer, "34"], ["Aditya Kumar", "ML"]]) {
  if (!n) continue;
  const c = ct.getByLabel(`Marks for ${n}, out of 50`);
  await c.fill(v); await c.press("Tab"); await sleep(400);
}
await sleep(3000);
await ct.getByRole("button", { name: "Submit marks" }).click();
await sleep(1200);
await ct.getByRole("dialog").getByRole("button", { name: /^Submit \d+ marks/ }).click();
await sleep(3000);
m = await messages(ct);
res(M, P, "Class teacher adds the newcomer's mark and Aditya ML, resubmits", "Class Teacher", "Submitted again", m.slice(0, 160), /submitted/i.test(m) ? "PASS" : "FAIL");
console.log(sql(`select s.full_name, m.total, m.absent, m.medical from marks m join student s on s.id=m.student_id where m.entry_id='${maths}' and s.full_name in ('Aditya Kumar','${newcomer}');`));

// Lock the whole exam
await open(ex, "/examination-results/marks");
await ex.getByRole("button", { name: "Lock submitted marks" }).first().click();
await sleep(600);
await ex.getByRole("dialog").getByRole("button", { name: "Lock marks" }).click();
await sleep(3000);
m = await messages(ex);
res(M, P, "Lock submitted marks of the exam", "Exam In-charge", "All 6 papers locked", m.slice(0, 160), /lock/i.test(m) ? "PASS" : "FAIL");
console.log(sql(`select status, count(*) from marks_paper p join datesheet_entry d on d.id=p.entry_id where d.exam_id='${exam}' group by 1;`));
await shot(ex, "marks-locked");
await close();
