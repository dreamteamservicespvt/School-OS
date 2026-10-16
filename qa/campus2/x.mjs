// node qa/campus2/x.mjs <login> <url> [viewport] [--fields]  — prints a screen (saved session).
import { asUser, go, mainText, layoutIssues, close, VIEWPORTS, fields, shot } from "./util.mjs";
const [login, url, vp = "laptop1280", f] = process.argv.slice(2);
const page = await asUser(login, VIEWPORTS[vp]);
const res = await go(page, url);
await new Promise((r) => setTimeout(r, 800));
console.log("STATUS", res?.status(), page.url());
console.log(await mainText(page, 6000));
if (f) { const d = await page.locator("dialog[open]").count(); console.log((await fields(page, d ? "dialog[open]" : "main")).join("\n")); }
console.log("LAYOUT", await layoutIssues(page));
console.log("PROBLEMS", page.problems);
await shot(page, `x_${(login + url).replace(/[^a-z0-9]+/gi, "_")}_${vp}`);
await page.context().close(); await close();
