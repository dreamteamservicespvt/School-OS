// Workflow 8 step 7 on a phone: the Mathematics teacher enters Class Test October QA marks for Class 5 A.
// A: "One at a time" number keys: 25 (above 20), half marks, AB. B: Grid: letters, negative, comma, blank.
// Then fills all, one absent, submits.
import { as, visit, text, report, shot, VIEWPORTS, sql, sleep, messages } from "./h.mjs";
import { close } from "../../lib.mjs";

const SEC = process.env.SEC_NAME ?? "Class 5 A";
const vp = process.env.VP ?? "phone390";
const t = await as("teacher", VIEWPORTS[vp]);
await visit(t, "/examination-results/marks", 1500);
await t.getByRole("link", { name: new RegExp(`Mathematics · ${SEC}`) }).first().click();
await t.waitForLoadState("load"); await sleep(2000);
console.log("url:", t.url());
const keys = t.getByRole("group", { name: "Number keys" });
const press = async (...k) => { for (const x of k) { await (x === "del" ? t.getByRole("button", { name: "Delete last digit" }) : x === ".5" ? t.getByRole("button", { name: "Add a half mark" }) : keys.getByRole("button", { name: x, exact: true })).click(); await sleep(150); } };
const box = async () => (await t.locator("main").innerText()).match(/Marks \/ 20\s*\n?\s*([^\n]*)/)?.[1];
if (await keys.count()) {
  // Is the number pad visible without scrolling, and not under the fixed bars?
  const r = await keys.boundingBox();
  console.log("keypad box:", r, "viewport", t.viewportSize());
  await keys.scrollIntoViewIfNeeded();
  await shot(t, `marks-${vp}-keypad-view`, false);
  await press("2", "5"); await sleep(600);
  console.log("pressed 2,5 ->", JSON.stringify(await box()), "|", await messages(t));
  console.log((await text(t, 3000)).match(/(maximum|out of|too high|between)[^.]*\./gi));
  await shot(t, `marks-${vp}-25`, false);
  await t.getByRole("button", { name: "Clear", exact: true }).click();
  await press("7", ".5"); await sleep(400);
  console.log("7 + half ->", JSON.stringify(await box()));
  await t.getByRole("button", { name: /^Next/ }).click(); await sleep(600);
  await press("AB"); await sleep(400);
  console.log("AB for student 2 ->", (await text(t, 3000)).match(/Ananya Verma[^]{0,120}/)?.[0]);
  await t.getByRole("button", { name: /^Next/ }).click(); await sleep(600);
  await t.getByRole("button", { name: /Save now/ }).click().catch(() => {}); await sleep(2500);
  console.log("save now ->", await messages(t));
}
// B: Grid
await t.getByRole("button", { name: "Grid" }).or(t.getByRole("tab", { name: "Grid" })).or(t.getByRole("radio", { name: "Grid" })).first().click(); await sleep(1500);
await report(t, "grid on phone");
await shot(t, `marks-${vp}-grid`, true);
const cells = t.locator("input[aria-label^='Marks for ']");
const n = await cells.count();
console.log("grid cells:", n);
const cell = (i) => cells.nth(i);
for (const [v, why] of [["25", "above max"], ["abc", "letters"], ["-3", "negative"], ["1,5", "comma"], ["7.25", "quarter"], ["20.0", "max with decimal"]]) {
  await cell(2).fill(v); await cell(2).press("Tab"); await sleep(900);
  console.log(`grid typed ${v} (${why}) -> shows "${await cell(2).inputValue()}" invalid=${await cell(2).getAttribute("aria-invalid")} title=${await cell(2).getAttribute("title")} | ${await messages(t)}`);
}
await shot(t, `marks-${vp}-grid-bad`, false);
for (let i = 2; i < n; i++) {
  if (i === 4) { await cell(i).fill(""); continue; }
  await cell(i).fill(String(8 + (i * 3) % 13)); await cell(i).press("Tab");
}
await sleep(3000);
await t.getByRole("button", { name: "Submit marks" }).click(); await sleep(1500);
console.log("submit with a blank ->", await messages(t));
await shot(t, `marks-${vp}-blank`, false);
await cell(4).fill("15"); await cell(4).press("Tab"); await sleep(3000);
await t.getByRole("button", { name: "Submit marks" }).click(); await sleep(1500);
const sheet = t.getByRole("dialog");
console.log("confirm:", (await sheet.innerText().catch(() => "none")).replace(/\s+/g, " ").slice(0, 500));
await sheet.getByRole("button", { name: /^Submit \d+ marks/ }).click(); await sleep(3500);
console.log("after submit:", await messages(t));
console.log((await text(t, 1500)));
console.log("db:", sql(`select s.full_name, m.parts::text, m.total::text, m.grade, m.absent from marks m join student s on s.id=m.student_id join datesheet_entry d on d.id=m.entry_id join exam e on e.id=d.exam_id where e.title='Class Test October QA' order by s.full_name limit 5`));
console.log("paper:", sql(`select p.status, p.submitted_at from marks_paper p join datesheet_entry d on d.id=p.entry_id join exam e on e.id=d.exam_id where e.title='Class Test October QA'`));
console.log("problems:", t.problems);
await close();
