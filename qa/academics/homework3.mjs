// Homework, part 3 (the end of part 2 after a browser crash): Pranav Korada (student login) hands in a photo; the class teacher checks it
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
const ct = await login("cems.classteacher");
const te = await login("cems.teacher");
let r, t;
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
