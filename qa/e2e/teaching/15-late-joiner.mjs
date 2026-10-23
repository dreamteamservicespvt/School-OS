// A student joins Class 5 A after the Class Test marks were submitted (gap list G23): the School Admin adds
// the student; Marks Entry shows "Joined late"; the results show "Joined after this exam".
import { as, visit, text, report, shot, VIEWPORTS, sql, sleep, messages, SUNRISE } from "./h.mjs";
import { close } from "../../lib.mjs";

const NAME = "Tanvi Latejoin";
if (!process.env.SKIP_ADD) {
  const a = await as("admin", VIEWPORTS.laptop1280);
  await visit(a, "/student-management/new", 1500);
  await a.getByLabel("Full name").fill(NAME);
  const cs = a.getByLabel("Class and section");
  const opts = await cs.locator("option").allInnerTexts();
  console.log("class options:", opts.slice(0, 30));
  await cs.selectOption({ label: opts.find((o) => /Class 5 A|5 A/.test(o)) });
  await a.getByLabel("Date of birth").fill("2015-06-12");
  await a.getByText("Female", { exact: true }).click();
  await a.getByLabel("Admission date").fill("2026-10-18");
  const rel = a.getByLabel("Relation");
  if ((await rel.evaluate((e) => e.tagName)) === "SELECT") await rel.selectOption({ index: 1 }); else await rel.fill("Mother");
  await a.getByLabel("Parent's phone").fill("9876500118");
  await a.getByLabel("Parent's or guardian's name").fill("Sunita Latejoin");
  const fee = a.getByLabel(/Apply class fee plan/);
  if (await fee.isChecked().catch(() => false)) await fee.uncheck();
  await a.getByRole("button", { name: "Add student", exact: true }).click(); await sleep(4000);
  console.log("add ->", await messages(a), a.url());
  console.log(sql(`select s.id, s.full_name, e.section_id, e.created_at from student s join enrolment e on e.student_id=s.id where s.full_name='${NAME}'`));
}
const t = await as("teacher", VIEWPORTS.phone390);
await visit(t, "/examination-results/marks", 1500);
console.log("marks list:", (await text(t, 900)));
await t.getByRole("link", { name: /Mathematics · Class 5 A/ }).first().click(); await t.waitForLoadState("load"); await sleep(2000);
await t.getByRole("button", { name: "Grid" }).first().click().catch(() => {}); await sleep(1000);
console.log("\nmarks page:", (await text(t, 3000)));
await shot(t, "late-marks-phone", true);
await report(t, "late marks");
await close();
