// Helpers for self-test A (2026-11-12): Salary, Finance, Front Office, Events, Reports.
// Signs in ONCE per role and reuses the saved session (two-step code limits).
//   MSYS_NO_PATHCONV=1 node qa/full/selftest-A-<x>.mjs
import path from "node:path";
import { existsSync, mkdirSync, writeFileSync, appendFileSync } from "node:fs";
process.env.QA_OUT ??= path.resolve("qa-output/2026-11-12-A");
const h = await import("./h.mjs");
export const { go, mainText, close, signIn, newPage, pageState, sleep, BASE } = h;
export const OUTA = process.env.QA_OUT;
mkdirSync(OUTA, { recursive: true });

const W = { width: 1440, height: 900 };
const statePath = (role) => path.join(OUTA, `state-${role}.json`);

/** A page signed in as `role`, reusing the saved session when it still works. */
export async function asRole(role) {
  if (existsSync(statePath(role))) {
    const p = await newPage(W, { storageState: statePath(role) });
    await go(p, "/dashboard");
    if (!new URL(p.url()).pathname.startsWith("/sign-in")) return p;
    await p.context().close();
  }
  const p = await newPage(W);
  await signIn(p, role);
  await p.context().storageState({ path: statePath(role) });
  return p;
}

/** Screenshot into qa-output/2026-11-12-A/<name>.png (full page). */
export async function snap(page, name, full = true) {
  const file = path.join(OUTA, `${name}.png`);
  await page.screenshot({ path: file, fullPage: full }).catch(() => {});
  return `qa-output/2026-11-12-A/${name}.png`;
}

const R = [];
export function ok(area, name, pass, note = "") {
  R.push({ area, name, pass, note });
  console.log(pass ? "PASS" : "FAIL", `[${area}]`, name, note ? `- ${String(note).replace(/\n/g, " | ").slice(0, 300)}` : "");
}
export function finish(file) {
  writeFileSync(path.join(OUTA, `${file}.json`), JSON.stringify(R, null, 2));
  const f = R.filter((r) => !r.pass).length;
  console.log(`\n${R.length - f} of ${R.length} pass`);
}
export function note(file, line) { appendFileSync(path.join(OUTA, `${file}.txt`), line + "\n"); }
export const text = (p, n = 6000) => mainText(p, n);
