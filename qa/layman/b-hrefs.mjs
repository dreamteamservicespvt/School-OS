import { asRole, go, sleep } from "../full/selftest-A-h.mjs";
const p = await asRole(process.argv[2]); await go(p, process.argv[3]); await sleep(2500);
console.log((await p.evaluate((re) => [...document.querySelectorAll("main tr, main li")].filter((r) => new RegExp(re).test(r.innerText)).map((r) => [...r.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")).join(" ")), process.argv[4])).join("\n"));
process.exit(0);
