// Locked attendance: the class teacher asks for corrections for 14 and 15 Oct (Diya Patel absent,
// everyone else present), the Principal approves; validation and refusals on the server.
import { mainText, shot, close } from "../lib.mjs";
import { res, login, open, messages, sleep, sql, uuidOf } from "./r.mjs";
import { callFormAction } from "./action.mjs";

const M = "Attendance Management", P = "Attendance Register (corrections)", R = "Class Teacher";
const G5A = "949e25d2-78bc-48aa-a6b6-7fd678175201";
const F = "src/app/(school)/attendance-management/register/actions.ts";
const page = await login("cems.classteacher");

async function request(date, who, status, reason) {
  await open(page, `/attendance-management/register/correction?section=${G5A}&date=${date}`);
  const boxes = page.locator("input[name=people]");
  const n = await boxes.count();
  for (let i = 0; i < n; i++) {
    const label = await boxes.nth(i).locator("xpath=..").innerText();
    const want = who === "all-but-diya" ? !/Diya Patel/.test(label) : label.includes(who);
    if (want) await boxes.nth(i).check(); else await boxes.nth(i).uncheck();
  }
  await page.getByLabel("New status").selectOption(status);
  await page.getByLabel("Reason").fill(reason);
  await page.getByRole("button", { name: "Send for approval" }).click();
  await sleep(3500);
  return { url: page.url(), text: (await mainText(page, 1200)).replace(/\s+/g, " "), msg: await messages(page) };
}

// validation: short reason
let r = await request("2026-10-15", "Diya Patel", "absent", "abc");
res(M, P, "Correction with a 3-letter reason", R, "Refused: reason of at least 5 characters", (r.msg || r.text).slice(0, 200), /at least 5/.test(r.msg + r.text) ? "PASS" : "FAIL");
for (const date of ["2026-10-14", "2026-10-15"]) {
  r = await request(date, "all-but-diya", "present", "Demo: register was taken on paper that day; entering it now.");
  res(M, P, `Correction ${date}: 18 students present`, R, "Sent to Approvals; detail page", `${r.url.replace(/.*attendance-management/, "")} ${r.msg.slice(0, 120)}`, /corrections\/[0-9a-f-]{36}/.test(r.url) ? "PASS" : "FAIL");
  r = await request(date, "Diya Patel", "absent", "Demo: Diya Patel was absent; paper register.");
  res(M, P, `Correction ${date}: Diya Patel absent`, R, "Sent to Approvals", `${r.url.replace(/.*attendance-management/, "")} ${r.msg.slice(0, 120)}`, /corrections\/[0-9a-f-]{36}/.test(r.url) ? "PASS" : "FAIL");
}
// duplicate waiting correction
r = await request("2026-10-15", "Diya Patel", "late", "Demo: duplicate request test");
res(M, P, "Second correction for Diya on 15 Oct while one waits", R, "Refused: already waiting", (r.msg || r.text).slice(0, 200), /already waiting/.test(r.msg + r.text) ? "PASS" : "FAIL");

// Future date and Sunday through crafted calls
const diya = uuidOf(sql(`select s.id from student s join enrolment e on e.student_id=s.id where e.section_id='${G5A}' and s.full_name='Diya Patel';`));
for (const [date, what] of [["2026-12-01", "a future date"], ["2026-10-11", "a Sunday"], ["2026-10-02", "a holiday (Gandhi Jayanti)"], ["2025-01-10", "a date outside the year"]]) {
  const x = await callFormAction(page, F, "requestCorrectionAction", { forWhom: "student", sectionId: G5A, date, people: diya, status: "absent", reason: `Demo: crafted correction for ${what}` });
  const refused = !/NEXT_REDIRECT|corrections\//.test(x.text) && /"ok":false/.test(x.text);
  res(M, P, `Correction for ${what} (${date}) by crafted call`, R, "Refused: attendance is not taken on that day", (x.text.match(/"message":"[^"]*"/)?.[0] ?? x.text.slice(-200)).slice(0, 200), refused ? "PASS" : "FAIL", refused ? undefined : "ACAD-COR-DATE");
}

// Teacher of another class (Grade 8 A) asks a correction for it
const teacher = await login("cems.teacher");
const g8a = uuidOf(sql("select s.id from section s join school_class c on c.id=s.class_id where c.name='Grade 8' and s.name='A' and s.academic_year_id='151ceaef-b5c1-4c94-a994-6eee097806af';"));
const g8student = uuidOf(sql(`select student_id from enrolment where section_id='${g8a}' and archived_at is null limit 1;`));
let x = await callFormAction(teacher, F, "requestCorrectionAction", { forWhom: "student", sectionId: g8a, date: "2026-10-15", people: g8student, status: "absent", reason: "Demo: crafted by a teacher of another class" });
res(M, P, "Teacher asks a correction for Grade 8 A (not theirs) by crafted call", "Teacher", "Refused", (x.text.match(/"message":"[^"]*"/)?.[0] ?? x.text.slice(-200)).slice(0, 200), /"ok":false/.test(x.text) ? "PASS" : "FAIL");
// Teacher teaches Science in 5 A: may they correct the class teacher's daily register?
x = await callFormAction(teacher, F, "requestCorrectionAction", { forWhom: "student", sectionId: G5A, date: "2026-10-13", people: diya, status: "present", reason: "Demo: subject teacher correcting the daily register" });
console.log("subject teacher on 5A daily register:", x.text.slice(-250));
await close();
