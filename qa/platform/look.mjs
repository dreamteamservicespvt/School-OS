// node qa/platform/look.mjs <login> <url> [viewport]  — like qa/explore.mjs, with the platform sign-in helper.
import { go, mainText, layoutIssues, close, VIEWPORTS, shot } from "../lib.mjs";
import { as } from "./util.mjs";
const [login, url, vp = "laptop1280"] = process.argv.slice(2);
const p = await as(login, VIEWPORTS[vp]);
const res = await p.goto(url.startsWith("http") ? url : `${process.env.QA_URL ?? "http://localhost:3000"}${url}`);
await p.waitForTimeout(1200);
console.log("STATUS", res?.status(), p.url());
console.log(await mainText(p, Number(process.env.MAX ?? 2500)));
console.log("LAYOUT", await layoutIssues(p));
console.log("PROBLEMS", p.problems);
if (process.env.SHOT) await shot(p, process.env.SHOT);
await close();
