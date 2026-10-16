// Helpers for the money-area QA scripts (Fee, Finance, Salary). Sign-in
// sessions are cached per login so scripts do not sign in again and again.
//   QA_URL=http://localhost:3000 QA_OUT=/home/claude/qa-out/money node qa/money/<script>.mjs
import { launch, newPage, PASSWORD, BASE, OUT, VIEWPORTS, mainText, layoutIssues, shot } from "../lib.mjs";
import { existsSync, mkdirSync, appendFileSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

export { BASE, OUT, VIEWPORTS, mainText, layoutIssues, shot, newPage };
const STATE = path.join(OUT, "state");
mkdirSync(STATE, { recursive: true });

export async function signInFast(page, login, password = PASSWORD) {
  await page.goto(`${BASE}/sign-in`);
  await page.getByLabel(/username|mobile|login/i).first().fill(login);
  await page.getByLabel(/password/i).first().fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/sign-in"), { timeout: 30000 });
}

/** A page signed in as `login` (session reused from disk when present). */
export async function as(login, viewport = VIEWPORTS.laptop1280) {
  const b = await launch();
  const file = path.join(STATE, `${login}.json`);
  const context = await b.newContext({ viewport, ...(existsSync(file) ? { storageState: file } : {}) });
  const page = await context.newPage();
  page.problems = [];
  page.on("pageerror", (e) => page.problems.push(`pageerror: ${e.message.split("\n")[0]}`));
  page.on("response", (r) => { if (r.status() >= 500) page.problems.push(`HTTP ${r.status()} ${r.url().replace(BASE, "")}`); });
  await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded", timeout: 300000 });
  if (page.url().includes("/sign-in")) {
    await signInFast(page, login);
    await context.storageState({ path: file });
  }
  return page;
}

/** Goes to a URL and waits for the main area (pages poll, so no networkidle). */
export async function visit(page, url) {
  const res = await page.goto(url.startsWith("http") ? url : `${BASE}${url}`, { waitUntil: "domcontentloaded", timeout: 300000 });
  await page.waitForTimeout(400);
  await page.waitForLoadState("load").catch(() => {});
  return res;
}

/** Read-only SQL as the postgres superuser. Returns rows as arrays of strings. */
export function sql(q) {
  const out = execFileSync("sudo", ["-u", "postgres", "psql", "school_os", "-AtF", "\t", "-c", q], { encoding: "utf8" });
  return out.trim() ? out.trim().split("\n").map((l) => l.split("\t")) : [];
}
export const SCHOOL_A = "fbe1c0d0-cc45-4512-908c-70436e3fd47f";

const RESULTS = process.env.QA_RESULTS ?? path.resolve("qa/results/money.jsonl");
export function result(row) {
  appendFileSync(RESULTS, JSON.stringify(row) + "\n");
  console.log(`[${row.status}] ${row.module} / ${row.page} / ${row.action} (${row.role}) -> ${row.actual}`);
}
