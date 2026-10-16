// Shared helpers for the browser QA scripts in qa/. They drive the running
// app (npm run build && npx next start) with real clicks, like a person.
//
//   QA_URL=http://localhost:3000 node qa/<script>.mjs
//
// Every helper records page errors, failed requests and server errors so a
// script can fail loudly instead of passing on a broken screen.
import { chromium } from "playwright-core";
import { mkdirSync, readFileSync, existsSync, writeFileSync, appendFileSync } from "node:fs";
import path from "node:path";

export const BASE = process.env.QA_URL ?? "http://localhost:3000";
export const PASSWORD = process.env.QA_PASSWORD ?? "QaDemo#2026";
export const OUT = process.env.QA_OUT ?? path.resolve("qa-output");
const EXEC = process.env.QA_CHROMIUM ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
mkdirSync(path.join(OUT, "shots"), { recursive: true });

export const VIEWPORTS = {
  phone320: { width: 320, height: 640 }, phone375: { width: 375, height: 740 }, phone390: { width: 390, height: 844 },
  phone414: { width: 414, height: 896 }, tablet768: { width: 768, height: 1024 }, tablet820: { width: 820, height: 1180 },
  laptop1024: { width: 1024, height: 768 }, laptop1280: { width: 1280, height: 800 }, desk1440: { width: 1440, height: 900 },
  desk1920: { width: 1920, height: 1080 },
};

let browser;
export async function launch() {
  browser ??= await chromium.launch({ executablePath: EXEC, args: ["--no-sandbox"] });
  return browser;
}
export async function close() { await browser?.close(); browser = undefined; }

/** A fresh, signed-out browser context with problem tracking. */
export async function newPage(viewport = VIEWPORTS.laptop1280, opts = {}) {
  const b = await launch();
  const context = await b.newContext({ viewport, ...opts });
  const page = await context.newPage();
  page.problems = [];
  page.on("pageerror", (e) => page.problems.push(`pageerror: ${e.message.split("\n")[0]}`));
  page.on("console", (m) => { if (m.type() === "error" && !/favicon|Failed to load resource: the server responded with a status of 4/.test(m.text())) page.problems.push(`console: ${m.text().slice(0, 200)}`); });
  page.on("response", (r) => { if (r.status() >= 500) page.problems.push(`HTTP ${r.status()} ${r.url().replace(BASE, "")}`); });
  return page;
}

/** Signs in with a username (or phone/email) through the real sign-in screen. */
export async function signIn(page, login, password = PASSWORD) {
  await page.goto(`${BASE}/sign-in`);
  await page.getByLabel(/username|mobile|login/i).first().fill(login);
  await page.getByLabel(/password/i).first().fill(password);
  await Promise.all([page.waitForLoadState("networkidle"), page.getByRole("button", { name: "Sign in", exact: true }).click()]);
  await page.waitForLoadState("networkidle");
  return page;
}

export async function asUser(login, viewport) {
  const page = await newPage(viewport);
  await signIn(page, login);
  return page;
}

export async function go(page, url) {
  const res = await page.goto(url.startsWith("http") ? url : `${BASE}${url}`);
  await page.waitForLoadState("networkidle").catch(() => {});
  return res;
}

export async function shot(page, name, full = true) {
  const file = path.join(OUT, "shots", `${name}.png`);
  await page.screenshot({ path: file, fullPage: full });
  return file;
}

/** Visible text of the main area, squeezed, for quick reading. */
export async function mainText(page, max = 3000) {
  // Option lists of <select> are left out: they flood the text.
  const t = await page.evaluate(() => {
    const root = (document.querySelector("main") ?? document.body).cloneNode(true);
    root.querySelectorAll("select, option, script, style").forEach((el) => el.remove());
    document.body.appendChild(root); root.style.position = "absolute"; root.style.left = "-99999px";
    const text = root.innerText; root.remove(); return text;
  });
  return t.replace(/\n{2,}/g, "\n").slice(0, max);
}

/** Layout problems a person would notice: sideways scrolling, clipped buttons, tiny targets. */
export async function layoutIssues(page) {
  return page.evaluate(() => {
    const out = [];
    const doc = document.documentElement;
    if (doc.scrollWidth > window.innerWidth + 1) {
      const wide = [...document.querySelectorAll("body *")]
        .filter((el) => { const r = el.getBoundingClientRect(); return r.right > window.innerWidth + 1 && r.width > 0 && getComputedStyle(el).position !== "fixed" && !el.closest("[data-scroll-x], .overflow-x-auto, .overflow-auto, table"); })
        .slice(0, 3).map((el) => `${el.tagName.toLowerCase()}.${String(el.className).split(" ").slice(0, 3).join(".")} "${(el.innerText || "").slice(0, 30)}"`);
      out.push(`page scrolls sideways (${doc.scrollWidth}px > ${window.innerWidth}px)${wide.length ? ": " + wide.join("; ") : ""}`);
    }
    const unlabeled = [...document.querySelectorAll("button, a[href], input:not([type=hidden]), select, textarea")]
      .filter((el) => { const r = el.getBoundingClientRect(); if (!r.width) return false; const name = el.getAttribute("aria-label") || el.getAttribute("title") || el.innerText?.trim() || (el.id && document.querySelector(`label[for="${el.id}"]`)?.innerText) || el.closest("label")?.innerText || el.getAttribute("placeholder") || el.getAttribute("aria-labelledby"); return !name; })
      .slice(0, 5).map((el) => `${el.tagName.toLowerCase()}[${el.getAttribute("name") ?? el.getAttribute("type") ?? ""}]`);
    if (unlabeled.length) out.push(`controls without a name: ${unlabeled.join(", ")}`);
    return out;
  });
}

/** Records one test result line for the matrix (qa-output/results.jsonl). */
export function record(row) {
  appendFileSync(path.join(OUT, "results.jsonl"), JSON.stringify({ at: new Date().toISOString(), ...row }) + "\n");
}

/** Reads the one-time code the console wrote to the server log (no SMS provider in test). */
export function lastConsoleCode(logFile = process.env.QA_SERVER_LOG) {
  if (!logFile || !existsSync(logFile)) return null;
  const lines = readFileSync(logFile, "utf8").split("\n").reverse();
  for (const l of lines) { const m = l.match(/\b(\d{6})\b/); if (m && /code|OTP|verification/i.test(l)) return m[1]; }
  return null;
}

export function save(name, data) { writeFileSync(path.join(OUT, name), typeof data === "string" ? data : JSON.stringify(data, null, 2)); }
