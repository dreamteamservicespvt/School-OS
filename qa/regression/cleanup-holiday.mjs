// Removes (archives) the Demo QA regression holiday added by academics.mjs, through the School Calendar,
// so 19-12-2026 stays a normal school day.  node qa/regression/cleanup-holiday.mjs
import { as, open, close, squeeze } from "./_lib.mjs";
const p = await as("cems.principal");
await open(p, "/events-calendar?m=2026-12&d=2026-12-19");
const names = await p.locator("main").getByText(/Demo QA Regression Holiday \d+/).allInnerTexts();
console.log("found", [...new Set(names)]);
for (const n of [...new Set(names)]) {
  await open(p, "/events-calendar?m=2026-12&d=2026-12-19");
  await p.locator("main").getByText(n, { exact: true }).filter({ visible: true }).first().click({ force: true });
  await p.waitForTimeout(1200);
  const rm = p.getByRole("button", { name: /^Remove/ }).or(p.getByRole("link", { name: /^Remove/ })).last();
  console.log("remove offered:", await rm.count());
  if (await rm.count()) {
    await rm.click(); await p.waitForTimeout(1000);
    const c = p.locator("dialog[open]").last().getByRole("button", { name: /^Remove/ });
    if (await c.count()) await c.last().click();
    await p.waitForTimeout(2500);
    console.log(squeeze((await p.locator("[role=status]").allInnerTexts()).join(" | ")).slice(0, 200));
  }
}
await close();
