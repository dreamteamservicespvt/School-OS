// Shared helpers for the regression re-tests of the QA fixes.
//   QA_OUT=qa-output/regression node qa/regression/<script>.mjs
// Each result is written with lib.record() to $QA_OUT/results.jsonl and also
// appended to qa/results/regression.jsonl (the committed list).
import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
process.env.QA_OUT ??= path.resolve("qa-output/regression");
const lib = await import("../lib.mjs");
export const { BASE, PASSWORD, VIEWPORTS, close, newPage, mainText, shot, layoutIssues, go } = lib;
mkdirSync("qa/results", { recursive: true });

let n = Math.floor(Math.random() * 240);
const block = 60 + Math.floor(Math.random() * 150);
/** A made-up client address per browser context, so the shared sign-in limit is not used up. */
export const fakeIp = () => `10.77.${block}.${(n++ % 250) + 1}`;

export async function page(viewport = VIEWPORTS.laptop1280, opts = {}) {
  const p = await newPage(viewport, { ...opts, extraHTTPHeaders: { "x-forwarded-for": fakeIp(), ...(opts.extraHTTPHeaders ?? {}) } });
  p.setDefaultTimeout(Number(process.env.QA_TIMEOUT ?? 30000));
  return p;
}

/** Signs in through the real Sign in screen; throws with the screen's words if it fails. */
export async function as(login, viewport, opts) {
  const p = await page(viewport, opts);
  await p.goto(`${BASE}/sign-in`);
  await p.getByLabel(/username|mobile|login/i).first().fill(login);
  await p.getByLabel(/password/i).first().fill(PASSWORD);
  await p.getByRole("button", { name: "Sign in", exact: true }).click();
  await p.waitForURL((u) => !u.pathname.startsWith("/sign-in"), { timeout: 30000 }).catch(() => {});
  if (/\/sign-in/.test(p.url())) {
    const t = await p.locator("body").innerText().catch(() => "");
    throw new Error(`Sign-in failed for ${login}: ${t.replace(/\s+/g, " ").slice(0, 200)}`);
  }
  await p.waitForLoadState("networkidle").catch(() => {});
  return p;
}

export async function open(p, url) {
  const r = await p.goto(url.startsWith("http") ? url : `${BASE}${url}`, { waitUntil: "domcontentloaded" });
  await settle(p);
  return r;
}

/** Waits until the page's loading skeleton is replaced by its heading. */
export async function settle(p, timeout = 30000) {
  await p.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  await p.waitForFunction(() => { const m = document.querySelector("main"); return !!m && !!m.querySelector("h1, h2") && !m.querySelector(".animate-pulse"); }, null, { timeout }).catch(() => {});
}

export const squeeze = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

/** Records one regression row (id, area, role, check, status, note). */
export function rec(row) {
  const r = { id: row.id, area: row.area, role: row.role, check: row.check, status: row.status, note: row.note ?? "", ...(row.shot ? { shot: row.shot } : {}) };
  lib.record(r);
  appendFileSync("qa/results/regression.jsonl", JSON.stringify({ at: new Date().toISOString(), ...r }) + "\n");
  console.log(`${r.status.padEnd(8)} ${r.id} ${r.check} :: ${r.note.slice(0, 300)}`);
}

/** Runs one check; an exception becomes a FAIL (or BLOCKED when flagged) with a screenshot. */
export async function check(meta, fn) {
  let p;
  try {
    const out = await fn((x) => (p = x));
    if (out) rec({ ...meta, ...out });
  } catch (e) {
    let s;
    if (p) s = await shot(p, `${meta.id}-error`).catch(() => undefined);
    rec({ ...meta, status: e.blocked ? "BLOCKED" : "FAIL", note: `error: ${String(e.message).split("\n")[0].slice(0, 400)}`, shot: s });
  } finally {
    await p?.context().close().catch(() => {});
  }
}
export const blocked = (msg) => Object.assign(new Error(msg), { blocked: true });
