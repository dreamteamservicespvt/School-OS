// 14 Nov: "staff have no option to apply for leave". Checks the new "Me > My leave" menu item for a Teacher,
// that it opens My leave with the Apply button, on a computer and on a phone (More sheet), light and dark.
import { asRole, close, snap, sleep, mainText } from "./nc-h.mjs";
const out = [];
for (const [vp, tag] of [[{ width: 1440, height: 900 }, "1440"], [{ width: 390, height: 844 }, "390"]]) {
  const p = await asRole("teacher", vp);
  for (const theme of ["light", "dark"]) {
    await p.emulateMedia({ colorScheme: theme });
    await p.goto(new URL("/dashboard", p.url()).href);
    await p.waitForLoadState("networkidle").catch(() => {});
    if (tag === "390") { await p.getByRole("button", { name: /More/ }).last().click().catch(() => {}); await sleep(600); }
    const link = p.getByRole("link", { name: "My leave" }).first();
    out.push(`${tag} ${theme}: My leave link visible = ${await link.isVisible().catch(() => false)}`);
    await snap(p, `myleave-menu-${tag}-${theme}`, false);
    await link.click();
    await p.waitForURL(/staff-hr-management\/leave/, { timeout: 30000 }).catch(() => {});
    await p.waitForLoadState("networkidle").catch(() => {});
    const apply = p.getByRole("button", { name: /Apply for leave/ }).first();
    await apply.waitFor({ timeout: 45000 }).catch(() => {});
    out.push(`${tag} ${theme}: page ${new URL(p.url()).pathname}${new URL(p.url()).search}, Apply button = ${await apply.isVisible().catch(() => false)}`);
    if (!(await apply.isVisible().catch(() => false))) out.push("  page says: " + (await mainText(p, 400)).replace(/\n+/g, " | "));
    await snap(p, `myleave-page-${tag}-${theme}`, false);
  }
  await p.context().close();
}
console.log(out.join("\n"));
await close();
