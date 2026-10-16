// Fills and submits one paper of Demo Unit Test 2 through the marks grid.
//   node qa/academics/marks-fill.mjs <login> <subject> <section A|B> <max>
// Sahithi Gorle gets full marks, Karthik Pydi low marks (fails), Diya Patel AB, others a spread.
import { close } from "../lib.mjs";
import { res, login, open, messages, sleep, sql, uuidOf } from "./r.mjs";

const [who, subject, sec, maxS] = process.argv.slice(2);
const max = Number(maxS);
const entry = uuidOf(sql(`select d.id from datesheet_entry d join exam e on e.id=d.exam_id join subject s on s.id=d.subject_id where e.title='Demo Unit Test 2 (QA)' and s.name='${subject}';`));
const section = uuidOf(sql(`select x.id from section x join school_class c on c.id=x.class_id where c.name='Grade 5' and x.name='${sec}' and x.academic_year_id='151ceaef-b5c1-4c94-a994-6eee097806af';`));
const names = sql(`select s.full_name from student s join enrolment e on e.student_id=s.id where e.section_id='${section}' and e.archived_at is null order by e.roll_no;`).split("\n").slice(2).map((x) => x.trim()).filter((x) => x && !/rows?\)$/.test(x));
const page = await login(who);
await open(page, `/examination-results/marks/${entry}/${section}`);
let i = 0;
for (const n of names) {
  i++;
  const value = n === "Sahithi Gorle" ? String(max) : n === "Karthik Pydi" ? String(Math.floor(max * 0.18)) : n === "Diya Patel" ? "AB" : String(Math.round(max * (0.5 + ((i * 37) % 45) / 100)));
  const cell = page.getByLabel(`Marks for ${n}, out of ${max}`);
  await cell.fill(value);
  await cell.press("Tab");
  await sleep(150);
}
await sleep(3000);
await page.getByRole("button", { name: "Submit marks" }).click();
await sleep(1500);
await page.getByRole("dialog").getByRole("button", { name: /^Submit \d+ marks/ }).click();
await sleep(3000);
const m = await messages(page);
res("Examination & Results", "Marks Entry", `Enter and submit ${subject} Grade 5 ${sec} (${names.length} students)`, who, "Submitted", m.slice(0, 160), /submitted/i.test(m) ? "PASS" : "FAIL");
await close();
