// node qa/people/crawl.mjs <login> [prefix...]
// Visits every in-app link a role's screens offer under the given prefixes
// (one level of tabs), and prints status, problems and layout issues.
import { asUser, go, mainText, layoutIssues, close, VIEWPORTS, BASE } from "../lib.mjs";

const [login, ...prefixes] = process.argv.slice(2);
const vp = process.env.VP ?? "laptop1280";
const page = await asUser(login, VIEWPORTS[vp]);
const seen = new Set();
const queue = prefixes.length ? [...prefixes] : ["/dashboard"];
const out = [];
while (queue.length && seen.size < Number(process.env.MAX ?? 60)) {
  const url = queue.shift();
  if (seen.has(url)) continue;
  seen.add(url);
  page.problems = [];
  const res = await go(page, url);
  const text = await mainText(page, 400);
  const lay = await layoutIssues(page);
  const errorish = /something went wrong|error|cannot|could not|not allowed|no access/i.test(text.slice(0, 200)) ? text.slice(0, 160).replace(/\n/g, " | ") : "";
  out.push({ url, status: res?.status(), final: page.url().replace(BASE, ""), problems: page.problems, layout: lay, errorish });
  console.log(JSON.stringify(out.at(-1)));
  const links = await page.evaluate(() => [...document.querySelectorAll("a[href^='/']")].map((a) => a.getAttribute("href")));
  for (const l of links) {
    const clean = l.split("#")[0];
    if (!clean || seen.has(clean) || /export|\.pdf|\/files\/|receipt|sign-out|template\/?$/.test(clean)) continue;
    if (prefixes.some((p) => clean.startsWith(p)) && clean.split("?")[0].split("/").length <= 4 && !/[0-9a-f]{8}-/.test(clean)) queue.push(clean);
  }
}
await close();
