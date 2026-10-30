// Signs in as one person, reads the menu and opens every page reachable by links
// inside each menu module (two of each address pattern). Records broken pages,
// script errors, 5xx answers and layout problems.
//   node qa/full/crawl.mjs <username> [maxPerModule=40] [viewport=laptop1280]
import { asUser, menu, go, pageState, layoutIssues, saveJson, close, VIEWPORTS, shot } from "./h.mjs";

const [login, maxArg, vpArg] = process.argv.slice(2);
const MAX = Number(maxArg ?? 40);
const vp = VIEWPORTS[vpArg ?? "laptop1280"];
const page = await asUser(login, vp);
const items = await menu(page);
const pattern = (p) => p.replace(/\/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, "/:id").replace(/\/c[a-z0-9]{20,}/g, "/:id").replace(/\/\d+(?=\/|$)/g, "/:n").replace(/\?.*$/, "");
const SKIP = /sign-out|\/api\/|\.pdf|\/download|\/export|\/print|logout|\/r\/|\/p\//i;
const seen = new Set(), perPattern = new Map(), results = [];

for (const item of items) {
  const root = item.href.split("?")[0];
  const queue = [item.href];
  let n = 0;
  while (queue.length && n < MAX) {
    const href = queue.shift();
    if (seen.has(href)) continue;
    seen.add(href);
    const pat = pattern(href);
    if ((perPattern.get(pat) ?? 0) >= 2) continue;
    perPattern.set(pat, (perPattern.get(pat) ?? 0) + 1);
    n++;
    page.problems.length = 0;
    const res = await go(page, href).catch((e) => ({ status: () => `ERR ${e.message.slice(0, 80)}` }));
    await page.waitForTimeout(400);
    const st = await pageState(page);
    const lay = await layoutIssues(page).catch(() => []);
    const row = { module: item.text, href, status: res?.status?.(), landed: st.path, h1: st.h1, broken: st.broken, refused: st.refused, problems: [...new Set(page.problems)], layout: lay };
    if (row.broken || row.problems.length || (typeof row.status === "number" && row.status >= 400)) {
      row.shot = await shot(page, `crawl-${login}-${pat.replace(/[^a-z0-9]+/gi, "_").slice(0, 60)}`).catch(() => null);
      row.text = st.text.slice(0, 400);
    }
    results.push(row);
    if (results.length % 10 === 0) saveJson(`crawl-${login}-${vpArg ?? "laptop1280"}.json`, { login, menu: items, pages: results.length, partial: true, bad: [], layout: [], results });
    const links = await page.evaluate(() => [...document.querySelectorAll("main a[href]")].map((a) => a.getAttribute("href")));
    for (const l of links) {
      if (!l || !l.startsWith("/") || SKIP.test(l)) continue;
      if (!l.startsWith(root)) continue;
      if (!seen.has(l)) queue.push(l);
    }
  }
}
const bad = results.filter((r) => r.broken || r.problems.length || (typeof r.status === "number" && r.status >= 400) || String(r.status).startsWith("ERR"));
const lay = results.filter((r) => r.layout.length);
saveJson(`crawl-${login}-${vpArg ?? "laptop1280"}.json`, { login, menu: items, pages: results.length, bad, layout: lay, results });
console.log(JSON.stringify({ login, menu: items.map((i) => i.text), pages: results.length, bad: bad.map((b) => ({ href: b.href, status: b.status, broken: b.broken, problems: b.problems.slice(0, 2) })), layout: lay.slice(0, 8).map((l) => ({ href: l.href, layout: l.layout })) }, null, 1));
await close();
