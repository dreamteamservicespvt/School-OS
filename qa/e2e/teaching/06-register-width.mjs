// What makes the register page wider than a phone? Lists elements wider than the screen and scroll containers.
import { as, visit, shot, VIEWPORTS } from "./h.mjs";
import { close } from "../../lib.mjs";
const vp = process.env.VP ?? "phone390";
const url = process.argv[2] ?? "/attendance-management/register";
const page = await as(process.env.WHO ?? "teacher", VIEWPORTS[vp]);
await visit(page, url, 1500);
const info = await page.evaluate(() => {
  const W = window.innerWidth;
  const out = { doc: document.documentElement.scrollWidth, body: document.body.scrollWidth, W, wide: [], scrollers: [] };
  for (const el of document.querySelectorAll("body *")) {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    if ((cs.overflowX === "auto" || cs.overflowX === "scroll") && el.scrollWidth > el.clientWidth) out.scrollers.push(`${el.tagName}.${String(el.className).slice(0, 60)} sw=${el.scrollWidth} cw=${el.clientWidth}`);
    if (r.right > W + 2 && r.width > 0 && out.wide.length < 12) out.wide.push(`${el.tagName}.${String(el.className).slice(0, 80)} right=${Math.round(r.right)} w=${Math.round(r.width)}`);
  }
  return out;
});
console.log(JSON.stringify(info, null, 1));
await page.evaluate(() => window.scrollTo(400, 600));
await shot(page, `width-${vp}-${url.replace(/[^a-z0-9]+/gi, "_").slice(0, 40)}`, false);
await close();
