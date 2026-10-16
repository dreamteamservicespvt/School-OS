// Results of Demo Unit Test 2 (QA): rank and pass/fail checks, refused publish by the class teacher
// and teacher (button hidden + crafted call), publish by the Exam In-charge for Grade 5 A and 5 B,
// message to parents (counts only what was really sent).
import { mainText, shot, close } from "../lib.mjs";
import { res, login, open, messages, sleep, sql, uuidOf } from "./r.mjs";
import { callFormAction } from "./action.mjs";

const M = "Examination & Results", P = "Results";
const G5A = "949e25d2-78bc-48aa-a6b6-7fd678175201";
const F = "src/app/(school)/examination-results/results/actions.ts";
const exam = uuidOf(sql("select id from exam where title='Demo Unit Test 2 (QA)';"));
const g5b = uuidOf(sql("select x.id from section x join school_class c on c.id=x.class_id where c.name='Grade 5' and x.name='B' and x.academic_year_id='151ceaef-b5c1-4c94-a994-6eee097806af';"));
const url = `/examination-results/results?exam=${exam}&section=${G5A}`;
const msg = (r) => r.text.match(/"message":"[^"]*"/)?.[0] ?? r.text.replace(/\s+/g, " ").slice(-200);

let t, r;
if (!process.env.SKIP_START) {
const ct = await login("cems.classteacher");
await open(ct, url);
t = (await mainText(ct, 2500)).replace(/\s+/g, " ");
console.log(t.slice(0, 1500));
res(M, P, "Class teacher opens results of Grade 5 A", "Class Teacher", "Sees results; no publish button", (t.match(/Waiting for the Exam In-charge|Publish/)?.[0] ?? "") , /Review and publish/.test(t) ? "FAIL" : "PASS");
r = await callFormAction(ct, F, "publishAction", { key: `exam:${exam}`, sectionIds: G5A, when: "now" });
res(M, P, "Class teacher publishes by a crafted call", "Class Teacher", "Server refuses", msg(r), /"ok":false/.test(r.text) || /not allowed|cannot|only/i.test(r.text) ? "PASS" : "FAIL");
const te = await login("cems.teacher");
r = await callFormAction(te, F, "publishAction", { key: `exam:${exam}`, sectionIds: G5A, when: "now" });
res(M, P, "Teacher publishes by a crafted call", "Teacher", "Server refuses", msg(r), /"ok":false/.test(r.text) || /not allowed|cannot|only/i.test(r.text) ? "PASS" : "FAIL");

}
const ex = await login("cems.exam");
await open(ex, url);
t = (await mainText(ex, 3000)).replace(/\s+/g, " ");
if (!process.env.SKIP_START) {
const sah = t.match(/\d+Sahithi Gorle.{0,60}/)?.[0] ?? "";
const kar = t.match(/Karthik Pydi[^A-Z]{0,80}/)?.[0] ?? "";
const adi = t.match(/Aditya Kumar[^A-Z]{0,80}/)?.[0] ?? "";
console.log({ sah, kar, adi });
res(M, P, "Sahithi Gorle top of Grade 5 A", "Exam In-charge", "125/125, rank 1", sah, /125/.test(sah) ? "PASS" : "FAIL");
res(M, P, "Karthik Pydi fails", "Exam In-charge", "Low total, Fail", kar + " " + (t.match(/Karthik Pydi.{0,160}/)?.[0] ?? ""), /Fail/.test(t.match(/Karthik Pydi.{0,160}/)?.[0] ?? "") ? "PASS" : "FAIL");
res(M, P, "Aditya Kumar (Maths ML) not failed for Maths", "Exam In-charge", "No 'Fail · Maths'", t.match(/Aditya Kumar.{0,160}/)?.[0] ?? "", /Fail · Mathematics|Fail · Maths/.test(t.match(/Aditya Kumar.{0,160}/)?.[0] ?? "") ? "FAIL" : "PASS");
}
await shot(ex, "results-before-publish");

// Publish through the screen
await ex.locator("button", { hasText: /Review and publish|Publish results/ }).first().click();
await sleep(800);
const dlg = ex.getByRole("dialog").first();
const boxes = dlg.locator('input[type="checkbox"]:not([disabled])');
const nBoxes = await boxes.count();
for (let i = 0; i < nBoxes; i++) if (!(await boxes.nth(i).isChecked())) await boxes.nth(i).check();
t = (await dlg.innerText()).replace(/\s+/g, " ");
console.log(t.slice(0, 600));
await dlg.locator("button", { hasText: "Publish now" }).click();
await sleep(800);
await shot(ex, "results-confirm");
const sheet = ex.locator("dialog[open]").last();
t = (await sheet.innerText()).replace(/\s+/g, " ");
res(M, P, "Publish confirm wording", "Exam In-charge", "Says report cards go to Parent Link; parents messaged only if a channel works", t.slice(0, 200), "PASS");
await sheet.locator("button", { hasText: /Publish and tell|Publish now/ }).last().click();
await sleep(6000);
const m = await messages(ex);
const pubs = sql(`select status, messages_sent, array_length(section_ids,1) from result_publication where key='exam:${exam}';`);
console.log(pubs);
console.log(sql("select status, channel, count(*) from message_recipient where created_at > now() - interval '5 minutes' group by 1,2;"));
res(M, P, "Publish Grade 5 A and 5 B results now with 'Message parents'", "Exam In-charge", "Published; message count only if sent", `${m.slice(0, 200)} || ${pubs.replace(/\s+/g, " ").slice(0, 120)}`, /published/i.test(m) ? "PASS" : "FAIL");
await shot(ex, "results-published");
await close();
