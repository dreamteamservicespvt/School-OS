// Expenses: a small one paid at once; a bigger one with a bill goes to the Principal,
// is sent back, corrected, sent again, approved and paid. Day Book checked by SQL after each step.
//   node qa/money/12-expense.mjs small|big|reject|correct|approve|pay
import { as, visit, shot, sql, SCHOOL_A, result, mainText, OUT } from "./m.mjs";
import { close } from "../lib.mjs";
import path from "node:path";

const M = "Finance Management", P = "Expenses";
const step = process.argv[2];
const exp = (what) => sql(`select id, number, status, amount_paise, paid_paise, reject_reason from expense where school_id='${SCHOOL_A}' and note like '${what}%' order by created_at desc limit 1`)[0];
const dbk = (id) => sql(`select d.direction, d.amount_paise, d.date, d.reverses_entry_id is not null from day_book_entry d join expense_payment p on p.id::text = d.source_id and d.source_type = 'expense-payment' where d.school_id='${SCHOOL_A}' and p.expense_id='${id}' order by d.posted_at`);
const BIG = "Demo projector lamp for Hall B";

async function sheetText(page) {
  return (await page.getByRole("dialog").last().innerText().catch(() => "")).replace(/\s+/g, " ");
}
async function fillNew(page, { amount, what, head, vendor, bill }) {
  await visit(page, "/finance-management/expenses?do=new");
  const d = page.getByRole("dialog").last();
  await d.locator("input[name=amount]").fill(String(amount));
  await d.locator("input[name=what]").fill(what);
  { const s = d.locator("select[name=accountHeadId]"); const v = await s.locator("option").evaluateAll((os, h) => os.find((o) => o.textContent.startsWith(h))?.value, head); await s.selectOption(v); }
  await d.locator("input[name=vendorName]").fill(vendor);
  if (bill) await d.locator("#exp-bill").setInputFiles(bill);
  return d;
}

if (step === "small") {
  const page = await as("cems.accountant");
  const d = await fillNew(page, { amount: 450, what: "Demo chalk and dusters for Block B", head: "Stationery", vendor: "Demo Sai Stationers" });
  const btn = d.getByRole("button", { name: "Save and mark paid" });
  await btn.dblclick(); // double click on purpose
  await page.waitForTimeout(5000);
  const msg = (await page.locator("[role=status], [role=alert]").allInnerTexts()).join(" | ").replace(/\s+/g, " ");
  const e = exp("Demo chalk and dusters");
  const n = sql(`select count(*) from expense where school_id='${SCHOOL_A}' and note like 'Demo chalk and dusters%'`)[0][0];
  const b = e ? dbk(e[0]) : [];
  result({ module: M, page: P, action: "Record ₹450 expense, paid now in cash (double click on Save)", role: "accountant", expected: "1 expense Paid, 1 Day Book OUT ₹450", actual: `${msg.slice(0, 160)} | expenses=${n} status=${e?.[2]} daybook=${JSON.stringify(b)}`, status: n === "1" && e?.[2] === "PAID" && b.length === 1 && b[0][0] === "OUT" && b[0][1] === "45000" ? "PASS" : "FAIL" });
}
if (step === "big") {
  const page = await as("cems.accountant");
  const bill = path.join(OUT, "demo-bill.png");
  await page.screenshot({ path: bill, clip: { x: 0, y: 0, width: 300, height: 200 } });
  let d = await fillNew(page, { amount: 8000, what: BIG, head: "Repairs and maintenance", vendor: "Demo Vision Electricals" });
  const t0 = await sheetText(page);
  await d.getByRole("button", { name: /Send to/ }).click();
  await page.waitForTimeout(3000);
  const err = await sheetText(page);
  result({ module: M, page: P, action: "Record ₹8,000 expense without the bill", role: "accountant", expected: "Refused: bill needed above ₹2,000; says it goes to the Principal", actual: `${(t0.match(/Above[^.]*\./) ?? [""])[0]} | ${(err.match(/[^.]*bill[^.]*\./gi) ?? []).slice(0, 3).join(" ")}`, status: !exp(BIG) && /bill/i.test(err) ? "PASS" : "FAIL" });
  d = await fillNew(page, { amount: 8000, what: BIG, head: "Repairs and maintenance", vendor: "Demo Vision Electricals", bill });
  await d.getByRole("button", { name: /Send to/ }).click();
  await page.waitForTimeout(5000);
  const e = exp(BIG);
  result({ module: M, page: P, action: "Record ₹8,000 expense with bill photo", role: "accountant", expected: "Waiting for approval; not in Day Book", actual: `status=${e?.[2]} daybook=${JSON.stringify(e ? dbk(e[0]) : null)}`, status: e?.[2] === "WAITING" && !dbk(e[0]).length ? "PASS" : "FAIL" });
  // Cannot be marked paid while waiting: open pay sheet by URL.
  await visit(page, `/finance-management/expenses?pay=${e[0]}`);
  const t = await mainText(page, 3000);
  result({ module: M, page: P, action: "Open 'Mark paid' by URL while waiting for approval", role: "accountant", expected: "No pay form", actual: /Date paid/.test(t) ? "Pay form shown" : "No pay form", status: /Date paid/.test(t) ? "FAIL" : "PASS" });
}
if (step === "reject") {
  const page = await as("cems.principal");
  const e = exp(BIG);
  await visit(page, `/finance-management/expenses?open=${e[0]}`);
  await page.getByRole("dialog").last().getByRole("link", { name: "Reject" }).click();
  await page.waitForTimeout(2000);
  const d = page.getByRole("dialog").last();
  await d.locator("textarea[name=reason]").fill("Demo: get a second quote first");
  await d.getByRole("button", { name: "Send back" }).click();
  await page.waitForTimeout(4000);
  const a = exp(BIG);
  result({ module: M, page: P, action: "Principal sends the ₹8,000 expense back with a reason", role: "principal", expected: "Draft with reason; not in Day Book", actual: `status=${a[2]} reason=${a[5]} daybook=${dbk(a[0]).length}`, status: a[2] === "DRAFT" && /second quote/.test(a[5]) && !dbk(a[0]).length ? "PASS" : "FAIL" });
}
if (step === "correct") {
  const page = await as("cems.accountant");
  const e = exp(BIG);
  await visit(page, `/finance-management/expenses?open=${e[0]}`);
  const d = page.getByRole("dialog").last();
  const t = await sheetText(page);
  const btns = (await d.getByRole("button").allInnerTexts()).concat(await d.getByRole("link").allInnerTexts()).map((x) => x.trim()).filter(Boolean);
  console.log("SHEET", t.slice(0, 600), "\nBUTTONS", btns);
  await shot(page, "expense-sent-back");
  const change = d.getByRole("link", { name: /^Change/ });
  if (await change.count()) {
    await change.click();
    await page.waitForTimeout(2500);
    const f = page.getByRole("dialog").last();
    await f.locator("input[name=amount]").fill("7200");
    await f.locator("input[name=what]").fill(`${BIG} (second quote)`);
    await f.getByRole("button", { name: /Save and send|Send/ }).click();
    await page.waitForTimeout(5000);
    const a = exp(BIG);
    result({ module: M, page: P, action: "Change the sent-back expense (₹7,200 after second quote) and send again", role: "accountant", expected: "Changed amount; Waiting for approval again", actual: `status=${a[2]} amount=${a[3]}`, status: a[2] === "WAITING" && a[3] === "720000" ? "PASS" : "FAIL", defect: a[2] === "WAITING" && a[3] === "720000" ? undefined : "MONEY-06" });
  } else {
    result({ module: M, page: P, action: "Change the sent-back expense and send again", role: "accountant", expected: "Can change amount/details, then send again (blueprint 07 §Expenses: 'to be changed and sent again')", actual: `Only buttons: ${btns.join(", ")}. No way to change it.`, status: "FAIL", defect: "MONEY-06" });
  }
}
if (step === "approve") {
  const page = await as("cems.principal");
  const e = exp(BIG);
  await visit(page, `/finance-management/expenses?open=${e[0]}`);
  await page.getByRole("dialog").last().getByRole("button", { name: /^Approve/ }).click();
  await page.waitForTimeout(4000);
  const a = exp(BIG);
  result({ module: M, page: P, action: "Principal approves the corrected expense", role: "principal", expected: "Approved; not in Day Book until paid", actual: `status=${a[2]} daybook=${dbk(a[0]).length}`, status: a[2] === "APPROVED" && !dbk(a[0]).length ? "PASS" : "FAIL" });
}
if (step === "pay") {
  const page = await as("cems.accountant");
  const e = exp(BIG);
  await visit(page, `/finance-management/expenses?pay=${e[0]}`);
  const d = page.getByRole("dialog").last();
  await d.getByRole("radio", { name: "Bank transfer" }).click().catch(async () => d.getByRole("button", { name: "Bank transfer" }).click());
  await d.locator("input[name=reference]").fill("DEMOUTR7200HALLB");
  await d.getByRole("button", { name: /^Mark/ }).click();
  await page.waitForTimeout(5000);
  const a = exp(BIG);
  const b = dbk(a[0]);
  result({ module: M, page: P, action: "Mark the approved expense paid by bank transfer", role: "accountant", expected: "Paid; exactly 1 Day Book OUT for the amount", actual: `status=${a[2]} paid=${a[4]} daybook=${JSON.stringify(b)}`, status: a[2] === "PAID" && b.length === 1 && b[0][1] === a[3] ? "PASS" : "FAIL" });
}
await close();
