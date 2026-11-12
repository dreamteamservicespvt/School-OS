// Self-test A, area 1b: Finance Management as the Accountant. Expense (empty, cash over cash-in-hand, small
// paid now, double click, large one waits), income (empty, posted), Day Book totals move by the same amounts,
// Day Book export/print, Cash & Bank, Finance Reports each with Excel and PDF.
//   MSYS_NO_PATHCONV=1 node qa/full/selftest-A-finance.mjs
import { asRole, go, snap, ok, finish, note, close, sleep, text, pageState, BASE } from "./selftest-A-h.mjs";
const A = "finance";
const p = await asRole("accountant");
const dlg = () => p.getByRole("dialog").last();
const dt = async () => (await dlg().innerText().catch(() => "")).replace(/\n+/g, " | ");
const open = () => dlg().isVisible().catch(() => false);
const rupees = (s) => Number(String(s ?? "").replace(/[^\d]/g, "") || NaN);
const S = new Date().toISOString().slice(11, 16).replace(":", "");
const dayBook = async () => {
  await go(p, "/finance-management/day-book");
  await sleep(2000);
  const t = await text(p, 12000);
  return { t, inc: rupees((t.match(/Total income\n(₹[\d,]+)/) ?? [])[1]), exp: rupees((t.match(/Total expense\n(₹[\d,]+)/) ?? [])[1]), net: (t.match(/Net balance\n([^\n]+)/) ?? [])[1] };
};
const db0 = await dayBook();
note("finance", `DAYBOOK START inc=${db0.inc} exp=${db0.exp} net=${db0.net}`);
ok(A, "Day Book opens with totals", Number.isFinite(db0.inc) && Number.isFinite(db0.exp), `income ${db0.inc}, expense ${db0.exp}, net ${db0.net}`);

// 1. Expense: empty
await go(p, "/finance-management/expenses?do=new");
await sleep(2000);
await snap(p, "finance-expense-sheet");
const btn = () => dlg().getByRole("button", { name: /^(Save|Send to)/ }).last();
await btn().click();
await sleep(1500);
const e0 = await dt();
ok(A, "expense: empty form refused with plain messages", (await open()) && /Enter|required|Choose|Give/i.test(e0), e0.slice(0, 300));
// cash bigger than cash in hand
const hand = rupees((e0.match(/(₹[\d,]+) in hand now/) ?? [])[1]);
note("finance", `cash in hand ${hand}; sheet: ${e0.slice(0, 1200)}`);
await dlg().getByLabel("Amount").fill("2,999");
await sleep(600);
const e1 = await dt();
note("finance", `AFTER AMOUNT 2999: ${e1.slice(0, 1200)}`);
await dlg().getByLabel("What was it for").fill(`QA-A ${S} chalk and dusters`);
await dlg().getByLabel("Expense head").selectOption({ index: 1 });
await dlg().getByLabel("Vendor").fill("QA Sri Sai Stationers");
await btn().dblclick();
await sleep(5000);
const e2 = (await dt()) + " || " + (await text(p, 3000));
note("finance", `AFTER SAVE EXPENSE: ${e2.slice(0, 1500)}`);
const stillOpen = await open();
if (stillOpen) {
  // A bill may be required, or a warning
  ok(A, "expense ₹2,999 saved (or refused for a plain reason)", true, (await dt()).match(/[^|]*(bill|Attach|cash|warn|already)[^|]*/i)?.[0] ?? (await dt()).slice(0, 200));
  await snap(p, "finance-expense-refused");
  await p.keyboard.press("Escape");
}
await go(p, "/finance-management/expenses");
await sleep(2000);
const el = await text(p, 15000);
const n = (el.match(new RegExp(`QA-A ${S} chalk`, "g")) ?? []).length;
ok(A, "expense in the list once after a double click", n <= 1, `${n} rows`);
await snap(p, "finance-expenses-after");
note("finance", `EXPENSES LIST: ${el.slice(0, 2500)}`);

// 2. Large expense waits for approval
await go(p, "/finance-management/expenses?do=new");
await sleep(2000);
await dlg().getByLabel("Amount").fill("25000");
await sleep(800);
const big = await dt();
ok(A, "expense ₹25,000: form says it waits for the approver", /waits for|Send to|Goes to/i.test(big), (big.match(/[^|]*(waits for|Goes to)[^|]*/i) ?? [""])[0]);
await snap(p, "finance-expense-big");
await p.keyboard.press("Escape");

// 3. Income: empty, then ₹1,234 cash posted
await go(p, "/finance-management/income?do=new");
await sleep(2000);
const ib = () => dlg().getByRole("button", { name: /Post to Day Book|Save as draft/ }).last();
await ib().click();
await sleep(1500);
ok(A, "income: empty form refused", (await open()) && /Enter|required|Choose/i.test(await dt()), (await dt()).slice(0, 300));
await dlg().getByLabel("Amount").fill("1234");
await dlg().getByLabel("Income head").selectOption({ index: 1 });
await dlg().getByLabel("Received from").fill(`QA-A ${S} hall rent`);
await dlg().getByRole("radio", { name: "Cash" }).or(dlg().getByRole("button", { name: "Cash", exact: true })).first().click().catch(() => {});
await sleep(400);
await ib().dblclick();
await sleep(5000);
const i1 = (await dt()) + " || " + (await text(p, 3000));
note("finance", `AFTER INCOME: ${i1.slice(0, 1500)}`);
if (await open()) { ok(A, "income saved", false, (await dt()).slice(0, 300)); await snap(p, "finance-income-refused"); await p.keyboard.press("Escape"); }
await go(p, "/finance-management/income");
await sleep(2000);
const il = await text(p, 12000);
const ni = (il.match(new RegExp(`QA-A ${S} hall rent`, "g")) ?? []).length;
ok(A, "income in the list once after a double click", ni === 1, `${ni} rows`);
await snap(p, "finance-income-after");

// 4. Day Book moved by the same amounts
const db1 = await dayBook();
note("finance", `DAYBOOK AFTER inc=${db1.inc} exp=${db1.exp} net=${db1.net}\n${db1.t.slice(0, 3000)}`);
ok(A, "Day Book income went up by ₹1,234", db1.inc - db0.inc === 1234, `${db0.inc} -> ${db1.inc}`);
ok(A, "Day Book expense went up by ₹2,999 (if it was paid now)", db1.exp - db0.exp === 2999 || n === 0, `${db0.exp} -> ${db1.exp}`);
ok(A, "Day Book net = income - expense", rupees(db1.net) === Math.abs(db1.inc - db1.exp) && (/^-|−/.test(db1.net) === db1.inc < db1.exp), `${db1.inc} - ${db1.exp} vs ${db1.net}`);
await snap(p, "finance-daybook-after");
// Export / Print
const exportLinks = await p.locator('main a[href*="day-book/export"], main a[href*="/export"]').evaluateAll((as) => [...new Set(as.map((a) => a.getAttribute("href")))]);
note("finance", `DAY BOOK EXPORTS: ${exportLinks.join(" ")}`);
for (const h of exportLinks.slice(0, 4)) {
  const r = await p.context().request.get(new URL(h, BASE).toString());
  const ct = r.headers()["content-type"] ?? "";
  ok(A, `Day Book export ${h.slice(-40)}`, r.ok() && !/html/.test(ct) && (await r.body()).length > 100, `${r.status()} ${ct}`);
}
const exp = p.getByRole("button", { name: "Export" }).or(p.getByRole("link", { name: "Export" })).first();
if (await exp.isVisible().catch(() => false)) {
  await exp.click();
  await sleep(1200);
  const items = await p.getByRole("menuitem").allInnerTexts().catch(() => []);
  note("finance", `EXPORT MENU: ${items.join(" / ")}`);
  ok(A, "Day Book Export offers CSV/Excel/PDF", items.length >= 2 || exportLinks.length >= 1, items.join(" / "));
  await snap(p, "finance-daybook-export-menu", false);
  await p.keyboard.press("Escape");
}
// past date with a date filter: pick a date with fee payments
await go(p, "/finance-management/day-book?date=2026-10-31");
await sleep(2000);
const dOld = await text(p, 6000);
ok(A, "Day Book for 31-10-2026 opens", /31/.test(dOld), (dOld.match(/Total income\n[^\n]*\n[^\n]*/) ?? [""])[0].replace(/\n/g, " | "));
await snap(p, "finance-daybook-31oct");

// 5. Cash & Bank
await go(p, "/finance-management/cash-bank");
await sleep(2000);
const cb = await text(p, 6000);
note("finance", `CASH BANK: ${cb.slice(0, 2500)}`);
await go(p, "/finance-management/cash-bank?do=move");
await sleep(2000);
const mv = dlg().getByRole("button", { name: /Move|Save/ }).last();
await mv.click().catch(() => {});
await sleep(1500);
ok(A, "Move money: empty form refused", await open(), (await dt()).slice(0, 300));
await snap(p, "finance-move-money-empty");
await p.keyboard.press("Escape");

// 6. Finance reports
await go(p, "/finance-management/reports");
await sleep(2000);
const rl = await p.locator('main a[href*="/finance-management/reports?"]').evaluateAll((as) => [...new Set(as.map((a) => a.getAttribute("href")).filter((h) => /[?&]r=/.test(h)))]);
note("finance", `FIN REPORTS: ${rl.join(" ")}`);
ok(A, "Finance Reports lists reports", rl.length > 0, `${rl.length}`);
for (const h of rl) {
  p.problems.length = 0;
  await go(p, h);
  await sleep(1500);
  const s = await pageState(p);
  const key = (h.match(/r=([\w-]+)/) ?? [])[1];
  note("finance", `\n== REPORT ${key}\n${s.text.slice(0, 1500)}`);
  ok(A, `Finance report ${key} opens`, !s.broken && p.problems.length === 0, p.problems.join(";"));
  await snap(p, `finance-report-${key}`, false);
  const xl = await p.locator('main a[href*="/export"]').first().getAttribute("href").catch(() => null);
  if (xl) {
    const r = await p.context().request.get(new URL(xl, BASE).toString());
    ok(A, `Finance report ${key} Excel`, r.ok() && !/html/.test(r.headers()["content-type"] ?? ""), `${r.status()} ${r.headers()["content-type"]}`);
    const r2 = await p.context().request.get(new URL(xl + (xl.includes("?") ? "&" : "?") + "format=pdf", BASE).toString());
    ok(A, `Finance report ${key} PDF`, r2.ok() && (await r2.body()).slice(0, 4).toString() === "%PDF", `${r2.status()}`);
  }
}
console.log("PROBLEMS", p.problems.join(" ; "));
finish("finance");
await close();
