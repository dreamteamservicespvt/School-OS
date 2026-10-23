// Decide one approval on its own page as a login: node 06-decide.mjs <login> <approvalId> approve|reject [note]
import { as, visit, text, shot, one, note, squeeze } from "./h.mjs";
import { close } from "../../lib.mjs";
const [login, id, decision, why] = process.argv.slice(2);
const page = await as(login);
await visit(page, `/approvals/${id}`, 2000);
note("APPROVAL PAGE:", (await text(page, 3000)).slice(0, 1500));
await shot(page, `approval-${id.slice(0, 8)}-${login}`);
if (decision === "approve") {
  await page.getByRole("button", { name: "Approve", exact: true }).first().click();
  await page.waitForTimeout(1200);
  const dlg = page.locator("dialog[open], [role=dialog]").last();
  if (await dlg.count()) { note("DIALOG:", squeeze(await dlg.innerText()).slice(0, 500)); const b = dlg.getByRole("button", { name: /^Approve/ }); if (await b.count()) await b.last().click(); }
} else if (decision === "reject") {
  await page.getByRole("button", { name: /Reject|Decline/ }).first().click();
  await page.waitForTimeout(1200);
  const dlg = page.locator("dialog[open], [role=dialog]").last();
  await dlg.locator("textarea").first().fill(why ?? "QA: not agreed, please check the bill again");
  await dlg.getByRole("button", { name: /Reject|Decline/ }).last().click();
}
for (let i = 0; i < 20; i++) { if (one(`select status from approval where id='${id}'`) !== "WAITING") break; await page.waitForTimeout(500); }
note("STATUS:", one(`select status from approval where id='${id}'`));
note("AFTER:", (await text(page, 1500)).slice(0, 500));
note("problems", JSON.stringify(page.problems));
await close();
