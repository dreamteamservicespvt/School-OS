import { asRole, go, mainText, sleep, close, snap } from "../full/selftest-A-h.mjs";
const [role, url, name, vw] = process.argv.slice(2);
const p = await asRole(role);
if (vw) await p.setViewportSize({ width: Number(vw), height: 844 });
await go(p, url); await sleep(1200);
console.log(new URL(p.url()).pathname, "\n", (await mainText(p, 8000)).replace(/\n+/g, " | ").slice(0, 3000));
if (name) await snap(p, name);
console.log("PROBLEMS", p.problems);
await close();
