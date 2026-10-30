// Finds the elements behind crawl findings: unnamed links/inputs, sideways scroll, links to refused pages.
//   node qa/full/probe-a11y.mjs <login> <path> [linkPattern]
import { as } from "./look.mjs";
import { go, close } from "./h.mjs";
const [login, url, linkPat] = process.argv.slice(2);
const p = await as(login, { width: 1280, height: 800 });
await go(p, url);
await p.waitForTimeout(600);
console.log(JSON.stringify(await p.evaluate((linkPat) => {
  const nameOf = (el) => el.getAttribute("aria-label") || el.getAttribute("title") || el.innerText?.trim() || (el.id && document.querySelector(`label[for="${el.id}"]`)?.innerText) || el.closest("label")?.innerText || el.getAttribute("placeholder") || el.getAttribute("aria-labelledby");
  const unnamed = [...document.querySelectorAll("button, a[href], input:not([type=hidden]), select, textarea")].filter((el) => el.getBoundingClientRect().width && !nameOf(el)).slice(0, 6).map((el) => el.outerHTML.slice(0, 300) + " PARENT " + el.parentElement.outerHTML.slice(0, 200));
  const wide = [...document.querySelectorAll("body *")].filter((el) => el.getBoundingClientRect().right > innerWidth + 1 && el.getBoundingClientRect().width > 0).slice(-4).map((el) => `${el.tagName} ${el.className} w=${Math.round(el.getBoundingClientRect().width)} :: ${el.innerText?.slice(0, 60)}`);
  const links = linkPat ? [...document.querySelectorAll("a[href]")].filter((a) => a.getAttribute("href").includes(linkPat)).slice(0, 4).map((a) => `${a.getAttribute("href")} "${a.innerText.trim().slice(0, 40)}"`) : [];
  return { scrollW: document.documentElement.scrollWidth, unnamed, wide, links };
}, linkPat ?? null), null, 1));
await close();
