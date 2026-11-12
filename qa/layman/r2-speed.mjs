// Round 2: page open times on the production build (layman LA10, LD9, LC3, LE9).
import { asRole, go, sleep, close } from "./d-h.mjs";
const pages = {
  admin: ["/academic-management/allocation?view=teachers", "/academic-management/subjects", "/student-management/guardians", "/academic-management/settings", "/student-management", "/dashboard", "/hostel-management/allocation", "/events-calendar", "/transport-management/reports", "/inventory-management/settings", "/library-management/books", "/reports-analytics/r/inv-stock"],
};
for (const [role, list] of Object.entries(pages)) {
  const p = await asRole(role);
  for (const u of list) {
    const t0 = Date.now();
    await go(p, u); await p.waitForLoadState("networkidle").catch(() => {});
    const ms = Date.now() - t0;
    const t1 = Date.now(); await go(p, u); await p.waitForLoadState("networkidle").catch(() => {});
    console.log(`${role} ${u} first ${(ms / 1000).toFixed(1)} s, again ${((Date.now() - t1) / 1000).toFixed(1)} s`);
  }
}
await close();
