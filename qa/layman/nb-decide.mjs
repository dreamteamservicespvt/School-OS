// Night B: Principal opens a request and approves or rejects it.  node nb-decide.mjs <id> approve|reject [reason]
import { asRole, go, mainText, sleep, snap, log, flat } from "./nb-h.mjs";
const L = log("appr");
const [id, what, why] = process.argv.slice(2);
const p = await asRole(process.argv[5] ?? "principal");
await go(p, `/approvals/${id}`); await sleep(1500);
L("DETAIL", id.slice(0, 6), flat(await mainText(p, 4000)).slice(0, 1500));
await snap(p, `appr-${id.slice(0, 6)}-before`);
if (what === "approve") {
  await p.locator("main").getByRole("button", { name: /^Approve/ }).first().click(); 
} else {
  await p.locator("main").getByRole("button", { name: /^Reject/ }).or(p.locator("main").getByRole("link", { name: /^Reject/ })).first().click(); await sleep(1500);
  const d = p.getByRole("dialog").last(); const scope = (await d.isVisible().catch(() => false)) ? d : p.locator("main");
  await scope.locator("textarea").first().fill(why ?? "NB- night test, declined");
  await scope.getByRole("button", { name: /Reject/ }).last().click();
}
await sleep(4000);
L("RESULT", what, flat(await mainText(p, 3000)).slice(0, 900));
await snap(p, `appr-${id.slice(0, 6)}-after`);
process.exit(0);
