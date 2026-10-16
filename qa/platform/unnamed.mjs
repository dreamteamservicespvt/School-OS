// node qa/platform/unnamed.mjs <login> <url> — lists links/buttons/inputs without an accessible name, with their HTML.
import { close, BASE } from "../lib.mjs";
import { as } from "./util.mjs";
const [login, url] = process.argv.slice(2);
const p = await as(login);
await p.goto(BASE + url);
await p.waitForTimeout(800);
const list = await p.evaluate(() => [...document.querySelectorAll("button, a[href], input:not([type=hidden]), select, textarea")]
  .filter((el) => {
    const r = el.getBoundingClientRect();
    if (!r.width) return false;
    const name = el.getAttribute("aria-label") || el.getAttribute("title") || el.innerText?.trim() || (el.id && document.querySelector(`label[for="${el.id}"]`)?.innerText) || el.closest("label")?.innerText || el.getAttribute("placeholder") || el.getAttribute("aria-labelledby");
    return !name;
  })
  .slice(0, 10).map((el) => el.outerHTML.slice(0, 300)));
console.log(list.join("\n---\n"));
await close();
