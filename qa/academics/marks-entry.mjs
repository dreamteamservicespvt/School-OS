// Marks entry: the class teacher (Maths, Grade 5 A) enters Demo Unit Test 2 marks: invalid, above max,
// negative, decimals, missing, absent (AB) and medical leave (ML); submits. The Science teacher
// cannot enter Maths (screen and server).
import { mainText, shot, close, layoutIssues, VIEWPORTS } from "../lib.mjs";
import { res, login, open, messages, sleep, sql, uuidOf } from "./r.mjs";
import { callAction } from "./action.mjs";

const M = "Examination & Results", P = "Marks Entry", R = "Class Teacher (Maths)";
const G5A = "949e25d2-78bc-48aa-a6b6-7fd678175201";
const BASEURL = process.env.QA_URL ?? "http://localhost:3000";
const maths = uuidOf(sql("select d.id from datesheet_entry d join exam e on e.id=d.exam_id join subject s on s.id=d.subject_id where e.title='Demo Unit Test 2 (QA)' and s.name='Mathematics';"));
const subjectEntry = (name) => uuidOf(sql(`select d.id from datesheet_entry d join exam e on e.id=d.exam_id join subject s on s.id=d.subject_id where e.title='Demo Unit Test 2 (QA)' and s.name='${name}';`));
const page = await login("cems.classteacher");
await open(page, `/examination-results/marks/${maths}/${G5A}`);
const cell = (name) => page.getByLabel(`Marks for ${name}, out of 50`);
async function typeMark(name, value) { await cell(name).fill(value); await cell(name).press("Tab"); await sleep(300); }

await typeMark("Sahithi Gorle", "51");
await sleep(1500);
let t = (await mainText(page, 3000)).replace(/\s+/g, " ");
res(M, P, "Type 51 out of 50", R, "Cell marked wrong with a plain message; not saved", (t.match(/[^.]*out of 50[^.]*\./)?.[0] ?? t.slice(0, 200)), /out of 50\. 51 is too high/.test(t) ? "PASS" : "FAIL");
await typeMark("Sahithi Gorle", "-5");
const v = await cell("Sahithi Gorle").inputValue();
res(M, P, "Type -5", R, "Refused or not accepted", `cell now shows "${v}"`, v !== "-5" ? "PASS" : "FAIL");
await typeMark("Sahithi Gorle", "37.3");
await sleep(1200);
t = (await mainText(page, 3000)).replace(/\s+/g, " ");
res(M, P, "Type 37.3 (not a whole or half mark)", R, "Plain error: whole or half marks", t.match(/[^.]*half marks[^.]*\./)?.[0] ?? t.slice(0, 160), /half marks/.test(t) ? "PASS" : "FAIL");
await typeMark("Sahithi Gorle", "abc");
const v2 = await cell("Sahithi Gorle").inputValue();
res(M, P, "Type letters 'abc'", R, "Not accepted (only numbers, AB, ML)", `cell now shows "${v2}"`, !/abc/i.test(v2) ? "PASS" : "FAIL");

// Real marks
const marks = { "Aarav Kumar": "42", "Ananya Reddy": "38.5", "Vihaan Rao": "27", "Saanvi Sharma": "45", "Arjun Varma": "33", "Diya Patel": "AB", "Aditya Kumar": "ML",
  "Ishita Rao": "40", "Rohan Singh": "36", "Kavya Reddy": "44", "Sai Naidu": "29", "Sahithi Gorle": "50", "Karthik Pydi": "9", "Lasya Boddu": "31", "Pranav Korada": "47",
  "Harini Inti": "35", "Charan Lanka": "39", "Navya Allu": "41" }; // Teja Varma left blank on purpose
for (const [n, m] of Object.entries(marks)) await typeMark(n, m);
await sleep(3000);
await page.getByRole("button", { name: "Submit marks" }).click();
await sleep(1500);
t = (await mainText(page, 4000)).replace(/\s+/g, " ");
res(M, P, "Submit with one student missing (Teja Varma)", R, "Refused naming the student; tick Absent hint", t.match(/[^.]*Teja Varma[^.]*\./)?.[0] ?? (await messages(page)).slice(0, 200), /Teja Varma/.test(t) ? "PASS" : "FAIL");
await page.keyboard.press("Escape");
await typeMark("Teja Varma", "30");
await sleep(3000);
console.log(sql(`select s.full_name, m.total, m.absent, m.medical from marks m join student s on s.id=m.student_id where m.entry_id='${maths}' and s.full_name in ('Aditya Kumar','Diya Patel','Sahithi Gorle','Karthik Pydi','Ananya Reddy');`));
const aditya = sql(`select m.medical from marks m join student s on s.id=m.student_id where m.entry_id='${maths}' and s.full_name='Aditya Kumar';`);
res(M, P, "Mark Aditya Kumar ML (medical leave) and save", R, "Saved as medical leave (ML), not plain absent", `marks.medical = ${aditya.split("\n")[2]?.trim()}`, /\bt\b/.test(aditya) ? "PASS" : "FAIL", /\bt\b/.test(aditya) ? undefined : "ACADEMICS-09");
await page.getByRole("button", { name: "Submit marks" }).click();
await sleep(1500);
const sheet = page.getByRole("dialog");
await sheet.getByRole("button", { name: /^Submit \d+ marks/ }).click();
await sleep(3000);
const m = await messages(page);
res(M, P, "Submit Maths Grade 5 A marks (19)", R, "Submitted; teacher can no longer change", m.slice(0, 200), /submit/i.test(m) ? "PASS" : "FAIL");
await shot(page, "marks-submitted");

// Science teacher and Maths paper
const teacher = await login("cems.teacher");
const r0 = await open(teacher, `/examination-results/marks/${maths}/${G5A}`);
const tt = (await mainText(teacher, 800)).replace(/\s+/g, " ");
res(M, P, "Science teacher opens the Grade 5 A Maths paper", "Teacher (Science)", "Refused in plain words, no grid", `HTTP ${r0?.status()} ${tt.slice(0, 200)}`, !/Marks for Sahithi/.test(await teacher.content()) ? "PASS" : "FAIL");
const sahithi = uuidOf(sql(`select s.id from student s join enrolment e on e.student_id=s.id where e.section_id='${G5A}' and s.full_name='Sahithi Gorle';`));
const sci = subjectEntry("Science");
let r = await callAction(teacher, "src/app/(school)/examination-results/marks/actions.ts", "saveMarksAction", [subjectEntry("English"), G5A, [{ studentId: sahithi, parts: { Marks: 1 }, absent: false, grade: null, remark: null }]]);
res(M, P, "Science teacher saves English marks for Grade 5 A (crafted call)", "Teacher (Science)", "Server refuses: not their subject", r.text.replace(/\s+/g, " ").slice(-200), /"ok":false/.test(r.text) ? "PASS" : "FAIL");
// The Science teacher enters Science for 5 A (own subject) with one crafted value above max
r = await callAction(teacher, "src/app/(school)/examination-results/marks/actions.ts", "saveMarksAction", [sci, G5A, [{ studentId: sahithi, parts: { Marks: 500 }, absent: false, grade: null, remark: null }]]);
res(M, P, "Save 500 out of 50 by a crafted call", "Teacher (Science)", "Server refuses: out of 50", r.text.replace(/\s+/g, " ").slice(-200), /out of 50/.test(r.text) ? "PASS" : "FAIL");
r = await callAction(teacher, "src/app/(school)/examination-results/marks/actions.ts", "saveMarksAction", [sci, G5A, [{ studentId: sahithi, parts: { Marks: -3 }, absent: false, grade: null, remark: null }]]);
res(M, P, "Save -3 by a crafted call", "Teacher (Science)", "Server refuses: below 0", r.text.replace(/\s+/g, " ").slice(-200), /below 0/.test(r.text) ? "PASS" : "FAIL");
r = await callAction(teacher, "src/app/(school)/examination-results/marks/actions.ts", "saveMarksAction", [sci, G5A, [{ studentId: sahithi, parts: { Marks: "NaN" }, absent: false, grade: null, remark: null }]]);
res(M, P, "Save a non-number by a crafted call", "Teacher (Science)", "Server refuses: must be a number", r.text.replace(/\s+/g, " ").slice(-200), /"ok":false/.test(r.text) ? "PASS" : "FAIL");
await page.setViewportSize(VIEWPORTS.phone375);
await open(page, `/examination-results/marks/${maths}/${G5A}`);
const li = await layoutIssues(page);
await shot(page, "marks-375");
res(M, P, "Marks Entry at 375px", R, "No sideways scroll", li.join("; ") || "no issues", li.length ? "FAIL" : "PASS");
await close();
