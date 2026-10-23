// Viewport-only screenshots (top of page, then after scrolling) for a login: node 08-viewshot.mjs <login> <vp> <name> <url> [scrollY...]
import { as, visit, VIEWPORTS, layoutIssues, note } from "./h.mjs";
import { close } from "../../lib.mjs";
const [login, vp, name, url, ...ys] = process.argv.slice(2);
const page = await as(login, VIEWPORTS[vp]);
await visit(page, url, 2500);
note("layout", JSON.stringify(await layoutIssues(page)), "problems", JSON.stringify(page.problems));
await page.screenshot({ path: `${process.env.QA_OUT}/shots/${name}-0.png` });
for (const y of ys) { await page.evaluate((y) => window.scrollTo(0, Number(y)), y); await page.waitForTimeout(600); await page.screenshot({ path: `${process.env.QA_OUT}/shots/${name}-${y}.png` }); }
await close();
