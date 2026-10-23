// A payment dated yesterday, then cancelled: it should wait for the Principal's approval.
//   node qa/e2e/money/05-past-cancel.mjs collect|cancel|approve
import { as, visit, text, shot, sql, one, note, squeeze, BASE } from "./h.mjs";
import { close } from "../../lib.mjs";
const STUDENT = "5323a56e-27dd-4d83-a914-3e95790b75a7";
const step = process.argv[2];
const state = () => sql(`select p.id, p.amount_paise, p.status, to_char(p.payment_date,'YYYY-MM-DD HH24:MI'), r.number, r.status from payment p left join receipt r on r.payment_id=p.id where p.student_id='${STUDENT}' order by p.created_at`);
if (step === "collect") {
  const page = await as("accountant");
  await visit(page, `/fee-management/collect/${STUDENT}`, 1200);
  await page.locator("#pay-amt").fill("500");
  await page.getByText("Discount, waiver, date or note").click();
  await page.waitForTimeout(500);
  const when = page.locator("#pay-when");
  note("Paid on field visible:", await when.count());
  if (await when.count()) { await when.fill("2026-10-17T10:30"); await page.locator("#pay-note").fill("QA: brought by the parent yesterday, entered today"); }
  // Also try a future date first.
  await when.fill("2026-10-25T10:30");
  await page.getByRole("button", { name: /^Collect ₹/ }).click();
  await page.waitForTimeout(3000);
  note("FUTURE DATE:", (await page.locator("[role=alert], [id$=-error]").allInnerTexts()).join(" | "), "| dialog open:", await page.locator("dialog[open]").count());
  await visit(page, `/fee-management/collect/${STUDENT}`, 1200);
  await page.locator("#pay-amt").fill("500");
  await page.getByText("Discount, waiver, date or note").click();
  await page.locator("#pay-when").fill("2026-10-17T10:30");
  await page.locator("#pay-note").fill("QA: brought by the parent yesterday, entered today");
  await page.getByRole("button", { name: /^Collect ₹/ }).click();
  await page.waitForTimeout(4000);
  note("YESTERDAY:", squeeze(await page.locator("dialog[open]").first().innerText().catch(async () => (await page.locator("[role=alert]").allInnerTexts()).join(" | "))));
  await shot(page, "past-collect", false);
  note(JSON.stringify(state().slice(-2)));
  note("day book:", JSON.stringify(sql(`select date, direction, amount_paise from day_book_entry where student_id='${STUDENT}' order by posted_at desc limit 2`)));
}
if (step === "cancel") {
  const page = await as("accountant");
  const p = state().filter((r) => r[2] === "POSTED" && r[3].startsWith("2026-10-17")).at(-1);
  await visit(page, `/fee-management/payments/${p[0]}`, 1500);
  await page.getByRole("link", { name: /Cancel with a reason/ }).click();
  await page.waitForTimeout(1500);
  const sheet = page.locator("dialog[open], [role=dialog]").last();
  note("SHEET:", squeeze(await sheet.innerText()));
  await sheet.locator("select[name=reason]").selectOption({ label: "Same payment entered twice" }).catch(async () => sheet.locator("select[name=reason]").selectOption({ index: 1 }));
  await sheet.locator("textarea[name=note]").fill("QA: entered twice by mistake");
  await sheet.getByRole("button", { name: /Send for approval|Cancel receipt/ }).click();
  await page.waitForTimeout(4000);
  note("AFTER:", (await text(page, 3000)).slice(-900));
  await shot(page, "past-cancel-after", false);
  note(JSON.stringify(state().slice(-1)));
  note("approval:", JSON.stringify(sql(`select id, status, summary from approval where summary ilike '%${p[4]}%' or summary ilike '%Rithvik%' order by created_at desc limit 3`)));
}
if (step === "approve") {
  const page = await as("principal");
  await visit(page, "/approvals", 2000);
  const t = await text(page, 4000);
  note("APPROVALS:", t.slice(0, 1500));
  const row = page.getByText(/Rithvik Varma/).first();
  if (await row.count()) {
    await row.click(); await page.waitForTimeout(2500);
    note("OPENED:", page.url().replace(BASE, ""), (await text(page, 2500)).slice(0, 1200));
    await shot(page, "past-cancel-approval");
    await page.getByRole("button", { name: "Approve", exact: true }).first().click();
    await page.waitForTimeout(1500);
    const dlg = page.locator("dialog[open], [role=dialog]").last();
    if (await dlg.count()) { note("APPROVE DIALOG:", squeeze(await dlg.innerText()).slice(0, 400)); const b = dlg.getByRole("button", { name: /^Approve/ }); if (await b.count()) await b.last().click(); }
    await page.waitForTimeout(4000);
    note("AFTER APPROVE:", (await text(page, 1500)).slice(0, 600));
  }
  note(JSON.stringify(state().slice(-1)));
  note("day book:", JSON.stringify(sql(`select date, direction, amount_paise, section from day_book_entry where student_id='${STUDENT}' order by posted_at desc limit 3`)));
  note("problems", JSON.stringify(page.problems));
}
await close();
