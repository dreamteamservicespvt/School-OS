// Exam: a Teacher cannot publish; the Exam In-charge publishes the datesheet (parents told: simulated, no channel).
import { mainText, shot, close } from "../lib.mjs";
import { res, login, open, messages, sleep, sql, uuidOf } from "./r.mjs";
import { callAction } from "./action.mjs";

const M = "Examination & Results", P = "Datesheet", R = "Exam In-charge";
const exam = uuidOf(sql("select id from exam where title='Demo Unit Test 2 (QA)';"));
const teacher = await login("cems.teacher");
let r = await callAction(teacher, "src/app/(school)/examination-results/datesheet/actions.ts", "publishDatesheetAction", [exam, false]);
res(M, P, "Teacher publishes the datesheet (crafted call)", "Teacher", "Refused", r.text.replace(/\s+/g, " ").slice(-200), /not|only|cannot|can't/i.test(r.text) && !/Published/.test(r.text) ? "PASS" : "FAIL");
console.log(sql(`select status from exam where id='${exam}';`));
const page = await login("cems.exam");
await open(page, `/examination-results/datesheet/${exam}`);
await page.getByRole("button", { name: "Publish datesheet" }).click();
await sleep(800);
const dlg = page.getByRole("dialog");
const body = (await dlg.innerText()).replace(/\s+/g, " ");
console.log("publish dialog:", body);
await dlg.getByRole("button", { name: /^Publish/ }).last().click();
await sleep(4000);
const m = await messages(page);
res(M, P, "Publish the datesheet", R, "Published; on the School Calendar; parents told only if a channel exists (no false 'Sent')", `${body.slice(0, 160)} => ${m.slice(0, 200)}`, /publish/i.test(m) ? "PASS" : "FAIL");
console.log(sql(`select status from exam where id='${exam}';`));
console.log(sql("select title, type, start_date from calendar_entry where source like 'exam:%';"));
console.log(sql("select title, status, channels, recipient_count, skipped from message order by created_at desc limit 3;"));
await shot(page, "exam-published");
await close();
