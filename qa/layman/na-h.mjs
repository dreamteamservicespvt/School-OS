// Night test A (2026-11-13) helpers: d-h style sign-in (code for THIS user's phone), own output folder.
import path from "node:path";
import { existsSync, readFileSync, appendFileSync } from "node:fs";
process.env.QA_OUT = path.resolve("qa-output/2026-11-13-night-A");
const A = await import("../full/selftest-A-h.mjs");
const h = await import("../full/h.mjs");
export const { go, mainText, sleep, close, OUTA, newPage } = A;
const W = { width: 1440, height: 900 };
export const PHONE = { width: 390, height: 844 };
const statePath = (role) => path.join(OUTA, `state-${role}.json`);
const LOG = process.env.QA_SERVER_LOG;
async function signIn(page, login) {
  await go(page, "/sign-in");
  await page.locator("#username").pressSequentially(login, { delay: 15 });
  await page.locator("#password").pressSequentially(h.PASSWORD, { delay: 10 });
  const from = readFileSync(LOG, "utf8").length;
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((u) => !u.pathname.match(/^\/sign-in$/), { timeout: 60000 }).catch(() => {});
  await page.waitForLoadState("networkidle").catch(() => {});
  if (new URL(page.url()).pathname.startsWith("/sign-in/code")) {
    const t = await mainText(page, 800);
    const suf = (t.match(/•+(\d{4})/) ?? [])[1];
    for (let attempt = 0; attempt < 3; attempt++) {
      await sleep(2500);
      const log = readFileSync(LOG, "utf8").slice(from);
      const all = [...log.matchAll(/\[dev\] one-time code for x+(\d{4}) \(sign-in\): (\d{6})/g)].filter((m) => !suf || m[1] === suf);
      if (!all.length) continue;
      const code = all[all.length - 1][2];
      const box = page.getByLabel("6-digit code");
      await box.fill("");
      await box.pressSequentially(code, { delay: 30 });
      const btn = page.getByRole("button", { name: /Verify and sign in/ });
      if (await btn.isVisible().catch(() => false)) await btn.click().catch(() => {});
      await page.waitForURL((u) => !u.pathname.startsWith("/sign-in"), { timeout: 20000 }).catch(() => {});
      if (!new URL(page.url()).pathname.startsWith("/sign-in")) break;
    }
  }
  if (new URL(page.url()).pathname.startsWith("/sign-in")) throw new Error(`sign-in failed for ${login}: ${(await mainText(page, 300)).replace(/\n/g, " | ")}`);
}
export async function asRole(role, vp = W) {
  if (existsSync(statePath(role))) {
    const p = await newPage(vp, { storageState: statePath(role) });
    await go(p, "/dashboard");
    if (!new URL(p.url()).pathname.startsWith("/sign-in")) return p;
    await p.context().close();
  }
  const p = await newPage(vp);
  await signIn(p, role);
  await p.context().storageState({ path: statePath(role) });
  if (vp !== W) return p;
  return p;
}
/** Another page (e.g. phone width) in a role whose session is already saved. */
export async function asRoleAt(role, vp) {
  await (await asRole(role)).context().close();
  const p = await newPage(vp, { storageState: statePath(role) });
  return p;
}
export async function snap(page, name, full = true) {
  const file = path.join(OUTA, `${name}.png`);
  await page.screenshot({ path: file, fullPage: full }).catch(() => {});
  return `qa-output/2026-11-13-night-A/${name}.png`;
}
export function log(line) { console.log(line); appendFileSync(path.join(OUTA, "notes.txt"), line + "\n"); }
/** go() with timing in ms. */
export async function timed(page, url) {
  const t0 = Date.now();
  const r = await go(page, url);
  return { ms: Date.now() - t0, status: r?.status() };
}
export const txt = (p, n = 6000) => mainText(p, n);
