import { asRole, go, mainText, sleep, close, snap } from "./d-h.mjs";
const [role, url, from = "", len = "2500", shot = ""] = process.argv.slice(2);
const p = await asRole(role, shot.startsWith("390") ? { width: 390, height: 844 } : undefined);
await go(p, url); await sleep(1800);
const t = await mainText(p, 60000);
const i = from ? Math.max(0, t.indexOf(from)) : 0;
console.log(new URL(p.url()).pathname + new URL(p.url()).search, "\n" + t.slice(i, i + Number(len)).replace(/\n+/g, " | "));
if (shot) await snap(p, shot.replace(/^390/, "p390"));
await close();
