import { asRole, go, mainText, sleep, close, snap, pageState } from "../full/selftest-A-h.mjs";
for (const role of (process.argv[2] ?? "reception").split(",")) {
  const p = await asRole(role);
  for (const u of ["/attendance-management/settings", "/attendance-management/settings?tab=punch", "/attendance-management/register", "/attendance-management"]) {
    await go(p, u); await sleep(800);
    const s = await pageState(p);
    console.log(role, u, "->", s.path, s.refused ? "REFUSED" : s.broken ? "BROKEN" : "OPEN", s.text.slice(0, 160).replace(/\n/g, " | "));
    if (s.broken) await snap(p, `broken-${role}-${u.replace(/[\/?=]/g, "_")}`);
  }
  console.log("PROBLEMS", p.problems.slice(0, 3));
  await p.context().close();
}
await close();
