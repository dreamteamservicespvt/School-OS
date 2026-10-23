// Teacher grades on a phone: Bhavya's hand-in (score 25 of 20 refused, then 16 + feedback); bulk Complete with preview
// for three students who showed their notebooks in class; Undo.
import { as, visit, text, report, shot, VIEWPORTS, sql, sleep, messages } from "./h.mjs";
import { close } from "../../lib.mjs";

const HW = "dd2720d9-0ad1-474d-aba3-322cf1c40a6f";
const t = await as("teacher", VIEWPORTS.phone390);
await visit(t, `/homework-learning/submissions?hw=${HW}`, 1500);
await t.locator(":text(\"Bhavya Bhat\"):visible").first().click(); await sleep(1500);
console.log("url:", t.url());
let d = t.getByRole("dialog");
console.log("detail:", (await d.innerText().catch(() => "no dialog")).replace(/\s+/g, " ").slice(0, 900));
await shot(t, "hw-grade-detail", false);
const grade = d.getByRole("link", { name: /Grade|Check|Give marks|Mark/ }).or(d.getByRole("button", { name: /Grade|Check|Give marks/ })).first();
if (await grade.count()) { console.log("grade control:", await grade.innerText()); await grade.click(); await sleep(1500); d = t.getByRole("dialog"); }
console.log("grade sheet:", (await d.innerText().catch(() => "no dialog")).replace(/\s+/g, " ").slice(0, 900));
const score = t.locator("#gr-score");
if (await score.count()) {
  await score.fill("25"); await sleep(500);
  console.log("25 ->", (await d.innerText()).match(/(Out of|too high|from 0)[^.]*\./gi));
  console.log("Save enabled with 25:", await d.getByRole("button", { name: /^Save/ }).isEnabled());
  console.log("db after 25:", sql(`select s.status, s.score from submission s join student st on st.id=s.student_id where s.homework_id='${HW}' and st.full_name='Bhavya Bhat'`));
  await score.fill("16");
  await t.locator("#gr-fb").fill("Good work. Q6: line up the decimal points before adding.").catch(async () => { await d.locator("textarea").first().fill("Good work. Q6: line up the decimal points."); });
  await shot(t, "hw-grade-sheet", false);
  await d.getByRole("button", { name: /^Save/ }).click(); await sleep(2500);
  console.log("save 16 ->", await messages(t));
}
console.log("db:", sql(`select st.full_name, s.status, s.check_result, s.score, s.grade, left(s.feedback,40) from submission s join student st on st.id=s.student_id where s.homework_id='${HW}' and st.full_name='Bhavya Bhat'`));
// Bulk: select three students, Mark Complete
await visit(t, `/homework-learning/submissions?hw=${HW}`, 1500);
for (const n of ["Akshara Pillai", "Ayaan Iyer", "Dhruv Bhat"]) await t.locator(`input[type=checkbox][aria-label="Select ${n}"]:visible`).first().check();
await sleep(500);
await t.getByRole("link", { name: /Mark Complete/ }).or(t.getByRole("button", { name: /Mark Complete/ })).first().click(); await sleep(1500);
d = t.getByRole("dialog");
console.log("bulk preview:", (await d.innerText().catch(() => "none")).replace(/\s+/g, " ").slice(0, 700));
await shot(t, "hw-bulk-preview", false);
await d.getByRole("button", { name: /^Mark \d+ Complete/ }).click(); await sleep(3000);
console.log("bulk ->", await messages(t));
console.log("db bulk:", sql(`select st.full_name, s.status, s.check_result from submission s join student st on st.id=s.student_id where s.homework_id='${HW}' and st.full_name in ('Akshara Pillai','Ayaan Iyer','Dhruv Bhat')`));
const undo = t.getByRole("button", { name: /Undo/ });
console.log("undo visible:", await undo.count());
if (await undo.count()) { await undo.first().click(); await sleep(3000); console.log("undo ->", await messages(t)); }
console.log("db after undo:", sql(`select st.full_name, s.status, s.check_result from submission s join student st on st.id=s.student_id where s.homework_id='${HW}' and st.full_name in ('Akshara Pillai','Ayaan Iyer','Dhruv Bhat')`));
await report(t, "after bulk");
await close();
