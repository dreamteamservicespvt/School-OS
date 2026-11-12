import { asRole, go, close } from "./d-h.mjs";
const p = await asRole(process.argv[2] ?? "admin");
for (const u of process.argv.slice(3)) for (let i = 0; i < 2; i++) {
  const t0 = Date.now(); await go(p, u); await p.waitForLoadState("networkidle").catch(() => {});
  console.log(`${u} ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}
await close();
