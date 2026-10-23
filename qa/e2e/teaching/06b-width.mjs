// Finds elements that stick out of the screen and are not inside a sideways-scrolling box.
import { as, visit, VIEWPORTS } from "./h.mjs";
import { close } from "../../lib.mjs";
const vp = process.env.VP ?? "phone390";
const url = process.argv[2] ?? "/attendance-management/register";
const page = await as(process.env.WHO ?? "teacher", VIEWPORTS[vp]);
await visit(page, url, 1500);
const info = await page.evaluate(() => {
  const W = window.innerWidth;
  const inScroller = (el) => { for (let p = el.parentElement; p; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o === "auto" || o === "scroll" || o === "hidden" || o === "clip") return true; } return false; };
  const out = [];
  for (const el of document.querySelectorAll("body *")) {
    const r = el.getBoundingClientRect();
    if (r.right > W + 2 && !inScroller(el)) out.push(`${el.tagName}.${String(el.className).slice(0, 100)} pos=${getComputedStyle(el).position} right=${Math.round(r.right)} w=${Math.round(r.width)} text="${(el.innerText || el.textContent || "").slice(0, 40)}"`);
  }
  return { doc: document.documentElement.scrollWidth, out: out.slice(0, 15) };
});
console.log(JSON.stringify(info, null, 1));
await close();
