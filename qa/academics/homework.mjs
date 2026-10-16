// Homework: the class teacher (Maths, Grade 5 A) gives "Demo: Maths Exercise 4.3" with an empty
// title first (refused), then for real (due 20-10-2026, out of 10, online submission). Crafted
// calls: a past due date, and the Science teacher giving Maths homework to 5 A.
import { mainText, shot, close, layoutIssues, VIEWPORTS } from "../lib.mjs";
import { res, login, open, messages, sleep, sql, uuidOf } from "./r.mjs";
import { callFormAction } from "./action.mjs";

const M = "Homework & Learning", P = "Homework", R = "Class Teacher (Maths)";
const G5A = "949e25d2-78bc-48aa-a6b6-7fd678175201";
const F = "src/app/(school)/homework-learning/actions.ts";
const maths = uuidOf(sql("select id from subject where name='Mathematics' and archived_at is null limit 1;"));
const msg = (r) => r.text.match(/"message":"[^"]*"/)?.[0] ?? r.text.replace(/\s+/g, " ").slice(-200);

const ct = await login("cems.classteacher");
await open(ct, "/homework-learning?do=give");
let sheet = ct.locator("dialog[open]").last();
let t = (await sheet.innerText()).replace(/\s+/g, " ");
console.log(t.slice(0, 600));
// pick Grade 5 A
const radio = sheet.locator('[role="radio"]', { hasText: "5 A" });
if (await radio.count()) await radio.first().click();
else await sheet.locator("#gh-class").selectOption({ label: /5 A/ }).catch(() => {});
await sheet.locator("button", { hasText: /^Send to/ }).click();
await sleep(1500);
t = (await sheet.innerText().catch(() => "")).replace(/\s+/g, " ");
const v = await sheet.locator('[name="title"]').evaluate((e) => e.validationMessage).catch(() => "");
res(M, P, "Give homework with no title", R, "Refused: title needed", (t.match(/[^.]*[Tt]itle[^.]*\./)?.[0] ?? "") + ` ${v}`, /title/i.test(t + v) ? "PASS" : "FAIL");
await sheet.locator('[name="title"]').fill("Demo: Maths Exercise 4.3, Q1 to Q8");
await sheet.locator('[name="instructions"]').fill("Demo: Do the sums in your notebook and hand in a photo.");
await sheet.locator('[role="radio"], button', { hasText: "Pick a date" }).first().click();
await sheet.locator("#gh-due").fill("2026-10-20");
await sheet.locator("button", { hasText: "More details" }).click();
await sheet.locator("#gh-max").fill("10");
const sw = sheet.locator("#gh-online");
if ((await sw.getAttribute("aria-checked")) !== "true") await sw.click();
await sheet.locator("button", { hasText: /^Send to/ }).click();
await sleep(3500);
const m = await messages(ct);
const hw = sql("select id, title, due_date, max_marks, online_submission from homework where title like 'Demo: Maths Exercise 4.3%' and archived_at is null;");
console.log(hw);
res(M, P, "Give homework to Grade 5 A (due 20-10-2026, out of 10, online)", R, "Sent; students and parents told only by working channels", `${m.slice(0, 200)} || ${hw.replace(/\s+/g, " ").slice(0, 200)}`, /Homework sent/.test(m) && /4\.3/.test(hw) ? "PASS" : "FAIL");
res(M, P, "Message after giving homework (no WhatsApp connected)", R, "Does not claim parents get it on WhatsApp", m.slice(0, 200), /parents get it on WhatsApp/.test(m) ? "FAIL" : "PASS", /parents get it on WhatsApp/.test(m) ? "ACADEMICS-16" : undefined);

let r = await callFormAction(ct, F, "giveHomeworkAction", { sectionId: G5A, subjectId: maths, title: "Demo: past due", startDate: "2026-10-01", dueDate: "2026-10-10", due: "pick", givenTo: "SECTION" });
res(M, P, "Give homework due in the past (crafted call)", R, "Refused in plain words", msg(r), /"ok":false|error/.test(r.text) && !/Homework sent/.test(r.text) ? "PASS" : "FAIL");
const te = await login("cems.teacher");
r = await callFormAction(te, F, "giveHomeworkAction", { sectionId: G5A, subjectId: maths, title: "Demo: not my subject", dueDate: "2026-10-21", due: "pick", givenTo: "SECTION" });
res(M, P, "Science teacher gives Maths homework to 5 A (crafted call)", "Teacher (Science)", "Refused", msg(r), /Homework sent/.test(r.text) ? "FAIL" : "PASS");
await ct.setViewportSize(VIEWPORTS.phone375);
await open(ct, "/homework-learning");
const li = await layoutIssues(ct);
await shot(ct, "homework-375");
res(M, P, "Homework at 375px", R, "No sideways scroll; every control named", li.join("; ") || "no issues", li.some((x) => /scroll|wider/i.test(x)) ? "FAIL" : li.length ? "FAIL" : "PASS", li.length ? "ACADEMICS-17" : undefined);
await close();
