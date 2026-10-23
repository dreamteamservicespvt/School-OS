// Workflow 10, the monthly salary run, Sunrise October 2026 (Accountant runs, Principal approves).
//   node qa/e2e/money/13-salary.mjs <step>
// steps: look | line | adjust | twice | send | approve | slips | pay | mine
import { as, visit, text, shot, sql, one, layoutIssues, VIEWPORTS, BASE, note, squeeze, SUNRISE } from "./h.mjs";
import { close } from "../../lib.mjs";

const step = process.argv[2];
const RUN = "cdbb442b-696a-490c-b211-826f7a6b26ae";
const RAVI = "9791b29f-d6f7-4bb5-9c3b-702cc8bce9cb", MEENA = "70e4a2ee-2293-4e79-9b9a-95760e887782";
const G = "/salary-management/generate";
const page = await as(process.env.LOGIN ?? "accountant", VIEWPORTS[process.env.VP ?? "laptop1280"]);
const dlg = () => page.locator("dialog[open], [role=dialog]").last();
const msgs = async () => (await page.locator("[role=status], [data-sonner-toast], [role=alert], [id$=-error]").allInnerTexts()).map((x) => (x ?? "").trim()).filter(Boolean).join(" | ").replace(/\s+/g, " ");
const run = () => sql(`select status, staff_count, gross_paise, deductions_paise, net_paise, paid_on, pay_mode from payroll_run where id='${RUN}'`)[0];
const line = (s) => sql(`select paid_days, leave_days, lop_days, absent_days, gross_paise, lop_paise, add_paise, cut_paise, deductions_paise, net_paise, flags from payroll_line where run_id='${RUN}' and staff_id='${s}'`)[0];

if (step === "look") {
  await visit(page, G, 2500);
  note("PAGE:", (await text(page, 2500)).slice(0, 2000));
  note("RUN:", JSON.stringify(run()));
  await shot(page, `salary-generate-${process.env.LOGIN ?? "accountant"}`);
}
if (step === "line") {
  for (const s of [RAVI, MEENA]) {
    await visit(page, `${G}?open=${s}`, 2500);
    note("LINE SHEET:", squeeze(await dlg().innerText()).slice(0, 2000));
    note("DB line:", JSON.stringify(line(s)));
    await shot(page, `salary-line-${s.slice(0, 4)}`, false);
  }
  }
if (step === "adjust") {
  await visit(page, `${G}?do=adjust&staff=${RAVI}`, 2500);
  note("ADJ SHEET:", squeeze(await dlg().innerText()).slice(0, 600));
  await dlg().locator("input[name=amount]").fill("1500");
  await dlg().getByRole("button", { name: /Add|Save/ }).last().click();
  await page.waitForTimeout(2500);
  note("NO REASON:", await msgs(), squeeze(await dlg().innerText().catch(() => "closed")).slice(-200));
  await dlg().locator("textarea[name=reason]").fill("QA: science fair coordination in October");
  await dlg().getByRole("button", { name: /Add|Save/ }).last().click();
  await page.waitForTimeout(3500);
  note("ADDED:", await msgs());
  note("DB line:", JSON.stringify(line(RAVI)), "adjustments:", JSON.stringify(sql(`select type, amount_paise, reason from payroll_adjustment where run_id='${RUN}' and staff_id='${RAVI}'`)));
  await page.getByRole("button", { name: "Recalculate" }).click().catch(() => {});
  await page.waitForTimeout(4000);
  note("RECALC:", await msgs(), JSON.stringify(run()), JSON.stringify(line(RAVI)));
}
if (step === "twice") {
  await visit(page, `${G}?do=open-month`, 2500);
  note("OPEN MONTH SHEET:", squeeze(await dlg().innerText()).slice(0, 600));
  const opts = await dlg().locator("select[name=month] option").allInnerTexts();
  note("month options:", opts.join(" | "));
  const oct = opts.find((o) => /October 2026/.test(o));
  if (oct) { await dlg().locator("select[name=month]").selectOption({ label: oct }); await dlg().getByRole("button", { name: /Open/ }).last().click(); await page.waitForTimeout(3000); note("OPEN OCT AGAIN:", await msgs(), squeeze(await dlg().innerText().catch(() => "closed")).slice(-300)); }
  note("runs for Oct:", one(`select count(*) from payroll_run where school_id='${SUNRISE}' and month='2026-10-01'`));
}
if (step === "send") {
  await visit(page, `${G}?do=send`, 2500);
  note("SEND SHEET:", squeeze(await dlg().innerText()).slice(0, 1200));
  await shot(page, "salary-send-sheet", false);
  await dlg().getByRole("button", { name: "Send for approval" }).last().click();
  await page.waitForTimeout(4000);
  note("SENT:", await msgs(), JSON.stringify(run()), JSON.stringify(sql(`select id, status, summary from approval where record_id='${RUN}' order by created_at desc limit 1`)));
}
if (step === "approve") {
  await visit(page, `${G}?do=approve`, 2500);
  note("APPROVE SHEET:", squeeze(await dlg().innerText().catch(() => "none")).slice(0, 1200));
  await shot(page, "salary-approve-sheet", false);
  await dlg().getByRole("button", { name: /Approve/ }).last().click();
  await page.waitForTimeout(6000);
  note("APPROVED:", await msgs(), JSON.stringify(run()), "slips:", one(`select count(*) from payslip where run_id='${RUN}'`));
}
if (step === "slips") {
  await visit(page, `/salary-management/slips?run=${RUN}`, 2500);
  note("SLIPS:", (await text(page, 2500)).slice(0, 1500));
  await shot(page, "salary-slips");
  const slip = sql(`select id from payslip where run_id='${RUN}' and staff_id='${RAVI}'`)[0]?.[0];
  note("Ravi slip id", slip);
  const hrefs = await page.locator("a[href*='slip']").evaluateAll((as) => as.map((a) => a.getAttribute("href")).slice(0, 5));
  note("slip links:", JSON.stringify(hrefs));
}
if (step === "mine") {
  // A staff member (Ravi Teja = login teacher) sees only their own slips.
  await visit(page, "/salary-management/slips", 2500);
  note("MY SLIPS:", (await text(page, 2000)).slice(0, 1200));
  await shot(page, `salary-my-slips-${process.env.LOGIN}`);
  const hrefs = await page.locator("a[href]").evaluateAll((as) => as.map((a) => a.getAttribute("href")).filter((h) => /slip|pdf/i.test(h)).slice(0, 6));
  note("links:", JSON.stringify(hrefs));
  const other = sql(`select id from payslip where staff_id='${process.env.OTHER ?? MEENA}' order by created_at desc limit 1`)[0]?.[0];
  for (const h of hrefs.slice(0, 1)) {
    const swapped = other ? h.replace(/[0-9a-f-]{36}/, other) : null;
    for (const u of [h, swapped].filter(Boolean)) { const r = await page.request.get(`${BASE}${u}`); note(`GET ${u}: ${r.status()} ${r.headers()["content-type"]}`); }
  }
  for (const u of ["/salary-management/generate", "/salary-management/structures", `/salary-management/slips?run=${RUN}`]) { const r = await visit(page, u, 1500); note(`OPEN ${u}: ${r.status()} ${page.url().replace(BASE, "")} :: ${(await text(page, 300)).slice(0, 200)}`); }
}
if (step === "pay") {
  const before = sql(`select count(*), coalesce(sum(amount_paise),0) from day_book_entry where school_id='${SUNRISE}' and source_type ilike '%payroll%'`)[0];
  await visit(page, `${G}?do=pay`, 2500);
  note("PAY SHEET:", squeeze(await dlg().innerText()).slice(0, 900));
  await dlg().locator("input[name=reference]").fill("HDFCQA18102026");
  await dlg().getByRole("button", { name: /Mark|paid/i }).last().click();
  await page.waitForTimeout(5000);
  note("PAID:", await msgs(), JSON.stringify(run()));
  note("day book payroll entries", JSON.stringify(before), "->", JSON.stringify(sql(`select count(*), coalesce(sum(amount_paise),0) from day_book_entry where school_id='${SUNRISE}' and source_type ilike '%payroll%'`)[0]));
  await visit(page, "/finance-management/day-book", 2500);
  note("DAY BOOK salary:", ((await text(page, 30000)).match(/Salary \d* ?entr.{0,500}|Salary None.{0,100}/) ?? [""])[0]);
}
note("problems", JSON.stringify(page.problems));
await close();
