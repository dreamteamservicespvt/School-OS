// Platform QA helpers. Each browser context gets its own made-up client address
// (x-forwarded-for), so these scripts do not use up the shared sign-in limit
// (30 tries per address per 10 minutes) that every QA agent on this machine hits
// from the same "unknown" address.
import { newPage, VIEWPORTS, BASE, PASSWORD } from "../lib.mjs";

let n = Math.floor(Math.random() * 200);
export const fakeIp = () => `10.55.${Math.floor(n / 250) % 250}.${(n++ % 250) + 1}`;

export async function page(viewport = VIEWPORTS.laptop1280, opts = {}) {
  const p = await newPage(viewport, { ...opts, extraHTTPHeaders: { "x-forwarded-for": fakeIp(), ...(opts.extraHTTPHeaders ?? {}) } });
  // A dev server compiles each page on first use: allow more time there.
  if (process.env.QA_TIMEOUT) p.setDefaultTimeout(Number(process.env.QA_TIMEOUT));
  return p;
}

/** Signs in like lib.signIn, but waits for the next page instead of network quiet (some pages poll). */
export async function signInFast(p, login, password = PASSWORD) {
  await p.goto(`${BASE}/sign-in`);
  await p.getByLabel(/username|mobile|login/i).first().fill(login);
  await p.getByLabel(/password/i).first().fill(password);
  await p.getByRole("button", { name: "Sign in", exact: true }).click();
  await p.waitForURL((u) => !u.pathname.startsWith("/sign-in"), { timeout: Number(process.env.QA_SIGNIN_MS ?? 20000) }).catch(() => {});
  await p.waitForLoadState("domcontentloaded").catch(() => {});
  return p;
}

/** Signs in and checks it worked; throws with the screen's words if not. */
export async function as(login, viewport, opts) {
  const p = await page(viewport, opts);
  await signInFast(p, login);
  if (/\/sign-in(\?|$)/.test(p.url())) {
    const t = await p.locator("main, body").first().innerText().catch(() => "");
    throw new Error(`Sign-in failed for ${login}: ${t.replace(/\s+/g, " ").slice(0, 200)}`);
  }
  return p;
}
