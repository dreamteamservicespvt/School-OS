// Archive the stray 80-character test fee head (made by the length check in 01-heads) through Fee Structure.
import { as, visit, sql, SCHOOL_A, result } from "./m.mjs";
import { close } from "../lib.mjs";

const head = sql(`select id from fee_head where school_id='${SCHOOL_A}' and name like 'xxx%' and archived_at is null`)[0]?.[0];
if (head) {
  const page = await as("cems.accountant");
  await visit(page, `/fee-management/structure?head=${head}`);
  await page.getByRole("dialog").last().getByRole("button", { name: "Archive" }).first().click();
  await page.waitForTimeout(800);
  await page.getByRole("alertdialog").or(page.getByRole("dialog")).last().getByRole("button", { name: "Archive" }).last().click();
  await page.waitForTimeout(3000);
  const a = sql(`select archived_at is not null from fee_head where id='${head}'`)[0][0];
  result({ module: "Fee Management", page: "Fee Structure", action: "Archive the unused 80-character test fee head", role: "accountant", expected: "Archived, kept for history", actual: `archived=${a}`, status: a === "t" ? "PASS" : "FAIL" });
}
await close();
