// Self-test 14 Nov, flow 1: a Teacher applies for leave from Me > My leave, an approver approves it, the Teacher sees it.
import { asRole, close, snap, sleep, mainText } from "./nc-h.mjs";
const out = [];
const go = async (p, path) => { await p.goto(new URL(path, p.url()).href); await p.waitForLoadState("networkidle").catch(() => {}); };
const reason = `QA self-test ${Date.now() % 100000}`;
// A Monday about 3 weeks ahead, so it is a school day and never clashes with earlier tests.
const day = new Date(Date.now() + 21 * 864e5); while (day.getUTCDay() !== 1) day.setUTCDate(day.getUTCDate() + 1);
const iso = day.toISOString().slice(0, 10);

const t = await asRole("teacher");
await go(t, "/dashboard");
await t.getByRole("link", { name: "My leave" }).first().click();
const apply = t.getByRole("button", { name: /Apply for leave/ }).first();
await apply.waitFor({ timeout: 60000 });
await apply.click();
const dlg = t.getByRole("dialog");
await dlg.waitFor();
const typeSel = dlg.getByLabel("Leave type");
const opts = await typeSel.locator("option").allInnerTexts();
const casual = opts.find((o) => /casual/i.test(o)) ?? opts[1];
await typeSel.selectOption({ label: casual });
await dlg.getByLabel("From date").fill(iso);
await dlg.getByLabel("To date").fill(iso);
await dlg.getByLabel("Reason").fill(reason);
await dlg.getByRole("button", { name: "Apply", exact: true }).click();
await sleep(4000);
await t.waitForLoadState("networkidle").catch(() => {});
let txt = await mainText(t, 6000);
out.push(`teacher applied ${casual} on ${iso}: request listed = ${txt.includes(reason)}, waiting = ${/Waiting/.test(txt.slice(txt.indexOf(reason) - 300, txt.indexOf(reason) + 300))}`);
if (!txt.includes(reason)) out.push("  page: " + txt.slice(0, 500).replace(/\n+/g, " | "));
await snap(t, "e2e-leave-applied", false);

// Whoever has it waiting decides it: try the Principal, then HR.
let approvedBy = null;
for (const role of ["principal", "hr"]) {
  const a = await asRole(role);
  await go(a, "/staff-hr-management/leave?view=requests");
  await sleep(1500);
  const row = a.locator("li").filter({ hasText: reason }).first();
  if (await row.count()) {
    await row.getByRole("button", { name: /Approve/ }).click();
    await sleep(4000);
    approvedBy = role;
    await snap(a, "e2e-leave-approved", false);
  }
  await a.context().close();
  if (approvedBy) break;
}
out.push(`approved by: ${approvedBy ?? "nobody found it waiting (check routing)"}`);

await go(t, "/staff-hr-management/leave?view=mine");
await sleep(1500);
txt = await mainText(t, 6000);
const near = txt.slice(Math.max(0, txt.indexOf(reason) - 300), txt.indexOf(reason) + 300);
out.push(`teacher sees: ${/Approved/.test(near) ? "Approved" : /Waiting/.test(near) ? "still Waiting" : "?"}`);
await snap(t, "e2e-leave-teacher-after", false);
await t.context().close();
console.log(out.join("\n"));
await close();
