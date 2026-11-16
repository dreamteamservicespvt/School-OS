import { asRole, close, txt, log } from "./na-h.mjs";
for (const r of process.argv.slice(2)) {
  try { const p = await asRole(r); log(`${r}: ${p.url()} :: ${(await txt(p, 200)).replace(/\n/g," | ")}`); await p.context().close(); }
  catch (e) { log(`${r}: FAIL ${e.message}`); }
}
await close();
