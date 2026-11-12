import { asRole, go, mainText, sleep, close } from "./d-h.mjs";
const [role, url, re] = process.argv.slice(2);
const p = await asRole(role);
await go(p, url); await sleep(1500);
const t = await mainText(p, 40000);
console.log(new URL(p.url()).pathname, "| matches:", (t.match(new RegExp(re, "g")) ?? []).length);
console.log(t.split("\n").filter((l) => new RegExp(re).test(l)).slice(0, 10).join("\n"));
await close();
