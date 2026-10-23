// Workflow 9 steps 4 to 8: the student (Bhavya Bhat) hands in a photo on a phone; the teacher opens Submissions &
// Grading, gives a score above the maximum (refused), then a real score and feedback; bulk "Complete" with preview and undo.
import { as, visit, text, report, shot, VIEWPORTS, sql, sleep, messages, SUNRISE, OUT } from "./h.mjs";
import { close } from "../../lib.mjs";
import path from "node:path";

const HW = process.env.HW ?? "dd2720d9-0ad1-474d-aba3-322cf1c40a6f";
const TITLE = "QA: Exercise 5.1 Decimals, Q1-Q6";
if (!process.env.SKIP_STUDENT) {
  const s = await as("student", VIEWPORTS.phone390);
  await visit(s, "/homework-learning", 1500);
  const card = s.locator("li, article, div").filter({ hasText: TITLE }).filter({ has: s.getByRole("link", { name: "Submit" }).or(s.getByRole("button", { name: "Submit" })) }).last();
  await card.getByRole("link", { name: "Submit" }).or(card.getByRole("button", { name: "Submit" })).first().click(); await sleep(1500);
  console.log("hand-in form:", (await text(s, 1200)));
  const hand = s.getByRole("button", { name: /Hand in|Add a photo/ }).last();
  console.log("button before file:", await hand.innerText(), await hand.isEnabled());
  const file = s.locator("input[type=file]").first();
  await file.setInputFiles(path.join(OUT, "shots", "report-card-akshara-p1.png"));
  await sleep(1000);
  await s.getByLabel("Note to your teacher").fill("I could not do Q6").catch(() => {});
  await s.getByRole("button", { name: /^Hand in/ }).last().click(); await sleep(4000);
  console.log("hand in ->", await messages(s));
  console.log((await text(s, 800)));
  await report(s, "student hand in");
  await shot(s, "hw-student-handedin", false);
}
console.log("submissions:", sql(`select st.full_name, s.status, s.submitted_at is not null from submission s join student st on st.id=s.student_id where s.homework_id='${HW}' and st.full_name in ('Bhavya Bhat','Akshara Pillai')`));

const t = await as("teacher", VIEWPORTS.phone390);
await visit(t, `/homework-learning/submissions?hw=${HW}`, 1500);
console.log("\nteacher submissions:", (await text(t, 2500)));
await report(t, "submissions");
await shot(t, "hw-submissions-phone", true);
await close();
