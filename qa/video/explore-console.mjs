// Walks the Super Admin console as a DREAM TEAM user and saves each page (computer and phone)
// with its text and any problems, for planning the owner videos.
//   node qa/video/explore-console.mjs <outDir> [mobile]
import { chromium } from "playwright-core";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const [OUT, mobile = "9849012345"] = process.argv.slice(2);
const BASE = "http://localhost:3000"; const LOG = "C:/Users/chala/tools/app.log";
mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
async function signedIn(viewport, mobileView = false) {
  const ctx = await b.newContext({ viewport, isMobile: mobileView, hasTouch: mobileView });
  const p = await ctx.newPage(); p.problems = [];
  p.on("pageerror", (e) => p.problems.push(e.message)); p.on("response", (r) => r.status() >= 500 && p.problems.push(`${r.status()} ${r.url()}`));
  await p.goto(`${BASE}/console/sign-in`);
  await p.getByLabel(/mobile number or email/i).fill(mobile);
  await p.getByLabel(/^password/i).fill(process.env.DEMO_PASSWORD);
  await p.getByRole("button", { name: /continue/i }).click();
  await p.getByLabel(/code/i).first().waitFor({ timeout: 15000 });
  await p.waitForTimeout(800);
  const line = readFileSync(LOG, "utf8").split("\n").filter((l) => l.includes(mobile.slice(-4)) && /\b\d{6}\b/.test(l)).pop() ?? "";
  await p.getByLabel(/code/i).first().fill(line.match(/\b(\d{6})\b/)[1]);
  await p.getByRole("button", { name: /sign in|verify|continue/i }).first().click();
  await p.waitForURL(/\/console(?!\/sign-in)/);
  return p;
}
const text = (p) => p.evaluate(() => (document.querySelector("main") ?? document.body).innerText.replace(/\n{2,}/g, "\n"));
const desk = await signedIn({ width: 1440, height: 900 });
const pages = ["/console", "/console/schools", "/console/schools/new", "/console/billing", "/console/team", "/console/activity", "/console/profile"];
await desk.goto(`${BASE}/console/schools`); await desk.waitForLoadState("networkidle");
const first = await desk.locator('a[href^="/console/schools/"]').evaluateAll((as) => as.map((a) => a.getAttribute("href")).filter((h) => /schools\/[0-9a-f-]{36}$/.test(h)));
pages.push(...[...new Set(first)].slice(0, 2));
const report = [];
for (const u of pages) {
  await desk.goto(`${BASE}${u}`); await desk.waitForLoadState("networkidle"); await desk.waitForTimeout(400);
  const name = u.replace(/[^a-z0-9]+/gi, "_");
  await desk.screenshot({ path: `${OUT}/d${name}.png`, fullPage: true });
  report.push(`=== ${u}\n${(await text(desk)).slice(0, 3500)}`);
}
const ph = await signedIn({ width: 390, height: 844 }, true);
for (const u of pages.slice(0, 7)) {
  await ph.goto(`${BASE}${u}`); await ph.waitForLoadState("networkidle"); await ph.waitForTimeout(400);
  const wide = await ph.evaluate(() => document.documentElement.scrollWidth);
  await ph.screenshot({ path: `${OUT}/m${u.replace(/[^a-z0-9]+/gi, "_")}.png`, fullPage: true });
  report.push(`PHONE ${u} scrollWidth=${wide}`);
}
report.push(`PROBLEMS desk=${JSON.stringify(desk.problems)} phone=${JSON.stringify(ph.problems)}`);
writeFileSync(`${OUT}/report.txt`, report.join("\n\n"));
console.log(report.join("\n\n").slice(0, 200)); console.log("pages", pages.length);
await b.close();
