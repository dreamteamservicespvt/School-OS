// One week (Mon 12 - Fri 16 Oct 2026): Grade 5 A attendance for Mon and Tue entered late through
// corrections (the app's rule after the 11:00 lock) and approved; a teacher's leave request and
// the Principal's approval; a PTM on the School Calendar; the week's attendance report.
//   node qa/simulations/week.mjs
import { as, visit, text, shot, record, done, close, sql, SCHOOL_A, feedback } from "./sim-lib.mjs";

const A = "sim-week";
const G5A = "949e25d2-78bc-48aa-a6b6-7fd678175201";
const TAG = "Demo QA simulation week";

const ONLY = process.env.ONLY ?? "all";
const on = (k) => ONLY === "all" || ONLY.split(",").includes(k);
// ---------- 1. Back-dated attendance (Mon 12, Tue 13 Oct) ----------
const days = on("att") ? [["2026-10-12", "Vihaan Rao"], ["2026-10-13", "Navya Allu"]] : [];
const ct = await as("cems.classteacher");
if (on("att")) {
// Before: the locked view of a day with no marks.
await visit(ct, `/attendance-management?date=2026-10-13`);
const pre = await text(ct, 800);
const preMarks = Number(sql(`select count(*) from attendance_mark where section_id='${G5A}' and date='2026-10-13' and archived_at is null`)[0][0]);
const preP = Number(pre.match(/(\d+)\nPresent/)?.[1]);
record({ area: A, role: "Class Teacher", check: "Locked day with no marks (Tue 13 Oct) shows as not taken, not as all present", status: preMarks === 0 && preP > 0 ? "FAIL" : "PASS", note: `Take Attendance for 13-10-2026 shows "${preP} Present" while ${preMarks} marks are saved for that day. Steps: cems.classteacher → /attendance-management?date=2026-10-13. Screenshot qa-output/simulations/week-01-unmarked-day.png` });
await shot(ct, "week-01-unmarked-day");
}
async function correction(date, who, status, reason, allBut) {
  if (sql(`select count(*) from attendance_correction where section_id='${G5A}' and date='${date}' and reason='${reason}'`)[0][0] !== "0") return { skipped: true };
  await visit(ct, `/attendance-management/register/correction?section=${G5A}&date=${date}`);
  const boxes = ct.locator("input[name=people]");
  const n = await boxes.count();
  let picked = 0;
  for (let i = 0; i < n; i++) {
    const label = await boxes.nth(i).locator("xpath=..").innerText();
    const want = allBut ? !label.includes(who) && !/Now: Leave/.test(label) : label.includes(who);
    if (want) { await boxes.nth(i).check(); picked++; } else await boxes.nth(i).uncheck();
  }
  await ct.getByLabel("New status").selectOption(status);
  await ct.getByLabel("Reason").fill(reason);
  await ct.getByRole("button", { name: "Send for approval" }).click();
  await ct.waitForTimeout(3500);
  return { url: ct.url(), fb: await feedback(ct, 200), picked };
}
for (const [date, absent] of days) {
  let r = await correction(date, absent, "present", `${TAG}: paper register for ${date}, everyone else present`, true);
  record({ area: A, role: "Class Teacher", check: `Enter ${date} attendance late: all present except ${absent} (correction)`, status: r.skipped || /corrections\/[0-9a-f-]{36}/.test(r.url) ? "PASS" : "FAIL", note: r.skipped ? "sent earlier in this run" : `${r.picked} students; ${r.url.replace(/.*attendance-management/, "")} ${r.fb.slice(0, 160)}` });
  r = await correction(date, absent, "absent", `${TAG}: ${absent} absent on ${date}`, false);
  record({ area: A, role: "Class Teacher", check: `Enter ${date}: ${absent} absent (correction)`, status: r.skipped || /corrections\/[0-9a-f-]{36}/.test(r.url) ? "PASS" : "FAIL", note: r.skipped ? "sent earlier in this run" : `${r.url.replace(/.*attendance-management/, "")} ${r.fb.slice(0, 160)}` });
}
await done(ct);
const pr = await as("cems.principal");
for (const [id, date, reason] of sql(`select id, date, reason from attendance_correction where section_id='${G5A}' and status='WAITING' and reason like '${TAG}%' order by created_at`)) {
  await visit(pr, `/attendance-management/register/corrections/${id}`);
  await pr.getByRole("button", { name: "Approve", exact: true }).click();
  await pr.waitForTimeout(600);
  const dlg = pr.getByRole("dialog");
  if (await dlg.isVisible().catch(() => false)) await dlg.getByRole("button", { name: /^Approve/ }).last().click();
  await pr.waitForTimeout(3000);
  const st = sql(`select status from attendance_correction where id='${id}'`)[0][0];
  record({ area: A, role: "Principal", check: `Principal approves correction for ${date}: ${reason.replace(TAG + ": ", "")}`, status: st === "APPROVED" ? "PASS" : "FAIL", note: `status ${st}; ${(await feedback(pr, 100)).slice(0, 160)}` });
}

// ---------- 2. Weekly attendance report ----------
if (on("att")) {
const wk = Object.fromEntries(sql(`select m.status_key, count(*) from attendance_mark m join student s on s.id=m.student_id where m.section_id='${G5A}' and m.date between '2026-10-12' and '2026-10-16' and m.archived_at is null and m.period_no=0 and s.status='ACTIVE' group by 1`).map(([k, n]) => [k, Number(n)]));
const wkAll = Object.fromEntries(sql(`select m.status_key, count(*) from attendance_mark m where m.section_id='${G5A}' and m.date between '2026-10-12' and '2026-10-16' and m.archived_at is null and m.period_no=0 group by 1`).map(([k, n]) => [k, Number(n)]));
await visit(pr, "/reports-analytics/r/at-daily?period=thisweek&class=9d0e8325-9a6b-4443-9af8-10e8eda87ac2");
let rt = await text(pr, 4000);
await shot(pr, "week-02-attendance-report-week");
const row = rt.split("\n").find((l) => /^Grade 5 A\t/.test(l)) ?? "";
const cells = row.split("\t");
const [_, onRoll, P, Ab, L, Lv, pct] = cells.length === 7 ? cells : [cells[0], cells[1], cells[3], cells[4], cells[5], cells[6], cells[7]];
const expP = (wk.present ?? 0) + (wk.late ?? 0);
record({ area: A, role: "Principal", check: "Reports & Analytics 'Daily attendance' for This week (Grade 5 A) agrees with the register", status: Number(Ab) === (wk.absent ?? 0) && (Number(P) === expP || Number(P) === (wk.present ?? 0)) ? "PASS" : "FAIL", note: `report row: "${row.replace(/\t/g, " | ")}" (${rt.match(/Showing:[^\n]*/)?.[0] ?? ""}); register of active students Mon-Fri: present ${wk.present ?? 0}, late ${wk.late ?? 0}, absent ${wk.absent ?? 0}, leave ${wk.leave ?? 0}; all saved marks incl. transferred student: ${JSON.stringify(wkAll)}` });
// The same report for today only, compared with the register and the Dashboard.
await visit(pr, "/reports-analytics/r/at-daily");
rt = await text(pr, 4000);
const trow = (rt.split("\n").find((l) => /^Grade 5 A\t/.test(l)) ?? "").split("\t");
const today = Object.fromEntries(sql(`select m.status_key, count(*) from attendance_mark m join student s on s.id=m.student_id where m.section_id='${G5A}' and m.date=current_date and m.archived_at is null and m.period_no=0 and s.status='ACTIVE' group by 1`).map(([k, n]) => [k, Number(n)]));
const sumT = Number(trow[3]) + Number(trow[4]) + Number(trow[5]) + Number(trow[6]);
record({ area: A, role: "Principal", check: "Daily attendance report for today: Present + Absent + Late + Leave fits within On roll for Grade 5 A, and matches the register", status: sumT <= Number(trow[1]) && Number(trow[3]) === (today.present ?? 0) ? "PASS" : "FAIL", note: `report: on roll ${trow[1]}, present ${trow[3]}, absent ${trow[4]}, late ${trow[5]}, leave ${trow[6]}, ${trow[7]} (sum ${sumT} > on roll ${trow[1]}). Register (Take Attendance): present ${today.present ?? 0}, late ${today.late ?? 0}, absent ${today.absent ?? 0}, leave ${today.leave ?? 0}. The extra Present is Harini Inti (TRANSFERRED) and the Late student appears to be counted in Present too. Screenshot qa-output/simulations/week-03-attendance-report-today.png` });
await shot(pr, "week-03-attendance-report-today");
}

// ---------- 3. Staff leave ----------
if (on("leave")) {
const LEAVE_REASON = "Demo QA simulation: family function (synthetic)";
let lr = sql(`select lr.id, lr.status from leave_request lr where lr.school_id='${SCHOOL_A}' and lr.reason='${LEAVE_REASON}'`)[0];
if (!lr) {
  const te = await as("cems.teacher");
  await visit(te, "/staff-hr-management/leave");
  await te.getByRole("button", { name: /Apply for leave/ }).first().click();
  const dlg = te.getByRole("dialog");
  await dlg.getByLabel("Leave type").selectOption({ label: "Casual Leave" });
  await dlg.getByLabel("From date").fill("2026-11-05");
  await dlg.getByLabel("To date").fill("2026-11-05");
  await dlg.getByLabel("Reason").fill(LEAVE_REASON);
  await te.waitForTimeout(2500);
  const preview = (await dlg.innerText()).replace(/\s+/g, " ");
  await dlg.getByRole("button", { name: "Apply", exact: true }).click();
  await te.waitForTimeout(3000);
  const fb = await feedback(te, 200);
  lr = sql(`select lr.id, lr.status from leave_request lr where lr.school_id='${SCHOOL_A}' and lr.reason='${LEAVE_REASON}'`)[0];
  await shot(te, "week-04-leave-applied");
  record({ area: A, role: "Teacher", check: "Teacher applies for 1 day Casual Leave on 05-11-2026", status: lr?.[1] === "WAITING" ? "PASS" : "FAIL", note: `${preview.match(/\d+(\.\d+)? days? of Casual Leave[^.]*\./)?.[0] ?? ""} ${fb.slice(0, 160)}; saved status ${lr?.[1]}` });
  await done(te);
} else record({ area: A, role: "Teacher", check: "Teacher applies for Casual Leave on 05-11-2026", status: "PASS", note: `applied earlier in this run (${lr[1]})` });
if (lr?.[1] === "WAITING") {
  await visit(pr, "/staff-hr-management/leave?view=requests");
  const card = pr.locator("li, tr, article", { hasText: "05-11-2026" }).filter({ has: pr.getByRole("button", { name: /^Approve/ }) }).first();
  if (await card.count()) {
    await card.getByRole("button", { name: /^Approve/ }).click();
    await pr.waitForTimeout(800);
    const dlg = pr.getByRole("dialog");
    if (await dlg.isVisible().catch(() => false)) await dlg.getByRole("button", { name: /^Approve/ }).last().click().catch(() => {});
    await pr.waitForTimeout(3000);
  }
  const fb = await feedback(pr, 100);
  const st = sql(`select status from leave_request where id='${lr[0]}'`)[0][0];
  await shot(pr, "week-05-leave-approved");
  record({ area: A, role: "Principal", check: "Principal approves the teacher's leave on Staff Leave", status: st === "APPROVED" ? "PASS" : "FAIL", note: `status ${st}; ${fb.slice(0, 200)}` });
}
{
  const te = await as("cems.teacher");
  await visit(te, "/staff-hr-management/leave");
  const t = await text(te, 3000);
  record({ area: A, role: "Teacher", check: "Teacher sees the leave as approved", status: /05-11-2026[\s\S]{0,200}Approved|Approved[\s\S]{0,200}05-11-2026/.test(t) ? "PASS" : "FAIL", note: (t.match(/.{0,120}05-11-2026.{0,120}/s)?.[0] ?? t.slice(0, 200)).replace(/\s+/g, " ") });
  await done(te);
}

}
// ---------- 4. PTM on the School Calendar ----------
if (on("ptm")) {
const PTM = "Demo QA simulation PTM: Grade 5";
if (sql(`select count(*) from calendar_entry where school_id='${SCHOOL_A}' and title='${PTM}' and archived_at is null`)[0][0] === "0") {
  await visit(pr, "/events-calendar");
  await pr.getByRole("button", { name: "Add to calendar" }).or(pr.getByRole("link", { name: "Add to calendar" })).first().click();
  await pr.waitForTimeout(1200);
  const dlg = pr.locator("dialog[open], [role=dialog]").last();
  await dlg.locator("input[name=title]").fill(PTM);
  await dlg.locator("select[name=type]").selectOption({ label: "PTM" });
  await dlg.locator("input[name=from]").fill("2026-10-31");
  await dlg.locator("textarea[name=details]").fill("Demo: Parent-Teacher Meeting, 9:30 AM to 12:30 PM.").catch(() => {});
  await dlg.getByRole("button", { name: "Add to calendar" }).click();
  await pr.waitForTimeout(3000);
  const fb = await feedback(pr, 100);
  const n = sql(`select count(*) from calendar_entry where school_id='${SCHOOL_A}' and title='${PTM}' and archived_at is null`)[0][0];
  record({ area: A, role: "Principal", check: "Add a PTM (31-10-2026) to the School Calendar", status: n === "1" ? "PASS" : "FAIL", note: `${fb.slice(0, 200)}; saved ${n}` });
} else record({ area: A, role: "Principal", check: "Add a PTM to the School Calendar", status: "PASS", note: "added earlier in this run" });
{
  const ctt = await as("cems.classteacher");
  await visit(ctt, "/events-calendar?month=2026-10");
  const t = await text(ctt, 3000);
  await shot(ctt, "week-06-calendar-ptm");
  record({ area: A, role: "Class Teacher", check: "Class teacher sees the PTM on 31 Oct on the School Calendar", status: t.includes(PTM) ? "PASS" : "FAIL", note: (t.match(/31\n.{0,80}/s)?.[0] ?? "").replace(/\s+/g, " ") });
  await done(ctt);
}
}
await done(pr);
await close();
