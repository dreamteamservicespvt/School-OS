// F21 console pages and F22 driver page: signs in, then opens every page reachable by
// links under the start address (two of each address pattern). Same checks as crawl.mjs.
//   node qa/full/crawl-console.mjs owner|onboarding|support|driver [max=80]
import { newPage, go, pageState, layoutIssues, saveJson, close, shot, mainText, logSize, waitLog, signIn, PASSWORD } from "./h.mjs";

const [who = "owner", maxArg] = process.argv.slice(2);
const MAX = Number(maxArg ?? 80);
const MOBILES = { owner: "9849012345", onboarding: "9849023456", support: "9849034567" };
const page = await newPage();
let root;
if (who === "driver") {
  await signIn(page, "driver");
  root = "/driver";
} else {
  await go(page, "/console/sign-in");
  await page.locator("#login").pressSequentially(MOBILES[who], { delay: 10 });
  await page.locator("#password").pressSequentially(PASSWORD, { delay: 5 });
  const from = logSize();
  await page.getByRole("button", { name: /sign in|continue|next/i }).first().click();
  const m = await waitLog(from, /code[^\n]*?(\d{6})/);
  if (!m) throw new Error(`no console code: ${await mainText(page, 300)}`);
  await page.waitForTimeout(1000);
  for (let i = 0; i < 6; i++) await page.getByLabel(`Digit ${i + 1}`).pressSequentially(m[1][i]);
  await page.waitForTimeout(500);
  const verify = page.getByRole("button", { name: /verify|sign in|continue/i }).first();
  if (await verify.isVisible().catch(() => false)) await verify.click().catch(() => {});
  await page.waitForURL((u) => !u.pathname.startsWith("/console/sign-in"), { timeout: 60000 });
  root = "/console";
}
const pattern = (p) => p.replace(/\/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, "/:id").replace(/\/c[a-z0-9]{20,}/g, "/:id").replace(/\/\d+(?=\/|$)/g, "/:n").replace(/\?.*$/, "");
const SKIP = /sign-out|\/api\/|\.pdf|\/download|\/export|\/print|logout|sign-in/i;
const seen = new Set(), perPattern = new Map(), results = [];
const queue = [new URL(page.url()).pathname];
while (queue.length && results.length < MAX) {
  const href = queue.shift();
  if (seen.has(href)) continue;
  seen.add(href);
  const pat = pattern(href);
  if ((perPattern.get(pat) ?? 0) >= 2) continue;
  perPattern.set(pat, (perPattern.get(pat) ?? 0) + 1);
  page.problems.length = 0;
  const res = await go(page, href).catch((e) => ({ status: () => `ERR ${e.message.slice(0, 80)}` }));
  await page.waitForTimeout(400);
  const st = await pageState(page);
  const lay = await layoutIssues(page).catch(() => []);
  const row = { href, status: res?.status?.(), landed: st.path, h1: st.h1, broken: st.broken, refused: st.refused, problems: [...new Set(page.problems)], layout: lay };
  if (row.broken || row.problems.length || (typeof row.status === "number" && row.status >= 400)) {
    row.shot = await shot(page, `crawl-${who}-${pat.replace(/[^a-z0-9]+/gi, "_").slice(0, 60)}`).catch(() => null);
    row.text = st.text.slice(0, 400);
  }
  results.push(row);
  const links = await page.evaluate(() => [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")));
  for (const l of links) if (l && l.startsWith(root) && !SKIP.test(l) && !seen.has(l)) queue.push(l);
}
const bad = results.filter((r) => r.broken || r.problems.length || (typeof r.status === "number" && r.status >= 400) || String(r.status).startsWith("ERR"));
const lay = results.filter((r) => r.layout.length);
saveJson(`crawl-${who}.json`, { who, pages: results.length, bad, layout: lay, results });
console.log(JSON.stringify({ who, pages: results.length, titles: results.map((r) => `${r.landed} ${r.h1}`), bad: bad.map((b) => ({ href: b.href, status: b.status, broken: b.broken, problems: b.problems.slice(0, 2) })), layout: lay.slice(0, 8).map((l) => ({ href: l.href, layout: l.layout })) }, null, 1));
await close();
