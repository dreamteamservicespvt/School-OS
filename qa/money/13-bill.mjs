// Vendor bill: record ₹3,000, pay ₹1,000 now and ₹2,000 later; then try to overpay. Day Book checked after each.
import { as, visit, sql, SCHOOL_A, result, OUT } from "./m.mjs";
import { close } from "../lib.mjs";
import path from "node:path";

const M = "Finance Management", P = "Expenses";
const BILL = "DEMO-SSS/1210";
const row = () => sql(`select id, status, amount_paise, paid_paise from expense where school_id='${SCHOOL_A}' and bill_no='${BILL}' order by created_at desc limit 1`)[0];
const dbk = (id) => sql(`select d.direction, d.amount_paise from day_book_entry d join expense_payment p on p.id::text=d.source_id and d.source_type='expense-payment' where p.expense_id='${id}' order by d.posted_at`);
const page = await as("cems.accountant");
const toast = async () => (await page.locator("[role=status], [role=alert]").allInnerTexts()).join(" ").replace(/\s+/g, " ").slice(0, 200);

const featOn = () => sql(`select is_on from school_feature where school_id='${SCHOOL_A}' and feature_key='finance-vendor-bills'`)[0]?.[0] === "t";
if (!featOn()) {
  await visit(page, "/finance-management/settings");
  await page.getByRole("switch", { name: /Vendor bills/ }).click();
  await page.waitForTimeout(4000);
  const audit = sql(`select count(*) from audit_log_entry where school_id='${SCHOOL_A}' and record_type ilike '%feature%' and at > now() - interval '10 minutes'`)[0][0];
  result({ module: M, page: "Finance Settings", action: "Switch on Vendor bills (School Feature)", role: "accountant", expected: "Switched on for this school only", actual: `on=${featOn()} audit rows in last 2 min=${audit}`, status: featOn() ? "PASS" : "FAIL" });
}
if (!row()) {
  await visit(page, "/finance-management/expenses?do=bill");
  const d = page.getByRole("dialog").last();
  const vs = d.locator("select[name=vendorId]");
  const v = await vs.locator("option").evaluateAll((os) => os.find((o) => o.textContent.startsWith("Demo Sai"))?.value);
  await vs.selectOption(v);
  await d.locator("input[name=billNo]").fill(BILL);
  await d.locator("input[name=amount]").fill("3000");
  await d.locator("input[name=dueDate]").fill("2026-10-31");
  const hs = d.locator("select[name=accountHeadId]");
  await hs.selectOption(await hs.locator("option").evaluateAll((os) => os.find((o) => o.textContent.startsWith("Stationery"))?.value));
  await d.locator("input[name=what]").fill("Demo exam answer booklets");
  const file = d.locator("input[type=file][name=bill]");
  if (await file.count()) await file.setInputFiles(path.join(OUT, "demo-bill.png"));
  await d.getByRole("button", { name: "Save bill" }).click();
  await page.waitForTimeout(5000);
  const r = row();
  result({ module: M, page: P, action: "Record vendor bill ₹3,000 (Demo Sai Stationers)", role: "accountant", expected: "Saved, approved at once, not in Day Book", actual: `${await toast()} | ${JSON.stringify(r)}`, status: r?.[1] === "APPROVED" && !dbk(r[0]).length ? "PASS" : "FAIL" });
}
async function pay(amount, ref) {
  const r = row();
  await visit(page, `/finance-management/expenses?pay=${r[0]}`);
  const d = page.getByRole("dialog").last();
  await d.locator("input[name=payAmount]").fill(String(amount));
  await d.getByRole("radio", { name: "UPI" }).click().catch(async () => d.getByRole("button", { name: "UPI" }).click());
  await d.locator("input[name=reference]").fill(ref);
  await d.getByRole("button", { name: /^Mark/ }).click();
  await page.waitForTimeout(5000);
  return { msg: await toast(), dialog: (await page.getByRole("dialog").last().innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 300) };
}
let r = row();
if (r[3] === "0") {
  const m = await pay(1000, "DEMOUPI1210A");
  r = row();
  result({ module: M, page: P, action: "Pay ₹1,000 of the ₹3,000 vendor bill", role: "accountant", expected: "Paid ₹1,000; ₹2,000 left; 1 Day Book OUT ₹1,000", actual: `${m.msg} | ${JSON.stringify(r)} daybook=${JSON.stringify(dbk(r[0]))}`, status: r[1] === "APPROVED" && r[3] === "100000" && dbk(r[0]).length === 1 ? "PASS" : "FAIL" });
}
// Overpay: ₹2,500 when ₹2,000 is left.
const before = dbk(r[0]).length;
const over = await pay(2500, "DEMOUPI1210B");
r = row();
result({ module: M, page: P, action: "Pay ₹2,500 when ₹2,000 is left on the bill", role: "accountant", expected: "Refused in plain words; nothing posted", actual: `${over.msg} ${over.dialog.match(/[^.]*(more than|left|only)[^.]*\./i)?.[0] ?? ""} | paid=${r[3]} daybook ${before}->${dbk(r[0]).length}`, status: r[3] === "100000" && dbk(r[0]).length === before ? "PASS" : "FAIL" });
const m2 = await pay(2000, "DEMOUPI1210C");
r = row();
result({ module: M, page: P, action: "Pay the remaining ₹2,000", role: "accountant", expected: "Bill Paid; 2 Day Book OUT totalling ₹3,000", actual: `${m2.msg} | ${JSON.stringify(r)} daybook=${JSON.stringify(dbk(r[0]))}`, status: r[1] === "PAID" && dbk(r[0]).length === 2 && dbk(r[0]).reduce((s, x) => s + Number(x[1]), 0) === 300000 ? "PASS" : "FAIL" });
await close();
