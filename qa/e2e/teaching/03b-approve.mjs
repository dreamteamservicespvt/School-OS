// Decides one approval from its own page (/approvals/<id>), the way a principal opens it from a notification.
// node 03b-approve.mjs <approvalId> [Approve|Reject|Decline] [login]
import { as, visit, text, report, shot, VIEWPORTS, sleep, messages } from "./h.mjs";
import { close } from "../../lib.mjs";

const [id, verb = "Approve", login = "principal"] = process.argv.slice(2);
const p = await as(login, VIEWPORTS[process.env.VP ?? "phone390"]);
await visit(p, `/approvals/${id}`, 1500);
console.log((await text(p, 1500)));
await p.getByRole("button", { name: verb, exact: true }).last().click();
await sleep(1500);
const dlg = p.getByRole("dialog");
if (await dlg.count()) {
  console.log("dialog:", (await dlg.innerText()).replace(/\s+/g, " ").slice(0, 600));
  await shot(p, `approve-dialog-${id.slice(0, 8)}`, false);
  const ta = dlg.locator("textarea").first();
  if (await ta.count()) await ta.fill(verb === "Approve" ? "Checked with the class teacher; correct." : "Please send the doctor's note first.");
  const btn = dlg.getByRole("button", { name: new RegExp(`^${verb}`) }).last();
  await btn.click(); await sleep(3000);
} else await sleep(2000);
console.log("after:", await messages(p));
console.log((await text(p, 800)));
await report(p, "decide");
await close();
