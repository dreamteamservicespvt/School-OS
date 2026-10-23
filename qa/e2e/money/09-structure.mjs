// Fee Structure: a fee head, and a mid-year change for Class 3 with paid and part-paid students.
//   node qa/e2e/money/09-structure.mjs <step>
// steps: pay | head | open | draft | publish
import { as, visit, text, shot, sql, one, layoutIssues, VIEWPORTS, BASE, note, squeeze } from "./h.mjs";
import { close } from "../../lib.mjs";

const step = process.argv[2];
const RITHVIK = "5323a56e-27dd-4d83-a914-3e95790b75a7", SAHITHI = "c07a2c71-fc6c-42f7-8c61-bb7c0c3309ed";
const dues = (s) => sql(`select (select name from fee_head where id=d.fee_head_id), d.label, d.due_date, d.amount_paise, d.adjustment_paise, d.paid_paise, d.balance_paise, d.state, coalesce(d.removed_reason,'') from student_fee_due d where student_id='${s}' and (select name from fee_head where id=d.fee_head_id)='Tuition fee' order by due_date, created_at`);
const page = await as(process.env.LOGIN ?? "accountant", VIEWPORTS[process.env.VP ?? "laptop1280"]);
const dlg = () => page.locator("dialog[open], [role=dialog]").last();

async function payOnly(student, rowLabel, amount, mode, ref) {
  await visit(page, `/fee-management/collect/${student}`, 1200);
  for (const cb of await page.getByRole("checkbox").all()) if (await cb.isChecked()) await cb.uncheck();
  await page.getByRole("checkbox", { name: rowLabel }).check();
  await page.getByRole("radio", { name: mode, exact: true }).click();
  await page.locator("#pay-amt").fill(amount);
  if (ref) await page.locator("#pay-ref").fill(ref);
  await page.getByRole("button", { name: /^Collect ₹/ }).click();
  await page.waitForTimeout(4000);
  note("PAID:", squeeze(await page.locator("dialog[open]").first().innerText().catch(async () => (await page.locator("[role=alert]").allInnerTexts()).join(" | "))).slice(0, 300));
}

if (step === "pay") {
  await payOnly(RITHVIK, "Tuition fee Quarter 3 (Oct to Dec)", "8000", "Bank transfer", `NEFTQA${Date.now().toString().slice(-8)}`);
  await payOnly(SAHITHI, "Tuition fee Quarter 3 (Oct to Dec)", "3000", "Cash");
  note("RITHVIK tuition:", JSON.stringify(dues(RITHVIK)));
  note("SAHITHI tuition:", JSON.stringify(dues(SAHITHI)));
}

if (step === "head") {
  await visit(page, "/fee-management/structure", 1500);
  const add = page.getByRole("link", { name: "Add fee head" }).or(page.getByRole("button", { name: "Add fee head" })).first();
  for (const [what, name] of [["empty", ""], ["same as Tuition fee", "Tuition fee"], ["same with other case", "tuition FEE"], ["new", "QA Robotics club"]]) {
    await add.click();
    await page.waitForTimeout(1500);
    await dlg().locator("input[name=name]").fill(name);
    if (what === "new") { await dlg().locator("select[name=kind]").selectOption({ index: 3 }).catch(() => {}); }
    await dlg().getByRole("button", { name: /Add|Save/ }).last().click();
    await page.waitForTimeout(3000);
    const t = squeeze(await dlg().innerText().catch(() => "(closed)"));
    note(`HEAD ${what}:`, (await page.locator("[role=status], [data-sonner-toast], [role=alert], [id$=-error]").allInnerTexts()).join(" | ").replace(/\s+/g, " ").slice(0, 300), "| sheet:", t.slice(0, 200));
    if (await dlg().count()) await page.keyboard.press("Escape");
    await visit(page, "/fee-management/structure", 1200);
  }
  // Taxable head: needs a GSTIN?
  await add.click(); await page.waitForTimeout(1500);
  note("ADD SHEET:", squeeze(await dlg().innerText()).slice(0, 700));
  await shot(page, "head-sheet", false);
  note("heads:", JSON.stringify(sql(`select name, kind, archived_at is null from fee_head where school_id='150cdcd5-42f8-42d3-a105-7b26b28a3c85' order by created_at desc limit 3`)));
}

if (step === "open") {
  await visit(page, "/fee-management/structure", 1500);
  const card = page.locator("section, article, div").filter({ has: page.getByText("Class 3", { exact: true }) }).filter({ hasText: "32 students" }).last();
  note("CARD:", squeeze(await card.innerText()).slice(0, 300));
  const links = await page.getByRole("link").filter({ hasText: /Class 3|Change/ }).allInnerTexts();
  note("links:", links.slice(0, 20).join(" | "));
  await page.getByText("Class 3", { exact: true }).first().click();
  await page.waitForTimeout(2500);
  note("URL:", page.url().replace(BASE, ""));
  note("PAGE:", (await text(page, 4000)));
  await shot(page, "structure-class3");
}
if (step === "draft") {
  await visit(page, "/fee-management/structure?cls=66a13dda-6212-4b7d-99f9-46000dd40b28", 2000);
  await dlg().getByRole("link", { name: "Change" }).or(dlg().getByRole("button", { name: "Change" })).first().click();
  await page.waitForTimeout(2500);
  note("ROW SHEET:", squeeze(await dlg().innerText()).slice(0, 900));
  await dlg().locator("input[name=total]").fill("36000");
  await page.waitForTimeout(600);
  const inst = await dlg().locator("li").allInnerTexts();
  const vals = await dlg().locator("input[name=instAmount]").evaluateAll((els) => els.map((e) => e.value));
  const dues = await dlg().locator("input[name=instDue]").evaluateAll((els) => els.map((e) => e.value));
  note("INSTALLMENTS after total 36000:", JSON.stringify(vals), JSON.stringify(dues), squeeze(await dlg().innerText()).match(/Adds up to[^.]*|Installments add up to[^.]*\.[^.]*\./)?.[0]);
  // Mistake: installments that do not add up.
  await dlg().locator("input[name=instAmount]").first().fill("8000");
  await dlg().getByRole("button", { name: "Save in draft" }).click();
  await page.waitForTimeout(2500);
  note("NOT ADDING UP:", squeeze(await dlg().innerText()).slice(0, 600));
  await shot(page, "structure-row-not-adding", false);
  await dlg().locator("input[name=instAmount]").first().fill("9000");
  await dlg().getByRole("button", { name: "Save in draft" }).click();
  await page.waitForTimeout(3500);
  note("AFTER SAVE url:", page.url().replace(BASE, ""));
  note("AFTER SAVE:", (await text(page, 3000)).slice(0, 1500));
  await shot(page, "structure-draft-saved");
}

if (step === "publish") {
  await visit(page, "/fee-management/structure?cls=66a13dda-6212-4b7d-99f9-46000dd40b28", 2000);
  const t = await text(page, 20000);
  note("DRAFTS:", (t.match(/Drafts not published.{0,400}/) ?? [""])[0]);
  const pub = page.getByRole("link", { name: /Publish version|Send version/ }).or(page.getByRole("button", { name: /Publish|Send for approval/ })).first();
  note("publish control:", await pub.count() ? squeeze(await pub.innerText()) : "none");
  await pub.click();
  await page.waitForTimeout(3000);
  note("PUBLISH SHEET (default date):", squeeze(await dlg().innerText()).slice(0, 1500));
  await shot(page, "structure-publish-sheet-default", false);
  for (const d of (process.env.DATES ?? "2026-10-01").split(",")) {
    await dlg().locator("input[name=effectiveFrom]").fill(d);
    await page.waitForTimeout(5000);
    note(`PUBLISH SHEET from ${d}:`, squeeze(await dlg().innerText()).slice(0, 1500));
    await shot(page, `structure-publish-sheet-${d}`, false);
  }
  if (process.env.SEND) {
    if (await dlg().locator("textarea[name=reason]").count()) await dlg().locator("textarea[name=reason]").fill("QA: tuition goes up by ₹4,000 a year from October, as agreed by the management");
    // Without the tick first.
    await dlg().getByRole("button", { name: /Send for approval|Publish/ }).last().click();
    await page.waitForTimeout(2500);
    note("WITHOUT TICK:", squeeze(await dlg().innerText().catch(() => "closed")).slice(-300));
    await dlg().locator("input[name=confirm]").check();
    await dlg().getByRole("button", { name: /Send for approval|Publish/ }).last().click();
    await page.waitForTimeout(5000);
    note("SENT:", (await page.locator("[role=status], [data-sonner-toast], [role=alert]").allInnerTexts()).join(" | "), page.url().replace(BASE, ""));
    note("approval:", JSON.stringify(sql(`select id, status, summary from approval where record_type ilike '%structure%' order by created_at desc limit 2`)));
  }
}

if (step === "check") {
  note("RITHVIK tuition:", JSON.stringify(dues(RITHVIK)));
  note("SAHITHI tuition:", JSON.stringify(dues(SAHITHI)));
  note("adjustments:", JSON.stringify(sql(`select student_id, amount_paise, left(reason,90) from fee_adjustment where student_id in ('${RITHVIK}','${SAHITHI}') order by created_at`)));
  await visit(page, `/fee-management/ledger/${SAHITHI}`, 2000);
  note("SAHITHI LEDGER:", (await text(page, 5000)).slice(0, 2500));
  await shot(page, "structure-after-ledger-sahithi");
  await visit(page, `/fee-management/ledger/${RITHVIK}`, 2000);
  note("RITHVIK LEDGER:", (await text(page, 5000)).slice(0, 2500));
}
note("problems", JSON.stringify(page.problems));
await close();
