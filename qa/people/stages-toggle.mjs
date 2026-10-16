// Switch the Test and Interview stages on or off in Admission Settings (cems.admin).  node qa/people/stages-toggle.mjs on|off
import { go, close } from "../lib.mjs";
import { as } from "./session.mjs";

const want = process.argv[2] === "on";
const page = await as("cems.admin");
await go(page, "/admission-management/settings");
await page.waitForTimeout(1500);
for (const name of ["Test on", "Interview on"]) {
  const sw = page.getByRole("switch", { name }).or(page.getByRole("button", { name })).first();
  const state = await sw.getAttribute("aria-checked").catch(() => null) ?? await sw.getAttribute("aria-pressed").catch(() => null);
  console.log(name, "state", state);
  if ((state === "true") !== want) { await sw.click(); await page.waitForTimeout(2500); }
  console.log(name, "now", await sw.getAttribute("aria-checked").catch(() => null), (await page.locator("[role=status], [role=alert]").allInnerTexts()).join(" "));
}
await close();
