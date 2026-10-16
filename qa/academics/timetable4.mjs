// Time Table: a new draft cannot be published with a past date or by a Teacher; then the draft is discarded on screen.
import { close } from "../lib.mjs";
import { res, login, open, messages, sleep, sql, uuidOf } from "./r.mjs";
import { callFormAction } from "./action.mjs";

const M = "Academic Management", P = "Time Table", R = "Principal";
const F = "src/app/(school)/academic-management/time-table/actions.ts";
const page = await login("cems.principal");
await open(page, "/academic-management/time-table");
if (!process.env.SKIP_START) await page.getByRole("button", { name: /Start a draft|Change the Time Table|New draft|Edit/ }).first().click();
await sleep(3000);
console.log(await messages(page));
const draft = uuidOf(sql("select id from timetable_version where status='DRAFT' and archived_at is null;"));
console.log("draft", draft);
let r;
if (!process.env.SKIP_START) {
r = await callFormAction(page, F, "publishAction", { versionId: draft, effectiveFrom: "2026-01-01" });
res(M, P, "Publish with a past effective date (crafted call)", R, "Refused: date cannot be in the past", r.text.match(/"message":"[^"]*"/)?.[0] ?? r.text.slice(-200), /in the past/.test(r.text) ? "PASS" : "FAIL");
r = await callFormAction(page, F, "publishAction", { versionId: draft, effectiveFrom: "2027-09-01" });
res(M, P, "Publish with a date outside the year (crafted call)", R, "Refused: must be inside 2026-27", r.text.match(/"message":"[^"]*"/)?.[0] ?? r.text.slice(-200), /inside/.test(r.text) ? "PASS" : "FAIL");
const teacher = await login("cems.teacher");
r = await callFormAction(teacher, F, "publishAction", { versionId: draft, effectiveFrom: "2026-10-20" });
res(M, P, "Teacher publishes the draft (crafted call)", "Teacher", "Refused", r.text.match(/"message":"[^"]*"/)?.[0] ?? r.text.slice(-200), /"ok":false/.test(r.text) && !/Start a draft/.test(r.text) ? "PASS" : "FAIL");
}
await open(page, "/academic-management/time-table");
await page.getByRole("link", { name: "Open the draft" }).or(page.getByRole("button", { name: "Open the draft" })).first().click();
await sleep(2500);
await page.getByRole("button", { name: "Discard draft" }).click();
await page.getByRole("dialog").getByRole("button", { name: "Discard draft" }).click();
await sleep(2500);
const m = await messages(page);
res(M, P, "Discard draft", R, "Draft archived, published Time Table unchanged", m.slice(0, 200), /discarded/.test(m) ? "PASS" : "FAIL");
await close();
