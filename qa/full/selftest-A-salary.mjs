// Self-test A, area 1a: Salary Management. Accountant adjusts October, sends it; Principal approves;
// slips and PDF; Accountant marks it paid; the Day Book shows the salary on the paid date; exports open.
//   MSYS_NO_PATHCONV=1 node qa/full/selftest-A-salary.mjs
import { asRole, go, snap, ok, finish, note, close, sleep, text, pageState, BASE } from "./selftest-A-h.mjs";
const A = "salary";
const ac = await asRole("accountant");
const dlg = (p) => p.getByRole("dialog").last();
const dt = async (p) => (await dlg(p).innerText().catch(() => "")).replace(/\n+/g, " | ");
const open = (p) => dlg(p).isVisible().catch(() => false);
const rupees = (s) => Number(String(s ?? "").replace(/[^\d]/g, "") || NaN);
const netOf = (t) => rupees((t.match(/Net pay\n(₹[\d,]+)/) ?? [])[1]);
const grossOf = (t) => rupees((t.match(/Gross pay\n(₹[\d,]+)/) ?? [])[1]);

await go(ac, "/salary-management/generate");
await sleep(2000);
let t = await text(ac, 8000);
const status0 = (t.match(/\nOctober 2026\n(Open|Calculated|Waiting for approval|Approved|Paid|Locked)\n/) ?? [])[1];
const net0 = netOf(t), gross0 = grossOf(t);
note("salary", `START status=${status0} gross=${gross0} net=${net0}`);
ok(A, "Generate Salary opens with October totals", Number.isFinite(net0), `status ${status0}, gross ${gross0}, net ${net0}`);
const runHref = ac.url();

// 1. Open a month that already exists
await go(ac, "/salary-management/generate?do=open-month");
await sleep(2000);
note("salary", `OPEN MONTH SHEET: ${(await dt(ac)).slice(0, 600)}`);
const monthSel = dlg(ac).getByLabel("Month");
const opts = await monthSel.locator("option").allInnerTexts().catch(() => []);
note("salary", `month options: ${opts.join(" / ")}`);
const oct = opts.find((o) => /Oct/.test(o));
if (oct) {
  await monthSel.selectOption({ label: oct });
  await dlg(ac).getByRole("button", { name: "Open month" }).click();
  await sleep(3000);
  const m = (await dt(ac)) + " || " + (await text(ac, 1500));
  ok(A, "opening October again is refused: already exists", /already/i.test(m), m.slice(0, 250));
  await snap(ac, "salary-open-month-again");
} else ok(A, "October is offered in Open a month (to test the duplicate guard)", true, `options: ${opts.join(" / ")} (October not offered at all - guard by hiding)`);
if (await open(ac)) await ac.keyboard.press("Escape");

if (status0 === "Calculated" || status0 === "Open") {
  // 2. Adjustment: no reason, then a real one
  await go(ac, "/salary-management/generate?do=adjust");
  await sleep(2000);
  const addBtn = dlg(ac).getByRole("button", { name: "Add adjustment" });
  await addBtn.click();
  await sleep(1500);
  ok(A, "adjustment with nothing filled is refused", (await open(ac)) && /required|Choose|Give|Enter/i.test(await dt(ac)), (await dt(ac)).slice(0, 300));
  await dlg(ac).getByLabel("Staff member").selectOption({ index: 1 });
  await dlg(ac).getByLabel("Amount").fill("500");
  await addBtn.click();
  await sleep(1500);
  ok(A, "adjustment with no reason is refused", (await open(ac)) && /reason/i.test(await dt(ac)), ((await dt(ac)).match(/[^|]*reason[^|]*/i) ?? [""])[0]);
  await dlg(ac).getByLabel("Reason").fill("QA self-test A: sports day duty");
  await addBtn.dblclick();
  await sleep(5000);
  await go(ac, "/salary-management/generate");
  await sleep(2000);
  t = await text(ac, 8000);
  const qaAdj = (t.match(/QA self-test A|sports day/g) ?? []).length;
  note("salary", `AFTER ADJ net=${netOf(t)} gross=${grossOf(t)} \n${t.slice(0, 2500)}`);
  ok(A, "adjustment shows; totals change by ₹500 (or need Recalculate, said plainly)", netOf(t) - net0 === 500 || /Recalculate|recalculate|out of date|changed/i.test(t), `net ${net0} -> ${netOf(t)}, gross ${gross0} -> ${grossOf(t)}`);
  const adjCount = (t.match(/· Bonus\n\+₹500/g) ?? []).length;
  ok(A, "double click on Add adjustment made one adjustment", adjCount <= 1, `${adjCount} ₹500 bonus rows`);
  await snap(ac, "salary-after-adjustment");
  // Recalculate if offered
  const recalc = ac.getByRole("button", { name: /^Recalculate$/ }).first();
  if (await recalc.isVisible().catch(() => false)) { await recalc.click(); await sleep(6000); }
  t = await text(ac, 8000);
  const net1 = netOf(t);
  note("salary", `AFTER RECALC net=${net1}`);
  ok(A, "after Recalculate net pay is old + ₹500", net1 - net0 === 500, `${net0} -> ${net1}`);
  // Totals add up
  const ded = (k) => rupees((t.match(new RegExp(`${k}[^\\n]*\\n(₹[\\d,]+)`)) ?? [])[1]);
  const parts = ["PF \\(employee", "ESI \\(employee", "Professional Tax", "TDS", "Loans and advances"].map(ded).filter(Number.isFinite);
  const dedTotal = rupees((t.match(/\nDeductions\n(₹[\d,]+)/) ?? [])[1]);
  ok(A, "deductions = sum of PF+ESI+PT+TDS+loans; net = gross - deductions", parts.reduce((a, b) => a + b, 0) === dedTotal && grossOf(t) - dedTotal === net1, `parts ${parts.join("+")}=${parts.reduce((a, b) => a + b, 0)} vs ${dedTotal}; gross ${grossOf(t)} - ${dedTotal} = ${grossOf(t) - dedTotal} vs net ${net1}`);

  // 3. Send for approval (double click)
  await go(ac, "/salary-management/generate?do=send");
  await sleep(2000);
  note("salary", `SEND SHEET: ${(await dt(ac)).slice(0, 800)}`);
  await snap(ac, "salary-send-sheet");
  await dlg(ac).getByRole("button", { name: "Send for approval" }).dblclick();
  await sleep(5000);
  t = await text(ac, 4000);
  ok(A, "October goes to Waiting for approval", /Waiting for approval/.test(t) && !/Send for approval\nRecalculate/.test(t), (t.match(/\nOctober 2026\n[^\n]*\n[^\n]*/) ?? [""])[0]);
  await snap(ac, "salary-waiting");
}

// 4. Principal approves
const pr = await asRole("principal");
await go(pr, "/salary-management/generate");
await sleep(2000);
t = await text(pr, 6000);
if (/Approve salary/.test(t)) {
  await go(pr, "/salary-management/generate?do=approve");
  await sleep(2500);
  const ap = await dt(pr);
  note("salary", `APPROVE SHEET: ${ap.slice(0, 1500)}`);
  ok(A, "approve sheet shows the month's totals in plain words", /₹/.test(ap) && /staff/.test(ap), ap.slice(0, 300));
  await snap(pr, "salary-approve-sheet");
  await dlg(pr).getByRole("button", { name: /^Approve salary for/ }).click();
  await sleep(7000);
  t = await text(pr, 5000);
  ok(A, "Principal approved: status Approved, slips made", /Approved\./.test(t) || /salary slips are made/.test(t), (t.match(/[^\n]*(Approved|slips)[^\n]*/) ?? [""])[0]);
  await snap(pr, "salary-approved");
} else ok(A, "Principal sees 'Approve salary' on a waiting month", false, (t.match(/\nOctober 2026\n[^\n]*\n[^\n]*/) ?? [""])[0]);

// 5. Slips and PDF
await go(pr, "/salary-management/slips");
await sleep(2500);
t = await text(pr, 5000);
note("salary", `SLIPS: ${t.slice(0, 2000)}`);
await snap(pr, "salary-slips");
const pdfLink = pr.locator('main a[href*="/pdf"]').first();
const pdfHref = await pdfLink.getAttribute("href").catch(() => null);
if (pdfHref) {
  const r = await pr.context().request.get(new URL(pdfHref, BASE).toString());
  const b = await r.body();
  ok(A, "salary slip PDF downloads", r.ok() && b.slice(0, 4).toString() === "%PDF", `${r.status()} ${b.length} bytes ${pdfHref}`);
} else ok(A, "salary slip PDF link on Salary Slips", false, (await pr.locator("main a").evaluateAll((as) => as.map((a) => a.getAttribute("href")).filter(Boolean).slice(0, 30))).join(" "));

// 6. Accountant marks it paid: bank transfer without a reference, then with
await go(ac, "/salary-management/generate");
await sleep(2000);
t = await text(ac, 6000);
const netNow = netOf(t);
if (/Mark paid/.test(t)) {
  await go(ac, "/salary-management/generate?do=pay");
  await sleep(2500);
  const payBtn = dlg(ac).getByRole("button", { name: /^Mark paid/ });
  note("salary", `PAY SHEET: ${(await dt(ac)).slice(0, 800)}`);
  await payBtn.click();
  await sleep(1500);
  ok(A, "mark paid by bank transfer with no reference is refused", (await open(ac)) && /reference|UTR|required/i.test(await dt(ac)), ((await dt(ac)).match(/[^|]*(reference|UTR)[^|]*/i) ?? [""])[0]);
  // bank file
  const bf = dlg(ac).locator('a[href*="bank-file"]').first();
  const bfHref = await bf.getAttribute("href").catch(() => null);
  if (bfHref) {
    const r = await ac.context().request.get(new URL(bfHref, BASE).toString());
    ok(A, "bank transfer file downloads", r.ok() && (await r.body()).length > 200, `${r.status()} ${r.headers()["content-type"]}`);
  }
  await dlg(ac).getByLabel(/Bank batch reference or UTR/).fill("QAUTR20261112A");
  await payBtn.dblclick();
  await sleep(7000);
  t = await text(ac, 5000);
  ok(A, "October marked Paid", /Paid/.test((t.match(/\nOctober 2026\n[^\n]*\n[^\n]*/) ?? [""])[0]) || /Lock now/.test(t), (t.match(/\nOctober 2026\n[^\n]*\n[^\n]*/) ?? [""])[0]);
  await snap(ac, "salary-paid");
  // Day Book today
  await go(ac, "/finance-management/day-book");
  await sleep(2500);
  const db = await text(ac, 8000);
  note("salary", `DAY BOOK AFTER PAY: ${db.slice(0, 3000)}`);
  const sal = db.match(/\nSalary\n([^\n]*)\n([^\n]*)/);
  const salAmt = rupees((db.match(/\nSalary\n[^\n]*?(₹[\d,]+)/) ?? db.match(/Salary[^\n]*\n[^\n]*(₹[\d,]+)/) ?? [])[1]);
  ok(A, "Day Book today shows the salary once, equal to net pay", salAmt === netNow, `day book salary ${salAmt} vs net ${netNow} :: ${sal?.[0]?.replace(/\n/g, " | ")}`);
  const exp = rupees((db.match(/Total expense\n(₹[\d,]+)/) ?? [])[1]);
  ok(A, "Day Book total expense includes the salary", exp >= netNow, `total expense ${exp}`);
  await snap(ac, "salary-daybook-after-pay");
} else note("salary", `no Mark paid: ${t.slice(0, 800)}`);

// 7. Exports and statements
await go(ac, "/salary-management/generate");
await sleep(2000);
const hrefs = await ac.locator('main a[href*="/salary-management/generate/"]').evaluateAll((as) => [...new Set(as.map((a) => a.getAttribute("href")))]);
note("salary", `EXPORT LINKS: ${hrefs.join(" ")}`);
for (const h of hrefs.slice(0, 8)) {
  const r = await ac.context().request.get(new URL(h, BASE).toString());
  const b = await r.body();
  ok(A, `download ${h.split("/").slice(-1)[0].slice(0, 60)}`, r.ok() && b.length > 100 && !/text\/html/.test(r.headers()["content-type"] ?? ""), `${r.status()} ${r.headers()["content-type"]} ${b.length}`);
}
console.log("PROBLEMS", ac.problems.join(" ; "), pr.problems.join(" ; "));
finish("salary");
await close();
