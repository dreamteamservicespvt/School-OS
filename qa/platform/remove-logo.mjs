// Removes the school logo through Settings, School Profile (used to undo the QA logo test).
//   node qa/platform/remove-logo.mjs <login>
import { close, BASE } from "../lib.mjs";
import { as } from "./util.mjs";
const p = await as(process.argv[2] ?? "cems.admin");
await p.goto(`${BASE}/settings/school-profile`);
const btn = p.getByRole("button", { name: /Remove logo|Remove/ }).first();
console.log("remove button:", await btn.count());
if (await btn.count()) {
  await btn.click();
  await p.waitForTimeout(500);
  const confirm = p.getByRole("dialog").getByRole("button", { name: /Remove/ });
  if (await confirm.count()) await confirm.first().click();
  await p.waitForTimeout(1500);
}
console.log((await p.locator("main").first().innerText()).replace(/\s+/g, " ").match(/Logo .{0,80}/)?.[0]);
await close();
