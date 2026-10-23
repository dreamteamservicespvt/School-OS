// Hides parts of the page one by one to find which part makes the page wider than the phone.
import { as, visit, VIEWPORTS } from "./h.mjs";
import { close } from "../../lib.mjs";
const vp = process.env.VP ?? "phone390";
const url = process.argv[2] ?? "/attendance-management/register";
const page = await as(process.env.WHO ?? "teacher", VIEWPORTS[vp]);
await visit(page, url, 1500);
const info = await page.evaluate(() => {
  const W = window.innerWidth;
  const res = [];
  function probe(el, depth) {
    if (depth > 9) return;
    const kids = [...el.children];
    for (const k of kids) {
      const old = k.style.display; k.style.display = "none";
      const w = document.documentElement.scrollWidth;
      k.style.display = old;
      if (w <= W + 1) { res.push(`${"  ".repeat(depth)}${k.tagName}.${String(k.className).slice(0, 90)} (hiding it fixes)`); probe(k, depth + 1); return; }
    }
  }
  probe(document.body, 0);
  return res;
});
console.log(info.join("\n"));
await close();
