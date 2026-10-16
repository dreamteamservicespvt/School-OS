// Attendance workflow as the class teacher of Grade 5 A: today's class, mark absentees, save,
// parent message, dashboard, change before the lock; a Teacher of another section is refused.
import { mainText, shot, close, layoutIssues, VIEWPORTS } from "../lib.mjs";
import { res, login, open, messages, sleep, sql } from "./r.mjs";
import { callAction } from "./action.mjs";

const M = "Attendance Management", P = "Take Attendance", R = "Class Teacher";
const G5A = "949e25d2-78bc-48aa-a6b6-7fd678175201";
const page = await login("cems.classteacher");
await open(page, "/attendance-management");
let t = await mainText(page, 4000);
res(M, P, "Today's class opens for the class teacher", R, "Grade 5 A, today, 19 students, all present by default", t.split("\n").slice(0, 4).join(" ") + ` | 19 present=${/^19\nPresent/m.test(t)}`, /Grade 5 A/.test(t) && /19\nPresent/.test(t) ? "PASS" : "FAIL");
const aditya = (await page.locator("li", { hasText: "Aditya Kumar" }).innerText()).replace(/\s+/g, " ");
res(M, P, "Student on approved leave shows Leave, cannot be marked", R, "Aditya Kumar: On approved leave, Leave pill", aditya, /On approved leave/.test(aditya) && /Leave/.test(aditya) ? "PASS" : "FAIL");
await page.getByRole("radiogroup", { name: "Attendance for Diya Patel" }).getByRole("radio", { name: "Absent" }).click();
await page.getByRole("radiogroup", { name: "Attendance for Arjun Varma" }).getByRole("radio", { name: "Late" }).click();
const saveBtn = page.getByRole("button", { name: /^Save attendance/ });
const label = await saveBtn.innerText();
// double click to test double submit
await saveBtn.dblclick();
await sleep(4000);
const msg = await messages(page);
res(M, P, "Save with 1 absent (Diya Patel), 1 late (Arjun Varma), double-clicked", R, "Saved once; message names counts; absence message timing explained", `${label} => ${msg.slice(0, 300)}`, /saved/i.test(msg) ? "PASS" : "FAIL");
await shot(page, "attendance-saved");
console.log(sql(`select count(*) marks, count(distinct student_id) students from attendance_mark where section_id='${G5A}' and date='2026-10-16' and archived_at is null;`));
console.log(sql(`select outcome, count(*) from attendance_submission where section_id='${G5A}' and date='2026-10-16' group by 1;`));
console.log(sql(`select st.key, count(*) from attendance_mark m join attendance_status st on st.key=m.status_key and st.school_id=m.school_id where m.section_id='${G5A}' and m.date='2026-10-16' group by 1;`).slice(0, 400));

// Change before the lock: Arjun from Late to Present
await open(page, "/attendance-management");
await page.getByRole("radiogroup", { name: "Attendance for Arjun Varma" }).getByRole("radio", { name: "Present" }).click();
await page.getByRole("button", { name: /^Save attendance/ }).click();
await sleep(3500);
const msg2 = await messages(page);
res(M, P, "Change a mark before the lock (Arjun Late -> Present)", R, "Saved as an update, not a duplicate", msg2.slice(0, 250), /saved|updated|changed/i.test(msg2) ? "PASS" : "FAIL");
console.log(sql(`select count(*) from attendance_mark where section_id='${G5A}' and date='2026-10-16' and archived_at is null;`));

// Phone width
await page.setViewportSize(VIEWPORTS.phone375);
await open(page, "/attendance-management");
const li = await layoutIssues(page);
await shot(page, "attendance-375");
res(M, P, "Take Attendance at 375px", R, "No sideways scroll", li.join("; ") || "no issues", li.length ? "FAIL" : "PASS");

// Another teacher (Science in Grades 5-7, not class teacher of 5 A)
const teacher = await login("cems.teacher");
await open(teacher, `/attendance-management?section=${G5A}`);
const tt = await mainText(teacher, 1500);
res(M, P, "Teacher (not class teacher) opens Grade 5 A attendance", "Teacher", "Not offered / refused in plain words", tt.replace(/\s+/g, " ").slice(0, 250), !/Diya Patel/.test(tt) ? "PASS" : "FAIL");
const students = sql(`select s.id from student s join enrolment e on e.student_id=s.id where e.section_id='${G5A}' and e.archived_at is null and s.full_name='Diya Patel';`).match(/[0-9a-f]{8}-[0-9a-f-]{27}/)[0];
const r = await callAction(teacher, "src/app/(school)/attendance-management/actions.ts", "saveSheet", [{ sectionId: G5A, date: "2026-10-16", periodNo: 0, entries: [{ studentId: students, statusKey: "present" }], clientId: "qa-hack-" + Date.now() }]);
res(M, P, "Teacher saves Grade 5 A attendance by a crafted call", "Teacher", "Server refuses, Diya stays absent", r.text.replace(/\s+/g, " ").slice(-200), /"ok":false/.test(r.text) ? "PASS" : "FAIL");
console.log(sql(`select status_key from attendance_mark where section_id='${G5A}' and date='2026-10-16' and student_id='${students}' and archived_at is null;`));
await close();
