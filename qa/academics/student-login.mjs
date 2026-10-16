// Student login for Pranav Korada: the School Admin switches on Student logins, makes Pranav's
// login (set-password link from the downloaded list), Pranav sets a password, signs in, sees his
// homework, hands in a photo; he cannot open teacher pages or another student's work.
import { mainText, shot, close, BASE, newPage } from "../lib.mjs";
import { res, login, open, messages, sleep, sql, uuidOf } from "./r.mjs";
import { callFormAction } from "./action.mjs";

const M = "Homework & Learning", P = "Student login";
const pranav = uuidOf(sql("select s.id from student s join enrolment e on e.student_id=s.id where e.section_id='949e25d2-78bc-48aa-a6b6-7fd678175201' and e.archived_at is null and s.full_name='Pranav Korada';"));
const hwId = "11905cb2-1364-485a-b471-19bf724a6cd8";
const ad = await login("cems.admin");
await open(ad, "/student-management/settings");
const box = ad.getByLabel("Student logins (optional)");
const was = await box.isChecked();
if (!was) await box.check();
await ad.locator("button", { hasText: "Save student records" }).click();
await sleep(3000);
let m = await messages(ad);
res("Student Management", "Student Settings", "Switch on Student logins", "School Admin", "Saved", m.slice(0, 160), /saved/i.test(m) ? "PASS" : "FAIL");
const r = await callFormAction(ad, "src/app/(school)/student-management/_actions/bulk.ts", "loginsAction", { ids: pranav });
const link = (r.text.match(/https?:\/\/[^,"\\\s]+\/invite\/[A-Za-z0-9_-]+/) ?? [])[0];
const username = (r.text.match(/Pranav Korada,[^,]*,([^,]+),/) ?? [])[1];
res("Student Management", "Student logins", "Make a login for Pranav Korada", "School Admin", "Login and set-password link in the list", `${r.text.match(/"message":"[^"]*"/)?.[0] ?? r.text.slice(-160)} user=${username}`, link && username ? "PASS" : "FAIL");
if (!link) { console.log(r.text.slice(-800)); await close(); process.exit(1); }

const st = await newPage();
await st.goto(link.replace(/^https?:\/\/[^/]+/, BASE));
await st.locator("#password").fill("DemoStudent#2026pk");
await st.locator("#confirm").fill("DemoStudent#2026pk");
await st.locator("button", { hasText: "Set my password" }).click();
await sleep(3000);
await st.goto(`${BASE}/sign-in`);
await st.locator('input[name="identifier"], input[name="username"], #identifier, #username').first().fill(username);
await st.locator('input[type="password"]').first().fill("DemoStudent#2026pk");
await st.locator('button[type="submit"]').first().click();
await st.waitForLoadState("load");
await sleep(3000);
let t = (await mainText(st, 2500)).replace(/\s+/g, " ");
res(M, P, "Pranav sets a password and signs in", "Student", "Signed in; lands on his homework", `${st.url().replace(BASE, "")} ${t.slice(0, 160)}`, !/sign-in/.test(st.url()) ? "PASS" : "FAIL");
await st.goto(`${BASE}/homework-learning`);
await sleep(1500);
t = (await mainText(st, 2500)).replace(/\s+/g, " ");
console.log(t.slice(0, 800));
res(M, P, "Student sees the Maths homework", "Student", "Demo: Maths Exercise 4.3 listed", t.match(/Demo: Maths Exercise 4\.3[^.]{0,80}/)?.[0] ?? t.slice(0, 160), /Demo: Maths Exercise 4\.3/.test(t) ? "PASS" : "FAIL");
for (const [url, what] of [["/examination-results/marks", "Marks Entry"], ["/attendance-management", "Attendance"], ["/student-management", "Student Management"], ["/homework-learning/submissions", "Submissions & Grading"]]) {
  await st.goto(`${BASE}${url}`);
  await sleep(800);
  const tx = (await mainText(st, 500)).replace(/\s+/g, " ");
  res(M, P, `Student opens ${what}`, "Student", "Refused", `${st.url().replace(BASE, "")} ${tx.slice(0, 100)}`, /no-access|not part of your role|not here/i.test(st.url() + tx) ? "PASS" : "FAIL");
}
await st.goto(`${BASE}/homework-learning/homework/${hwId}`);
await sleep(1500);
t = (await mainText(st, 2500)).replace(/\s+/g, " ");
console.log(t.slice(0, 600));
await shot(st, "student-homework");
await st.context().storageState({ path: "/home/claude/qa-out/academics/sessions/pranav.json" });
await close();
