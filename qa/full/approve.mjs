// Decides requests on /approvals as someone: each argument is "Approve|Decline::text in the title".
//   MSYS_NO_PATHCONV=1 node qa/full/approve.mjs <login> "Approve::Diya Patel" "Decline::Electricity"
import { as } from "./look.mjs";
import { go, shot, close } from "./h.mjs";
const [login, ...items] = process.argv.slice(2);
const p = await as(login);
for (const it of items) {
  const [act, text] = it.split("::");
  await go(p, "/approvals");
  const card = p.locator("main li, main article").filter({ hasText: text }).filter({ has: p.getByRole("button", { name: act, exact: true }) }).last();
  if (!(await card.count())) { console.log(`MISSING ${it}`); continue; }
  await card.getByRole("button", { name: act, exact: true }).click();
  await p.waitForTimeout(1200);
  const d = p.getByRole("dialog").last();
  let dlg = "";
  if (await d.count()) {
    dlg = (await d.innerText()).replace(/\n+/g, " | ").slice(0, 500);
    const t = d.locator("textarea").first();
    if (await t.count()) await t.pressSequentially(`${act}d in the full self-test.`, { delay: 3 });
    const b = d.getByRole("button", { name: new RegExp(`^${act}`) }).last();
    for (let i = 0; i < 2; i++) await b.click({ timeout: 3000 }).catch(() => {});
  }
  await p.waitForTimeout(3000);
  const after = (await p.locator("main li, main article").filter({ hasText: text }).last().innerText().catch(() => "(card gone)")).replace(/\n+/g, " | ").slice(0, 300);
  console.log(`${act} ${text}\n  DIALOG ${dlg}\n  AFTER ${after}`);
  if (p.problems.length) console.log("  PROBLEMS", p.problems.splice(0));
}
await shot(p, `approvals-${login}`, false);
await close();
