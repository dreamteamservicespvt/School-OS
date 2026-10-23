// Lists absolutely positioned elements in the register table body and where they sit.
import { as, visit, VIEWPORTS } from "./h.mjs";
import { close } from "../../lib.mjs";
const page = await as("teacher", VIEWPORTS.phone390);
await visit(page, "/attendance-management/register", 1500);
const info = await page.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll("tbody *")) {
    const cs = getComputedStyle(el);
    if (cs.position === "absolute" || cs.position === "fixed") {
      const r = el.getBoundingClientRect();
      if (out.length < 6) out.push(`${el.tagName}.${String(el.className).slice(0, 80)} right=${Math.round(r.right)} bottom=${Math.round(r.bottom)} text="${(el.textContent || "").slice(0, 50)}" offsetParent=${el.offsetParent?.tagName}.${String(el.offsetParent?.className ?? "").slice(0, 40)}`);
    }
  }
  return out;
});
console.log(info.join("\n"));
await close();
