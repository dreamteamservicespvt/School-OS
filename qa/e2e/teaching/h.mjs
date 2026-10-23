// Helpers for the teaching e2e tester (Attendance, Student/Staff leave, Exams,
// Homework, Early Warnings) on Windows. Sessions cached per login+viewport;
// SQL is read-only through the local psql (READ ONLY transaction).
import { launch, PASSWORD, BASE, OUT, VIEWPORTS, mainText, layoutIssues, shot, lastConsoleCode } from "../../lib.mjs";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

export { BASE, OUT, VIEWPORTS, mainText, layoutIssues, shot, lastConsoleCode, PASSWORD };
const STATE = path.join(OUT, "state");
mkdirSync(STATE, { recursive: true });
export const PSQL = "C:/Users/chala/tools/pg16/pgsql/bin/psql.exe";
export const SUNRISE = "150cdcd5-42f8-42d3-a105-7b26b28a3c85";
export const GREEN = "4e496b06-26d0-4940-8ee4-912369ebfbde";
export const CEMS = "50addf23-63cf-44b2-9cb1-5202b4db3dcd";

export function sql(q) {
  const out = execFileSync(PSQL, ["-U", "postgres", "-d", "school_os", "-AtF", "\t", "-c", `BEGIN READ ONLY; ${q}; COMMIT;`], { encoding: "utf8" });
  return out.trim().split(/\r?\n/).filter((l) => l && l !== "BEGIN" && l !== "COMMIT").map((l) => l.split("\t"));
}
export const one = (q) => sql(q)[0]?.[0];
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function track(page) {
  page.problems = [];
  page.on("pageerror", (e) => page.problems.push(`pageerror: ${e.message.split("\n")[0]}`));
  page.on("console", (m) => { if (m.type() === "error" && !/favicon|Failed to load resource: the server responded with a status of 4/.test(m.text())) page.problems.push(`console: ${m.text().slice(0, 200)}`); });
  page.on("response", (r) => { if (r.status() >= 500) page.problems.push(`HTTP ${r.status()} ${r.url().replace(BASE, "")}`); });
}

export async function signIn(page, login, password) {
  for (let attempt = 0; ; attempt++) {
    await page.goto(`${BASE}/sign-in`, { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.getByLabel(/username|mobile|login/i).first().fill(login);
    await page.getByLabel(/password/i).first().fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.waitForTimeout(2500);
    for (let i = 0; i < 20 && page.url().includes("/sign-in"); i++) {
      const code = page.getByLabel(/code/i).first();
      if (await code.count()) {
        await page.waitForTimeout(1500);
        const c = lastConsoleCode(process.env.QA_SERVER_LOG);
        if (c) { await code.fill(c); await page.getByRole("button", { name: /verify|sign in|continue/i }).first().click(); await page.waitForTimeout(2500); }
      }
      await page.waitForTimeout(500);
    }
    if (!page.url().includes("/sign-in")) return;
    const t = await page.locator("main").innerText().catch(() => "");
    const wait = t.match(/(\d+) (seconds|minutes)/);
    if (!wait || attempt > 5) throw new Error(`sign-in failed for ${login}: ${t.slice(0, 300)}`);
    const ms = (Number(wait[1]) * (wait[2] === "minutes" ? 60 : 1) + 5) * 1000;
    console.log(`(sign-in limit; waiting ${ms / 1000}s)`);
    await page.waitForTimeout(ms);
  }
}

/** A page signed in as `login` (session reused from disk when present). */
export async function as(login, viewport = VIEWPORTS.laptop1280, password) {
  const pw = password ?? process.env.QA_PW ?? "SchoolOS@2026"; // CEMS logins use DEMO_PASSWORD (SchoolOS@2026 here)
  const b = await launch();
  const file = path.join(STATE, `${login}.json`);
  const context = await b.newContext({ viewport, ...(existsSync(file) ? { storageState: file } : {}) });
  const page = await context.newPage();
  track(page);
  await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded", timeout: 300000 });
  if (page.url().includes("/sign-in")) {
    await signIn(page, login, pw);
    await context.storageState({ path: file });
  }
  return page;
}

export async function anon(viewport = VIEWPORTS.phone390) {
  const b = await launch();
  const context = await b.newContext({ viewport });
  const page = await context.newPage();
  track(page);
  return page;
}

export async function visit(page, url, wait = 700) {
  const res = await page.goto(url.startsWith("http") ? url : `${BASE}${url}`, { waitUntil: "domcontentloaded", timeout: 300000 });
  await page.waitForLoadState("load").catch(() => {});
  await page.waitForTimeout(wait);
  return res;
}

export const squeeze = (t) => t.replace(/\s+/g, " ").trim();
export async function text(page, max = 6000) { return squeeze(await mainText(page, max)); }
/** Text of alerts, toasts and live regions. */
export async function messages(page) {
  return squeeze(await page.evaluate(() => [...document.querySelectorAll("[role=alert], [role=status], [aria-live], [data-sonner-toast]")].map((e) => e.innerText.trim()).filter(Boolean).join(" | "))).slice(0, 800);
}

const FIND = path.join(OUT, "findings.json");
export function finding(f) {
  const all = existsSync(FIND) ? JSON.parse(readFileSync(FIND, "utf8")) : [];
  const i = all.findIndex((x) => x.id === f.id);
  if (i >= 0) all[i] = f; else all.push(f);
  writeFileSync(FIND, JSON.stringify(all, null, 2));
  console.log(`FINDING ${f.id} [${f.severity}] ${f.actual.slice(0, 200)}`);
}
export function note(...a) { console.log(...a); }
export async function report(page, label) {
  const li = await layoutIssues(page);
  const p = page.problems.splice(0);
  console.log(`-- ${label}: layout=${JSON.stringify(li)} problems=${JSON.stringify(p)}`);
  return { li, p };
}
