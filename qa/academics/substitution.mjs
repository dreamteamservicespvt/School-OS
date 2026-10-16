// Substitutions for Demo Pavan Seela's approved leave (26 Oct): assign on screen; busy teacher and the
// absent teacher refused on the server; the substitute sees the extra period; a Teacher cannot arrange.
import { mainText, shot, close, layoutIssues, VIEWPORTS } from "../lib.mjs";
import { res, login, open, messages, sleep, sql, uuidOf } from "./r.mjs";
import { callFormAction } from "./action.mjs";

const M = "Academic Management", P = "Substitutions", R = "Principal";
const F = "src/app/(school)/academic-management/substitutions/actions.ts";
const msgOf = (r) => (r.text.match(/"message":"[^"]*"/)?.[0] ?? r.text.replace(/\s+/g, " ").slice(-200));
const pr = await login("cems.principal");
await open(pr, "/academic-management/substitutions?date=2026-10-26");
const p3 = pr.locator("li, div", { hasText: /Period 3.*Grade 5 A/s }).filter({ has: pr.getByRole("button", { name: "Assign substitute" }) }).last();
await p3.getByRole("button", { name: "Assign substitute" }).click();
const dlg = pr.getByRole("dialog");
await sleep(3000);
const options = await dlg.locator("input[name=substituteId]").count();
const first = (await dlg.locator("label", { has: pr.locator("input[name=substituteId]") }).first().innerText()).replace(/\s+/g, " ");
res(M, P, "Suggestions for Period 3, Grade 5 A Science", R, "Free teachers, best match first", `${options} free; first: ${first}`, options > 0 ? "PASS" : "FAIL");
await dlg.locator("input[name=substituteId]").first().check();
await dlg.getByLabel("Note").fill("Demo: revise chapter 4");
await dlg.getByRole("button", { name: "Assign substitute" }).click();
await sleep(3000);
let m = await messages(pr);
res(M, P, "Assign the best-match substitute", R, "Arranged; substitute and class teacher told", m.slice(0, 200), /covers/.test(m) ? "PASS" : "FAIL");
await shot(pr, "substitution-assigned");

// Crafted: the absent teacher himself, and a busy teacher (Grade 5 A class teacher teaching Maths period 1)
const periods = sql("select p.id, p.period_no, c.name||' '||s.name from timetable_period p join timetable_version v on v.id=p.version_id join section s on s.id=p.section_id join school_class c on c.id=s.class_id join staff st on st.id=p.staff_id where v.status='PUBLISHED' and p.archived_at is null and st.full_name='Demo Pavan Seela' and p.day_of_week=1 order by p.period_no;");
const rows = periods.split("\n").map((l) => l.split("|").map((x) => x.trim())).filter((x) => /^[0-9a-f]{8}-/.test(x[0]));
const pavan = uuidOf(sql("select id from staff where full_name='Demo Pavan Seela';"));
const lavanya = uuidOf(sql("select id from staff where full_name='Demo Lavanya Teki';"));
const busyAt = sql(`select p.period_no from timetable_period p join timetable_version v on v.id=p.version_id where v.status='PUBLISHED' and p.archived_at is null and p.staff_id='${lavanya}' and p.day_of_week=1;`);
const busyNo = busyAt.split("\n").map((x) => x.trim()).filter((x) => /^\d+$/.test(x));
const target = rows.find((x) => busyNo.includes(x[1]));
let r = await callFormAction(pr, F, "assignAction", { date: "2026-10-26", periodIds: rows[0][0], substituteId: pavan, note: "" });
res(M, P, "Assign the absent teacher as his own substitute (crafted call)", R, "Refused", msgOf(r), /"ok":false/.test(r.text) ? "PASS" : "FAIL");
if (target) {
  r = await callFormAction(pr, F, "assignAction", { date: "2026-10-26", periodIds: target[0], substituteId: lavanya, note: "" });
  res(M, P, `Assign a teacher busy in period ${target[1]} (crafted call)`, R, "Refused: not free", msgOf(r), /not free/.test(r.text) ? "PASS" : "FAIL");
}
r = await callFormAction(pr, F, "assignAction", { date: "2026-10-27", periodIds: rows[0][0], substituteId: lavanya, note: "" });
res(M, P, "Assign a Monday period on a Tuesday date (crafted call)", R, "Refused: another day of the week", msgOf(r), /another day/.test(r.text) ? "PASS" : "FAIL");
const teacher = await login("cems.teacher");
r = await callFormAction(teacher, F, "assignAction", { date: "2026-10-26", periodIds: rows[1][0], substituteId: lavanya, note: "" });
res(M, P, "Teacher arranges a substitution (crafted call)", "Teacher", "Refused", msgOf(r), /"ok":false/.test(r.text) ? "PASS" : "FAIL");
const sub = sql("select st.full_name, u.username from substitution x join staff st on st.id=x.substitute_staff_id left join user_login u on u.id=st.user_login_id where x.status='ARRANGED' and x.date='2026-10-26';");
console.log(sub);
await pr.setViewportSize(VIEWPORTS.phone375);
await open(pr, "/academic-management/substitutions?date=2026-10-26");
const li = await layoutIssues(pr);
res(M, P, "Substitutions at 375px", R, "No sideways scroll", li.join("; ") || "no issues", li.length ? "FAIL" : "PASS");
await close();
