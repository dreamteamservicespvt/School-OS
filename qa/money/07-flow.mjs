// The fee counter end to end, as the accountant, with database checks after each step.
import { as, visit, shot, sql, SCHOOL_A, result, mainText, BASE } from "./m.mjs";
import { close, launch } from "../lib.mjs";
import { collect, readOutcome, money, STU, rs } from "./collect-lib.mjs";

const M = "Fee Management", R = "accountant";
const step = process.argv[2] ?? "all";
const page = await as("cems.accountant");
const today = new Date().toISOString().slice(0, 10);
const dayBookToday = () => sql(`select coalesce(sum(case when direction='IN' then amount_paise else -amount_paise end),0), count(*) from day_book_entry where school_id='${SCHOOL_A}' and date='${today}'`)[0];

const CANCEL_PAGE = process.env.QA_LEDGER ? "Student Fee Ledger" : "Fee Dashboard";
async function cancel(paymentId, studentId, reason, note, bounce) {
  await visit(page, process.env.QA_LEDGER ? `/fee-management/ledger/${studentId}?tab=payments&cancel=${paymentId}` : `/fee-management/dashboard?cancel=${paymentId}`);
  const d = page.getByRole("dialog").last();
  await d.waitFor();
  await d.locator("select[name=reason]").selectOption(reason);
  if (bounce) await d.locator("input[name=bounceCharge]").fill(bounce);
  if (note) await d.locator("textarea[name=note]").fill(note);
  await d.getByRole("button", { name: /Cancel receipt|Send for approval/ }).click();
  await page.waitForTimeout(3500);
  return (await d.isVisible().catch(() => false)) ? (await d.innerText()).replace(/\s+/g, " ").slice(0, 300) : "closed";
}

if (step === "all" || step === "search") {
  // Search → collect partial → receipt → ledger → Day Book → remaining → balance 0 (Ananya).
  await visit(page, "/fee-management");
  const box = page.getByRole("searchbox").or(page.getByPlaceholder(/name|admission|search/i)).first();
  await box.fill("Ananya Reddy");
  await page.waitForTimeout(2500);
  const hits = await page.getByRole("link", { name: /Ananya Reddy/ }).allInnerTexts();
  result({ module: M, page: "Collect Fee", action: "Search a student by name", role: R, expected: "Grade 5 A Ananya Reddy listed", actual: hits.join(" | ").replace(/\s+/g, " ").slice(0, 200), status: hits.some((h) => /5 A|Grade 5/.test(h)) ? "PASS" : "FAIL" });
  await box.fill("CEMS/2026/0167");
  await page.waitForTimeout(2500);
  const hits2 = await page.getByRole("link", { name: /Ananya/ }).count();
  result({ module: M, page: "Collect Fee", action: "Search by admission number", role: R, expected: "Found", actual: `${hits2} hits`, status: hits2 > 0 ? "PASS" : "FAIL" });

  const b0 = money(STU.ananya), d0 = dayBookToday();
  const r1 = await collect(page, STU.ananya, { amount: "5000", mode: "UPI", ref: "DEMOUPI1016ANANYA1" });
  const b1 = money(STU.ananya), d1 = dayBookToday();
  await shot(page, "ananya-partial2-receipt");
  result({ module: M, page: "Collect Fee", action: "Ananya: part payment ₹5,000 by UPI", role: R, expected: "Receipt, balance down by ₹5,000, Day Book +₹5,000 today", actual: `${r1.text.slice(0, 120)} | balance ${rs(b0.balancePaise)}->${rs(b1.balancePaise)} dayBook today ${d0}->${d1}`, status: r1.ok && b0.balancePaise - b1.balancePaise === 500000 && Number(d1[0]) - Number(d0[0]) === 500000 && Number(d1[1]) - Number(d0[1]) === 1 ? "PASS" : "FAIL" });
  // Ledger shows it
  await visit(page, `/fee-management/ledger/${STU.ananya}?tab=payments`);
  const led = await mainText(page, 3000);
  result({ module: M, page: "Student Fee Ledger", action: "Ledger lists both Ananya payments with receipts", role: R, expected: "Two receipts", actual: (led.match(/CEMS\/2026-27\/\d+/g) ?? []).join(","), status: (led.match(/CEMS\/2026-27\/\d+/g) ?? []).length >= 2 ? "PASS" : "FAIL" });
  await shot(page, "ananya-ledger");
  // Day Book page shows it
  await visit(page, "/finance-management/day-book");
  const db = await mainText(page, 4000);
  result({ module: "Finance Management", page: "Day Book", action: "Today's Day Book shows Ananya's UPI ₹5,000", role: R, expected: "Entry listed", actual: /Ananya Reddy/.test(db) ? "listed" : db.slice(0, 200), status: /Ananya Reddy/.test(db) ? "PASS" : "FAIL" });
  // Collect the rest (amount defaults to what is ticked: all rows due)
  const r2 = await collect(page, STU.ananya, { tick: [] , mode: "Cash" });
  const b2 = money(STU.ananya);
  result({ module: M, page: "Collect Fee", action: "Ananya: collect the remaining balance in cash", role: R, expected: "Balance ₹0, 3 receipts, Day Book matches payments", actual: `${r2.text.slice(0, 120)} | balance ${rs(b2.balancePaise)} open rows ${b2.openRows} receipts ${b2.receipts} dayNet ${rs(b2.dayNet)} posted ${rs(b2.posted)}`, status: r2.ok && b2.balancePaise === 0 && b2.receipts === 3 && b2.dayNet === b2.posted ? "PASS" : "FAIL" });
}

if (step === "all" || step === "arjun") {
  const r = await collect(page, STU.arjun, { untick: ["Tuition Term 2"], mode: "UPI", ref: "DEMOUPI1016ARJUN01" });
  const m = money(STU.arjun);
  const pay = sql(`select amount_paise, late_fee_paise from payment where student_id='${STU.arjun}'`)[0];
  const pen = sql(`select penalty_paise from day_book_entry where student_id='${STU.arjun}'`)[0];
  result({ module: M, page: "Collect Fee", action: "Arjun Varma pays Term 1, Exam, Activity and the 3 late fees by UPI", role: R, expected: "₹17,350 with late fee ₹600 shown as penalty; Term 2 still due", actual: `${r.text.slice(0, 160)} | payment=${pay} dayBook penalty=${pen} balance=${rs(m.balancePaise)}`, status: r.ok && pay?.[0] === "1735000" && pay?.[1] === "60000" && pen?.[0] === "60000" && m.balancePaise === 1325000 ? "PASS" : "FAIL" });
}

if (step === "all" || step === "modes") {
  // Card (Vihaan stays overdue, so use Grade 5 A Kavya Reddy) and advance.
  const k0 = money(STU.kavya);
  const r = await collect(page, STU.kavya, { mode: "Card", ref: "DEMOCARD4242", amount: String((k0.balancePaise + 100000) / 100) });
  const k = money(STU.kavya);
  result({ module: M, page: "Collect Fee", action: "Kavya Reddy pays everything + ₹1,000 extra by card (advance on)", role: R, expected: "Balance ₹0, ₹1,000 held as advance, Day Book shows full amount", actual: `${r.text.slice(0, 160)} | pays=${JSON.stringify(k.pays)} balance=${rs(k.balancePaise)} dayNet=${rs(k.dayNet)}`, status: r.ok && k.balancePaise === 0 && k.pays.at(-1)?.[4] === "100000" && k.dayNet === k0.balancePaise + 100000 ? "PASS" : "FAIL" });
  // Advance-only payment with nothing due
  const r2 = await collect(page, STU.kavya, { mode: "Cash", amount: "500" });
  const k2 = money(STU.kavya);
  result({ module: M, page: "Collect Fee", action: "Kavya: ₹500 advance when nothing is due", role: R, expected: "Accepted as advance (advance on) or refused clearly", actual: `${r2.ok ? "accepted" : "refused"}: ${r2.text.slice(0, 160)} | pays=${k2.pays.length}`, status: (r2.ok && k2.pays.at(-1)?.[4] === "50000") || (!r2.ok && k2.pays.length === k.pays.length) ? "PASS" : "FAIL" });

  // Cheque then bounce (Ishita Rao): cheque posts at once, bounce cancels with a charge.
  const r3 = await collect(page, STU.ishita, { untick: ["Tuition Term 2"], mode: "Cheque", cheque: { no: "456789", bank: "Demo Bank, Vizag", date: today } });
  const i1 = money(STU.ishita);
  result({ module: M, page: "Collect Fee", action: "Ishita Rao pays Term 1 dues by cheque", role: R, expected: "Posted (verification off), receipt, Day Book IN", actual: `${r3.text.slice(0, 140)} | pays=${JSON.stringify(i1.pays)} dayNet=${rs(i1.dayNet)}`, status: r3.ok && i1.pays.length === 1 && i1.dayNet === i1.posted ? "PASS" : "FAIL" });
  const pid = i1.pays[0]?.[0];
  if (pid) {
    const t = await cancel(pid, STU.ishita, "Cheque bounced", "Demo QA: cheque returned unpaid", "300");
    const i2 = money(STU.ishita);
    const charge = sql(`select label, amount_paise from student_fee_due where student_id='${STU.ishita}' and label ilike '%bounce%'`);
    await shot(page, "ishita-bounce");
    result({ module: M, page: CANCEL_PAGE, action: "Cheque bounced: cancel Ishita's cheque payment (same day) with ₹300 bounce charge", role: R, expected: "Payment Cancelled, receipt cancelled, Day Book reversal (net 0), dues reopen + ₹300 charge row", actual: `sheet=${t.slice(0, 80)} pays=${JSON.stringify(i2.pays)} dayBook=${JSON.stringify(i2.day)} charge=${JSON.stringify(charge)} balance=${rs(i2.balancePaise)}`, status: i2.pays[0]?.[3] === "CANCELLED" && i2.dayNet === 0 && charge.length === 1 && i2.balancePaise === i1.balancePaise + i1.posted + 30000 ? "PASS" : "FAIL" });
    const t2 = await cancel(pid, STU.ishita, "Duplicate", null);
    const i3 = money(STU.ishita);
    result({ module: M, page: CANCEL_PAGE, action: "Cancel the same payment again", role: R, expected: "Refused: already cancelled; no second reversal", actual: `${t2.slice(0, 160)} | dayBook rows ${i3.day.length}`, status: i3.day.length === i2.day.length ? "PASS" : "FAIL" });
  }
}

if (step === "all" || step === "dup") {
  // Double click on Collect, then the same payment from two tabs at once (Rohan Singh, Grade 5 A).
  const rohan = sql(`select s.id from student s join enrolment e on e.student_id=s.id join section x on x.id=e.section_id join school_class c on c.id=e.class_id where s.school_id='${SCHOOL_A}' and s.full_name='Rohan Singh' and c.name='Grade 5' and x.name='A'`)[0][0];
  const before = money(rohan).pays.length;
  const r = await collect(page, rohan, { amount: "2000", mode: "Cash", doubleClick: true });
  await page.waitForTimeout(3000);
  const after = money(rohan).pays.length;
  result({ module: M, page: "Collect Fee", action: "Double-click Collect (₹2,000 cash, Rohan Singh)", role: R, expected: "Exactly one payment", actual: `${r.text.slice(0, 100)} | payments ${before}->${after}`, status: after - before === 1 ? "PASS" : "FAIL" });
  // Same amount again within 10 minutes: warning
  const r2 = await collect(page, rohan, { amount: "2000", mode: "Cash" });
  const after2 = money(rohan).pays.length;
  result({ module: M, page: "Collect Fee", action: "Collect the same ₹2,000 cash again within 10 minutes", role: R, expected: "Warning 'was collected at … by you. Collect again?'; nothing saved until confirmed", actual: `${r2.ok ? "SAVED" : "warned"}: ${r2.text.slice(0, 200)} | payments ${after}->${after2}`, status: !r2.ok && /Collect again/i.test(r2.text) && after2 === after ? "PASS" : "FAIL" });
  // Two tabs at once
  const b = await launch();
  const ctx2 = await b.newContext({ storageState: `${process.env.QA_OUT}/state/cems.accountant.json` });
  const p2 = await ctx2.newPage();
  const p1 = page;
  await Promise.all([collect(p1, rohan, { amount: "1500", mode: "UPI", ref: "DEMOTWOTABS01", noSubmit: true }), collect(p2, rohan, { amount: "1500", mode: "UPI", ref: "DEMOTWOTABS01", noSubmit: true })]);
  const b3 = money(rohan).pays.length;
  await Promise.all([p1.getByRole("button", { name: /^Collect ₹/ }).click(), p2.getByRole("button", { name: /^Collect ₹/ }).click()]);
  const [o1, o2] = await Promise.all([readOutcome(p1), readOutcome(p2)]);
  const a3 = money(rohan);
  result({ module: M, page: "Collect Fee", action: "Same UPI payment (same UTR) submitted from two tabs at the same moment", role: R, expected: "One payment; the other tab is warned", actual: `tab1 ${o1.ok ? "saved" : "warned: " + o1.text.slice(0, 80)} / tab2 ${o2.ok ? "saved" : "warned: " + o2.text.slice(0, 80)} | payments ${b3}->${a3.pays.length}; dayNet=${rs(a3.dayNet)} posted=${rs(a3.posted)}`, status: a3.pays.length - b3 === 1 && a3.dayNet === a3.posted ? "PASS" : "FAIL" });
  await ctx2.close();
}

if (step === "all" || step === "cancel") {
  // Same-day cancel (no approval) and a past payment (needs approval): Rohan's first and Aarav's June payment.
  const rohan = sql(`select s.id from student s join enrolment e on e.student_id=s.id join section x on x.id=e.section_id join school_class c on c.id=e.class_id where s.school_id='${SCHOOL_A}' and s.full_name='Rohan Singh' and c.name='Grade 5' and x.name='A'`)[0][0];
  const m0 = money(rohan);
  const last = m0.pays.filter((p) => p[3] === "POSTED").at(-1);
  const t = await cancel(last[0], rohan, "Duplicate", "Demo QA: entered twice");
  const m1 = money(rohan);
  result({ module: M, page: CANCEL_PAGE, action: "Cancel today's duplicate payment (Rohan, 'Same payment entered twice')", role: R, expected: "Cancelled at once, Day Book reversal, balance back up", actual: `${t.slice(0, 80)} | status=${m1.pays.find((p) => p[0] === last[0])?.[3]} dayNet ${rs(m0.dayNet)}->${rs(m1.dayNet)} balance ${rs(m0.balancePaise)}->${rs(m1.balancePaise)}`, status: m1.pays.find((p) => p[0] === last[0])?.[3] === "CANCELLED" && m0.dayNet - m1.dayNet === Number(last[1]) ? "PASS" : "FAIL" });
  const a0 = money(STU.ananya);
  const june = a0.pays[0];
  const t2 = await cancel(june[0], STU.ananya, "Other", "Demo QA: test of approval for an old payment");
  const ap = sql(`select status, summary from approval where record_id='${june[0]}' order by created_at desc limit 1`)[0];
  const a1 = money(STU.ananya);
  result({ module: M, page: CANCEL_PAGE, action: "Cancel Ananya's June payment (older than today)", role: R, expected: "Goes to Approvals; payment stays posted meanwhile", actual: `${t2.slice(0, 80)} | approval=${JSON.stringify(ap)} status=${a1.pays[0][3]}`, status: ap?.[0] === "WAITING" && a1.pays[0][3] === "POSTED" ? "PASS" : "FAIL" });
}
await close();
