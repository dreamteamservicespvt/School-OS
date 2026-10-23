// Quick look at a list of pages as one login: text, problems, screenshot.
//   node qa/e2e/money/00-look.mjs <login> <viewport> <url> [url...]
import { as, visit, text, shot, layoutIssues, VIEWPORTS } from "./h.mjs";
import { close } from "../../lib.mjs";

const [login, vp, ...urls] = process.argv.slice(2);
const page = await as(login, VIEWPORTS[vp] ?? VIEWPORTS.laptop1280);
for (const u of urls) {
  const res = await visit(page, u, 1500);
  const t = await text(page, 5000);
  const li = await layoutIssues(page);
  const name = `look-${login}-${vp}-${u.replace(/\W+/g, "_").slice(0, 60)}`;
  await shot(page, name);
  console.log(`\n=== ${u} -> ${page.url().replace(/^https?:\/\/[^/]+/, "")} HTTP ${res?.status()} layout=${JSON.stringify(li)} problems=${JSON.stringify(page.problems)}\n${t}`);
  page.problems.length = 0;
}
await close();
