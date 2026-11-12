import { asRole, go, sleep, close } from "./d-h.mjs";
const [role, url, sel] = process.argv.slice(2);
const p = await asRole(role);
await go(p, url); await sleep(1500);
console.log(await p.evaluate((s) => [...document.querySelectorAll(s)].map((e) => e.outerHTML.slice(0, 400)).join("\n"), sel));
await close();
