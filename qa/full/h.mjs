// Helpers for the 2026-10-30 full self-test (docs/qa/2026-10-30-full-test.md).
// Builds on qa/lib.mjs: real sign-in by typing, the code read from the server log.
//   QA_SERVER_LOG=tools/app.log QA_PASSWORD=<DEMO_PASSWORD> node qa/full/<script>.mjs
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
process.env.QA_CHROMIUM ??= "C:/Program Files/Google/Chrome/Application/chrome.exe";
process.env.QA_OUT ??= path.resolve("qa-output/full");
process.env.QA_SERVER_LOG ??= path.resolve("tools/app.log");
if (!process.env.QA_PASSWORD) {
  const m = readFileSync(".env", "utf8").match(/^DEMO_PASSWORD=(.*)$/m);
  if (m) process.env.QA_PASSWORD = m[1].trim().replace(/^"|"$/g, "");
}
const lib = await import("../lib.mjs");
export const { BASE, PASSWORD, OUT, VIEWPORTS, newPage, shot, mainText, layoutIssues, close } = lib;
/** Opens an address; waits for the page, then at most 5 s for quiet (some pages refresh themselves). */
export async function go(page, url) {
  const res = await page.goto(url.startsWith("http") ? url : `${BASE}${url}`, { waitUntil: "load", timeout: 90000 });
  await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
  return res;
}
mkdirSync(path.join(OUT, "shots"), { recursive: true });

const LOG = process.env.QA_SERVER_LOG;
const logSize = () => (existsSync(LOG) ? readFileSync(LOG, "utf8").length : 0);
/** Waits for a new "[dev] ..." line in the server log written after `from` and matching `re`. */
export async function waitLog(from, re, ms = 20000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const t = readFileSync(LOG, "utf8").slice(from);
    const m = t.match(re);
    if (m) return m;
    await new Promise((r) => setTimeout(r, 300));
  }
  return null;
}
export { logSize };

/** Signs in on /sign-in by typing, like a person; types the one-time code from the log when asked. */
export async function signIn(page, login, password = PASSWORD) {
  await go(page, "/sign-in");
  await page.locator("#username").pressSequentially(login, { delay: 15 });
  await page.locator("#password").pressSequentially(password, { delay: 10 });
  const from = logSize();
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((u) => !u.pathname.match(/^\/sign-in$/), { timeout: 60000 }).catch(() => {});
  await page.waitForLoadState("networkidle").catch(() => {});
  if (new URL(page.url()).pathname.startsWith("/sign-in/code")) {
    const m = await waitLog(from, /\[dev\] one-time code[^\n]*: (\d{4,6})/);
    if (!m) throw new Error("no one-time code in the server log");
    await page.getByLabel("6-digit code").pressSequentially(m[1], { delay: 30 });
    const btn = page.getByRole("button", { name: /Verify and sign in/ });
    if (await btn.isVisible().catch(() => false)) await btn.click().catch(() => {});
    await page.waitForURL((u) => !u.pathname.startsWith("/sign-in"), { timeout: 60000 }).catch(() => {});
    await page.waitForLoadState("networkidle").catch(() => {});
  }
  if (new URL(page.url()).pathname.startsWith("/sign-in")) throw new Error(`sign-in failed for ${login}: ${(await mainText(page, 300)).replace(/\n/g, " | ")}`);
  return page;
}

export async function asUser(login, viewport = VIEWPORTS.laptop1280, opts) {
  const page = await newPage(viewport, opts);
  await signIn(page, login);
  return page;
}

/** Menu links of the main menu (desktop sidebar). */
export async function menu(page) {
  return page.evaluate(() => [...document.querySelectorAll('nav[aria-label="Main menu"] a[href]')].map((a) => ({ text: a.innerText.trim().split("\n")[0], href: a.getAttribute("href") })));
}

/** Text a person sees when a page broke or was refused. */
export async function pageState(page) {
  const t = await mainText(page, 1500);
  return {
    path: new URL(page.url()).pathname,
    h1: (await page.locator("h1").first().innerText().catch(() => "")).trim(),
    broken: /Something went wrong|Application error|Internal Server Error|This page could not be found|Unhandled Runtime/i.test(t),
    refused: /no-access/.test(page.url()) || /You do not have access|not allowed|No access|can't open this|cannot open this/i.test(t),
    text: t,
  };
}

export function saveJson(name, data) { writeFileSync(path.join(OUT, name), JSON.stringify(data, null, 2)); }
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
