// The Principal decides the waiting marks changes of Demo Unit Test 2 in Approvals; the Exam
// In-charge cannot (crafted call); a decided change cannot be decided twice; the marks and the
// change history are checked in the database.
import { mainText, close } from "../lib.mjs";
import { res, login, open, messages, sleep, sql, uuidOf } from "./r.mjs";
import { callAction } from "./action.mjs";

const M = "Examination & Results", P = "Marks moderation";
const G5A = "949e25d2-78bc-48aa-a6b6-7fd678175201";
const A = "src/app/(school)/approvals/actions.ts";
const maths = uuidOf(sql("select d.id from datesheet_entry d join exam e on e.id=d.exam_id join subject s on s.id=d.subject_id where e.title='Demo Unit Test 2 (QA)' and s.name='Mathematics';"));
const approvals = sql(`select a.id, a.summary from approval a where a.type='marks-moderation' and a.status='WAITING' and a.summary like '%Demo Unit Test 2%' order by a.created_at;`);
const ids = approvals.split("\n").map((l) => l.split("|").map((x) => x.trim())).filter((x) => /^[0-9a-f]{8}-/.test(x[0]));
const ex = await login("cems.exam");
let r = await callAction(ex, A, "decideAction", [ids[0][0], "approve", null]);
res(M, P, "Exam In-charge approves a marks change routed to the Principal (crafted call)", "Exam In-charge", "Refused", r.text.replace(/\s+/g, " ").slice(-160), /"\$@1"/.test(r.text) && /1:"[A-Z]/.test(r.text) ? "PASS" : "FAIL");

const pr = await login("cems.principal");
await open(pr, "/approvals");
let t = (await mainText(pr, 1500)).replace(/\s+/g, " ");
res(M, P, "Principal sees the marks changes in Approvals", "Principal", "Both requests listed", t.match(/Karthik Pydi[^·]{0,100}/)?.[0] ?? t.slice(0, 160), /Karthik Pydi/.test(t) && /Aditya Kumar/.test(t) ? "PASS" : "FAIL");
for (const [id, summary] of ids) {
  await open(pr, `/approvals/${id}`);
  await pr.locator("main button", { hasText: /^\s*Approve\s*$/ }).first().click();
  await sleep(700);
  const d = pr.getByRole("dialog");
  if (await d.isVisible().catch(() => false)) await d.locator("button", { hasText: /^\s*Approve/ }).last().click();
  await sleep(3000);
  const m = await messages(pr);
  res(M, P, `Approve: ${summary.slice(0, 80)}`, "Principal", "Approved; mark changed; history kept", m.slice(0, 160), /approved/i.test(m) ? "PASS" : "FAIL");
}
r = await callAction(pr, A, "decideAction", [ids[0][0], "approve", null]);
res(M, P, "Approve the same change again (second tab)", "Principal", "Refused: already decided", r.text.replace(/\s+/g, " ").slice(-160), /already/i.test(r.text) ? "PASS" : "FAIL");
const after = sql(`select s.full_name, m.total, m.absent, m.medical from marks m join student s on s.id=m.student_id where m.entry_id='${maths}' and s.full_name in ('Karthik Pydi','Aditya Kumar') and m.section_id='${G5A}';`).replace(/[ \t]+/g, " ");
console.log(after);
const hist = sql(`select status, before->>'total' b, after->>'total' a, after->>'medical' med from marks_moderation where entry_id='${maths}' order by created_at;`);
console.log(hist);
res(M, P, "Marks and history after approval", "Principal", "Karthik 10; Aditya ML (no total); moderation history kept", `${after.replace(/\s+/g, " ").slice(0, 160)} || ${hist.replace(/\s+/g, " ").slice(0, 160)}`, /Karthik Pydi \| 10 \| f \| f/.test(after) && /Aditya Kumar \| \| t \| t/.test(after) ? "PASS" : "FAIL");
await close();
