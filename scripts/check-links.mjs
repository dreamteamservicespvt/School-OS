// Cross-module link check: signs in as the demo principal, opens every built
// module's pages, follows each link on them, and fails on any page that
// answers 404 or 500 (or any server error). Run against a running app:
//
//   PORT=3000 npm run dev            (or npm run build && npm start)
//   BASE_URL=http://localhost:3000 npm run check:links
//
// The built modules come from BUILT_MODULES in src/lib/modules.ts. Links that
// leave the app, download files (exports, PDFs) or sign out are checked with
// a plain request only, never clicked.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright-core");

const base = (process.env.BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
const user = process.env.CHECK_USER || "principal";
const password = process.env.CHECK_PASSWORD || process.env.DEMO_PASSWORD || readEnv("DEMO_PASSWORD");
const maxPages = Number(process.env.CHECK_MAX_PAGES || 600);
if (!password) fail("Set DEMO_PASSWORD (or CHECK_PASSWORD) to the demo users' password.");

function readEnv(key) {
  try {
    const m = readFileSync(new URL("../.env", import.meta.url), "utf8").match(new RegExp(`^${key}=(.*)$`, "m"));
    return m ? m[1].replace(/^"|"$/g, "") : "";
  } catch {
    return "";
  }
}
function fail(msg) {
  console.error(msg);
  process.exit(1);
}

const modulesSrc = readFileSync(new URL("../src/lib/modules.ts", import.meta.url), "utf8");
const builtBlock = modulesSrc.match(/BUILT_MODULES[^[]*\[([\s\S]*?)\]/);
if (!builtBlock) fail("Could not read BUILT_MODULES from src/lib/modules.ts.");
const built = [...builtBlock[1].matchAll(/"([a-z-]+)"/g)].map((m) => m[1]);
const starts = ["/dashboard", ...built.map((k) => `/${k}`)];
const inBuilt = (path) => starts.some((s) => path === s || path.startsWith(`${s}/`)) || ["/profile", "/approvals", "/messages", "/notifications"].some((s) => path === s || path.startsWith(`${s}/`));
// Downloads and actions that change something are requested, never opened in the browser.
const requestOnly = (path) => /\/(export|print|download|pdf)(\/|$|\?)|\/api\/|\.pdf$|\.csv$|\.xlsx$/.test(path) || path.startsWith("/sign-out");
const skip = (path) => path.startsWith("/sign-out") || path.startsWith("/sign-in");

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || readEnv("CHROMIUM_PATH") || undefined });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
await page.goto(`${base}/sign-in`);
await page.fill("#username", user);
await page.fill("#password", password);
await page.click("button[type=submit]");
await page.waitForURL((u) => !u.pathname.startsWith("/sign-in"), { timeout: 60_000 }).catch(() => fail(`Could not sign in as ${user}.`));

const seen = new Map(); // path -> status
const foundOn = new Map(); // path -> first page that linked it
const queue = [...starts];
const problems = [];
let visited = 0;

function normal(href, from) {
  try {
    const u = new URL(href, `${base}${from}`);
    if (u.origin !== base) return null;
    u.hash = "";
    return u.pathname + u.search;
  } catch {
    return null;
  }
}

while (queue.length && visited < maxPages) {
  const path = queue.shift();
  if (seen.has(path) || skip(path)) continue;
  if (requestOnly(path)) {
    let why = "";
    const r = await page.request.get(`${base}${path}`, { maxRedirects: 5, timeout: 120_000 }).catch((e) => { why = String(e.message).split("\n")[0]; return null; });
    const status = r ? r.status() : 0;
    seen.set(path, status);
    if (!r || status === 404 || status >= 500) problems.push({ path, status: r ? status : `no answer (${why})`, from: foundOn.get(path) });
    continue;
  }
  visited++;
  const errors = [];
  const onError = (e) => errors.push(e.message);
  page.on("pageerror", onError);
  const r = await page.goto(`${base}${path}`, { waitUntil: "domcontentloaded", timeout: 120_000 }).catch((e) => ({ status: () => 0, err: e }));
  page.off("pageerror", onError);
  const status = r.status();
  seen.set(path, status);
  const text = status === 200 ? await page.locator("body").innerText().catch(() => "") : "";
  const notFound = /This page could not be found|Page not found/i.test(text) && !/\/not-found/.test(path);
  const crashed = /Something went wrong|Application error/i.test(text);
  if (status === 404 || status >= 500 || status === 0 || notFound || crashed) {
    problems.push({ path, status: notFound ? 404 : crashed ? 500 : status, from: foundOn.get(path) });
    continue;
  }
  if (errors.length) problems.push({ path, status: "page error", from: errors[0] });
  const landed = new URL(page.url()).pathname;
  if (!inBuilt(landed)) continue;
  const hrefs = await page.$$eval("a[href]", (as) => as.map((a) => a.getAttribute("href")));
  for (const h of hrefs) {
    const p = normal(h, landed);
    if (!p || seen.has(p) || skip(p)) continue;
    if (!foundOn.has(p)) foundOn.set(p, path);
    // Follow links inside the built modules; links to other parts are opened once but not crawled.
    if (inBuilt(p.split("?")[0]) || requestOnly(p)) queue.push(p);
    else if (!queue.includes(p)) queue.push(p);
  }
}

await browser.close();
console.log(`Checked ${seen.size} links (${visited} pages opened) as ${user}.`);
if (problems.length) {
  console.error(`\n${problems.length} broken:`);
  for (const p of problems) console.error(`  ${p.status}  ${p.path}${p.from ? `   (linked from ${p.from})` : ""}`);
  process.exit(1);
}
console.log("No broken links.");
