// CEMS (new school, no salary yet): add two structures, open September 2026, calculate, send.
//   node qa/e2e/money/16-cems-salary.mjs <step>   steps: structures | open | send | pay
import { as, visit, text, shot, sql, one, VIEWPORTS, BASE, note, squeeze, CEMS } from "./h.mjs";
import { close } from "../../lib.mjs";

const step = process.argv[2];
const page = await as(process.env.LOGIN ?? "cems.accountant", VIEWPORTS[process.env.VP ?? "laptop1280"]);
const dlg = () => page.locator("dialog[open], [role=dialog]").last();
const msgs = async () => (await page.locator("[role=status], [data-sonner-toast], [role=alert], [id$=-error]").allInnerTexts()).map((x) => (x ?? "").trim()).filter(Boolean).join(" | ").replace(/\s+/g, " ");
const runs = () => sql(`select id, to_char(month,'YYYY-MM'), status, staff_count, net_paise from payroll_run where school_id='${CEMS}' order by month`);

if (step === "structures") {
  for (const [who, tpl] of [["Demo Bhaskar Gorle", "Office staff"], ["Demo Lavanya Teki", "TGT"]]) {
    await visit(page, "/salary-management/structures", 2000);
    await page.getByRole("link", { name: "Add structure" }).or(page.getByRole("button", { name: "Add structure" })).first().click();
    await page.waitForTimeout(2000);
    const opts = await dlg().locator("select[name=staffId] option").allInnerTexts();
    const o = opts.find((x) => x.includes(who));
    note("staff option:", o);
    await dlg().locator("select[name=staffId]").selectOption({ label: o });
    const t = dlg().locator("select[name=template]");
    if (await t.count()) await t.selectOption({ label: `${tpl} template` });
    await page.waitForTimeout(600);
    note("SHEET:", squeeze(await dlg().innerText()).slice(0, 900));
    await dlg().getByRole("button", { name: "Save structure" }).click();
    await page.waitForTimeout(3500);
    note("SAVED:", await msgs(), squeeze(await dlg().innerText().catch(() => "closed")).slice(-300));
  }
  await shot(page, "cems-structures");
  note("structures:", JSON.stringify(sql(`select (select full_name from staff where id=s.staff_id), to_char(effective_from,'YYYY-MM-DD'), version from salary_structure s where school_id='${CEMS}'`)));
}
if (step === "open") {
  await visit(page, "/salary-management/generate?do=open-month", 2000);
  note("OPEN SHEET:", squeeze(await dlg().innerText()).slice(0, 500));
  const opts = await dlg().locator("select[name=month] option").allInnerTexts();
  await dlg().locator("select[name=month]").selectOption({ label: opts.find((x) => /October 2026/.test(x)) ?? opts[0] });
  await dlg().getByRole("button", { name: /Open/ }).last().click();
  await page.waitForTimeout(4000);
  note("OPENED:", await msgs(), JSON.stringify(runs()));
  const calc = page.getByRole("button", { name: /^(Calculate|Recalculate)$/ });
  if (await calc.count()) { await calc.first().click(); await page.waitForTimeout(5000); note("CALC:", await msgs(), JSON.stringify(runs())); }
  note("PAGE:", (await text(page, 3000)).slice(0, 1800));
  await shot(page, "cems-generate");
}
if (step === "send") {
  await visit(page, "/salary-management/generate?do=send", 2500);
  note("SEND SHEET:", squeeze(await dlg().innerText()).slice(0, 900));
  await dlg().getByRole("button", { name: "Send for approval" }).last().click();
  await page.waitForTimeout(4000);
  note("SENT:", await msgs(), JSON.stringify(runs()));
}
if (step === "approve") {
  await visit(page, "/salary-management/generate?do=approve", 2500);
  note("APPROVE SHEET:", squeeze(await dlg().innerText().catch(() => "none")).slice(0, 600));
  await dlg().getByRole("button", { name: /Approve/ }).last().click();
  await page.waitForTimeout(5000);
  note("APPROVED:", await msgs(), JSON.stringify(runs()));
}
if (step === "pay") {
  await visit(page, "/salary-management/generate?do=pay", 2500);
  note("PAY SHEET:", squeeze(await dlg().innerText()).slice(0, 600));
  await dlg().getByRole("button", { name: /Cash/ }).first().click().catch(() => {});
  if (await dlg().locator("input[name=reference]").count()) await dlg().locator("input[name=reference]").fill("SBINCEMS0930");
  await dlg().getByRole("button", { name: /Mark paid/ }).last().click();
  await page.waitForTimeout(4000);
  note("PAID:", await msgs(), JSON.stringify(runs()));
  note("day book:", JSON.stringify(sql(`select date, direction, amount_paise, section, mode from day_book_entry where school_id='${CEMS}' order by posted_at desc limit 3`)));
  await visit(page, "/finance-management/cash-bank", 2000);
  note("CASH & BANK:", (await text(page, 1200)).slice(0, 700));
}
note("problems", JSON.stringify(page.problems));
await close();
