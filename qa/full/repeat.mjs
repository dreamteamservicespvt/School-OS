// Opens one page N times and prints any script errors (hydration mismatches show as React #418).
//   node qa/full/repeat.mjs <login> <path> [n=4]
import { as } from "./look.mjs";
import { go, close, mainText } from "./h.mjs";
const [login, url, n] = process.argv.slice(2);
const p = await as(login, { width: 1280, height: 800 });
const errs = [];
p.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 300)); });
for (let i = 0; i < Number(n ?? 4); i++) { p.problems.length = 0; errs.length = 0; await go(p, url); await p.waitForTimeout(1500); console.log(i, JSON.stringify(p.problems), JSON.stringify(errs.slice(0, 3))); }
if (process.env.SHOW) console.log((await mainText(p, 3000)));
await close();
