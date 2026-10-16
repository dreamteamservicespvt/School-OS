// Helpers for the end-to-end school simulations (qa/simulations/).
//   node qa/simulations/<script>.mjs
// Results: qa/results/simulations.jsonl. Screenshots: qa-output/simulations/.
// Sessions are cached per login in qa-output/simulations/state so each script
// does not sign in again and again.
import { launch, PASSWORD, BASE, VIEWPORTS, mainText, layoutIssues, close } from "../lib.mjs";
import { existsSync, mkdirSync, appendFileSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

export { BASE, VIEWPORTS, mainText, layoutIssues, close };
export const SHOTS = path.resolve("qa-output/simulations");
const STATE = path.join(SHOTS, "state");
mkdirSync(STATE, { recursive: true });
const RESULTS = path.resolve("qa/results/simulations.jsonl");

export async function signIn(page, login, password = PASSWORD) {
  await page.goto(`${BASE}/sign-in`);
  await page.getByLabel(/username|mobile|login/i).first().fill(login);
  await page.getByLabel(/password/i).first().fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/sign-in"), { timeout: 60000 });
}

/** A page signed in as `login` at laptop size (1440x900 by default). */
export async function as(login, viewport = VIEWPORTS.desk1440) {
  const b = await launch();
  const file = path.join(STATE, `${login}.json`);
  const context = await b.newContext({ viewport, ...(existsSync(file) ? { storageState: file } : {}) });
  const page = await context.newPage();
  page.problems = [];
  page.on("pageerror", (e) => page.problems.push(`pageerror: ${e.message.split("\n")[0]}`));
  page.on("response", (r) => { if (r.status() >= 500) page.problems.push(`HTTP ${r.status()} ${r.url().replace(BASE, "")}`); });
  await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded", timeout: 120000 });
  if (page.url().includes("/sign-in")) {
    await signIn(page, login);
    await context.storageState({ path: file });
  }
  return page;
}

export async function visit(page, url) {
  const res = await page.goto(url.startsWith("http") ? url : `${BASE}${url}`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForLoadState("load").catch(() => {});
  await page.waitForTimeout(600);
  return res;
}

export async function text(page, max = 6000) { return mainText(page, max); }

export async function shot(page, name, full = false) {
  const file = path.join(SHOTS, `${name}.png`);
  await page.screenshot({ path: file, fullPage: full });
  return `qa-output/simulations/${name}.png`;
}

/** Read-only SQL used only to cross-check what a screen said. */
export function sql(q) {
  const out = execFileSync("sudo", ["-u", "postgres", "psql", "school_os", "-AtF", "\t", "-c", q], { encoding: "utf8" });
  return out.trim() ? out.trim().split("\n").map((l) => l.split("\t")) : [];
}
export const SCHOOL_A = "fbe1c0d0-cc45-4512-908c-70436e3fd47f";

export function record(row) {
  const r = { at: new Date().toISOString(), ...row };
  appendFileSync(RESULTS, JSON.stringify(r) + "\n");
  console.log(`[${r.status}] ${r.area} / ${r.role} / ${r.check} -> ${String(r.note ?? "").slice(0, 300)}`);
}

/** Toast / alert text after an action. */
export async function feedback(page, wait = 2500) {
  await page.waitForTimeout(wait);
  const t = await page.locator("[role=status], [role=alert], [data-sonner-toast]").allInnerTexts().catch(() => []);
  return t.join(" | ").replace(/\s+/g, " ").trim();
}
export const num = (s) => Number(String(s).replace(/[₹,\s]/g, ""));

/** Closes a page's browser context to keep memory low. */
export async function done(page) { await page.context().close().catch(() => {}); }
