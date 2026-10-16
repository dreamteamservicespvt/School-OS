// School day, 09:00 - 13:00: Grade 5 A attendance (already locked at 11:00 by the time this runs,
// so the class teacher sends corrections and the Principal approves them), homework, a cash fee
// at the counter with a printed receipt, and a library issue.
//   node qa/simulations/day-2-classes.mjs
import { as, visit, text, shot, record, done, close, sql, SCHOOL_A, feedback } from "./sim-lib.mjs";
import { collect } from "../money/collect-lib.mjs";

const A = "sim-day";
const G5A = "949e25d2-78bc-48aa-a6b6-7fd678175201";
const LASYA = "9236c09d-10bd-4338-95fc-35aea416843d";
const TAG = "Demo QA simulation";
const today = sql("select to_char(current_date,'YYYY-MM-DD')")[0][0];

// ---------- 1. Attendance ----------
const ct = await as("cems.classteacher");
await visit(ct, "/attendance-management");
let t = await text(ct);
const locked = /locked at/.test(t);
const sum = (s) => ({ P: Number(s.match(/(\d+)\nPresent/)?.[1]), A: Number(s.match(/(\d+)\nAbsent/)?.[1]), L: Number(s.match(/(\d+)\nLate/)?.[1]), LV: Number(s.match(/(\d+)\nLeave/)?.[1]) });
const before = sum(t);
const dbMarks = () => Object.fromEntries(sql(`select status_key, count(*) from attendance_mark m join student s on s.id=m.student_id where m.section_id='${G5A}' and m.date=current_date and m.archived_at is null and s.status='ACTIVE' group by 1`).map(([k, n]) => [k, Number(n)]));
const db0 = dbMarks();
const unmarked = Number(sql(`select count(*) from enrolment e join student s on s.id=e.student_id where e.section_id='${G5A}' and e.archived_at is null and s.status='ACTIVE' and not exists (select 1 from attendance_mark m where m.student_id=s.id and m.date=current_date and m.archived_at is null)`)[0][0]);
record({ area: A, role: "Class Teacher", check: "Take Attendance summary for Grade 5 A agrees with what is saved", status: before.P === (db0.present ?? 0) ? "PASS" : "FAIL", note: `screen Present ${before.P} / Absent ${before.A} / Late ${before.L} / Leave ${before.LV}; saved marks present ${db0.present ?? 0}, absent ${db0.absent ?? 0}, leave ${db0.leave ?? 0}; ${unmarked} active student(s) have no mark today but the screen counts them under Present` });

async function correction(who, status, reason, note) {
  const waiting = sql(`select count(*) from attendance_correction where section_id='${G5A}' and date=current_date and status='WAITING' and reason='${reason.replace(/'/g, "''")}'`)[0][0];
  const doneAlready = sql(`select count(*) from attendance_correction where section_id='${G5A}' and date=current_date and reason='${reason.replace(/'/g, "''")}'`)[0][0];
  if (doneAlready !== "0") return { skipped: true, waiting };
  await visit(ct, `/attendance-management/register/correction?section=${G5A}&date=${today}`);
  const boxes = ct.locator("input[name=people]");
  const n = await boxes.count();
  for (let i = 0; i < n; i++) {
    const label = await boxes.nth(i).locator("xpath=..").innerText();
    if (who.some((w) => label.includes(w))) await boxes.nth(i).check(); else await boxes.nth(i).uncheck();
  }
  await ct.getByLabel("New status").selectOption(status);
  if (note) await ct.getByLabel("Note on the entry").fill(note).catch(() => {});
  await ct.getByLabel("Reason").fill(reason);
  await ct.getByRole("button", { name: "Send for approval" }).click();
  await ct.waitForTimeout(3500);
  return { url: ct.url(), fb: await feedback(ct, 200) };
}
if (locked) {
  const reqs = [
    [["Rohan Singh", "Sahithi Gorle"], "absent", `${TAG}: absent today, register was marked present by mistake`, null],
    [["Karthik Pydi"], "late", `${TAG}: late arrival at the gate`, "Came at 10:15 (late arrival)"],
    [["Demo Varun Teja", "Demo శ్రీజ Varma"], "present", `${TAG}: new admissions were not on the paper register`, null],
  ];
  for (const [who, st, reason, note] of reqs) {
    const r = await correction(who, st, reason, note);
    record({ area: A, role: "Class Teacher", check: `Attendance locked at 11:00: correction request ${who.join(", ")} -> ${st}`, status: r.skipped ? "PASS" : /corrections\/[0-9a-f-]{36}/.test(r.url) ? "PASS" : "FAIL", note: r.skipped ? "already sent earlier in this run" : `${r.url.replace(/.*attendance-management/, "")} ${r.fb.slice(0, 150)}` });
  }
}
await done(ct);
// Principal approves the simulation corrections.
const pr = await as("cems.principal");
const waiting = sql(`select id, reason from attendance_correction where section_id='${G5A}' and date=current_date and status='WAITING' and reason like '${TAG}%'`);
for (const [id, reason] of waiting) {
  await visit(pr, `/attendance-management/register/corrections/${id}`);
  await pr.getByRole("button", { name: "Approve", exact: true }).click();
  await pr.waitForTimeout(600);
  const dlg = pr.getByRole("dialog");
  if (await dlg.isVisible().catch(() => false)) await dlg.getByRole("button", { name: /^Approve/ }).last().click();
  await pr.waitForTimeout(3000);
  const st = sql(`select status from attendance_correction where id='${id}'`)[0][0];
  record({ area: A, role: "Principal", check: `Principal approves correction: ${reason.replace(TAG + ": ", "")}`, status: st === "APPROVED" ? "PASS" : "FAIL", note: `status ${st}; ${(await feedback(pr, 100)).slice(0, 120)}` });
}
const db1 = dbMarks();
await done(pr);
const ct2 = await as("cems.classteacher");
await visit(ct2, "/attendance-management");
const after = sum(await text(ct2));
await shot(ct2, "day-06-attendance-after-corrections");
record({ area: A, role: "Class Teacher", check: "After approval the Grade 5 A register shows the corrected marks", status: after.A === (db1.absent ?? 0) && after.L === (db1.late ?? 0) && after.P === (db1.present ?? 0) ? "PASS" : "FAIL", note: `screen P${after.P} A${after.A} L${after.L} Lv${after.LV}; saved present ${db1.present ?? 0}, absent ${db1.absent ?? 0}, late ${db1.late ?? 0}, leave ${db1.leave ?? 0}` });
await done(ct2);

// ---------- 2. Homework ----------
const HW = "Demo QA simulation: English reader page 12, read aloud";
if (sql(`select count(*) from homework where school_id='${SCHOOL_A}' and title='${HW}'`)[0][0] === "0") {
  const h = await as("cems.classteacher");
  await visit(h, "/homework-learning?do=give");
  const sheet = h.locator("dialog[open]").last();
  await sheet.waitFor({ timeout: 20000 });
  const radio = sheet.locator('[role="radio"]', { hasText: "5 A" });
  if (await radio.count()) await radio.first().click();
  await sheet.locator('[name="title"]').fill(HW);
  await sheet.locator('[name="instructions"]').fill("Demo: read page 12 aloud at home and note three new words.");
  await sheet.locator('[role="radio"], button', { hasText: "Pick a date" }).first().click();
  await sheet.locator("#gh-due").fill("2026-10-19");
  await sheet.locator("button", { hasText: /^Send to/ }).click();
  await h.waitForTimeout(3500);
  const fb = await feedback(h, 200);
  const row = sql(`select title, due_date from homework where school_id='${SCHOOL_A}' and title='${HW}'`);
  await visit(h, "/homework-learning");
  const list = await text(h, 3000);
  await shot(h, "day-07-homework");
  record({ area: A, role: "Class Teacher", check: "Teacher sets homework for Grade 5 A (due 19-10-2026)", status: row.length === 1 && list.includes("English reader page 12") ? "PASS" : "FAIL", note: `${fb.slice(0, 150)}; saved rows ${row.length}; listed on Homework: ${list.includes("English reader page 12")}` });
  await done(h);
} else record({ area: A, role: "Class Teacher", check: "Teacher sets homework for Grade 5 A", status: "PASS", note: "already set earlier in this run" });

// ---------- 3. Cash fee at the counter + receipt ----------
const acc = await as("cems.accountant");
let pay = sql(`select p.id, r.number from payment p left join receipt r on r.payment_id=p.id where p.student_id='${LASYA}' and p.mode='CASH' and p.status='POSTED' and p.payment_date=current_date order by p.created_at desc limit 1`)[0];
if (!pay) {
  const r = await collect(acc, LASYA, { mode: "Cash", amount: "2500" });
  await shot(acc, "day-08-cash-receipt");
  pay = sql(`select p.id, r.number from payment p left join receipt r on r.payment_id=p.id where p.student_id='${LASYA}' and p.mode='CASH' and p.status='POSTED' and p.payment_date=current_date order by p.created_at desc limit 1`)[0];
  record({ area: A, role: "Accountant", check: "Collect ₹2,500 cash part payment from Lasya Boddu (Grade 5 A)", status: r.ok && pay?.[1] ? "PASS" : "FAIL", note: `${r.text.slice(0, 220)} | receipt ${pay?.[1]}` });
} else record({ area: A, role: "Accountant", check: "Collect ₹2,500 cash from Lasya Boddu", status: "PASS", note: `already collected earlier in this run, receipt ${pay[1]}` });
if (pay) {
  await visit(acc, `/fee-management/payments/${pay[0]}`);
  const pt = await text(acc, 2500);
  const printBtn = acc.getByRole("link", { name: /Print|PDF|Download/ }).or(acc.getByRole("button", { name: /Print|PDF|Download/ }));
  const n = await printBtn.count();
  let pdf = "no print control";
  if (n) {
    const href = await printBtn.first().getAttribute("href").catch(() => null);
    if (href) {
      const res = await acc.request.get(new URL(href, acc.url()).toString());
      pdf = `${href} -> ${res.status()} ${res.headers()["content-type"]} ${(await res.body()).length} bytes`;
    } else pdf = `print button: ${await printBtn.first().innerText()}`;
  }
  await shot(acc, "day-09-payment-page");
  record({ area: A, role: "Accountant", check: `Receipt ${pay[1]} can be printed from the payment`, status: pt.includes(pay[1]) && /200 application\/pdf|print button/.test(pdf) ? "PASS" : "FAIL", note: `${pdf}; page shows receipt no: ${pt.includes(pay[1])}; amount ₹2,500 shown: ${/2,500/.test(pt)}` });
}
await done(acc);

// ---------- 4. Library issue ----------
const issued = sql(`select count(*) from book_issue i join book_copy c on c.id=i.copy_id where i.school_id='${SCHOOL_A}' and c.accession_no='00009' and i.returned_on is null`)[0][0];
if (issued === "0") {
  const lib = await as("cems.librarian");
  await visit(lib, `/library-management?card=${encodeURIComponent("CEMS/2026/0176")}`);
  await lib.waitForTimeout(800);
  await lib.locator("input[name=code]").fill("00009");
  await lib.getByRole("button", { name: "Go" }).click();
  for (let i = 0; i < 20; i++) { await lib.waitForTimeout(800); if (await lib.getByRole("button", { name: /^(Issue|Return|Reserve) “/ }).count()) break; }
  await lib.getByRole("button", { name: /^Issue “/ }).first().click();
  let s = "";
  for (let i = 0; i < 20; i++) { await lib.waitForTimeout(800); s = await feedback(lib, 0); if (/issued|refused|cannot|limit/i.test(s)) break; }
  await visit(lib, "/library-management");
  const lt = await text(lib, 2500);
  await shot(lib, "day-10-library-issue");
  record({ area: A, role: "Librarian", check: "Issue Demo Import Atlas (copy 00009) to Sai Naidu, Grade 5 A", status: /issued to Sai Naidu/i.test(s) ? "PASS" : "FAIL", note: `${s.slice(0, 200)} | Issued today on desk: ${lt.match(/Issued today\n(\d+)/)?.[1]}` });
  await done(lib);
} else record({ area: A, role: "Librarian", check: "Issue copy 00009 to Sai Naidu", status: "PASS", note: "already issued earlier in this run" });
await close();
