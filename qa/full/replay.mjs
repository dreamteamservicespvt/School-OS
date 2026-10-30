// Server-side permission probe (delivery audit 2026-10-31): captures a server action request made
// by a person who may do it, then sends the very same request with other people's sessions.
// The server must refuse it for everyone who lacks the action (never trust the screen).
//   import { capture, replay } from "./replay.mjs"
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { as } from "./look.mjs";
import { BASE, OUT, go } from "./h.mjs";
import { launch } from "../lib.mjs";

/**
 * Opens `url` as `login`, runs `act(page)`, and captures the first server action POST it makes.
 * The request is aborted unless `letThrough` is true (nothing is saved by the capturing person).
 */
export async function capture(login, url, act, { letThrough = false } = {}) {
  const page = await as(login);
  await go(page, url);
  let caught = null;
  await page.route("**/*", async (route) => {
    const r = route.request();
    if (!caught && r.method() === "POST" && r.headers()["next-action"]) {
      caught = { url: r.url(), headers: r.headers(), body: r.postDataBuffer() };
      if (!letThrough) return route.abort();
    }
    return route.continue();
  });
  await act(page);
  for (let i = 0; i < 40 && !caught; i++) await page.waitForTimeout(250);
  await page.unroute("**/*");
  await page.context().close();
  if (!caught) throw new Error(`no server action captured on ${url}`);
  return caught;
}

/** Sends a captured request with `login`'s session (null = no session). Returns status and the reply text. */
export async function replay(caught, login, { body } = {}) {
  const b = await launch();
  const file = login ? path.join(OUT, "state", `${login}.json`) : null;
  if (login && !existsSync(file)) { const p = await as(login); await p.context().close(); }
  const ctx = await b.newContext(file ? { storageState: file } : {});
  const headers = { ...caught.headers };
  for (const h of ["cookie", "content-length", "host"]) delete headers[h];
  const r = await ctx.request.post(caught.url, { headers, data: body ?? caught.body, maxRedirects: 0, failOnStatusCode: false });
  const text = (await r.text()).slice(0, 4000);
  await ctx.close();
  return { status: r.status(), text, location: r.headers()["location"] ?? r.headers()["x-action-redirect"] ?? null };
}

export { BASE, readFileSync };
