// Workflow 9 on a phone as the Mathematics teacher: Give homework (mistakes: empty title, past due date, start after
// due, maximum 0 / letters), send; check the due date it fills ("Next class") against the Dasara holidays.
import { as, visit, text, report, shot, VIEWPORTS, sql, sleep, messages, SUNRISE } from "./h.mjs";
import { close } from "../../lib.mjs";

const TITLE = process.env.TITLE ?? "QA: Exercise 5.1 Decimals, Q1-Q6";
const vp = process.env.VP ?? "phone390";
const t = await as("teacher", VIEWPORTS[vp]);
await visit(t, "/homework-learning", 1500);
await t.getByRole("link", { name: /Give homework/ }).or(t.getByRole("button", { name: /Give homework/ })).first().click(); await sleep(1500);
const dlg = t.getByRole("dialog").or(t.locator("form").filter({ hasText: "Give homework" })).first();
console.log("form:", (await dlg.innerText()).replace(/\s+/g, " ").slice(0, 900));
await report(t, "give homework");
await shot(t, `hw-${vp}-form`, false);
console.log("classes offered:", await t.getByRole("radiogroup", { name: "Class" }).getByRole("radio").allInnerTexts().catch(() => []));
const send = t.getByRole("button", { name: /^Send to/ });
// 1. empty title
await send.click(); await sleep(1500);
console.log("empty ->", await messages(t));
// 2. Next class due words
await t.getByLabel("Title").fill(TITLE);
await t.getByLabel("Instructions").fill("Do Q1 to Q6 in the notebook. Show working.");
console.log("due words:", (await dlg.innerText()).match(/Next Mathematics class:[^\n]*/)?.[0]);
// 3. Pick a past date
await t.getByRole("radio", { name: "Pick a date" }).click(); await sleep(300);
await t.locator("#gh-due").fill("2026-10-10");
await send.click(); await sleep(2000);
console.log("past due ->", await messages(t), "|", (await dlg.innerText()).match(/(past|before|today|earlier)[^.]*\./gi));
// 4. Start after due, max 0
await t.getByRole("button", { name: /More details/ }).click(); await sleep(300);
await t.locator("#gh-due").fill("2026-10-27");
await t.locator("#gh-start").fill("2026-10-28");
await t.locator("#gh-max").fill("0");
await send.click(); await sleep(2000);
console.log("start>due, max 0 ->", await messages(t));
await t.locator("#gh-max").fill("ten");
await send.click(); await sleep(2000);
console.log("max letters ->", await messages(t));
await shot(t, `hw-${vp}-errors`, false);
// 5. Valid: start today, due 27 Oct, max 20
await t.locator("#gh-start").fill("2026-10-18");
await t.locator("#gh-max").fill("20");
await send.dblclick(); await sleep(4000);
console.log("send ->", await messages(t), t.url());
console.log("db:", sql(`select h.id, h.title, h.start_date, h.due_date, h.max_marks, (select count(*) from submission s where s.homework_id=h.id) from homework h where h.school_id='${SUNRISE}' and h.title='${TITLE}'`));
await close();
