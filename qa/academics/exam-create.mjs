// Exam: the Exam In-charge creates a Grade 5 datesheet (Mathematics, Science, English), with validation, then publishes it.
import { mainText, shot, close, layoutIssues, VIEWPORTS } from "../lib.mjs";
import { res, login, open, messages, sleep, sql } from "./r.mjs";

const M = "Examination & Results", P = "Datesheet", R = "Exam In-charge";
const page = await login("cems.exam");
await open(page, "/examination-results/datesheet/new");
await page.getByRole("group", { name: "Class" }).getByRole("button", { name: "Grade 5", exact: true }).click().catch(async () => {
  await page.getByRole("group", { name: "Class" }).getByText("Grade 5", { exact: true }).click();
});
await sleep(1000);
// Save with nothing else: validation
await page.getByRole("button", { name: "Save as draft" }).click();
await sleep(1500);
let t = (await mainText(page, 6000)).replace(/\s+/g, " ");
res(M, P, "Save a datesheet with no title, type or term", R, "Plain errors under each field, nothing saved", (t.match(/Give the exam a title[^.]*\.|Choose the exam type\.|Choose the term\./g) ?? []).join(" | ") || t.slice(0, 200), /Give the exam a title/.test(t) ? "PASS" : "FAIL");
await page.getByLabel("Title").fill("Demo Unit Test 2 (QA)");
await page.getByLabel("Exam type").selectOption({ label: "Unit Test 2" });
await page.getByLabel("Term").selectOption({ label: "Term 2" });
await page.getByLabel("Start date").fill("2026-10-16");
await page.getByLabel("End date").fill("2026-10-17");
await sleep(800);
const dates = page.locator("input[type=date][aria-label$='exam date']");
const n = await dates.count();
const labels = [];
for (let i = 0; i < n; i++) labels.push(await dates.nth(i).getAttribute("aria-label"));
console.log("subject rows:", labels);
const plan = { Mathematics: ["2026-10-16", "50"], Science: ["2026-10-17", "50"], English: ["2026-10-16", "25"] };
for (const [subject, [date, max]] of Object.entries(plan)) {
  const lbl = labels.find((l) => l.startsWith(subject));
  if (!lbl) { console.log("no row for", subject); continue; }
  const base = lbl.replace(/ exam date$/, "");
  await page.getByLabel(lbl, { exact: true }).fill(date);
  await page.getByLabel(`${base} maximum marks`, { exact: true }).fill(max);
  if (subject === "English") await page.getByLabel(`${base} start time`, { exact: true }).selectOption({ label: "1:30 PM" }).catch((e) => console.log("time", e.message));
}
// Out-of-range date first: exam date after the end date
const eng = labels.find((l) => l.startsWith("English"));
await page.getByLabel(eng, { exact: true }).fill("2026-12-25");
await page.getByRole("button", { name: "Save as draft" }).click();
await sleep(2500);
t = (await mainText(page, 8000)).replace(/\s+/g, " ");
res(M, P, "Exam date outside the exam's start and end dates", R, "Refused in plain words", (await messages(page)).slice(0, 200) || t.slice(0, 200), page.url().endsWith("/new") ? "PASS" : "FAIL");
if (page.url().endsWith("/new")) {
  await page.getByLabel(eng, { exact: true }).fill("2026-10-16");
  await page.getByRole("button", { name: "Save as draft" }).click();
  await page.waitForURL(/datesheet\/[0-9a-f-]{36}/, { timeout: 30000 }).catch(() => {});
  await sleep(1500);
}
const m = await messages(page);
res(M, P, "Save Demo Unit Test 2 for Grade 5 (3 subjects)", R, "Saved as draft; papers created; others left out", m.slice(0, 250), /draft/i.test(m) ? "PASS" : "FAIL");
await shot(page, "exam-draft");
t = (await mainText(page, 4000)).replace(/\s+/g, " ");
console.log(t.slice(0, 1500));
console.log(sql("select e.title, e.status, count(p.*) papers from exam e left join datesheet_entry p on p.exam_id=e.id group by 1,2;"));
await close();
