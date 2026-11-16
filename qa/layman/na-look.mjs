// node qa/layman/na-look.mjs <role> <url> [url...]   (env W=390 for phone; FULL=1 for whole text)
import { asRole, asRoleAt, close, txt, snap, timed, log, PHONE } from "./na-h.mjs";
const [role, ...urls] = process.argv.slice(2);
const phone = process.env.W === "390";
const p = phone ? await asRoleAt(role, PHONE) : await asRole(role);
for (const u of urls) {
  const { ms, status } = await timed(p, u);
  const t = await txt(p, Number(process.env.N ?? 2500));
  const sw = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  const name = `look-${role}-${phone ? "390" : "1440"}-${u.replace(/[^a-z0-9]+/gi, "_").slice(0, 60)}`;
  await snap(p, name);
  log(`\n=== ${role} ${phone ? 390 : 1440} ${u} -> ${new URL(p.url()).pathname}${new URL(p.url()).search} status ${status} ${ms} ms sideways=${sw} problems=${p.problems.join("; ")}`);
  console.log(t);
  p.problems.length = 0;
}
await close();
