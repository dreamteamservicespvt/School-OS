// Salary cycle: the September 2026 run (opened by month.mjs) has nobody in it because both salary
// structures start 01-10-2026; sending an empty run is tried. Then the October 2026 run (opened,
// approved and paid earlier in this QA) is followed through: approval trail, slips, Day Book,
// Salary register report, and the teacher sees only their own slip.
//   node qa/simulations/salary-cycle.mjs
import { as, visit, text, shot, record, done, close, sql, SCHOOL_A, feedback } from "./sim-lib.mjs";

const A = "sim-salary";
const sep = sql(`select id, status, staff_count from payroll_run where school_id='${SCHOOL_A}' and month='2026-09-01'`)[0];
const oct = sql(`select id, status, staff_count, gross_paise, net_paise, paid_on from payroll_run where school_id='${SCHOOL_A}' and month='2026-10-01'`)[0];
const acc = await as("cems.accountant");
if (sep?.[1] === "CALCULATED") {
  await visit(acc, `/salary-management/generate?run=${sep[0]}`);
  const t = await text(acc, 3000);
  const send = acc.locator("main").getByRole("button", { name: "Send for approval" });
  let note = `September run: ${sep[2]} staff; flags: ${(t.match(/\d+ staff have no salary structure/) ?? [""])[0]}`;
  if (await send.count()) {
    await send.first().click();
    await acc.waitForTimeout(1200);
    const d = acc.getByRole("dialog").last();
    const dt = (await d.innerText().catch(() => "")).replace(/\s+/g, " ");
    const go = d.getByRole("button", { name: "Send for approval" });
    const en = (await go.count()) ? await go.isEnabled() : false;
    if (en) { await go.click(); await acc.waitForTimeout(5000); }
    const st = sql(`select status from payroll_run where id='${sep[0]}'`)[0][0];
    note += ` | sheet: ${dt.slice(0, 200)} | ${(await feedback(acc, 100)).slice(0, 150)} | status now ${st}`;
    record({ area: A, role: "Accountant", check: "Send a salary run with 0 staff (September 2026) for approval", status: st === "CALCULATED" ? "PASS" : "FAIL", note: note + (st === "CALCULATED" ? " (refused / not offered)" : " (an empty run went to approval)") });
  } else record({ area: A, role: "Accountant", check: "Send a salary run with 0 staff for approval", status: "PASS", note: note + " | Send not offered" });
}
record({ area: A, role: "Accountant", check: "Run a fresh month through approval and payslips (September 2026)", status: "BLOCKED", note: "Only 2 of the 46-47 staff have a salary structure and both start 01-10-2026, so September calculates 0 staff and ₹0; November cannot honestly be paid before its pay day. The October 2026 run (opened, approved by the Principal and paid earlier in this QA) is followed below instead. To unblock: add salary structures effective from 01-09-2026 or earlier (Salary Structures)." });

// October run.
await visit(acc, "/salary-management/generate");
const ot = await text(acc, 4000);
const approvedBy = ot.match(/Paid [^\n]*approved by ([^\n]+)/)?.[1];
const net = Number(oct[4]) / 100;
record({ area: A, role: "Accountant", check: "October 2026 run shows its approval trail (approved by the Principal) and Paid", status: oct[1] === "PAID" && /Kesava/.test(approvedBy ?? "") ? "PASS" : "FAIL", note: `status ${oct[1]}; "${ot.match(/October 2026\nPaid\n[^\n]+/)?.[0]?.replace(/\n/g, " ")}"; net ₹${net.toLocaleString("en-IN")}` });
const dbk = sql(`select direction, amount_paise, to_char(date,'DD-MM-YYYY') from day_book_entry where school_id='${SCHOOL_A}' and source_id='${oct[0]}'`);
await visit(acc, `/finance-management/day-book`);
const db = await text(acc, 9000);
record({ area: A, role: "Accountant", check: "October salary = one Day Book salary entry for the net pay, shown in the Day Book", status: dbk.length === 1 && Number(dbk[0][1]) / 100 === net && db.includes(`₹${net.toLocaleString("en-IN")}`) ? "PASS" : "FAIL", note: `day book rows ${JSON.stringify(dbk)}; Day Book screen mentions ₹${net.toLocaleString("en-IN")}: ${db.includes(`₹${net.toLocaleString("en-IN")}`)}` });
await visit(acc, "/salary-management/slips");
const sl = await text(acc, 4000);
await shot(acc, "salary-01-slips-accountant");
record({ area: A, role: "Accountant", check: "Salary Slips (October) list both paid staff with net pay", status: /Lavanya Teki/.test(sl) && /Pavan Seela/.test(sl) ? "PASS" : "FAIL", note: sl.split("\n").filter((l) => /Lavanya|Pavan|₹/.test(l)).slice(0, 8).join(" | ") });
await visit(acc, "/reports-analytics/r/sa-register?from=2026-10-01&to=2026-10-31");
const sr = await text(acc, 5000);
await shot(acc, "salary-02-register-report");
record({ area: A, role: "Accountant", check: "Salary register report (October) net = run net pay", status: sr.includes(`₹${net.toLocaleString("en-IN")}`) ? "PASS" : "FAIL", note: `run net ₹${net.toLocaleString("en-IN")}; report lines: ${sr.split("\n").filter((l) => /Total|Lavanya|Pavan/.test(l)).slice(0, 4).join(" | ").replace(/\t/g, " ")}` });
await done(acc);

// HR sees salary? (blueprint 05-roles decides; record what the screen does)
const hr = await as("cems.hr");
await visit(hr, "/salary-management/generate");
const ht = await text(hr, 1500);
record({ area: A, role: "HR Manager", check: "HR opens Generate Salary", status: /Generate Salary/.test(ht) && /October 2026/.test(ht) ? "PASS" : "FAIL", note: `${hr.url().replace(/.*:\d+/, "")}: ${ht.replace(/\s+/g, " ").slice(0, 200)}` });
await done(hr);

// Teacher (Demo Pavan Seela) sees own slip only.
const te = await as("cems.teacher");
await visit(te, "/salary-management/slips");
const tt = await text(te, 4000);
await shot(te, "salary-03-slip-teacher-own");
const own = /Only your own slips/.test(tt) && /₹20,050/.test(tt), other = /Lavanya|₹49,200/.test(tt);
record({ area: A, role: "Teacher", check: "Teacher sees own salary slip (Demo Pavan Seela, net ₹20,050) and not another teacher's (Lavanya, ₹49,200)", status: own && !other ? "PASS" : "FAIL", note: `own shown ${own}; Lavanya Teki shown ${other}; ${tt.replace(/\s+/g, " ").slice(0, 250)}` });
// Download own slip PDF if a link exists.
const pdfLink = te.getByRole("link", { name: /PDF|Download|View|Open/ }).first();
if (await pdfLink.count()) {
  const href = await pdfLink.getAttribute("href");
  const res = href ? await te.request.get(new URL(href, te.url()).toString()) : null;
  record({ area: A, role: "Teacher", check: "Teacher opens own slip", status: res && res.status() === 200 ? "PASS" : "FAIL", note: `${href} -> ${res?.status()} ${res?.headers()["content-type"]}` });
}
// Another teacher's slip by direct address.
const otherSlip = sql(`select p.id from payslip p join payroll_line l on l.id=p.line_id join staff s on s.id=l.staff_id where s.staff_code='CEMS-ST-008' limit 1`)[0]?.[0];
if (otherSlip) {
  for (const u of [`/salary-management/slips?slip=${otherSlip}`, `/salary-management/slips/${otherSlip}`]) {
    const r = await visit(te, u);
    const x = await text(te, 1500);
    const leak = /Lavanya/.test(x) && /₹/.test(x);
    record({ area: A, role: "Teacher", check: `Teacher opens another teacher's slip by address (${u.replace(otherSlip, "<Lavanya's slip>")})`, status: leak ? "FAIL" : "PASS", note: `HTTP ${r?.status()}; ${x.replace(/\s+/g, " ").slice(0, 160)}` });
  }
}
await done(te);
await close();
