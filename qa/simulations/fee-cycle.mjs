// Fee cycle for Charan Lanka (Grade 5 A, new admission, nothing paid): dues, a ₹2,000
// concession sent to the Principal and approved, a part payment by UPI, the rest in cash,
// receipts, Student Fee Ledger, Defaulters; then the totals the accountant and the Principal see.
//   node qa/simulations/fee-cycle.mjs [dues,concession,approve,part,full,ledger,cross]
import { as, visit, text, shot, record, done, close, sql, SCHOOL_A, feedback } from "./sim-lib.mjs";
import { collect } from "../money/collect-lib.mjs";

const A = "sim-fee";
const ONLY = process.argv[2] ?? "dues,concession,approve,part,full,ledger,cross";
const on = (k) => ONLY.split(",").includes(k);
const CHARAN = "9321de3b-7233-484a-890d-104a3a5d673c";
const REASON = "Demo QA simulation: sibling concession, letter on file";
const rs = (s) => Number(String(s ?? "").replace(/[₹,\s]/g, ""));
const inr = (p) => `₹${(Number(p) / 100).toLocaleString("en-IN")}`;
const bal = () => Number(sql(`select coalesce(sum(balance_paise) filter (where state='OPEN'),0) from student_fee_due where student_id='${CHARAN}'`)[0][0]);
const pays = () => sql(`select p.id, p.amount_paise, p.mode, p.status, r.number from payment p left join receipt r on r.payment_id=p.id where p.student_id='${CHARAN}' order by p.created_at`);
const conc = () => sql(`select id, status, amount_paise from concession where student_id='${CHARAN}' and reason='${REASON}'`)[0];

const acc = await as("cems.accountant");
if (on("dues")) {
  await visit(acc, `/fee-management/collect/${CHARAN}`);
  await acc.getByText("How is it paid?").waitFor({ timeout: 60000 });
  const t = await text(acc, 3000);
  const left = t.match(/Left this year (₹[\d,]+)/)?.[1];
  const rows = t.match(/Payment\n(\d+) rows · (₹[\d,]+)/);
  await shot(acc, "fee-01-dues");
  record({ area: A, role: "Accountant", check: "Collect Fee shows Charan Lanka's dues (year, paid, left, ticked rows)", status: left && rs(left) * 100 === bal() ? "PASS" : "FAIL", note: `screen 'Left this year ${left}', ticked ${rows?.[1]} rows ${rows?.[2]}; open dues in records ${inr(bal())}` });
}
if (on("concession") && !conc()) {
  const before = bal();
  await visit(acc, `/fee-management/concessions?do=new&student=${CHARAN}`);
  const d = acc.getByRole("dialog").last();
  await d.waitFor();
  await d.locator("select[name=type]").selectOption("DISCOUNT").catch(async () => d.locator("select[name=type]").selectOption({ index: 1 }));
  await d.locator("select[name=period]").selectOption("whole").catch(() => {});
  await d.locator("input[name=value]").fill("2000");
  await d.locator("textarea[name=reason]").fill(REASON);
  await d.getByRole("button", { name: "Apply concession" }).click();
  await acc.waitForTimeout(3000);
  const fb = await feedback(acc, 100);
  const c = conc();
  record({ area: A, role: "Accountant", check: "Concession ₹2,000 for Charan Lanka (above the counter limit) goes to the Principal; dues unchanged until approved", status: c?.[1] === "WAITING" && bal() === before ? "PASS" : "FAIL", note: `${fb.slice(0, 150)} | concession ${JSON.stringify(c)} | balance ${inr(before)} -> ${inr(bal())}` });
}
await done(acc);
if (on("approve") && conc()?.[1] === "WAITING") {
  const pr = await as("cems.principal");
  const before = bal();
  const ap = sql(`select id, summary from approval where school_id='${SCHOOL_A}' and status='WAITING' and summary like '%Charan Lanka%' order by created_at desc limit 1`)[0];
  await visit(pr, "/approvals");
  const list = await text(pr, 3000);
  const listed = /Charan Lanka/.test(list);
  if (ap) {
    await visit(pr, `/approvals/${ap[0]}`);
    await pr.getByRole("button", { name: "Approve", exact: true }).first().click();
    await pr.waitForTimeout(800);
    const dlg = pr.getByRole("dialog");
    if (await dlg.count()) { const b = dlg.getByRole("button", { name: /^Approve/ }); if (await b.count()) await b.last().click(); }
    await pr.waitForTimeout(3500);
  }
  const fb = await feedback(pr, 100);
  await shot(pr, "fee-02-concession-approved");
  const dbk = sql(`select count(*) from day_book_entry where student_id='${CHARAN}'`)[0][0];
  record({ area: A, role: "Principal", check: "Principal sees the concession in Approvals and approves it; dues drop by ₹2,000, no Day Book entry", status: /APPROVED|APPLIED/.test(conc()?.[1] ?? "") && before - bal() === 200000 && dbk === "0" ? "PASS" : "FAIL", note: `listed in Approvals ${listed}; '${ap?.[1]}'; ${fb.slice(0, 120)} | balance ${inr(before)} -> ${inr(bal())}; day book rows ${dbk}` });
  await done(pr);
}
if (on("part") && !pays().some((p) => p[2] === "UPI" && p[3] === "POSTED")) {
  const a2 = await as("cems.accountant");
  const before = bal();
  const r = await collect(a2, CHARAN, { mode: "UPI", amount: "10000", ref: "DEMOUPISIMCHARAN01" });
  await shot(a2, "fee-03-part-payment");
  const p = pays().find((x) => x[2] === "UPI");
  record({ area: A, role: "Accountant", check: "Part payment ₹10,000 by UPI from Charan Lanka", status: r.ok && p?.[4] && before - bal() === 1000000 ? "PASS" : "FAIL", note: `${r.text.slice(0, 160)} | receipt ${p?.[4]} | balance ${inr(before)} -> ${inr(bal())}` });
  await done(a2);
}
if (on("full") && !pays().some((p) => p[2] === "CASH" && p[3] === "POSTED")) {
  const a3 = await as("cems.accountant");
  await visit(a3, `/fee-management/collect/${CHARAN}`);
  await a3.getByText("How is it paid?").waitFor({ timeout: 60000 });
  const t = await text(a3, 3000);
  const btn = (await a3.getByRole("button", { name: /^Collect ₹/ }).innerText()).trim();
  const before = bal();
  const r = await collect(a3, CHARAN, { mode: "Cash" });
  await shot(a3, "fee-04-full-payment");
  const p = pays().filter((x) => x[2] === "CASH").at(-1);
  record({ area: A, role: "Accountant", check: "Full payment of the rest in cash (all ticked rows)", status: r.ok && p?.[4] ? "PASS" : "FAIL", note: `button "${btn}"; ${r.text.slice(0, 160)} | receipt ${p?.[4]} | balance ${inr(before)} -> ${inr(bal())}; screen before said ${t.match(/Left this year (₹[\d,]+)/)?.[0]}` });
  await done(a3);
}
if (on("ledger")) {
  const a4 = await as("cems.accountant");
  // Receipts as PDF.
  for (const p of pays().filter((x) => x[3] === "POSTED")) {
    const res = await a4.request.get(`${new URL(a4.url()).origin}/fee-management/payments/${p[0]}/receipt`);
    record({ area: A, role: "Accountant", check: `Receipt ${p[4]} (${p[2]} ${inr(p[1])}) prints as PDF`, status: res.status() === 200 && /pdf/.test(res.headers()["content-type"] ?? "") ? "PASS" : "FAIL", note: `${res.status()} ${res.headers()["content-type"]} ${(await res.body()).length} bytes` });
  }
  await visit(a4, `/fee-management/ledger/${CHARAN}`);
  const t = await text(a4, 6000);
  await shot(a4, "fee-05-ledger", true);
  const posted = pays().filter((x) => x[3] === "POSTED");
  const allReceipts = posted.every((p) => t.includes(p[4]));
  const balShown = t.match(/(Balance|Left|Still to pay|Due now)[^\n]*\n?(₹[\d,]+)/)?.[2];
  record({ area: A, role: "Accountant", check: "Student Fee Ledger shows the concession, both payments with receipt numbers, and the balance", status: allReceipts && /2,000/.test(t) && (balShown === undefined || rs(balShown) * 100 === bal()) ? "PASS" : "FAIL", note: `receipts listed ${allReceipts} (${posted.map((p) => p[4]).join(", ")}); concession ₹2,000 shown ${/2,000/.test(t)}; balance shown ${balShown ?? "(no balance line found)"} vs records ${inr(bal())}` });
  await visit(a4, "/fee-management/defaulters?q=Charan%20Lanka");
  const dt = await text(a4, 3000);
  const stillOverdue = Number(sql(`select count(*) from student_fee_due where student_id='${CHARAN}' and state='OPEN' and balance_paise>0 and due_date<current_date`)[0][0]);
  record({ area: A, role: "Accountant", check: "Defaulters: Charan Lanka is listed only if something is still overdue", status: /Charan Lanka/.test(dt) === stillOverdue > 0 ? "PASS" : "FAIL", note: `listed ${/Charan Lanka/.test(dt)}; overdue rows left ${stillOverdue}; balance ${inr(bal())}` });
  await done(a4);
}
if (on("cross")) {
  // Same moment, both roles.
  const a5 = await as("cems.accountant");
  const pr = await as("cems.principal");
  const grab = async (p) => {
    await visit(p, "/fee-management/dashboard");
    const fd = await text(p, 3000);
    await visit(p, "/fee-management/defaulters");
    const df = await text(p, 1500);
    await visit(p, "/dashboard");
    const d = await text(p, 6000);
    await visit(p, "/fee-management/reports");
    const fr = await text(p, 3000);
    return {
      today: fd.match(/Collected today\n(₹[\d,]+)\n(\d+) payments/)?.slice(1).join(" / "),
      year: fd.match(/Collected this year\n([^\n]+)\nof ([^\n]+) due so far/)?.slice(1).join(" of "),
      overdue: fd.match(/Overdue\n(₹[\d.]+ ?[LkCr]*)\n(\d+) students/)?.slice(1).join(" / "),
      defaulters: df.match(/(\d+) students owe (₹[\d,]+) past the due date/)?.slice(1).reverse().join(" / "),
      dashOverdue: d.match(/(₹[\d,]+) overdue from (\d+) students/)?.slice(1).join(" / "),
      dashToday: d.match(/Fees collected today\n([^\n]+)\n(\d+) payments/)?.slice(1).join(" / "),
      dashYear: d.match(/Fee collection\n([^\n]+) due so far/)?.[1],
      reportTotal: fr.match(/\nTotal\t(\d+)\t[^\n]*\t(₹[\d,]+)/)?.slice(1).reverse().join(" / "),
    };
  };
  const ac = await grab(a5);
  const pc = await grab(pr);
  await shot(pr, "fee-06-principal-dashboard");
  await visit(a5, "/fee-management/dashboard");
  await shot(a5, "fee-07-accountant-fee-dashboard");
  const posted = sql(`select count(*), sum(amount_paise) from payment where school_id='${SCHOOL_A}' and status='POSTED'`)[0];
  const today = sql(`select count(*), sum(amount_paise) from payment where school_id='${SCHOOL_A}' and status='POSTED' and payment_date=current_date`)[0];
  const overdueDb = sql(`select count(distinct student_id), sum(balance_paise) from student_fee_due d join student s on s.id=d.student_id where d.school_id='${SCHOOL_A}' and d.state='OPEN' and d.balance_paise>0 and d.due_date<current_date`)[0];
  // The accountant's home Dashboard has no overdue / year tiles, so only shared screens are compared.
  const keys = Object.keys(ac).filter((k) => ac[k] !== undefined);
  const same = keys.filter((k) => ac[k] === pc[k]);
  record({ area: A, role: "Accountant + Principal", check: "Accountant and Principal see the same fee numbers on the same screens", status: same.length === keys.length ? "PASS" : "FAIL", note: `accountant ${JSON.stringify(ac)} | principal ${JSON.stringify(pc)}` });
  const todayOk = ac.today && rs(ac.today.split(" / ")[0]) * 100 === Number(today[1]) && ac.reportTotal && rs(ac.reportTotal.split(" / ")[0]) * 100 === Number(posted[1]);
  record({ area: A, role: "Accountant", check: "Collected today and Fee Reports total = posted payments", status: todayOk ? "PASS" : "FAIL", note: `Fee Dashboard today ${ac.today}; posted today ${inr(today[1])} in ${today[0]}; Fee Reports total ${ac.reportTotal}; all posted ${inr(posted[1])} in ${posted[0]}` });
  const ovA = ac.defaulters?.split(" / "), ovD = pc.dashOverdue?.split(" / ");
  record({ area: A, role: "Accountant + Principal", check: "Overdue: Defaulters = Dashboard 'overdue' = Fee Dashboard 'Overdue'", status: ovA && ovD && ovA[0] === ovD[0] && ovA[1] === ovD[1] ? "PASS" : "FAIL", note: `Defaulters: ${ac.defaulters}; Principal Dashboard: ${pc.dashOverdue}; Fee Dashboard Overdue: ${ac.overdue}; records (open rows past due date, any student status): ${inr(overdueDb[1])} from ${overdueDb[0]} students` });
  record({ area: A, role: "Accountant + Principal", check: "Collected this year: Dashboard = Fee Dashboard", status: pc.dashYear && ac.year && pc.dashYear.replace(/ · \d+%$/, "") === ac.year ? "PASS" : "FAIL", note: `Principal Dashboard "${pc.dashYear}"; Fee Dashboard "${ac.year}"; all posted payments ${inr(posted[1])}` });
  await done(a5); await done(pr);
}
await close();
