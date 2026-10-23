// Workflow 8 steps 1 to 4 as the Principal (exam in-charge) on a laptop: a one-class datesheet for Class 5 with
// Bulk apply; mistakes first (two papers at once, a room and an invigilator already busy); save; publish.
import { as, visit, text, report, shot, VIEWPORTS, sql, sleep, messages, SUNRISE } from "./h.mjs";
import { close } from "../../lib.mjs";

const TITLE = process.env.TITLE ?? "Class Test October QA";
const vp = process.env.VP ?? "laptop1280";
const p = await as("principal", VIEWPORTS[vp]);
await visit(p, "/examination-results/datesheet/new", 1500);
await p.getByRole("radio", { name: /Single class/ }).click();
await p.locator("#ds-classes").getByRole("button", { name: "5", exact: true }).click(); await sleep(1200);
// Save with nothing: what does a person see?
await p.getByRole("button", { name: /Save as draft/ }).click(); await sleep(1500);
console.log("empty save:", (await messages(p)), "|", (await text(p, 1200)).match(/Give the exam[^.]*\.|Choose the exam type\.|Choose[^.]*\./g));
await p.getByLabel("Title").fill(TITLE);
await p.getByLabel("Exam type").selectOption({ label: "Internal Assessment" });
await p.getByLabel("Term").selectOption({ label: "Term 1" });
await p.getByLabel("Start date").fill("2026-10-16");
await p.getByLabel("End date").fill("2026-10-16");
// Bulk apply
const st = await p.getByLabel("Start time for all").locator("option").allInnerTexts();
console.log("start times:", st.slice(0, 6), "durations:", (await p.getByLabel("Duration for all").locator("option").allInnerTexts()).slice(0, 8));
await p.getByLabel("Start time for all").selectOption({ label: st.find((x) => /^9[:.]00/.test(x)) ?? st[2] });
await p.getByRole("button", { name: "Apply start time to all subjects" }).click();
await p.getByLabel("Duration for all").selectOption({ index: 1 });
await p.getByRole("button", { name: "Apply duration to all subjects" }).click();
await p.getByLabel("Maximum marks for all").fill("20");
await p.getByRole("button", { name: "Apply max marks to all subjects" }).click();
// Two papers at the same time
await p.getByLabel("Mathematics exam date").fill("2026-10-16");
await p.getByLabel("English exam date").fill("2026-10-16");
await sleep(800);
console.log("rows:", (await text(p, 6000)).match(/Subject Exam date[^]*?Before you save/)?.[0]?.slice(0, 900));
await shot(p, `ds-${vp}-filled`, true);
await p.getByRole("button", { name: /Save as draft/ }).click(); await sleep(2500);
console.log("clash save ->", await messages(p), "|", p.url());
console.log((await text(p, 6000)).match(/(already|clash|same time|at once)[^.]*\./gi));
await shot(p, `ds-${vp}-clash`, true);
// Clear English; Mathematics room Room 13 (Class 6 Telugu, same time)
await p.getByLabel("English exam date").fill("");
await p.getByLabel("Mathematics location").fill("Room 13");
await p.getByRole("button", { name: /Save as draft/ }).click(); await sleep(2500);
console.log("room clash ->", await messages(p), "|", p.url());
console.log((await text(p, 6000)).match(/(already|clash|used by|booked)[^.]*\./gi));
await p.getByLabel("Mathematics location").fill("Room 5A");
const inv = p.getByLabel("Mathematics invigilator");
const invs = await inv.locator("option").allInnerTexts();
console.log("invigilators:", invs.slice(0, 5), "...", invs.length);
const kiran = invs.find((x) => /Kiran Agarwal/.test(x));
if (kiran) await inv.selectOption({ label: kiran });
await p.getByRole("button", { name: /Save as draft/ }).click(); await sleep(2500);
console.log("invigilator clash ->", await messages(p), "|", p.url());
console.log((await text(p, 6000)).match(/(already|clash|invigilat|busy)[^.]*\./gi));
await inv.selectOption({ index: 0 });
const mathInv = invs.find((x) => /Ravi Teja/.test(x));
if (mathInv) await inv.selectOption({ label: mathInv });
await p.getByRole("button", { name: /Save as draft/ }).click(); await sleep(3000);
console.log("save ->", await messages(p), "|", p.url());
console.log((await text(p, 2500)));
await report(p, "after save");
console.log("db exam:", sql(`select e.id, e.status, e.title from exam e where e.school_id='${SUNRISE}' and e.title='${TITLE}'`));
console.log("db entries:", sql(`select sub.name, d.date, d.start_time, d.duration_min, d.max_marks, d.room from datesheet_entry d join subject sub on sub.id=d.subject_id join exam e on e.id=d.exam_id where e.title='${TITLE}' and d.archived_at is null`));
await close();
