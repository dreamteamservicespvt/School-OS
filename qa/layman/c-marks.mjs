// Layman C: marks entry as the class teacher (own papers only, wrong values, save, reload, other teacher's paper).
import { asRole, go, mainText, sleep, close, snap } from "../full/selftest-A-h.mjs";
const p = await asRole("teacher");
await go(p, "/examination-results/marks"); await sleep(800);
const t0 = await mainText(p, 6000);
console.log("TEACHER LIST\n", t0.replace(/\n+/g, " | ").slice(0, 2500));
const links = await p.locator("main a[href*='/examination-results/marks/']").evaluateAll((as) => as.map((a) => `${a.getAttribute("href")} :: ${a.innerText.replace(/\s+/g, " ").slice(0, 80)}`));
console.log("LINKS\n" + [...new Set(links)].join("\n"));
await snap(p, "c-marks-teacher-list");
console.log("PROBLEMS", p.problems);
await close();
