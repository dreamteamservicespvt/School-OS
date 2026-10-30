// Lists links, forms and buttons placed inside a link (invalid HTML that breaks hydration).
import { as } from "./look.mjs";
import { go, close, VIEWPORTS } from "./h.mjs";
const [login, url] = process.argv.slice(2);
const p = await as(login, VIEWPORTS.phone390);
await go(p, url); await p.waitForTimeout(1200);
console.log(JSON.stringify(await p.evaluate(() => [...document.querySelectorAll("a a, a form, a button")].map((e) => { const o = e.parentElement.closest("a"); return `OUTER ${o.outerHTML.slice(0, 250)} || INNER ${e.outerHTML.slice(0, 150)}`; })), null, 1));
await close();
