// node qa/explore.mjs <login|-> <url> [viewport]  — prints the screen text and problems.
import { asUser, newPage, go, mainText, shot, layoutIssues, close, VIEWPORTS } from "./lib.mjs";
const [login, url, vp = "laptop1280"] = process.argv.slice(2);
const page = login === "-" ? await newPage(VIEWPORTS[vp]) : await asUser(login, VIEWPORTS[vp]);
const res = await go(page, url);
console.log("STATUS", res?.status(), page.url());
console.log(await mainText(page, 4000));
console.log("LAYOUT", await layoutIssues(page));
console.log("PROBLEMS", page.problems);
await shot(page, `${(login + url).replace(/[^a-z0-9]+/gi, "_")}_${vp}`);
await close();
