// Homework, part 2: Pranav Korada (student login) hands in a photo; the class teacher checks it
// (11 of 10 refused, then 9 of 10 Complete); Lasya Boddu has not handed in and shows as pending;
// Pranav sees his score; crafted give-homework calls (past due, another teacher's subject).
import { writeFileSync } from "node:fs";
import { mainText, shot, close } from "../lib.mjs";
import { res, login, open, messages, sleep, sql, uuidOf } from "./r.mjs";
import { callFormAction } from "./action.mjs";

const M = "Homework & Learning";
const G5A = "949e25d2-78bc-48aa-a6b6-7fd678175201";
const hwId = "11905cb2-1364-485a-b471-19bf724a6cd8";
const F = "src/app/(school)/homework-learning/actions.ts";
const FS = "src/app/(school)/homework-learning/submissions/actions.ts";
const maths = uuidOf(sql("select id from subject where name='Mathematics' and archived_at is null limit 1;"));
const msg = (r) => r.text.match(/"message":"[^"]*"/)?.[0] ?? r.text.replace(/\s+/g, " ").slice(-200);
// a tiny valid PNG
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
writeFileSync("/home/claude/qa-out/academics/demo-homework-photo.png", png);

const st = await login("pranav");
await open(st, `/homework-learning?submit=${hwId}`);
const sheet = st.locator("dialog[open]").last();
await sheet.locator('input[name="photos"]').setInputFiles("/home/claude/qa-out/academics/demo-homework-photo.png");
await sheet.locator('[name="note"]').fill("Demo: All 8 sums done.");
await sleep(500);
await sheet.locator("button", { hasText: /^Hand in/ }).last().click();
await sleep(4000);
let m = await messages(st);
res(M, "Homework (student)", "Pranav hands in a photo and a note", "Student", "Handed in on time", m.slice(0, 160), /Handed in on time/.test(m) ? "PASS" : "FAIL");
await open(st, `/homework-learning/homework/${hwId}`);
let t = (await mainText(st, 1500)).replace(/\s+/g, " ");
res(M, "Homework details", `Student opens the homework details link (${process.env.QA_URL ?? "base build"})`, "Student", "Only his own homework, no classmates", `${st.url().replace(/^https?:\/\/[^/]+/, "")} ${t.slice(0, 160)}`, /Aarav Kumar|Ananya Reddy/.test(t) ? "FAIL" : "PASS", /Aarav Kumar|Ananya Reddy/.test(t) ? "ACADEMICS-18" : undefined);

const sub = (name) => uuidOf(sql(`select sb.id from submission sb join student s on s.id=sb.student_id where sb.homework_id='${hwId}' and s.full_name='${name}';`));
const ct = await login("cems.classteacher");
let r = await callFormAction(ct, FS, "gradeAction", { id: sub("Pranav Korada"), result: "COMPLETE", score: "11", feedback: "Demo" });
res(M, "Submissions & Grading", "Score 11 of 10 (crafted call)", "Class Teacher (Maths)", "Refused in plain words", msg(r), /"ok":false|at most|out of 10|more than/i.test(r.text) && !/Saved for/.test(r.text) ? "PASS" : "FAIL");
await open(ct, `/homework-learning/submissions?hw=${hwId}`);
t = (await mainText(ct, 3000)).replace(/\s+/g, " ");
console.log(t.slice(0, 1200));
res(M, "Submissions & Grading", "Who handed in: Pranav handed in, Lasya not yet", "Class Teacher (Maths)", "Pranav handed in; Lasya pending", `${t.match(/Pranav Korada.{0,60}/)?.[0] ?? ""} | ${t.match(/Lasya Boddu.{0,60}/)?.[0] ?? ""}`, /Pranav Korada/.test(t) && /Lasya Boddu/.test(t) ? "PASS" : "FAIL");
r = await callFormAction(ct, FS, "gradeAction", { id: sub("Pranav Korada"), result: "COMPLETE", score: "9", feedback: "Demo: Neat work. Check Q7 again." });
res(M, "Submissions & Grading", "Check Pranav's work: 9 of 10, Complete, feedback", "Class Teacher (Maths)", "Saved; student sees it", msg(r), /Saved for Pranav Korada: 9 of 10/.test(r.text) ? "PASS" : "FAIL");
const te = await login("cems.teacher");
r = await callFormAction(te, FS, "gradeAction", { id: sub("Lasya Boddu"), result: "COMPLETE", score: "10", feedback: "Demo: not my subject" });
res(M, "Submissions & Grading", "Science teacher checks Lasya's Maths homework (crafted call)", "Teacher (Science)", "Refused", msg(r), /Saved for/.test(r.text) ? "FAIL" : "PASS");
console.log(sql(`select s.full_name, sb.status, sb.score, sb.check_result from submission sb join student s on s.id=sb.student_id where sb.homework_id='${hwId}' and s.full_name in ('Pranav Korada','Lasya Boddu');`));
await open(st, "/homework-learning?tab=checked");
t = (await mainText(st, 1500)).replace(/\s+/g, " ");
res(M, "Homework (student)", "Pranav sees his checked work", "Student", "Score 9 of 10", t.match(/Demo: Maths Exercise 4\.3.{0,80}/)?.[0] ?? t.slice(0, 160), /Score 9 of 10/.test(t) ? "PASS" : "FAIL");

r = await callFormAction(ct, F, "giveHomeworkAction", { sectionId: G5A, subjectId: maths, title: "Demo: past due", startDate: "2026-10-01", dueDate: "2026-10-10", due: "pick", givenTo: "SECTION", maxMarks: "10" });
res(M, "Homework", "Give homework due in the past (crafted call)", "Class Teacher (Maths)", "Refused in plain words", msg(r), /Homework sent/.test(r.text) ? "FAIL" : "PASS");
r = await callFormAction(ct, F, "giveHomeworkAction", { sectionId: G5A, subjectId: maths, title: "Demo: due before start", startDate: "2026-10-22", dueDate: "2026-10-21", due: "pick", givenTo: "SECTION", maxMarks: "10" });
res(M, "Homework", "Give homework due before its start date (crafted call)", "Class Teacher (Maths)", "Refused in plain words", msg(r), /Homework sent/.test(r.text) ? "FAIL" : "PASS");
r = await callFormAction(te, F, "giveHomeworkAction", { sectionId: G5A, subjectId: maths, title: "Demo: not my subject", startDate: "2026-10-16", dueDate: "2026-10-21", due: "pick", givenTo: "SECTION", maxMarks: "10" });
res(M, "Homework", "Science teacher gives Maths homework to 5 A (crafted call)", "Teacher (Science)", "Refused", msg(r), /Homework sent/.test(r.text) ? "FAIL" : "PASS");
console.log(sql("select title from homework where title in ('Demo: past due','Demo: due before start','Demo: not my subject');"));
await close();
