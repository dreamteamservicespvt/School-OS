// Workflow 7 step 10: the teacher cancels the approved leave on a phone; the balance comes back and the
// substitutions for those periods are released; the substitute's day no longer shows the extra periods.
import { as, visit, text, report, shot, VIEWPORTS, sql, sleep, messages, SUNRISE } from "./h.mjs";
import { close } from "../../lib.mjs";

const ME = "eb875a8c-e843-4289-b29c-a4d1a3f681ed";
const t = await as("subjectteacher", VIEWPORTS.phone390);
await visit(t, "/staff-hr-management/leave", 1500);
console.log((await text(t, 1200)));
await t.getByRole("button", { name: /Cancel leave/ }).first().click(); await sleep(1200);
const dlg = t.getByRole("dialog");
console.log("cancel dialog:", (await dlg.innerText()).replace(/\s+/g, " ").slice(0, 600));
await shot(t, "staffleave-cancel-dialog", false);
const ta = dlg.locator("textarea").first();
if (await ta.count()) await ta.fill("The wedding was postponed");
await dlg.getByRole("button", { name: /Cancel leave|Yes|Confirm/ }).last().click(); await sleep(3000);
console.log("after cancel:", await messages(t));
console.log((await text(t, 1200)));
console.log("leave:", sql(`select status, decision_reason from leave_request where staff_id='${ME}' order by created_at desc limit 1`));
console.log("subs:", sql(`select s.status, st.full_name, s.archived_at is not null from substitution s left join staff st on st.id=s.substitute_staff_id where s.absent_staff_id='${ME}' and s.date='2026-10-28' order by 1`));
await report(t, "cancelled");
const p = await as("principal", VIEWPORTS.phone390);
await visit(p, "/academic-management/time-table/mine?date=2026-10-28", 1200);
console.log("\nprincipal day:", (await text(p, 800)));
await close();
