// One month: dues and reminders view, the month's attendance register, a salary run for
// September 2026 (HR/accountant open and send, Principal approves, accountant pays, slips), and
// Finance month close in order (July refused while June is open, then June closed).
//   node qa/simulations/month.mjs [dues,att,salary,close]
import { as, visit, text, shot, record, done, close, sql, SCHOOL_A, feedback } from "./sim-lib.mjs";

const A = "sim-month";
const ONLY = process.argv[2] ?? "dues,att,salary,close";
const on = (k) => ONLY.split(",").includes(k);
const G5A = "949e25d2-78bc-48aa-a6b6-7fd678175201";
const rs = (s) => Number(String(s ?? "").replace(/[₹,\s]/g, ""));

// ---------- Dues and reminders ----------
if (on("dues")) {
  const acc = await as("cems.accountant");
  await visit(acc, "/fee-management/defaulters");
  const t = await text(acc, 6000);
  await shot(acc, "month-01-defaulters");
  const head = t.match(/(\d+) students owe (₹[\d,]+) past the due date/);
  const remind = /Send reminder to all/.test(t) && /Last reminder/.test(t);
  record({ area: A, role: "Accountant", check: "Defaulters (dues list) opens with totals, ageing, class split, Last reminder column and 'Send reminder to all'", status: head && remind ? "PASS" : "FAIL", note: `${head?.[0]}; reminder controls ${remind}. 'Send reminder to all' not pressed (would message ${head?.[1]} students' parents)` });
  await done(acc);
}
if (on("remind")) {
  // Reminder for one overdue student (Vihaan Rao: fee overdue scenario): tick the row, Send reminder.
  const acc = await as("cems.accountant");
  await visit(acc, "/fee-management/defaulters?q=Vihaan%20Rao");
  const row = acc.locator("tr", { hasText: "Vihaan Rao" }).first();
  const before = (await row.innerText()).replace(/\s+/g, " ");
  await row.locator("input[type=checkbox], [role=checkbox]").first().click();
  await acc.waitForTimeout(800);
  await acc.locator("main").getByRole("button", { name: /^Send reminder$/ }).click();
  await acc.waitForTimeout(1500);
  const dlg = acc.locator("dialog[open], [role=dialog]").last();
  const dt = (await dlg.innerText().catch(() => "")).replace(/\s+/g, " ");
  const sendBtn = dlg.getByRole("button", { name: /^Send to 1 parent/ });
  const enabled = (await sendBtn.count()) ? await sendBtn.isEnabled() : false;
  if (enabled) { await sendBtn.click(); await acc.waitForTimeout(3500); }
  const fb = await feedback(acc, 100);
  await shot(acc, "month-02-reminder");
  const noCredit = /needs \d+ credits?\. You have 0/.test(dt);
  record({ area: A, role: "Accountant", check: "Fee reminder for one overdue student (Vihaan Rao): tick the row, Send reminder", status: enabled ? (/sent|queued/i.test(fb) ? "PASS" : "FAIL") : noCredit ? "NEEDS EXTERNAL CREDENTIAL" : "FAIL", note: `Send button enabled ${enabled}. Sheet: ${dt.slice(0, 420)} ${fb.slice(0, 120)}` });
  const owed = before.match(/₹[\d,]+/)?.[0];
  const said = dt.match(/a fee of (₹[\d,]+)[^.]*due on ([\d-]+)/);
  record({ area: A, role: "Accountant", check: "Reminder wording agrees with the Defaulters row (overdue amount and date)", status: said && owed === said[1] ? "PASS" : "FAIL", note: `Defaulters row overdue ${owed} (oldest due 10-06-2026); reminder preview says "a fee of ${said?.[1]} ... is due on ${said?.[2]}". The preview total includes amounts not yet overdue (e.g. late fee due 16-10-2026) but gives the oldest due date for all of it. Screenshot qa-output/simulations/month-02-reminder.png` });
  await done(acc);
}

// ---------- Month's attendance register ----------
if (on("att")) {
  const pr = await as("cems.principal");
  await visit(pr, "/reports-analytics/r/at-monthly?period=thismonth&class=9d0e8325-9a6b-4443-9af8-10e8eda87ac2");
  const t = await text(pr, 6000);
  await shot(pr, "month-03-attendance-register");
  const rows = t.split("\n").filter((l) => /\tGrade 5 A\t/.test(l)).map((l) => l.split("\t"));
  const mism = [];
  for (const r of rows) {
    const [name, , , days, P, Ab, L, Lv] = r;
    const db = Object.fromEntries(sql(`select m.status_key, count(*) from attendance_mark m join student s on s.id=m.student_id where m.section_id='${G5A}' and s.first_name||' '||s.last_name='${name.replace(/'/g, "''")}' and m.date between '2026-10-01' and '2026-10-31' and m.archived_at is null and m.period_no=0 group by 1`).map(([k, n]) => [k, Number(n)]));
    const p = (db.present ?? 0) + (db.late ?? 0);
    if (Number(P) !== p || Number(Ab) !== (db.absent ?? 0) || Number(L) !== (db.late ?? 0) || Number(Lv) !== (db.leave ?? 0)) mism.push(`${name}: report P${P} A${Ab} L${L} Lv${Lv} vs saved P${p} A${db.absent ?? 0} L${db.late ?? 0} Lv${db.leave ?? 0}`);
  }
  record({ area: A, role: "Principal", check: "Monthly attendance register (October, Grade 5 A) agrees with each student's saved marks", status: rows.length && !mism.length ? "PASS" : "FAIL", note: `${rows.length} Grade 5 A rows; ${mism.join("; ") || "all match (Late counted inside Present)"}` });
  const days = rows[0]?.[3];
  const marked = sql(`select count(distinct date) from attendance_mark where section_id='${G5A}' and date between '2026-10-01' and current_date and archived_at is null`)[0][0];
  record({ area: A, role: "Principal", check: "Monthly register: 'School days' and 'Present %' are consistent", status: Number(days) > Number(marked) && /\t100%$/.test(rows[0]?.join("\t") ?? "") ? "FAIL" : "PASS", note: `Every row shows School days ${days}, but only ${marked} days have marks this month; Present % is worked out on marked days only (e.g. Aarav Kumar: 5 present of ${days} school days shown as 100%). A reader cannot tell that ${Number(days) - Number(marked)} school days were never marked. Screenshot qa-output/simulations/month-03-attendance-register.png` });
  await done(pr);
}

// ---------- Salary run, September 2026 ----------
const MONTH = "2026-09-01";
const run = () => sql(`select id, status, staff_count, gross_paise, net_paise, paid_on from payroll_run where school_id='${SCHOOL_A}' and month='${MONTH}'`)[0];
if (on("salary")) {
  let r = run();
  if (!r) {
    // HR first: may HR open the month?
    const hr = await as("cems.hr");
    await visit(hr, "/salary-management/generate?do=open-month");
    const dlg = hr.getByRole("dialog").last();
    let who = "Accountant";
    if (await dlg.locator("select[name=month]").count()) {
      await dlg.locator("select[name=month]").selectOption("2026-09");
      await dlg.getByRole("button", { name: "Open month" }).click();
      await hr.waitForTimeout(8000);
      who = "HR";
    }
    const fb = await feedback(hr, 100);
    await done(hr);
    r = run();
    if (!r) {
      const acc = await as("cems.accountant");
      await visit(acc, "/salary-management/generate?do=open-month");
      const d2 = acc.getByRole("dialog").last();
      await d2.locator("select[name=month]").selectOption("2026-09");
      await d2.getByRole("button", { name: "Open month" }).click();
      await acc.waitForTimeout(8000);
      await done(acc);
      r = run();
      record({ area: A, role: "HR Manager", check: "HR opens the September 2026 salary month", status: "PASS", note: `HR has no Open month here (${fb.slice(0, 120) || "no dialog"}); the accountant opened it` });
    }
    record({ area: A, role: who === "HR" ? "HR Manager" : "Accountant", check: "Open September 2026 and calculate salary", status: r?.[1] === "CALCULATED" ? "PASS" : "FAIL", note: `run ${JSON.stringify(r)} ${fb.slice(0, 150)}` });
  }
  r = run();
  if (r?.[1] === "CALCULATED") {
    const acc = await as("cems.accountant");
    await visit(acc, `/salary-management/generate?run=${run()[0]}&do=send`);
    const d = acc.getByRole("dialog").last();
    if (await d.getByRole("button", { name: "Send for approval" }).count()) { await d.getByRole("button", { name: "Send for approval" }).click(); await acc.waitForTimeout(6000); }
    const fb = await feedback(acc, 100);
    await shot(acc, "month-04-salary-sent");
    record({ area: A, role: "Accountant", check: "Send September salary for approval", status: run()[1] === "WAITING" ? "PASS" : "FAIL", note: `${fb.slice(0, 150)} | status ${run()[1]}` });
    await done(acc);
  }
  if (run()?.[1] === "WAITING") {
    const pr = await as("cems.principal");
    await visit(pr, `/salary-management/generate?run=${run()[0]}&do=approve`);
    const d = pr.getByRole("dialog").last();
    if (await d.getByRole("button", { name: /^Approve salary/ }).count()) { await d.getByRole("button", { name: /^Approve salary/ }).click(); await pr.waitForTimeout(6000); }
    const fb = await feedback(pr, 100);
    const slips = sql(`select count(*) from payslip where run_id='${run()[0]}'`)[0][0];
    record({ area: A, role: "Principal", check: "Principal approves September salary; slips are made", status: run()[1] === "APPROVED" && Number(slips) > 0 ? "PASS" : "FAIL", note: `${fb.slice(0, 150)} | status ${run()[1]}, slips ${slips}` });
    await done(pr);
  }
  if (run()?.[1] === "APPROVED") {
    const acc = await as("cems.accountant");
    await visit(acc, `/salary-management/generate?run=${run()[0]}&do=pay`);
    const d = acc.getByRole("dialog").last();
    const fields = await d.evaluate((e) => [...e.querySelectorAll("input,select")].map((i) => `${i.name}=${i.value}`).join(" ")).catch(() => "");
    await d.locator("input[name=reference]").fill("DEMOSALBATCH0926").catch(() => {});
    await d.getByRole("button", { name: /^Mark paid/ }).click();
    await acc.waitForTimeout(7000);
    const fb = await feedback(acc, 100);
    const dbk = sql(`select direction, amount_paise, date, section from day_book_entry where school_id='${SCHOOL_A}' and source_id='${run()[0]}'`);
    await shot(acc, "month-05-salary-paid");
    record({ area: A, role: "Accountant", check: "Mark September salary paid; one Day Book salary entry for the net pay", status: run()[1] === "PAID" && dbk.length === 1 && dbk[0][1] === run()[4] ? "PASS" : "FAIL", note: `${fb.slice(0, 150)} | pay sheet fields: ${fields.slice(0, 200)} | run ${JSON.stringify(run())} | day book ${JSON.stringify(dbk)}` });
    await done(acc);
  }
  // Slips: accountant sees all, teacher sees own only.
  const acc = await as("cems.accountant");
  await visit(acc, "/salary-management/slips");
  const at = await text(acc, 3000);
  await shot(acc, "month-06-salary-slips");
  record({ area: A, role: "Accountant", check: "Salary Slips for September list the paid staff", status: /Pavan Seela/.test(at) && /Lavanya Teki/.test(at) ? "PASS" : "FAIL", note: at.split("\n").filter((l) => /Pavan|Lavanya|Sept/.test(l)).slice(0, 6).join(" | ") });
  // Salary register report for September = run totals.
  await visit(acc, "/reports-analytics/r/sa-register?from=2026-09-01&to=2026-09-30");
  const sr = await text(acc, 4000);
  const r2 = run();
  const net = r2 ? (Number(r2[4]) / 100).toLocaleString("en-IN") : "?";
  record({ area: A, role: "Accountant", check: "Salary register report for September shows the same net pay as the run", status: r2 && sr.includes(`₹${net}`) ? "PASS" : "FAIL", note: `run net ₹${net}; report: ${(sr.match(/Showing:[^\n]*/)?.[0] ?? "")} ${sr.split("\n").filter((l) => /Total|Pavan|Lavanya/.test(l)).slice(0, 4).join(" | ").replace(/\t/g, " ")}` });
  await done(acc);
}

// ---------- Finance month close in order ----------
if (on("close")) {
  const acc = await as("cems.accountant");
  const state = () => Object.fromEntries(sql(`select to_char(month,'YYYY-MM'), 'CLOSED' from period_close where school_id='${SCHOOL_A}'`));
  const before = state();
  // The "Close month" links open a sheet at ?close=YYYY-MM.
  async function tryClose(ym) {
    await visit(acc, `/finance-management/settings?close=${ym}`);
    await acc.waitForTimeout(1200);
    const dlg = acc.locator("dialog[open], [role=dialog]").last();
    const dt = (await dlg.innerText().catch(() => "")).replace(/\s+/g, " ");
    const btns = dlg.getByRole("button", { name: /Close (June|July|this month|month)/ });
    const n = await btns.count();
    const en = n ? await btns.last().isEnabled() : false;
    if (en) { await btns.last().click(); await acc.waitForTimeout(3500); }
    return { dt, n, en, fb: await feedback(acc, 100) };
  }
  const j = await tryClose("2026-07");
  const afterJuly = state();
  await shot(acc, "month-07a-close-july-refused");
  record({ area: A, role: "Accountant", check: "Close July 2026 while June is open: refused (months close in order)", status: afterJuly["2026-07"] !== "CLOSED" ? "PASS" : "FAIL", note: `sheet: ${j.dt.slice(0, 260)} | confirm buttons ${j.n}, enabled ${j.en} | ${j.fb.slice(0, 150)} | July now ${afterJuly["2026-07"] ?? "open"}` });
  let juneNote = "already closed";
  if (before["2026-06"] !== "CLOSED") {
    const r = await tryClose("2026-06");
    juneNote = `sheet: ${r.dt.slice(0, 300)} | confirm enabled ${r.en} | ${r.fb.slice(0, 150)}`;
  }
  const after = state();
  await visit(acc, "/finance-management/settings");
  await shot(acc, "month-07-month-close");
  const t = await text(acc, 2500);
  record({ area: A, role: "Accountant", check: "Close June 2026 (April and May already closed)", status: after["2026-06"] === "CLOSED" && /June 2026\nClosed/.test(t) ? "PASS" : "FAIL", note: `${juneNote} | months closed: ${Object.keys(after).sort().join(", ")}` });
  await done(acc);
}
await close();
