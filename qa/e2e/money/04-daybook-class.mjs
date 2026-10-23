// Day Book and Fee Reports: which class is shown for a promoted student's payment.
import { as, visit, text, shot, note, squeeze } from "./h.mjs";
import { close } from "../../lib.mjs";
const page = await as("accountant");
await visit(page, "/finance-management/day-book", 2500);
const row = page.locator("tr", { hasText: "SPS/2026-27/00345" }).first();
note("DAY BOOK ROW:", squeeze(await row.innerText()));
await row.scrollIntoViewIfNeeded();
await page.screenshot({ path: `${process.env.QA_OUT}/shots/daybook-class-row.png`, clip: await (async () => { const b = await row.boundingBox(); return { x: 0, y: Math.max(0, b.y - 120), width: 1280, height: 260 }; })() });
// Class filter on the Day Book.
const sel = page.locator("select").filter({ hasText: /Class 3/ }).first();
if (await sel.count()) {
  const opts = await sel.locator("option").allInnerTexts();
  note("class options:", opts.slice(0, 20).join(" | "));
  await sel.selectOption({ label: opts.find((o) => /Class 3/.test(o)) });
  const apply = page.getByRole("button", { name: "Apply" });
  if (await apply.count()) await apply.click();
  await page.waitForTimeout(3000);
  const t = await text(page, 6000);
  note("FILTER Class 3:", page.url(), (t.match(/Total income.{0,120}/) ?? [""])[0], "| Rithvik rows:", (t.match(/Rithvik Varma/g) ?? []).length);
}
// Fee Reports, collection report.
await visit(page, "/fee-management/reports", 2500);
note("REPORTS:", (await text(page, 2500)).slice(0, 1500));
await shot(page, "fee-reports");
await close();
