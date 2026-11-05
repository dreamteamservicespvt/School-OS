// Screenshots of the issue 11 screens: Staff List notice and Add Staff step 2, 390 and 1440, light and dark.
//   MSYS_NO_PATHCONV=1 node qa/full/issue11-shots.mjs
import { asUser, go, shot, close } from "./h.mjs";
import { VIEWPORTS } from "../lib.mjs";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// ONLY=390-light runs one sign-in (each sign-in sends a code; 4 in a row hit the 15-minute limit).
const only = process.env.ONLY ?? "";
for (const [vw, v] of [["390", VIEWPORTS.phone390], ["1440", VIEWPORTS.desk1440]]) {
  for (const scheme of ["light", "dark"]) {
    if (only && only !== `${vw}-${scheme}`) continue;
    const p = await asUser("admin", v, { colorScheme: scheme });
    await p.evaluate((s) => document.documentElement.setAttribute("data-theme", s), scheme).catch(() => {});
    await go(p, "/staff-hr-management");
    await wait(2000);
    const note = p.getByText(/can sign in but ha(ve|s) no staff record/).first();
    await note.scrollIntoViewIfNeeded().catch(() => {});
    await shot(p, `issue11-notice-${vw}-${scheme}`);
    const href = await p.getByRole("link", { name: /^Add staff record for / }).first().getAttribute("href");
    await go(p, href);
    await wait(2500);
    await p.getByRole("button", { name: /^Next/ }).first().click();
    await wait(3000);
    if (await p.getByText("This may be someone already on file").isVisible().catch(() => false)) {
      await p.getByLabel("It is a different person. Save anyway.").check();
      await p.getByRole("button", { name: /^Next/ }).first().click(); await wait(3000);
    }
    await shot(p, `issue11-step2-${vw}-${scheme}`);
  }
}
await close();
console.log("done");
