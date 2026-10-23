// Day Book: the Refunds and reversals section, and the Close today button.
import { as, visit, text, shot, note, squeeze } from "./h.mjs";
import { close } from "../../lib.mjs";
const page = await as(process.env.LOGIN ?? "accountant");
await visit(page, "/finance-management/day-book", 2500);
const t = await text(page, 30000);
note("REVERSALS:", (t.match(/Refunds and reversals \d+ entr.{0,900}/) ?? [""])[0]);
const sec = page.locator("section, div").filter({ has: page.getByText(/^Refunds and reversals$/) }).last();
await sec.scrollIntoViewIfNeeded().catch(() => {});
await page.screenshot({ path: `${process.env.QA_OUT}/shots/daybook-reversals.png` });
await visit(page, "/finance-management/day-book?from=2026-12-01&to=2026-12-01", 2500);
note("DEC 1:", (await text(page, 3000)).slice(0, 900));
await visit(page, "/finance-management/day-book/" , 1500);
note("problems", JSON.stringify(page.problems));
await close();
