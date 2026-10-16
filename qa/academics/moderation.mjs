// Marks moderation after lock: the class teacher asks to change Karthik Pydi 9 -> 10 (totalling
// error) and Aditya Kumar AB -> ML; a short reason and an unchanged mark are refused; another
// teacher cannot ask; a second request while one waits is refused; the class teacher cannot approve
// their own request; the Exam In-charge approves; a decided request cannot be decided twice.
import { mainText, close } from "../lib.mjs";
import { res, login, open, messages, sleep, sql, uuidOf } from "./r.mjs";
import { callAction, callFormAction } from "./action.mjs";

const M = "Examination & Results", P = "Marks moderation";
const G5A = "949e25d2-78bc-48aa-a6b6-7fd678175201";
const F = "src/app/(school)/examination-results/marks/actions.ts";
const A = "src/app/(school)/approvals/actions.ts";
const maths = uuidOf(sql("select d.id from datesheet_entry d join exam e on e.id=d.exam_id join subject s on s.id=d.subject_id where e.title='Demo Unit Test 2 (QA)' and s.name='Mathematics';"));
const sid = (n) => uuidOf(sql(`select s.id from student s join enrolment e on e.student_id=s.id where e.section_id='${G5A}' and e.archived_at is null and s.full_name='${n}';`));
const karthik = sid("Karthik Pydi"), aditya = sid("Aditya Kumar");
const msg = (r) => r.text.match(/"message":"[^"]*"/)?.[0] ?? r.text.replace(/\s+/g, " ").slice(-200);

const ct = await login("cems.classteacher");
await open(ct, `/examination-results/marks/${maths}/${G5A}`);
// UI: Karthik's locked cell -> Ask for a mark change
await ct.locator(`button[aria-label^="Karthik Pydi: 9."]`).click();
let sheet = ct.getByRole("dialog");
await sheet.locator('input[name="part:Marks"]').fill("10");
let t;
if (!process.env.SKIP_START) {
await sheet.locator('textarea[name="reason"]').fill("typo");
await sheet.getByRole("button", { name: "Send for approval" }).click();
await sleep(2500);
t = (await sheet.innerText().catch(() => "(closed)")).replace(/\s+/g, " ");
res(M, P, "Ask for a change with a 4-letter reason", "Class Teacher", "Refused: reason of at least 5 characters", t.match(/Give a reason[^.]*\./)?.[0] ?? t.slice(0, 160), /at least 5/.test(t) ? "PASS" : "FAIL");
await sheet.locator('input[name="part:Marks"]').fill("9");
await sheet.locator('textarea[name="reason"]').fill("Demo: checking again");
await sheet.getByRole("button", { name: "Send for approval" }).click();
await sleep(2500);
t = (await sheet.innerText().catch(() => "(closed)")).replace(/\s+/g, " ");
res(M, P, "Ask for a change to the same mark (9 -> 9)", "Class Teacher", "Refused: same as the old marks", t.match(/The new marks[^.]*\./)?.[0] ?? t.slice(0, 160), /same as the old/.test(t) ? "PASS" : "FAIL");
}
await sheet.locator('input[name="part:Marks"]').fill("10");
await sheet.locator("button", { hasText: "Totalling error" }).click();
await sheet.getByRole("button", { name: "Send for approval" }).click();
await sleep(3000);
let m = await messages(ct);
res(M, P, "Ask to change Karthik Pydi 9 -> 10 (Totalling error)", "Class Teacher", "Sent for approval; old mark stays", m.slice(0, 160), /Change requested|approval/i.test(m) ? "PASS" : "FAIL");

// Aditya AB -> ML through the request (works in the base build: requestChangeAction keeps medical)
let r = await callFormAction(ct, F, "requestChangeAction", { entryId: maths, sectionId: G5A, studentId: aditya, medical: "on", reason: "Demo: Aditya was on approved medical leave on the exam day." });
res(M, P, "Ask to change Aditya Kumar AB -> ML (medical leave)", "Class Teacher", "Sent for approval", msg(r), /Change requested/.test(r.text) ? "PASS" : "FAIL");
r = await callFormAction(ct, F, "requestChangeAction", { entryId: maths, sectionId: G5A, studentId: karthik, "part:Marks": "11", reason: "Demo: second request" });
res(M, P, "Second request for Karthik while one waits (crafted call)", "Class Teacher", "Refused: already waiting", msg(r), /already waiting/.test(r.text) ? "PASS" : "FAIL");
const teacher = await login("cems.teacher");
r = await callFormAction(teacher, F, "requestChangeAction", { entryId: maths, sectionId: G5A, studentId: karthik, "part:Marks": "45", reason: "Demo: not my subject" });
res(M, P, "Science teacher asks to change a Maths mark (crafted call)", "Teacher (Science)", "Refused: does not teach Maths in 5 A", msg(r), /do not teach/.test(r.text) ? "PASS" : "FAIL");

const approvals = sql(`select a.id, a.summary from approval a where a.type='marks-moderation' and a.status='WAITING' and a.summary like '%Demo Unit Test 2%' order by a.created_at;`);
const ids = approvals.split("\n").map((l) => l.split("|").map((x) => x.trim())).filter((x) => /^[0-9a-f]{8}-/.test(x[0]));
console.log(approvals);
for (const [id] of ids) {
  r = await callAction(ct, A, "decideAction", [id, "approve", null]);
  res(M, P, "Class teacher approves own mark change (crafted call)", "Class Teacher", "Refused", r.text.replace(/\s+/g, " ").slice(-160), /approved/i.test(r.text) && !/cannot|not allowed|only/i.test(r.text) ? "FAIL" : "PASS");
  break;
}
const ex = await login("cems.exam");
await open(ex, "/approvals");
t = (await mainText(ex, 1500)).replace(/\s+/g, " ");
res(M, P, "Exam In-charge sees the mark changes in Approvals", "Exam In-charge", "Both requests listed", t.match(/Karthik Pydi[^·]{0,120}/)?.[0] ?? t.slice(0, 160), /Karthik Pydi/.test(t) && /Aditya Kumar/.test(t) ? "PASS" : "FAIL");
for (const [id, summary] of ids) {
  await open(ex, `/approvals/${id}`);
  await ex.locator("main button", { hasText: /^\s*Approve\s*$/ }).first().click();
  await sleep(600);
  const d = ex.getByRole("dialog");
  if (await d.isVisible().catch(() => false)) await d.getByRole("button", { name: /^Approve/ }).last().click();
  await sleep(3000);
  m = await messages(ex);
  res(M, P, `Approve: ${summary.slice(0, 70)}`, "Exam In-charge", "Approved; mark changed; history kept", m.slice(0, 160), /approved/i.test(m) ? "PASS" : "FAIL");
}
if (ids[0]) {
  r = await callAction(ex, A, "decideAction", [ids[0][0], "approve", null]);
  res(M, P, "Approve the same change again (second tab)", "Exam In-charge", "Refused: already decided", r.text.replace(/\s+/g, " ").slice(-160), /already/i.test(r.text) ? "PASS" : "FAIL");
}
const after = sql(`select s.full_name, m.total, m.absent, m.medical from marks m join student s on s.id=m.student_id where m.entry_id='${maths}' and m.student_id in ('${karthik}','${aditya}');`).replace(/[ \t]+/g, " ");
console.log(after);
res(M, P, "Database after approval", "Exam In-charge", "Karthik 10; Aditya ML (medical, no total)", after.replace(/\s+/g, " ").slice(0, 200), /Karthik Pydi \| 10 \| f \| f/.test(after) && /Aditya Kumar \| \| t \| t/.test(after) ? "PASS" : "FAIL");
await close();
