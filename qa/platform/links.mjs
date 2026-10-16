// Broken-link crawl: for each login, collects every in-app link on the
// Dashboard and on each menu module's first page, opens each once (server
// render) and reports 404s, server errors and "This page is not here".
//   node qa/platform/links.mjs [login ...]
import { close, BASE } from "../lib.mjs";
import { as } from "./util.mjs";

const logins = process.argv.slice(2).length ? process.argv.slice(2) : ["cems.principal", "cems.admin", "cems.accountant", "cems.classteacher", "cems.reception", "cems.viceprincipal"];
for (const login of logins) {
  const p = await as(login);
  const starts = ["/dashboard?view=dashboard", ...(await p.$$eval('nav[aria-label="Main menu"] a', (as) => as.map((a) => a.getAttribute("href"))))];
  const found = new Map();
  for (const s of starts) {
    await p.goto(BASE + s).catch(() => {});
    await p.waitForTimeout(700);
    const hrefs = await p.$$eval("main a[href^='/'], header a[href^='/']", (as) => as.map((a) => [a.getAttribute("href"), (a.innerText || a.getAttribute("aria-label") || "").trim().slice(0, 40)]));
    for (const [h, label] of hrefs) if (!found.has(h) && !/\/sign-in|\/(export|print|pdf|receipt|file)/.test(h)) found.set(h, { from: s, label });
  }
  let bad = 0;
  for (const [h, { from, label }] of found) {
    const r = await p.context().request.get(BASE + h, { maxRedirects: 0 });
    const body = r.status() === 200 ? await r.text() : "";
    const notHere = /This page is not here/.test(body.replace(/<script[\s\S]*?<\/script>/g, "")) || r.status() === 404;
    if (notHere || r.status() >= 500) { bad++; console.log(`BROKEN ${login} ${r.status()} ${h}  (link "${label}" on ${from})`); }
  }
  console.log(`${login}: ${found.size} links checked, ${bad} broken`);
  await p.context().close();
}
await close();
