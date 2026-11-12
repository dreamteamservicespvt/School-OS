// Layman B: print a page's main text.  node qa/layman/b-look.mjs <role> <url> [chars] [shot]
import { asRole, go, mainText, sleep, snap } from "../full/selftest-A-h.mjs";
const p = await asRole(process.argv[2]);
const errs = []; p.on("pageerror", (e) => errs.push(e.message));
if (process.env.PHONE) await p.setViewportSize({ width: 390, height: 844 });
await go(p, process.argv[3]); await sleep(Number(process.env.WAIT ?? 2000));
console.log(p.url()); console.log((await mainText(p, Number(process.argv[4] ?? 4000))));
if (process.argv[5]) await snap(p, process.argv[5], process.env.FULL !== "0");
if (errs.length) console.log("PAGE ERRORS", errs.join(" ; "));
process.exit(0);
