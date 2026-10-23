// CEMS (no fee heads yet): first fee head and Grade 5's first fee structure.
//   node qa/e2e/money/17-cems-fees.mjs <step>   steps: head | row | publish
import { as, visit, text, shot, sql, one, VIEWPORTS, BASE, note, squeeze, CEMS } from "./h.mjs";
import { close } from "../../lib.mjs";

const step = process.argv[2];
const page = await as(process.env.LOGIN ?? "cems.accountant", VIEWPORTS[process.env.VP ?? "laptop1280"]);
const dlg = () => page.locator("dialog[open], [role=dialog]").last();
const msgs = async () => (await page.locator("[role=status], [data-sonner-toast], [role=alert], [id$=-error]").allInnerTexts()).map((x) => (x ?? "").trim()).filter(Boolean).join(" | ").replace(/\s+/g, " ");
const grade5 = one(`select id from school_class where school_id='${CEMS}' and name='Grade 5'`);

if (step === "head") {
  await visit(page, "/fee-management/structure", 1500);
  await page.getByRole("link", { name: "Add fee head" }).or(page.getByRole("button", { name: "Add fee head" })).first().click();
  await page.waitForTimeout(1500);
  await dlg().locator("input[name=name]").fill("Tuition fee");
  await dlg().locator("select[name=kind]").selectOption({ label: "Tuition" });
  await dlg().getByRole("button", { name: /Add fee head/ }).last().click();
  await page.waitForTimeout(3000);
  note("HEAD:", await msgs(), JSON.stringify(sql(`select name, kind from fee_head where school_id='${CEMS}'`)));
}
if (step === "row") {
  await visit(page, `/fee-management/structure?cls=${grade5}`, 2000);
  note("CLASS SHEET:", squeeze(await dlg().innerText()).slice(0, 600));
  await dlg().getByRole("link", { name: /Add fee row|Add a fee|Add/ }).or(dlg().getByRole("button", { name: /Add fee row|Add/ })).first().click();
  await page.waitForTimeout(2000);
  note("ROW SHEET:", squeeze(await dlg().innerText()).slice(0, 700));
  await dlg().locator("input[name=total]").fill("30000");
  await dlg().locator("select[name=frequency]").selectOption("QUARTERLY").catch(async () => dlg().locator("select[name=frequency]").selectOption({ label: "Quarterly" }));
  await page.waitForTimeout(600);
  note("INST:", JSON.stringify(await dlg().locator("input[name=instDue]").evaluateAll((e) => e.map((x) => x.value))), JSON.stringify(await dlg().locator("input[name=instAmount]").evaluateAll((e) => e.map((x) => x.value))));
  await dlg().getByRole("button", { name: "Save in draft" }).click();
  await page.waitForTimeout(3500);
  note("SAVED:", await msgs(), page.url().replace(BASE, ""));
  await shot(page, "cems-fee-draft");
}
if (step === "publish") {
  await visit(page, `/fee-management/structure?cls=${grade5}`, 2000);
  await page.getByRole("link", { name: /Publish version|Send version/ }).first().click();
  await page.waitForTimeout(3000);
  note("PUBLISH SHEET:", squeeze(await dlg().innerText()).slice(0, 1000));
  await shot(page, "cems-fee-publish", false);
  if (await dlg().locator("textarea[name=reason]").count()) await dlg().locator("textarea[name=reason]").fill("QA: Grade 5 fees for 2026-27 entered for the first time");
  await dlg().locator("input[name=confirm]").check();
  await dlg().getByRole("button", { name: /Send for approval|Publish/ }).last().click();
  await page.waitForTimeout(4000);
  note("DONE:", await msgs(), JSON.stringify(sql(`select status, version, to_char(effective_from,'YYYY-MM-DD') from fee_structure where school_id='${CEMS}'`)));
  note("approval:", JSON.stringify(sql(`select id, status, summary from approval where school_id='${CEMS}' order by created_at desc limit 1`)));
}
note("problems", JSON.stringify(page.problems));
await close();
