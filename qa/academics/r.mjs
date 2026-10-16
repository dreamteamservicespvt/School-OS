// Results recorder for the academics QA scripts: one JSON line per test in
// qa/results/academics.jsonl (module, page, action, role, expected, actual, status, defect?).
import { appendFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { newPage, BASE, PASSWORD, VIEWPORTS } from "../lib.mjs";

const FILE = path.resolve("qa/results/academics.jsonl");
mkdirSync(path.dirname(FILE), { recursive: true });

export function res(module, page, action, role, expected, actual, status, defect) {
  const row = { module, page, action, role, expected, actual, status, ...(defect ? { defect } : {}) };
  if (!process.env.QA_DRY) appendFileSync(FILE, JSON.stringify(row) + "\n");
  console.log(`[${status}] ${module} | ${action} (${role}) -> ${String(actual).slice(0, 300)}`);
}

/** Text of alerts, toasts and live regions, squeezed. */
export async function messages(page) {
  return (await page.evaluate(() => [...document.querySelectorAll("[role=alert], [role=status], [aria-live]")].map((e) => e.innerText.trim()).filter(Boolean).join(" | "))).slice(0, 600);
}

import { execFileSync } from "node:child_process";
/** Read-only SQL as the owner role inside one school (QA_SQL script: <code> <sql>). */
const QSQL = process.env.QA_SQL ?? "/tmp/claude-0/-home-claude-school-os/3895b89f-1549-5376-9f0c-be97139fc4ec/scratchpad/a3/q.sh";
export const sql = (s, school = "CEMS") => execFileSync(QSQL, [school, s]).toString();
export const uuidOf = (s) => s.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/)?.[0];
export const uuidsOf = (s) => s.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g) ?? [];

export const sleep =(ms) => new Promise((r) => setTimeout(r, ms));

/** Signs in through the real sign-in screen without waiting for network idle (pages poll). */
// Sign-ins are limited to 30 per 10 minutes per address and several QA agents share
// one address, so each login's session is kept and reused while it still works.
const STATE_DIR = process.env.QA_STATE_DIR ?? "/home/claude/qa-out/academics/sessions";
mkdirSync(STATE_DIR, { recursive: true });
export async function login(user, viewport = VIEWPORTS.laptop1280) {
  const file = path.join(STATE_DIR, `${user}.json`);
  if (existsSync(file)) {
    const page = await newPage(viewport, { storageState: file });
    const r = await page.goto(`${BASE}/profile`, { waitUntil: "load", timeout: 60000 }).catch(() => null);
    if (r && !new URL(page.url()).pathname.startsWith("/sign-in")) return page;
    await page.context().close();
  }
  const page = await newPage(viewport);
  for (let attempt = 0; ; attempt++) {
    await page.goto(`${BASE}/sign-in`);
    await page.getByLabel(/username|mobile|login/i).first().fill(user);
    await page.getByLabel(/password/i).first().fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    const ok = await page.waitForURL((u) => !u.pathname.startsWith("/sign-in"), { timeout: 20000 }).then(() => true, () => false);
    if (ok) break;
    const text = await page.locator("main").innerText().catch(() => "");
    const wait = text.match(/wait (\d+) (seconds|minutes)/);
    if (!wait || attempt > 6) throw new Error(`sign-in failed for ${user}: ${text.slice(0, 300)}`);
    const ms = (Number(wait[1]) * (wait[2] === "minutes" ? 60 : 1) + 5) * 1000;
    console.log(`(sign-in limit reached; waiting ${Math.round(ms / 1000)}s)`);
    await page.waitForTimeout(ms);
  }
  await page.context().storageState({ path: file });
  return page;
}

/** Opens a page and waits for it to load, plus a short settle. */
export async function open(page, url) {
  const r = await page.goto(url.startsWith("http") ? url : `${BASE}${url}`, { waitUntil: "load", timeout: 60000 });
  await page.waitForTimeout(800);
  return r;
}
