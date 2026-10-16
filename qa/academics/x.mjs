// node qa/academics/x.mjs <login> <url> [viewport] [maxChars] — prints a screen's text, layout issues and errors.
import { mainText, shot, layoutIssues, close, VIEWPORTS } from "../lib.mjs";
import { login, open } from "./r.mjs";

const [who, url, vp = "laptop1280", max = "6000"] = process.argv.slice(2);
const page = await login(who, VIEWPORTS[vp]);
const r = await open(page, url);
console.log("STATUS", r?.status(), page.url());
console.log(await mainText(page, Number(max)));
console.log("LAYOUT", await layoutIssues(page));
console.log("PROBLEMS", page.problems);
await shot(page, `${(who + url).replace(/[^a-z0-9]+/gi, "_").slice(0, 80)}_${vp}`);
await close();
