// MONEY-01 in the browser: the same approved expense marked paid from two tabs at the same moment.
//   node qa/money/12c-pay-two-tabs.mjs <expense number>
import { as, visit, sql, SCHOOL_A, result, shot } from "./m.mjs";
import { close } from "../lib.mjs";

const no = process.argv[2] ?? "EXP/2026-27/00004";
const e = sql(`select id from expense where school_id='${SCHOOL_A}' and number='${no}'`)[0][0];
const tabs = [await as("cems.accountant"), await as("cems.accountant")];
for (const p of tabs) {
  await visit(p, `/finance-management/expenses?pay=${e}`);
  const d = p.getByRole("dialog").last();
  await d.getByRole("radio", { name: "Bank transfer" }).click().catch(async () => d.getByRole("button", { name: "Bank transfer" }).click());
  await d.locator("input[name=reference]").fill("DEMOUTR7200HALLB");
}
await Promise.all(tabs.map((p) => p.getByRole("dialog").last().getByRole("button", { name: /^Mark/ }).click()));
await tabs[0].waitForTimeout(6000);
const msgs = [];
for (const p of tabs) msgs.push((await p.locator("[role=status], [role=alert]").allInnerTexts()).join(" ").replace(/\s+/g, " ").slice(0, 140));
await shot(tabs[1], "expense-pay-two-tabs");
const pays = sql(`select count(*), coalesce(sum(amount_paise),0) from expense_payment where expense_id='${e}' and cancelled_at is null`)[0];
const dbk = sql(`select count(*), coalesce(sum(d.amount_paise),0) from day_book_entry d join expense_payment p on p.id::text=d.source_id and d.source_type='expense-payment' where p.expense_id='${e}'`)[0];
const ex = sql(`select status, amount_paise, paid_paise from expense where id='${e}'`)[0];
const ok = pays[0] === "1" && dbk[0] === "1";
result({ module: "Finance Management", page: "Expenses", action: `Mark ${no} paid from two tabs at the same moment (base code at :3000)`, role: "accountant", expected: "One Expense Payment, one Day Book OUT; the other tab told it is already paid", actual: `payments=${pays[0]} (₹${Number(pays[1]) / 100}), daybook=${dbk[0]} (₹${Number(dbk[1]) / 100}), expense ${ex.join("/")} | tabs: ${msgs.join(" || ")}`, status: ok ? "PASS" : "FAIL", defect: ok ? undefined : "MONEY-01" });
await close();
