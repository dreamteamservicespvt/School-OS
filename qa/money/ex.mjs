// node qa/money/ex.mjs <login> <url> [viewport] [maxChars] — prints a screen's text, layout issues and errors.
import { as, visit, mainText, layoutIssues, shot, VIEWPORTS } from "./m.mjs";
import { close } from "../lib.mjs";
const [login, url, vp = "laptop1280", max = "5000"] = process.argv.slice(2);
const page = await as(login, VIEWPORTS[vp]);
const res = await visit(page, url);
console.log("STATUS", res?.status(), page.url());
console.log(await mainText(page, Number(max)));
console.log("LAYOUT", await layoutIssues(page));
console.log("PROBLEMS", page.problems);
await shot(page, `${(login + url).replace(/[^a-z0-9]+/gi, "_")}_${vp}`);
await close();
