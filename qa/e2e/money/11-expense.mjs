// Workflow 13, expense entry, as the Accountant; the Principal approves the big one.
//   node qa/e2e/money/11-expense.mjs <step> [viewport]
// steps: mistakes | small | dup | big | pay | daybook | reports
import { as, visit, text, shot, sql, one, layoutIssues, VIEWPORTS, BASE, note, squeeze, SUNRISE } from "./h.mjs";
import { close } from "../../lib.mjs";
import { writeFileSync, existsSync } from "node:fs";
import path from "node:path";

const step = process.argv[2];
const vp = process.argv[3] ?? "laptop1280";
const page = await as(process.env.LOGIN ?? "accountant", VIEWPORTS[vp]);
const dlg = () => page.locator("dialog[open], [role=dialog]").last();
const msgs = async () => (await page.locator("[role=status], [data-sonner-toast], [role=alert], [id$=-error], .text-bad").allInnerTexts()).map((x) => (x ?? "").trim()).filter(Boolean).join(" | ").replace(/\s+/g, " ");
const BILL = path.join(process.env.QA_OUT, "bill.png");
if (!existsSync(BILL)) writeFileSync(BILL, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"));
const exp = (what) => sql(`select number, amount_paise, paid_paise, status, bill_file_id is not null, to_char(date,'YYYY-MM-DD'), coalesce(duplicate_reason,'') from expense where school_id='${SUNRISE}' and note like '%${what}%' order by created_at`);
const dayb = (num) => sql(`select date, direction, amount_paise, section, mode from day_book_entry where school_id='${SUNRISE}' and source_type ilike '%expense%' and (source_id in (select id::text from expense where number='${num}') or source_id in (select p.id::text from expense_payment p join expense e on e.id=p.expense_id where e.number='${num}')) order by posted_at`);

async function openSheet() {
  await visit(page, "/finance-management/expenses?do=new", 2000);
  if (!(await dlg().count())) { await page.getByRole("link", { name: /Record expense/ }).or(page.getByRole("button", { name: /Record expense/ })).first().click(); await page.waitForTimeout(1500); }
}
async function fillExp({ amount, what, head = 1, vendor, date, bill, mode, ref }) {
  if (bill) await dlg().locator("#exp-bill").setInputFiles(BILL);
  if (amount !== undefined) await dlg().locator("input[name=amount]").fill(amount);
  if (date) await dlg().locator("input[name=date]").fill(date);
  if (what !== undefined) await dlg().locator("input[name=what]").fill(what);
  if (head !== null) await dlg().locator("select[name=accountHeadId]").selectOption({ index: head });
  if (vendor) await dlg().locator("input[name=vendorName]").fill(vendor);
  if (mode) { await dlg().getByRole("radio", { name: mode }).or(dlg().getByRole("button", { name: mode, exact: true })).first().click(); }
  if (ref) await dlg().locator("input[name=reference]").fill(ref);
}
const submit = async () => { await dlg().getByRole("button", { name: /Save|Send to/ }).last().click(); await page.waitForTimeout(3500); };

if (step === "mistakes") {
  await openSheet();
  note("SHEET:", squeeze(await dlg().innerText()).slice(0, 900));
  await shot(page, `expense-sheet-${vp}`, false);
  note("layout", JSON.stringify(await layoutIssues(page)));
  for (const [what, o] of [["empty", { head: null }], ["zero", { amount: "0", what: "QA zero" }], ["negative", { amount: "-50", what: "QA negative" }], ["future date", { amount: "100", what: "QA future", date: "2026-12-01" }], ["letters", { amount: "abc", what: "QA letters" }], ["no bill above limit", { amount: "6000", what: "QA no bill" }]]) {
    await openSheet();
    await fillExp(o);
    await submit();
    note(`MISTAKE ${what}:`, (await msgs()).slice(0, 300), "| saved:", JSON.stringify(exp(`QA ${what.split(" ")[0]}`)));
  }
}
if (step === "small") {
  const before = one(`select count(*) from day_book_entry where school_id='${SUNRISE}' and date=current_date and direction='OUT'`);
  await openSheet();
  await fillExp({ amount: "1,250", what: "QA chalk and dusters for Block B", vendor: "QA Sri Sai Stationers", bill: true });
  note("button:", squeeze(await dlg().getByRole("button", { name: /Save|Send to/ }).last().innerText()));
  await submit();
  note("SMALL:", await msgs(), "|", squeeze(await dlg().innerText().catch(() => "closed")).slice(0, 200));
  note("DB:", JSON.stringify(exp("QA chalk")), JSON.stringify(dayb(exp("QA chalk").at(-1)?.[0])));
  note("day book OUT today", before, "->", one(`select count(*) from day_book_entry where school_id='${SUNRISE}' and date=current_date and direction='OUT'`));
  await shot(page, `expense-small-${vp}`);
}
if (step === "dup") {
  await openSheet();
  await fillExp({ amount: "1250", what: "QA chalk and dusters again", vendor: "QA Sri Sai Stationers" });
  await submit();
  note("DUP 1st try:", await msgs(), "|", squeeze(await dlg().innerText().catch(() => "closed")).slice(-400));
  await shot(page, `expense-dup-${vp}`, false);
  note("DB:", JSON.stringify(exp("QA chalk")));
}
if (step === "big") {
  await openSheet();
  await fillExp({ amount: "18500", what: "QA projector repair for the AV room", vendor: "QA Vision Electronics", bill: true });
  note("button:", squeeze(await dlg().getByRole("button", { name: /Save|Send to/ }).last().innerText()), "|", squeeze(await dlg().innerText()).match(/Above[^.]*\.[^.]*\./)?.[0]);
  await submit();
  note("BIG:", await msgs());
  note("DB:", JSON.stringify(exp("QA projector")), "approval:", JSON.stringify(sql(`select id, status, summary from approval where type='expense' order by created_at desc limit 1`)));
}
if (step === "pay") {
  const num = exp("QA projector").at(-1)[0];
  const id = one(`select id from expense where number='${num}'`);
  await visit(page, `/finance-management/expenses/${id}`, 2000);
  note("EXPENSE SHEET:", squeeze(await dlg().innerText()).slice(0, 900));
  await dlg().getByRole("link", { name: /Mark paid/ }).or(dlg().getByRole("button", { name: /Mark paid/ })).first().click();
  await page.waitForTimeout(2000);
  note("PAY SHEET:", squeeze(await dlg().innerText()).slice(0, 700));
  await dlg().getByRole("radio", { name: "Bank transfer" }).or(dlg().getByRole("button", { name: "Bank transfer", exact: true })).first().click().catch(() => {});
  if (await dlg().locator("input[name=reference]").count()) await dlg().locator("input[name=reference]").fill("SBINQA18102026");
  await dlg().getByRole("button", { name: /^Mark .*paid/ }).last().click();
  await page.waitForTimeout(3500);
  note("PAID:", await msgs());
  note("DB:", JSON.stringify(exp("QA projector")), JSON.stringify(dayb(num)));
}
if (step === "cancel") {
  const num = process.argv[4];
  const id = one(`select id from expense where number='${num}'`);
  await visit(page, `/finance-management/expenses/${id}`, 2000);
  note("SHEET:", squeeze(await dlg().innerText()).slice(0, 600));
  const btns = await dlg().getByRole("button").allInnerTexts(); const links = await dlg().getByRole("link").allInnerTexts();
  note("buttons:", btns.join(" | "), "links:", links.join(" | "));
  await dlg().getByRole("link", { name: /^Cancel/ }).or(dlg().getByRole("button", { name: /^Cancel( expense)?$/ })).last().click();
  await page.waitForTimeout(2000);
  note("CANCEL SHEET:", squeeze(await dlg().innerText()).slice(0, 500));
  await dlg().locator("textarea").first().fill("QA: dated in December by mistake, the bill is from today");
  await dlg().getByRole("button", { name: /Cancel expense/ }).last().click();
  await page.waitForTimeout(3500);
  note("CANCELLED:", await msgs());
  note("DB:", JSON.stringify(sql(`select number, status, cancel_reason from expense where number='${num}'`)), JSON.stringify(dayb(num)));
}
if (step === "daybook") {
  await visit(page, "/finance-management/day-book", 2500);
  const t = await text(page, 20000);
  note("DAY BOOK totals:", (t.match(/Total income.{0,300}/) ?? [""])[0]);
  note("Expenses section:", (t.match(/Expenses \d+ entr.{0,600}/) ?? t.match(/Expenses.{0,400}/g) ?? [""]).toString().slice(0, 800));
  await visit(page, "/finance-management/cash-bank", 2500);
  note("CASH & BANK:", (await text(page, 2500)).slice(0, 1500));
  await shot(page, "cash-bank");
  await visit(page, "/dashboard", 2500);
  note("DASHBOARD money:", ((await text(page, 4000)).match(/Money today.{0,300}/) ?? [""])[0]);
}
if (step === "reports") {
  await visit(page, "/finance-management/reports", 2500);
  note("FINANCE REPORTS:", (await text(page, 3500)).slice(0, 2500));
  await shot(page, "finance-reports");
  for (const l of (await page.getByRole("link").allInnerTexts()).filter((x) => /report|statement|Income and expense|Cash flow|Trial|Profit|Expense/i.test(x)).slice(0, 6)) note("report link:", l.replace(/\s+/g, " "));
}
note("problems", JSON.stringify(page.problems));
await close();
